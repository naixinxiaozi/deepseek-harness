/** Enterprise username and password account provider for the branded Desktop application. */

import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { platform, release } from 'node:os'
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-agent'
import { credentialRef, type CredentialRef } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-credentials'
import {
  type AccountClientMetadata,
  type AccountDetails,
  type AccountNotification,
  type AccountNotificationBatch,
  type AccountNotificationEvent,
  type AccountNotificationId,
  type AccountUpdate,
  type AccountUserId,
  type AccountView,
  type PlatformSession,
  type SignInAttemptId,
  type SignInAttemptView,
} from '@deepseek-ai/dsh-deepseek-account'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { LlmError } from '@deepseek-ai/dsh-llm'
import { brandString } from '@deepseek-ai/dsh-brand'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { EnterpriseAuthError, exchangeEnterpriseCredentials, revokeEnterpriseToken } from './protocol.ts'
import { renderEnterpriseLoginPage } from './login-page.ts'

export { EnterpriseAuthError } from './protocol.ts'
export { renderEnterpriseLoginPage } from './login-page.ts'
export type { EnterpriseAuthConfig } from './config.ts'

/** Stable plugin name. */
export const name = 'enterprise-account'
/** Host services required by the provider. */
export const inject = ['credentials', 'webServer']

/** Credential reference consumed by the enterprise `llm-pi-ai` route. */
export const ENTERPRISE_LLM_TOKEN: CredentialRef = credentialRef('ENTERPRISE_LLM_TOKEN')

const MAX_FORM_BYTES = 16 * 1024

/** Private profile configuration for the enterprise account provider. */
export interface Config {
  /** Product name shown on the Host-owned login page. */
  readonly productName: string
  /** Enterprise login endpoint. */
  readonly loginUrl: string
  /** Optional enterprise logout endpoint. */
  readonly logoutUrl?: string
  /** Enterprise account usage page. */
  readonly usageUrl: string
  /** Enterprise top-up page. */
  readonly topUpUrl: string
  /** Exact inference origin allowed to receive the stored token. */
  readonly inferenceOrigin: string
  /** JSON field carrying the username. */
  readonly usernameField: string
  /** JSON field carrying the password. */
  readonly passwordField: string
  /** Dot-separated JSON path carrying the access token. */
  readonly tokenField: string
  /** Permit loopback HTTP for owned tests. */
  readonly allowLoopbackHttp: boolean
  /** Maximum duration of one enterprise HTTP request. */
  readonly requestTimeoutMs: number
  /** Maximum lifetime of one browser login attempt. */
  readonly attemptTimeoutMs: number
}

/** Runtime schema for enterprise account configuration. */
export const Config: z<Config> = z.object({
  productName: z.string().required(),
  loginUrl: z.string().required(),
  logoutUrl: z.string(),
  usageUrl: z.string().required(),
  topUpUrl: z.string().required(),
  inferenceOrigin: z.string().required(),
  usernameField: z.string().default('username'),
  passwordField: z.string().default('password'),
  tokenField: z.string().default('access_token'),
  allowLoopbackHttp: z.boolean().default(false),
  requestTimeoutMs: z.number().min(1).max(120_000).default(30_000),
  attemptTimeoutMs: z.number().min(1).max(3_600_000).default(600_000),
})

interface Attempt {
  readonly id: SignInAttemptId
  readonly nonce: string
  readonly locale: string
  readonly origin: string
  readonly controller: AbortController
  view: SignInAttemptView
  done: Promise<void>
  disposeRoute: () => Promise<void>
}

function clientOrigin(value: string): URL {
  const url = new URL(value)
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new EnterpriseAuthError('enterprise login requires a loopback callback origin', 'protocol')
  }
  return url
}

function browserDestination(value: string): string {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('enterprise account: account links must be HTTPS URLs without credentials')
  }
  return url.href
}

function responseHeaders(pageHeaders: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(Object.entries(pageHeaders))
}

