import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import type { AccountClientMetadata } from '@deepseek-ai/dsh-deepseek-account/types'
import { afterEach, describe, expect, it } from 'vitest'
import EnterpriseAccount, { ENTERPRISE_LLM_TOKEN, type Config } from '../src/index.ts'

const client: AccountClientMetadata = {
  version: '0.2.2-rc.1',
  locale: 'zh-CN',
  timezoneOffsetSeconds: 28_800,
}

const cleanups: (() => Promise<void>)[] = []

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.()
})

async function fixture(options: { holdLogin?: boolean } = {}) {
  let releaseLogin = (): undefined => undefined
  let release = Promise.resolve()
  if (options.holdLogin === true) {
    const gate = Promise.withResolvers<undefined>()
    release = gate.promise
    releaseLogin = gate.resolve
  }
  const api = createServer(async (request, response) => {
    for await (const _chunk of request) { /* consume the bounded login body */ }
    await release
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ access_token: 'token-1' }))
  })
  await new Promise<void>(resolve => api.listen(0, '127.0.0.1', resolve))
  const address = api.address()
  if (address === null || typeof address === 'string') throw new Error('login server did not bind')
  cleanups.push(async () => {
    releaseLogin()
    api.closeAllConnections()
    await new Promise<void>(resolve => api.close(() => resolve()))
  })

  const home = await mkdtemp(join(tmpdir(), 'dsh-enterprise-account-'))
  cleanups.push(() => rm(home, { recursive: true, force: true }))
  const ctx = new Context()
  const web = ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
  await web
  const credentials = ctx.plugin(LocalCredentialProvider, { path: join(home, 'credentials.yaml'), watch: false })
  await credentials
  const credentialsService = ctx.get('credentials')
  if (credentialsService === undefined) throw new Error('credentials service did not register')
  const config: Config = {
    productName: 'Northstar Harness',
    loginUrl: `http://127.0.0.1:${String(address.port)}/login`,
    usageUrl: 'https://services.northstar.example/usage',
    topUpUrl: 'https://services.northstar.example/top-up',
    inferenceOrigin: 'https://services.northstar.example',
    usernameField: 'username',
    passwordField: 'password',
    tokenField: 'access_token',
    allowLoopbackHttp: true,
    requestTimeoutMs: 2_000,
    attemptTimeoutMs: 5_000,
  }
  const accountPlugin = ctx.plugin(EnterpriseAccount, config)
  await accountPlugin
  cleanups.push(async () => {
    await accountPlugin.dispose()
    await credentials.dispose()
    await web.dispose()
  })
  return {
    account: ctx.deepseekAccount,
    callbackOrigin: ctx.webServer.getOrigin(),
    ctx,
    credentials: credentialsService,
    releaseLogin,
  }
}

async function submit(formUrl: string, password = 'correct horse'): Promise<Response> {
  const page = await (await fetch(formUrl)).text()
  const nonce = /name="nonce" value="([^"]+)"/u.exec(page)?.[1]
  if (nonce === undefined) throw new Error('missing nonce')
  return fetch(formUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ nonce, username: 'alice', password }),
  })
}

describe('EnterpriseAccount', () => {
  it('serves the local form and commits the token only after a successful POST', async () => {
    const f = await fixture()
    const started = await f.account.startSignIn(client, f.callbackOrigin, 'desktop')
    expect(started.status).toBe('signed-out')
    expect(started.attempt?.phase).toBe('waiting-browser')
    const formUrl = started.attempt?.authorizeUrl
    if (formUrl === undefined) throw new Error('missing login URL')
    expect(formUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/enterprise-login\//u)
    expect(await submit(formUrl)).toMatchObject({ status: 200 })

    await expect(f.account.getState()).resolves.toMatchObject({
      status: 'credential-stored',
      attempt: { phase: 'succeeded' },
    })
    await expect(f.credentials.resolve(ENTERPRISE_LLM_TOKEN)).resolves.toMatchObject({ value: 'token-1' })
    await expect(f.account.resolveToken('https://services.northstar.example/v1/messages'))
      .resolves.toBe('token-1')
    await expect(f.account.resolveToken('https://other.example/v1/messages')).resolves.toBeUndefined()
  })

  it('does not commit a token after cancellation', async () => {
    const f = await fixture({ holdLogin: true })
    const started = await f.account.startSignIn(client, f.callbackOrigin, 'desktop')
    const formUrl = started.attempt?.authorizeUrl
    if (formUrl === undefined) throw new Error('missing login URL')
    const page = await (await fetch(formUrl)).text()
    const nonce = /name="nonce" value="([^"]+)"/u.exec(page)?.[1]
    if (nonce === undefined) throw new Error('missing nonce')
    const posting = fetch(formUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ nonce, username: 'alice', password: 'correct horse' }),
    })
    await f.account.cancelSignIn(started.attempt!.id)
    f.releaseLogin()
    await posting.catch(() => undefined)
    await expect(f.credentials.resolve(ENTERPRISE_LLM_TOKEN)).resolves.toBeUndefined()
    await expect(f.account.getState()).resolves.toMatchObject({
      status: 'signed-out',
      attempt: { phase: 'cancelled' },
    })
  })
})
