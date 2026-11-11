/** Opt-in enterprise staging qualification for login and the OpenAI-compatible proxy. */

import { describe, expect, it } from 'vitest'
import { exchangeEnterpriseCredentials } from '../../account/src/protocol.ts'

const loginUrl = process.env.ENTERPRISE_E2E_LOGIN_URL
const username = process.env.ENTERPRISE_E2E_USERNAME
const password = process.env.ENTERPRISE_E2E_PASSWORD
const baseUrl = process.env.ENTERPRISE_E2E_BASE_URL
const model = process.env.ENTERPRISE_E2E_MODEL
const configured = [loginUrl, username, password, baseUrl, model].every(value => value !== undefined && value !== '')

describe.skipIf(!configured)('enterprise staging', () => {
  it('logs in and reaches the configured enterprise model proxy', async () => {
    if (loginUrl === undefined || username === undefined || password === undefined || baseUrl === undefined || model === undefined) {
      return
    }
    const token = await exchangeEnterpriseCredentials({
      loginUrl,
      inferenceOrigin: new URL(baseUrl).origin,
      usernameField: process.env.ENTERPRISE_E2E_USERNAME_FIELD ?? 'username',
      passwordField: process.env.ENTERPRISE_E2E_PASSWORD_FIELD ?? 'password',
      tokenField: process.env.ENTERPRISE_E2E_TOKEN_FIELD ?? 'access_token',
      allowLoopbackHttp: process.env.ENTERPRISE_E2E_ALLOW_LOOPBACK_HTTP === '1',
      requestTimeoutMs: 30_000,
      attemptTimeoutMs: 60_000,
    }, username, password, AbortSignal.timeout(60_000))
    const response = await fetch(new URL('chat/completions', `${baseUrl.replace(/\/$/u, '')}/`), {
      method: 'POST',
      redirect: 'error',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model,
        stream: true,
        messages: [{ role: 'user', content: 'Reply with the single word ready.' }],
      }),
      signal: AbortSignal.timeout(120_000),
    })
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(body).toContain('data:')
    expect(body).toContain('[DONE]')
  }, 180_000)
})
