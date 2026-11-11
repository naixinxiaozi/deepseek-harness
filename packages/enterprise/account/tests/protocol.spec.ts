import { createServer } from 'node:http'
import { describe, expect, it } from 'vitest'
import {
  EnterpriseAuthError,
  exchangeEnterpriseCredentials,
  revokeEnterpriseToken,
  type EnterpriseAuthConfig,
} from '../src/protocol.ts'

async function withServer(
  handler: Parameters<typeof createServer>[1],
  operation: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = createServer(handler)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('server did not bind')
  try {
    await operation(`http://127.0.0.1:${String(address.port)}`)
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error === undefined ? resolve() : reject(error)))
  }
}

function config(baseUrl: string): EnterpriseAuthConfig {
  return {
    loginUrl: `${baseUrl}/login`,
    logoutUrl: `${baseUrl}/logout`,
    inferenceOrigin: 'https://inference.northstar.example',
    usernameField: 'user',
    passwordField: 'secret',
    tokenField: 'result.access_token',
    allowLoopbackHttp: true,
    requestTimeoutMs: 2_000,
    attemptTimeoutMs: 10_000,
  }
}

describe('enterprise credential exchange', () => {
  it('posts the configured credential fields and reads the configured token field', async () => {
    let received = ''
    await withServer((request, response) => {
      request.setEncoding('utf8')
      request.on('data', (chunk) => { received += chunk })
      request.on('end', () => {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ result: { access_token: 'token-1' } }))
      })
    }, async (baseUrl) => {
      await expect(exchangeEnterpriseCredentials(
        config(baseUrl),
        'alice',
        'correct horse',
        new AbortController().signal,
      )).resolves.toBe('token-1')
      expect(JSON.parse(received)).toEqual({ user: 'alice', secret: 'correct horse' })
    })
  })

  it('revokes the stored token without requiring a response body', async () => {
    let authorization: string | undefined
    await withServer((request, response) => {
      authorization = request.headers.authorization
      response.writeHead(204)
      response.end()
    }, async (baseUrl) => {
      await revokeEnterpriseToken(config(baseUrl), 'token-1', new AbortController().signal)
      expect(authorization).toBe('Bearer token-1')
    })
  })

  it('maps a rejected request without exposing the response body', async () => {
    await withServer((_request, response) => {
      response.writeHead(401, { 'content-type': 'text/plain' })
      response.end('private upstream detail')
    }, async (baseUrl) => {
      await expect(exchangeEnterpriseCredentials(
        config(baseUrl),
        'alice',
        'bad',
        new AbortController().signal,
      )).rejects.toMatchObject({
        name: 'EnterpriseAuthError',
        signInCode: 'network',
        message: 'enterprise login responded 401',
      } satisfies Partial<EnterpriseAuthError>)
    })
  })

  it('rejects loopback HTTP unless explicitly enabled', async () => {
    await withServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end('{"access_token":"unused"}')
    }, async (baseUrl) => {
      const value = { ...config(baseUrl), allowLoopbackHttp: false, tokenField: 'access_token' }
      await expect(exchangeEnterpriseCredentials(
        value,
        'alice',
        'password',
        new AbortController().signal,
      )).rejects.toMatchObject({ name: 'EnterpriseAuthError', signInCode: 'protocol' })
    })
  })
})