async function readPostForm(request: IncomingMessage): Promise<URLSearchParams> {
  if (!request.headers['content-type']?.toLowerCase().startsWith('application/x-www-form-urlencoded')) {
    throw new EnterpriseAuthError('enterprise login form requires URL-encoded input', 'protocol')
  }
  const chunks: Uint8Array[] = []
  let bytes = 0
  for await (const chunk of request) {
    const value = Buffer.from(chunk as Uint8Array)
    bytes += value.byteLength
    if (bytes > MAX_FORM_BYTES) throw new EnterpriseAuthError('enterprise login form is too large', 'protocol')
    chunks.push(value)
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'))
}

function nonceMatches(expected: string, received: string): boolean {
  const left = Buffer.from(expected)
  const right = Buffer.from(received)
  return left.byteLength === right.byteLength && timingSafeEqual(left, right)
}

/** Enterprise account service backed by one long-lived credential reference. */
export class EnterpriseAccount extends TypertRemoteService {
  static inject = inject
  static Config = Config
  private readonly enterpriseConfig: Config
  private readonly enterpriseUsageUrl: string
  private readonly enterpriseTopUpUrl: string
  private readonly enterpriseInferenceOrigin: string
  private readonly enterpriseListeners = new Set<(kind: AccountUpdate['type']) => void>()
  private enterpriseAttempt: Attempt | undefined
  private enterpriseRemoving: Promise<AccountView> | undefined
  private enterpriseClosed = false
  private readonly enterpriseLifetime = new AbortController()

  /**
   * @param ctx - Host with credentials and webServer services.
   * @param config - Product, enterprise endpoint, and timeout configuration.
   */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'deepseekAccount', { namespace: 'account' })
    this.enterpriseConfig = Config(config)
    this.enterpriseUsageUrl = browserDestination(this.enterpriseConfig.usageUrl)
    this.enterpriseTopUpUrl = browserDestination(this.enterpriseConfig.topUpUrl)
    const inference = new URL(this.enterpriseConfig.inferenceOrigin)
    if (!['http:', 'https:'].includes(inference.protocol) || inference.username || inference.password
      || inference.pathname !== '/' || inference.search || inference.hash) {
      throw new Error('enterprise account: inferenceOrigin must be an HTTP(S) origin without credentials, path, query or fragment')
    }
    if (inference.protocol === 'http:'
      && !(this.enterpriseConfig.allowLoopbackHttp && ['127.0.0.1', 'localhost', '[::1]'].includes(inference.hostname))) {
      throw new Error('enterprise account: inferenceOrigin requires HTTPS')
    }
    this.enterpriseInferenceOrigin = inference.origin
    ctx.on('credentials/reference-updated', (ref) => {
      if (ref === ENTERPRISE_LLM_TOKEN) this.notifyChanged('credentials-changed')
    })
    ctx.inject(['agents'], (scope) => {
      scope.on('agent/error', ({ error }) => {
        if (error instanceof LlmError && error.code === 'ACCOUNT_SIGN_IN_REQUIRED') {
          scope.emit('deepseek-account/model-sign-in-required')
        }
      })
      scope.on('deepseek-account/signed-out', () => {
        for (const agent of scope.agents.list()) {
          if (agent.status === 'running' && agent.session.requestContext()?.provider === 'deepseek-account') {
            agent.cancel({ kind: 'hook', reason: 'deepseek-account/signed-out' }, { keepInbox: true })
          }
        }
      })
    })
    ctx.effect(() => async () => {
      this.enterpriseClosed = true
      this.enterpriseLifetime.abort()
      const attempt = this.enterpriseAttempt
      if (attempt !== undefined) {
        if (attempt.view.phase !== 'committing') attempt.controller.abort()
        void attempt.disposeRoute()
        await attempt.done
      }
      await this.enterpriseRemoving
      this.notifyChanged('snapshot')
    }, 'enterprise account lifetime')
  }

  async getState(): Promise<AccountView> {
    const info = await this.ctx.credentials.describe(ENTERPRISE_LLM_TOKEN)
    return {
      status: info.configured ? 'credential-stored' : 'signed-out',
      attempt: this.enterpriseAttempt?.view ?? null,
      links: { usageUrl: this.enterpriseUsageUrl, topUpUrl: this.enterpriseTopUpUrl },
    }
  }

  getProfile(_client: AccountClientMetadata): Promise<AccountDetails['profile'] | null> {
    return Promise.resolve(null)
  }

  getBalance(_client: AccountClientMetadata): Promise<AccountDetails['balance'] | null> {
    return Promise.resolve(null)
  }

  getNotifications(_client: AccountClientMetadata): Promise<AccountNotificationBatch | null> {
    return Promise.resolve(null)
  }

  getNotificationContent(
    _id: AccountNotificationId,
    _client: AccountClientMetadata,
  ): Promise<AccountNotification | null> {
    return Promise.resolve(null)
  }

  reportNotificationEvent(
    _id: AccountNotificationId,
    _event: AccountNotificationEvent,
    _client: AccountClientMetadata,
  ): Promise<boolean> {
    return Promise.resolve(false)
  }

  async startSignIn(
    client: AccountClientMetadata,
    callbackOrigin: string,
    _loginSource: 'web' | 'desktop',
  ): Promise<AccountView> {
    if (this.enterpriseClosed) throw new EnterpriseAuthError('enterprise account is disposed', 'protocol')
    const current = this.enterpriseAttempt
    if (current !== undefined
      && !['succeeded', 'cancelled', 'expired', 'failed'].includes(current.view.phase)) {
      return this.getState()
    }
    const origin = clientOrigin(callbackOrigin)
    const id = brandString<SignInAttemptId>(randomUUID())
    const nonce = randomBytes(32).toString('base64url')
    const path = `/enterprise-login/${id}`
    const attempt: Attempt = {
      id,
      nonce,
      locale: client.locale,
      origin: origin.origin,
      controller: new AbortController(),
      view: {
        id,
        phase: 'waiting-browser',
        authorizeUrl: new URL(path, origin).href,
        expiresAt: Date.now() + this.enterpriseConfig.attemptTimeoutMs,
      },
      done: Promise.resolve(),
      disposeRoute: () => Promise.resolve(),
    }
    attempt.disposeRoute = this.ctx.effect(() => {
      const dispose = this.ctx.webServer.register({
        kind: 'exact',
        path,
        handler: (request, response) => {
          void this.handleLogin(attempt, request, response).catch((error: unknown) => {
            console.error('[enterprise-account] login route failed', error instanceof Error ? error.name : 'unknown')
            if (!response.headersSent) response.writeHead(500, { 'cache-control': 'no-store' }).end()
          })
        },
      })
      return () => { dispose() }
    }, 'enterprise account login form')
    this.enterpriseAttempt = attempt
    this.notifyChanged('snapshot')
    return this.getState()
  }

  async cancelSignIn(id: SignInAttemptId): Promise<AccountView> {
    const attempt = this.enterpriseAttempt
    if (attempt?.id === id) {
      if (attempt.view.phase !== 'committing') {
        attempt.controller.abort()
        this.updateAttempt(attempt, { phase: 'cancelled', authorizeUrl: undefined })
        void attempt.disposeRoute()
      }
      await attempt.done
    }
    return this.getState()
  }

  signOut(_client: AccountClientMetadata): Promise<AccountView> {
    this.enterpriseRemoving ??= (async () => {
      const current = await this.ctx.credentials.resolve(ENTERPRISE_LLM_TOKEN)
      await this.ctx.credentials.unset(ENTERPRISE_LLM_TOKEN)
      if (this.enterpriseAttempt !== undefined) {
        this.enterpriseAttempt.controller.abort()
        void this.enterpriseAttempt.disposeRoute()
      }
      this.enterpriseAttempt = undefined
      this.ctx.emit('deepseek-account/signed-out')
      this.notifyChanged('snapshot')
      if (current !== undefined) {
        void revokeEnterpriseToken(
          this.enterpriseConfig,
          current.value,
          AbortSignal.timeout(this.enterpriseConfig.requestTimeoutMs),
        ).catch(() => undefined)
      }
      return this.getState()
    })().finally(() => { this.enterpriseRemoving = undefined })
    return this.enterpriseRemoving
  }

  async resolveToken(url: string): Promise<string | undefined> {
    if (this.enterpriseClosed || new URL(url).origin !== this.enterpriseInferenceOrigin) return undefined
    return (await this.ctx.credentials.resolve(ENTERPRISE_LLM_TOKEN))?.value
  }

  async rejectToken(token: string): Promise<void> {
    const current = await this.ctx.credentials.resolve(ENTERPRISE_LLM_TOKEN)
    if (current?.value !== token) return
    await this.ctx.credentials.unset(ENTERPRISE_LLM_TOKEN)
    this.ctx.emit('deepseek-account/session-expired')
    this.ctx.emit('deepseek-account/signed-out')
    this.notifyChanged('snapshot')
  }

  getPlatformSession(): Promise<PlatformSession | null> {
    return Promise.resolve(null)
  }

  getDeviceIdentity(): Promise<{ deviceId?: string; userId?: AccountUserId; osVersion: string }> {
    return Promise.resolve({ osVersion: `${platform()} ${release()}` })
  }

  async* watch(signal: AbortSignal, _includeIdentityChanges = false): AsyncIterable<AccountUpdate> {
    let pending: AccountUpdate['type'] | undefined = 'snapshot'
    let wake: (() => void) | undefined
    const changed = (kind: AccountUpdate['type']): void => {
      if (kind === 'credentials-changed' || pending === undefined) pending = kind
      wake?.()
    }
    const abort = (): void => { wake?.() }
    this.enterpriseListeners.add(changed)
    signal.addEventListener('abort', abort, { once: true })
    try {
      while (!this.enterpriseClosed && !signal.aborted) {
        if (pending !== undefined) {
          const type = pending
          pending = undefined
          yield { type, state: await this.getState() }
          continue
        }
        await new Promise<void>((resolve) => { wake = resolve })
      }
    } finally {
      this.enterpriseListeners.delete(changed)
      signal.removeEventListener('abort', abort)
    }
  }

  /**
   * Inspect running work before sign-out.
   * @returns whether a running task's latest request uses the account route.
   */
  hasRunningAccountTasks(): boolean {
    return this.ctx.get('agents')?.list().some(agent =>
      agent.status === 'running' && agent.session.requestContext()?.provider === 'deepseek-account') ?? false
  }

  /**
   * Subscribe to live credential expiry without replay.
   * @param signal - subscription lifetime; provider disposal also ends it.
   * @returns expiry notifications emitted during the subscription.
   */
  async *watchExpiry(signal: AbortSignal): AsyncIterable<'session-expired'> {
    const lifetime = AbortSignal.any([signal, this.enterpriseLifetime.signal])
    let pending = 0
    let wake: (() => void) | undefined
    const stop = this.ctx.on('deepseek-account/session-expired', () => { pending++; wake?.() })
    const abort = (): void => { wake?.() }
    lifetime.addEventListener('abort', abort, { once: true })
    try {
      while (!lifetime.aborted) {
        if (pending > 0) {
          pending--
          yield 'session-expired'
          continue
        }
        await new Promise<void>((resolve) => { wake = resolve })
      }
    } finally {
      stop()
      lifetime.removeEventListener('abort', abort)
    }
  }

  /**
   * Stream account state without the Host-only identity subscription option.
   * @param signal - subscription lifetime.
   * @returns initial state, login progress, and credential-change updates.
   */
  watchState(signal: AbortSignal): AsyncIterable<AccountUpdate> {
    return this.watch(signal)
  }

  private async handleLogin(attempt: Attempt, request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (attempt !== this.enterpriseAttempt || attempt.view.phase !== 'waiting-browser'
      || Date.now() >= (attempt.view.expiresAt ?? 0)) {
      response.writeHead(410, { 'cache-control': 'no-store' }).end()
      return
    }
    if (request.method === 'GET') {
      const page = renderEnterpriseLoginPage({
        productName: this.enterpriseConfig.productName,
        nonce: attempt.nonce,
        locale: attempt.locale,
      })
      response.writeHead(200, responseHeaders(page.headers)).end(page.html)
      return
    }
    if (request.method !== 'POST') {
      response.writeHead(405, { allow: 'GET, POST', 'cache-control': 'no-store' }).end()
      return
    }
    if (request.headers.origin !== undefined && request.headers.origin !== attempt.origin) {
      response.writeHead(403, { 'cache-control': 'no-store' }).end()
      return
    }
    attempt.done = this.submit(attempt, request, response)
    await attempt.done
  }

  private async submit(attempt: Attempt, request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const form = await readPostForm(request)
      if (!nonceMatches(attempt.nonce, form.get('nonce') ?? '')) {
        response.writeHead(403, { 'cache-control': 'no-store' }).end()
        return
      }
      const username = form.get('username') ?? ''
      const password = form.get('password') ?? ''
      if (username === '' || password === '') {
        this.failPage(attempt, response, 'invalid-credentials', 400)
        return
      }
      this.updateAttempt(attempt, { phase: 'exchanging' })
      const token = await exchangeEnterpriseCredentials(
        this.enterpriseConfig,
        username,
        password,
        attempt.controller.signal,
      )
      attempt.controller.signal.throwIfAborted()
      this.updateAttempt(attempt, { phase: 'committing' })
      await this.ctx.credentials.set(ENTERPRISE_LLM_TOKEN, token)
      this.updateAttempt(attempt, { phase: 'succeeded' })
      void attempt.disposeRoute()
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
      }).end('<!doctype html><meta charset="utf-8"><title>Signed in</title><p>Sign-in complete. Return to the application.</p>')
    } catch (error) {
      if (attempt.controller.signal.aborted) {
        if (!response.headersSent) response.writeHead(204, { 'cache-control': 'no-store' }).end()
        return
      }
      const pageError = error instanceof EnterpriseAuthError ? error.signInCode : 'protocol'
      this.failPage(attempt, response, pageError, 400)
    }
  }

  private failPage(
    attempt: Attempt,
    response: ServerResponse,
    error: 'invalid-credentials' | 'no-response' | 'network' | 'protocol' | 'expired' | 'storage',
    status: number,
  ): void {
    const page = renderEnterpriseLoginPage({
      productName: this.enterpriseConfig.productName,
      nonce: attempt.nonce,
      locale: attempt.locale,
      error,
    })
    this.updateAttempt(attempt, {
      phase: error === 'expired' ? 'expired' : 'failed',
      authorizeUrl: undefined,
      errorCode: error === 'invalid-credentials' ? 'protocol' : error,
    })
    void attempt.disposeRoute()
    if (!response.headersSent) response.writeHead(status, responseHeaders(page.headers)).end(page.html)
  }

  private updateAttempt(
    attempt: Attempt,
    view: Omit<Partial<SignInAttemptView>, 'authorizeUrl'> & { authorizeUrl?: string | undefined },
  ): void {
    const { authorizeUrl: _authorizeUrl, ...current } = attempt.view
    const { authorizeUrl, ...next } = view
    attempt.view = {
      ...current,
      ...next,
      ...(authorizeUrl === undefined ? {} : { authorizeUrl }),
    }
    this.notifyChanged('snapshot')
  }

  private notifyChanged(kind: AccountUpdate['type']): void {
    for (const listener of this.enterpriseListeners) listener(kind)
  }
}

export default EnterpriseAccount
