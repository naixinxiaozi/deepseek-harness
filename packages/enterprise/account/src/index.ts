/** Enterprise username and password account provider for the branded Desktop application. */

import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { platform, release } from 'node:os'
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { credentialRef, type CredentialRef } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-credentials'
import {
  DeepSeekAccount,
  installAccountTaskCancellation,
  type AccountBonusBatch,
  type AccountBonusOrderId,
  type AccountClientMetadata,
  type AccountDetails,
  type AccountUserId,
  type AccountView,
  type PlatformSession,
  type SignInAttemptId,
  type SignInAttemptView,
} from '@deepseek-ai/dsh-deepseek-account'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { brandString } from '@deepseek-ai/dsh-brand'
import { EnterpriseAuthError, exchangeEnterpriseCredentials, revokeEnterpriseToken } from './protocol.ts'
import { renderEnterpriseLoginPage } from './login-page.ts'

export { EnterpriseAuthError } from './protocol.ts'
export { renderEnterpriseLoginPage } from './login-page.ts'
export type { EnterpriseAuthConfig } from './config.ts'

/** Stable plugin name. */
export const name = 'enterprise-account'
/** Host services required by the provider. */
export const inject = ['credentials', 'webServer'] as const

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
export class EnterpriseAccount extends DeepSeekAccount {
  static inject = inject
  static Config = Config
  private readonly config: Config
  private readonly usageUrl: string
  private readonly topUpUrl: string
  private readonly inferenceOrigin: string
  private readonly listeners = new Set<() => void>()
  private attempt: Attempt | undefined
  private removing: Promise<AccountView> | undefined
  private closed = false

  /**
   * @param ctx - Host with credentials and webServer services.
   * @param config - Product, enterprise endpoint, and timeout configuration.
   */
  constructor(ctx: Context, config: Config) {
    super(ctx)
    installAccountTaskCancellation(ctx)
    this.config = Config(config)
    this.usageUrl = browserDestination(this.config.usageUrl)
    this.topUpUrl = browserDestination(this.config.topUpUrl)
    const inference = new URL(this.config.inferenceOrigin)
    if (!['http:', 'https:'].includes(inference.protocol) || inference.username || inference.password
      || inference.pathname !== '/' || inference.search || inference.hash) {
      throw new Error('enterprise account: inferenceOrigin must be an HTTP(S) origin without credentials, path, query or fragment')
    }
    if (inference.protocol === 'http:'
      && !(this.config.allowLoopbackHttp && ['127.0.0.1', 'localhost', '[::1]'].includes(inference.hostname))) {
      throw new Error('enterprise account: inferenceOrigin requires HTTPS')
    }
    this.inferenceOrigin = inference.origin
    ctx.on('credentials/reference-updated', (ref) => {
      if (ref === ENTERPRISE_LLM_TOKEN) this.changed()
    })
    ctx.effect(() => async () => {
      this.closed = true
      const attempt = this.attempt
      if (attempt !== undefined) {
        if (attempt.view.phase !== 'committing') attempt.controller.abort()
        void attempt.disposeRoute()
        await attempt.done
      }
      await this.removing
      this.changed()
    }, 'enterprise account lifetime')
  }

  override async getState(): Promise<AccountView> {
    const info = await this.ctx.credentials.describe(ENTERPRISE_LLM_TOKEN)
    return {
      status: info.configured ? 'credential-stored' : 'signed-out',
      attempt: this.attempt?.view ?? null,
      links: { usageUrl: this.usageUrl, topUpUrl: this.topUpUrl },
    }
  }

  override getProfile(_client: AccountClientMetadata): Promise<AccountDetails['profile'] | null> {
    return Promise.resolve(null)
  }

  override getBalance(_client: AccountClientMetadata): Promise<AccountDetails['balance'] | null> {
    return Promise.resolve(null)
  }

  override getUnnotifiedBonuses(_client: AccountClientMetadata): Promise<AccountBonusBatch | null> {
    return Promise.resolve(null)
  }

  override ackBonusNotified(
    _accountId: AccountUserId,
    _orderId: AccountBonusOrderId,
    _client: AccountClientMetadata,
  ): Promise<boolean> {
    return Promise.resolve(false)
  }

  override async startSignIn(
    client: AccountClientMetadata,
    callbackOrigin: string,
    _loginSource: 'web' | 'desktop',
  ): Promise<AccountView> {
    if (this.closed) throw new EnterpriseAuthError('enterprise account is disposed', 'protocol')
    const current = this.attempt
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
        expiresAt: Date.now() + this.config.attemptTimeoutMs,
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
    this.attempt = attempt
    this.changed()
    return this.getState()
  }

