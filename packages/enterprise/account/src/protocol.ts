/** Host-only HTTP exchange for enterprise username and password authentication. */

import { HarnessError } from '@deepseek-ai/dsh-llm'
import type { SignInErrorCode } from '@deepseek-ai/dsh-deepseek-account/types'
import type { EnterpriseAuthConfig } from './config.ts'

export type { EnterpriseAuthConfig } from './config.ts'

/** Stable enterprise authentication failure mapped to an account sign-in code. */
export class EnterpriseAuthError extends HarnessError {
  /**
   * @param message - Safe diagnostic without credentials or response bodies.
   * @param signInCode - Account UI failure category.
   * @param options - Original error cause, retained only for Host diagnostics.
   */
  constructor(message: string, readonly signInCode: SignInErrorCode, options?: ErrorOptions) {
    super(message, signInCode, options)
    this.name = 'EnterpriseAuthError'
  }
}

function parseUrl(value: string, allowLoopbackHttp: boolean): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch (error) {
    throw new EnterpriseAuthError('enterprise authentication URL is invalid', 'protocol', { cause: error })
  }
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
  if (url.username || url.password
    || (url.protocol !== 'https:' && !(allowLoopbackHttp && loopback && url.protocol === 'http:'))) {
    throw new EnterpriseAuthError('enterprise authentication URL is not allowed', 'protocol')
  }
  return url
}

function readToken(payload: unknown, path: string): string {
  let current = payload
  for (const key of path.split('.')) {
    if (typeof current !== 'object' || current === null || Array.isArray(current)) {
      throw new EnterpriseAuthError('enterprise login response has no token', 'protocol')
    }
    current = (current as Record<string, unknown>)[key]
  }
  if (typeof current !== 'string' || current.length === 0) {
    throw new EnterpriseAuthError('enterprise login response has no token', 'protocol')
  }
  return current
}

function requestSignal(config: EnterpriseAuthConfig, signal: AbortSignal): AbortSignal {
  return AbortSignal.any([
    signal,
    AbortSignal.timeout(Math.min(config.requestTimeoutMs, config.attemptTimeoutMs)),
  ])
}

/**
 * Exchange one username and password for the configured long-lived token.
 * @param config - Enterprise login endpoint and field mapping.
 * @param username - User-entered enterprise username.
 * @param password - User-entered password held only for this request.
 * @param signal - Attempt cancellation.
 * @returns The non-empty enterprise access token.
 * @throws {EnterpriseAuthError} for URL, transport, HTTP, and response failures.
 */
export async function exchangeEnterpriseCredentials(
  config: EnterpriseAuthConfig,
  username: string,
  password: string,
  signal: AbortSignal,
): Promise<string> {
  const url = parseUrl(config.loginUrl, config.allowLoopbackHttp)
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        [config.usernameField]: username,
        [config.passwordField]: password,
      }),
      signal: requestSignal(config, signal),
    })
  } catch (error) {
    if (signal.aborted) throw error
    throw new EnterpriseAuthError('enterprise login request failed', 'network', { cause: error })
  }
  if (!response.ok) {
    const signInCode: SignInErrorCode = response.status === 401 || response.status === 403 ? 'network' : 'protocol'
    await response.body?.cancel()
    throw new EnterpriseAuthError(`enterprise login responded ${String(response.status)}`, signInCode)
  }
  let payload: unknown
  try {
    payload = await response.json()
  } catch (error) {
    throw new EnterpriseAuthError('enterprise login response is not JSON', 'protocol', { cause: error })
  }
  return readToken(payload, config.tokenField)
}

/**
 * Ask the enterprise service to revoke one stored token.
 * @param config - Enterprise logout endpoint and timeout settings.
 * @param token - Token already removed from the local credential store.
 * @param signal - Background revocation lifetime.
 * @returns After the remote request settles.
 * @throws {EnterpriseAuthError} when the URL or request is rejected.
 */
export async function revokeEnterpriseToken(
  config: EnterpriseAuthConfig,
  token: string,
  signal: AbortSignal,
): Promise<void> {
  if (config.logoutUrl === undefined) return
  const url = parseUrl(config.logoutUrl, config.allowLoopbackHttp)
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: '{}',
      signal: requestSignal(config, signal),
    })
  } catch (error) {
    if (signal.aborted) throw error
    throw new EnterpriseAuthError('enterprise logout request failed', 'network', { cause: error })
  }
  await response.body?.cancel()
  if (!response.ok && response.status !== 401) {
    throw new EnterpriseAuthError(`enterprise logout responded ${String(response.status)}`, 'network')
  }
}