  override async cancelSignIn(id: SignInAttemptId): Promise<AccountView> {
    const attempt = this.attempt
    if (attempt?.id === id) {
      if (attempt.view.phase !== 'committing') {
        attempt.controller.abort()
        this.update(attempt, { phase: 'cancelled', authorizeUrl: undefined })
        void attempt.disposeRoute()
      }
      await attempt.done
    }
    return this.getState()
  }

  override signOut(_client: AccountClientMetadata): Promise<AccountView> {
    this.removing ??= (async () => {
      const current = await this.ctx.credentials.resolve(ENTERPRISE_LLM_TOKEN)
      await this.ctx.credentials.unset(ENTERPRISE_LLM_TOKEN)
      if (this.attempt !== undefined) {
        this.attempt.controller.abort()
        void this.attempt.disposeRoute()
      }
      this.attempt = undefined
      this.ctx.emit('deepseek-account/signed-out')
      this.changed()
      if (current !== undefined) {
        void revokeEnterpriseToken(
          this.config,
          current.value,
          AbortSignal.timeout(this.config.requestTimeoutMs),
        ).catch(() => undefined)
      }
      return this.getState()
    })().finally(() => { this.removing = undefined })
    return this.removing
  }

  override async resolveToken(url: string): Promise<string | undefined> {
    if (this.closed || new URL(url).origin !== this.inferenceOrigin) return undefined
    return (await this.ctx.credentials.resolve(ENTERPRISE_LLM_TOKEN))?.value
  }

  override async rejectToken(token: string): Promise<void> {
    const current = await this.ctx.credentials.resolve(ENTERPRISE_LLM_TOKEN)
    if (current?.value !== token) return
    await this.ctx.credentials.unset(ENTERPRISE_LLM_TOKEN)
    this.ctx.emit('deepseek-account/session-expired')
    this.ctx.emit('deepseek-account/signed-out')
    this.changed()
  }

  override getPlatformSession(): Promise<PlatformSession | null> {
    return Promise.resolve(null)
  }

  override getDeviceIdentity(): Promise<{ deviceId?: string; userId?: AccountUserId; osVersion: string }> {
    return Promise.resolve({ osVersion: `${platform()} ${release()}` })
  }

  override async* watch(signal: AbortSignal): AsyncIterable<AccountView> {
    let dirty = true
    let wake: (() => void) | undefined
    const changed = (): void => {
      dirty = true
      wake?.()
    }
    this.listeners.add(changed)
    signal.addEventListener('abort', changed, { once: true })
    try {
      while (!this.closed && !signal.aborted) {
        if (dirty) {
          dirty = false
          yield await this.getState()
          continue
        }
        await new Promise<void>((resolve) => { wake = resolve })
      }
    } finally {
      this.listeners.delete(changed)
      signal.removeEventListener('abort', changed)
    }
  }

  private async handleLogin(attempt: Attempt, request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (attempt !== this.attempt || attempt.view.phase !== 'waiting-browser' || Date.now() >= (attempt.view.expiresAt ?? 0)) {
      response.writeHead(410, { 'cache-control': 'no-store' }).end()
      return
    }
    if (request.method === 'GET') {
      const page = renderEnterpriseLoginPage({
        productName: this.config.productName,
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
      this.update(attempt, { phase: 'exchanging' })
      const token = await exchangeEnterpriseCredentials(
        this.config,
        username,
        password,
        attempt.controller.signal,
      )
      attempt.controller.signal.throwIfAborted()
      this.update(attempt, { phase: 'committing' })
      await this.ctx.credentials.set(ENTERPRISE_LLM_TOKEN, token)
      this.update(attempt, { phase: 'succeeded' })
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
      productName: this.config.productName,
      nonce: attempt.nonce,
      locale: attempt.locale,
      error,
    })
    this.update(attempt, {
      phase: error === 'expired' ? 'expired' : 'failed',
      authorizeUrl: undefined,
      errorCode: error === 'invalid-credentials' ? 'protocol' : error,
    })
    void attempt.disposeRoute()
    if (!response.headersSent) response.writeHead(status, responseHeaders(page.headers)).end(page.html)
  }

  private update(
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
    this.changed()
  }

  private changed(): void {
    for (const listener of this.listeners) listener()
  }
}

export default EnterpriseAccount
