# Enterprise Desktop Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce an independently branded Desktop distribution that signs in with enterprise username and password, sends model requests through an OpenAI-compatible enterprise proxy, keeps Sessions local, and isolates all enterprise behavior from upstream DeepSeek Harness code.

**Architecture:** Four private packages under `packages/enterprise/` own distribution validation, enterprise authentication, the private bundle patch, and client branding. A small Desktop distribution adapter loads the enterprise manifest, chooses the profile bundles and application identity, and exposes only the values the Host and renderer need. Existing `llm-pi-ai`, `DeepSeekAccount`, JSONL persistence, and Web UI slots remain the runtime mechanisms.

**Tech Stack:** TypeScript, Cordis services and effects, Schemastery and Zod validation, Electron, `llm-pi-ai`, `dsh-deepseek-account`, `dsh-credentials-local`, Vitest, Vite, electron-builder.

**Spec:** [2026-11-11-enterprise-desktop-distribution.md](../notes/proposed/feature/2026-11-11-enterprise-desktop-distribution.md)

## Global Constraints

- Node.js is at least `24.9`; the workspace pins `pnpm@11.28.5`.
- Private package scope is `@dsh-enterprise`.
- Custom packages are `packages/enterprise/distribution`, `packages/enterprise/account`, `packages/enterprise/bundle`, and `packages/enterprise/ui-brand`.
- The model provider route is `enterprise`, `api` defaults to `openai-completions`, and the credential reference is exactly `ENTERPRISE_LLM_TOKEN`.
- Sessions remain append-only local JSONL; no Session persistence code or Session format changes.
- Official `llm-deepseek` and `llm-deepseek-account` routes are disabled in the enterprise bundle.
- Passwords, tokens, raw authentication bodies, and raw provider bodies never enter logs, analytics, renderer IPC, Session events, model context, tool results, or crash reports.
- Enterprise authentication and proxy URLs use HTTPS. Loopback HTTP requires `allowLoopbackHttp: true` in a test manifest.
- Enterprise production packaging requires `DSH_DESKTOP_DISTRIBUTION` to name an absolute distribution JSON file.
- Enterprise builds use their own `appId`, protocol scheme, `userData` directory, Harness home, logs, single-instance lock, signing identity, and either no updater or an enterprise update feed.
- Tests use `Northstar Harness`, `com.northstar.harness`, scheme `northstar-harness`, and `https://services.northstar.example` as fixed fixture values.
- Do not edit generated files, archived Agent Notes, `vendor/`, or core package implementations.

---

### Task 1: Distribution Manifest And Private Package Group

**Files:**
- Create: `packages/enterprise/README.md`
- Create: `packages/enterprise/README.zh.md`
- Create: `packages/enterprise/README.i18n.yaml`
- Create: `packages/enterprise/distribution/package.json`
- Create: `packages/enterprise/distribution/README.md`
- Create: `packages/enterprise/distribution/README.zh.md`
- Create: `packages/enterprise/distribution/README.i18n.yaml`
- Create: `packages/enterprise/distribution/tsconfig.json`
- Create: `packages/enterprise/distribution/src/index.ts`
- Create: `packages/enterprise/distribution/src/types.ts`
- Create: `packages/enterprise/distribution/tests/distribution.spec.ts`
- Create: `packages/enterprise/distribution/tests/fixtures/distribution.json`
- Modify: `packages/README.md`
- Modify: `packages/README.zh.md`
- Modify: `packages/README.i18n.yaml`
- Modify: `tsconfig.base.json`
- Modify: `tsconfig.host.json`
- Modify: `tsconfig.client.json`
- Modify: `scripts/doc-standard.spec.ts`
- Modify: `scripts/verify-package-readme-model-experience.ts`

**Interfaces:**
- Consumes: the confirmed requirements in the design document.
- Produces: `EnterpriseDistribution`, `EnterpriseModel`, `parseEnterpriseDistribution(value: unknown): EnterpriseDistribution`, and `ENTERPRISE_DISTRIBUTION_SCHEMA_VERSION = 1`.

- [x] **Step 1: Write the failing manifest test**

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseEnterpriseDistribution } from '../src/index.ts'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/distribution.json', import.meta.url), 'utf8'))

describe('enterprise distribution', () => {
  it('accepts the fixed Northstar fixture', () => {
    expect(parseEnterpriseDistribution(fixture)).toMatchObject({
      product: { name: 'Northstar Harness', appId: 'com.northstar.harness' },
      model: { provider: 'enterprise', api: 'openai-completions', defaultModel: 'northstar-chat' },
    })
  })

  type MutableFixture = {
    product: Record<string, unknown>
    auth: Record<string, unknown>
    model: Record<string, unknown>
    update: Record<string, unknown>
  }
  it.each([
    ['non-HTTPS login', (value: MutableFixture) => { value.auth.loginUrl = 'http://auth.northstar.example/login' }],
    ['empty model catalog', (value: MutableFixture) => { value.model.models = [] }],
    ['missing default model', (value: MutableFixture) => { value.model.defaultModel = 'missing' }],
    ['official application id', (value: MutableFixture) => { value.product.appId = 'com.deepseek.harness' }],
    ['official update feed', (value: MutableFixture) => { value.update.feed = 'https://download.deepseek.com/nightly.yml' }],
  ])('rejects %s', (_name, mutate) => {
    const candidate = structuredClone(fixture) as MutableFixture
    mutate(candidate)
    expect(() => parseEnterpriseDistribution(candidate)).toThrow()
  })
})
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run packages/enterprise/distribution/tests/distribution.spec.ts`

Expected: FAIL because `packages/enterprise/distribution/src/index.ts` does not exist.

- [x] **Step 3: Add the concrete manifest types**

```ts
export const ENTERPRISE_DISTRIBUTION_SCHEMA_VERSION = 1 as const

export interface EnterpriseModel {
  readonly id: string
  readonly name?: string
  readonly contextWindow: number
  readonly maxTokens: number
  readonly input?: readonly ('text' | 'image')[]
}

export interface EnterpriseDistribution {
  readonly schemaVersion: typeof ENTERPRISE_DISTRIBUTION_SCHEMA_VERSION
  readonly product: {
    readonly name: string
    readonly executableName: string
    readonly companyName: string
    readonly copyright: string
    readonly appId: string
    readonly protocolName: string
    readonly protocolScheme: string
    readonly dataDirectory: string
  }
  readonly auth: {
    readonly loginUrl: string
    readonly logoutUrl?: string
    readonly usageUrl: string
    readonly topUpUrl: string
    readonly inferenceOrigin: string
    readonly usernameField: string
    readonly passwordField: string
    readonly tokenField: string
    readonly allowLoopbackHttp: boolean
    readonly requestTimeoutMs: number
    readonly attemptTimeoutMs: number
  }
  readonly model: {
    readonly provider: 'enterprise'
    readonly displayName: string
    readonly baseUrl: string
    readonly api: 'openai-completions' | 'openai-responses'
    readonly defaultModel: string
    readonly models: readonly EnterpriseModel[]
  }
  readonly branding: {
    readonly windowsIcon: string
    readonly macosIcon: string
    readonly trayIcon: string
    readonly welcomeMark: string
    readonly installerSidebar: string
  }
  readonly update:
    | { readonly mode: 'disabled' }
    | { readonly mode: 'enterprise'; readonly feed: string; readonly channel: string }
  readonly bundles: readonly string[]
}
```

- [x] **Step 4: Implement strict parsing**

Create `src/index.ts` with a Zod schema that validates all fields above. It must require a reverse-domain `product.appId`, a lowercase protocol scheme matching `/^[a-z][a-z0-9+.-]*$/`, two HTTPS account links, an HTTPS login URL unless `allowLoopbackHttp` is true and the host is loopback, a non-empty unique model list, and a `defaultModel` present in that list.

```ts
import { z } from 'zod'
import { ENTERPRISE_DISTRIBUTION_SCHEMA_VERSION, type EnterpriseDistribution } from './types.ts'

const endpoint = z.url()
const model = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  contextWindow: z.number().int().positive(),
  maxTokens: z.number().int().positive(),
  input: z.array(z.enum(['text', 'image'])).min(1).optional(),
})

const schema = z.object({
  schemaVersion: z.literal(ENTERPRISE_DISTRIBUTION_SCHEMA_VERSION),
  product: z.object({
    name: z.string().min(1),
    executableName: z.string().min(1),
    companyName: z.string().min(1),
    copyright: z.string().min(1),
    appId: z.string().regex(/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/).refine(value => !value.startsWith('com.deepseek.'), 'enterprise appId required'),
    protocolName: z.string().min(1),
    protocolScheme: z.string().regex(/^[a-z][a-z0-9+.-]*$/),
    dataDirectory: z.string().min(1).refine(value => value !== '.' && value !== '..' && !/[/\\\0]/u.test(value), 'expected one directory name'),
  }),
  auth: z.object({
    loginUrl: endpoint,
    logoutUrl: endpoint.optional(),
    usageUrl: endpoint,
    topUpUrl: endpoint,
    inferenceOrigin: endpoint,
    usernameField: z.string().min(1),
    passwordField: z.string().min(1),
    tokenField: z.string().min(1),
    allowLoopbackHttp: z.boolean().default(false),
    requestTimeoutMs: z.number().int().min(1).max(120_000).default(30_000),
    attemptTimeoutMs: z.number().int().min(1).max(3_600_000).default(600_000),
  }),
  model: z.object({
    provider: z.literal('enterprise'),
    displayName: z.string().min(1),
    baseUrl: endpoint,
    api: z.enum(['openai-completions', 'openai-responses']),
    defaultModel: z.string().min(1),
    models: z.array(model).min(1),
  }),
  branding: z.object({
    windowsIcon: z.string().min(1),
    macosIcon: z.string().min(1),
    trayIcon: z.string().min(1),
    welcomeMark: z.string().min(1),
    installerSidebar: z.string().min(1),
  }),
  update: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('disabled') }),
    z.object({
      mode: z.literal('enterprise'),
      feed: endpoint.refine(value => !new URL(value).hostname.endsWith('deepseek.com'), 'enterprise update feed required'),
      channel: z.string().min(1),
    }),
  ]),
  bundles: z.array(z.string().min(1)).min(2),
})

export function parseEnterpriseDistribution(value: unknown): EnterpriseDistribution {
  const parsed = schema.parse(value)
  const loopback = (url: URL): boolean => ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
  const endpoint = (urlText: string, allowPath: boolean): URL => {
    const url = new URL(urlText)
    const permittedProtocol = url.protocol === 'https:'
      || (parsed.auth.allowLoopbackHttp && url.protocol === 'http:' && loopback(url))
    if (!permittedProtocol || url.username || url.password || url.search || url.hash
      || (!allowPath && url.pathname !== '/')) {
      throw new Error('enterprise distribution: invalid service URL')
    }
    return url
  }
  endpoint(parsed.auth.loginUrl, true)
  if (parsed.auth.logoutUrl !== undefined) endpoint(parsed.auth.logoutUrl, true)
  endpoint(parsed.auth.usageUrl, true)
  endpoint(parsed.auth.topUpUrl, true)
  endpoint(parsed.auth.inferenceOrigin, false)
  endpoint(parsed.model.baseUrl, true)
  if (parsed.update.mode === 'enterprise') endpoint(parsed.update.feed, true)
  const ids = parsed.model.models.map(entry => entry.id)
  if (new Set(ids).size !== ids.length) throw new Error('enterprise distribution: duplicate model id')
  if (!ids.includes(parsed.model.defaultModel)) throw new Error('enterprise distribution: defaultModel is not in models')
  return Object.freeze(parsed) as EnterpriseDistribution
}
```

- [x] **Step 5: Add the fixture and package metadata**

Create `tests/fixtures/distribution.json` with the fixed Northstar values and relative asset paths under `tests/fixtures/assets/`. Add the package manifest with `private: true`, version `0.2.2-rc.1`, dependencies on `zod`, and `files` containing `lib/index.js` and declarations. Add TypeScript references to both aggregations.

Write the English and Chinese group and package READMEs, then record both pairs:

```bash
pnpm run verify-translation-pairing --write packages/README.md
pnpm run verify-translation-pairing --write packages/enterprise/README.md
pnpm run verify-translation-pairing --write packages/enterprise/distribution/README.md
```

- [x] **Step 6: Run the focused test**

Run: `pnpm exec vitest run packages/enterprise/distribution/tests/distribution.spec.ts`

Expected: PASS with 6 tests.

- [x] **Step 7: Run package and type checks**

Run: `pnpm exec tsc -b packages/enterprise/distribution`

Expected: exit 0.

Run: `pnpm run test:docs`

Expected: PASS.

Run: `pnpm run build:check`

Expected: exit 0.

- [x] **Step 8: Commit**

```bash
git add packages/enterprise packages/README.md tsconfig.host.json tsconfig.client.json
git commit -m "feat(enterprise): add distribution manifest"
```

---

### Task 2: Enterprise Credential Exchange

**Files:**
- Create: `packages/enterprise/account/package.json`
- Create: `packages/enterprise/account/README.md`
- Create: `packages/enterprise/account/README.zh.md`
- Create: `packages/enterprise/account/README.i18n.yaml`
- Create: `packages/enterprise/account/tsconfig.json`
- Create: `packages/enterprise/account/src/config.ts`
- Create: `packages/enterprise/account/src/protocol.ts`
- Create: `packages/enterprise/account/tests/protocol.spec.ts`

**Interfaces:**
- Consumes: `EnterpriseDistribution['auth']`.
- Produces: `EnterpriseAuthConfig`, `EnterpriseAuthError`, `exchangeEnterpriseCredentials(config, username, password, signal)`, and `revokeEnterpriseToken(config, token, signal)`.

- [ ] **Step 1: Write the protocol tests**

```ts
import { createServer } from 'node:http'
import { describe, expect, it } from 'vitest'
import { EnterpriseAuthError, exchangeEnterpriseCredentials } from '../src/protocol.ts'

describe('enterprise credential exchange', () => {
  it('posts the configured fields and reads the configured token field', async () => {
    let received = ''
    const server = createServer((request, response) => {
      request.setEncoding('utf8')
      request.on('data', chunk => { received += chunk })
      request.on('end', () => {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ result: { access_token: 'token-1' } }))
      })
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('server did not bind')
    try {
      await expect(exchangeEnterpriseCredentials({
        loginUrl: `http://127.0.0.1:${address.port}/login`,
        inferenceOrigin: 'https://inference.northstar.example',
        usernameField: 'user',
        passwordField: 'secret',
        tokenField: 'result.access_token',
        allowLoopbackHttp: true,
        requestTimeoutMs: 2_000,
        attemptTimeoutMs: 10_000,
      }, 'alice', 'correct horse', new AbortController().signal)).resolves.toBe('token-1')
      expect(JSON.parse(received)).toEqual({ user: 'alice', secret: 'correct horse' })
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error === undefined ? resolve() : reject(error)))
    }
  })

  it('maps a rejected request without exposing the response body', async () => {
    const config = {
      loginUrl: 'http://127.0.0.1:1/login',
      inferenceOrigin: 'https://inference.northstar.example',
      usernameField: 'username',
      passwordField: 'password',
      tokenField: 'access_token',
      allowLoopbackHttp: true,
      requestTimeoutMs: 100,
      attemptTimeoutMs: 1_000,
    }
    await expect(exchangeEnterpriseCredentials(config, 'alice', 'bad', new AbortController().signal))
      .rejects.toMatchObject({ name: 'EnterpriseAuthError', signInCode: 'network' } satisfies Partial<EnterpriseAuthError>)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run packages/enterprise/account/tests/protocol.spec.ts`

Expected: FAIL because `protocol.ts` does not exist.

- [ ] **Step 3: Implement URL and response validation**

```ts
import { HarnessError } from '@deepseek-ai/dsh-llm'
import type { SignInErrorCode } from '@deepseek-ai/dsh-deepseek-account/types'

export class EnterpriseAuthError extends HarnessError {
  constructor(message: string, readonly signInCode: SignInErrorCode, options?: ErrorOptions) {
    super(message, signInCode, options)
    this.name = 'EnterpriseAuthError'
  }
}

function parseUrl(value: string, allowLoopbackHttp: boolean): URL {
  const url = new URL(value)
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
  if (url.username || url.password || (url.protocol !== 'https:' && !(allowLoopbackHttp && loopback && url.protocol === 'http:'))) {
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
```

- [ ] **Step 4: Implement bounded exchange and revocation**

```ts
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
      body: JSON.stringify({ [config.usernameField]: username, [config.passwordField]: password }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(Math.min(config.requestTimeoutMs, config.attemptTimeoutMs))]),
    })
  } catch (error) {
    if (signal.aborted) throw error
    throw new EnterpriseAuthError('enterprise login request failed', 'network', { cause: error })
  }
  if (!response.ok) {
    await response.body?.cancel()
    throw new EnterpriseAuthError(`enterprise login responded ${String(response.status)}`, response.status === 401 ? 'network' : 'protocol')
  }
  let payload: unknown
  try {
    payload = await response.json()
  } catch (error) {
    throw new EnterpriseAuthError('enterprise login response is not JSON', 'protocol', { cause: error })
  }
  return readToken(payload, config.tokenField)
}

export async function revokeEnterpriseToken(
  config: EnterpriseAuthConfig,
  token: string,
  signal: AbortSignal,
): Promise<void> {
  if (config.logoutUrl === undefined) return
  const response = await fetch(parseUrl(config.logoutUrl, config.allowLoopbackHttp), {
    method: 'POST',
    redirect: 'error',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: '{}',
    signal: AbortSignal.any([signal, AbortSignal.timeout(config.requestTimeoutMs)]),
  })
  await response.body?.cancel()
  if (!response.ok && response.status !== 401) {
    throw new EnterpriseAuthError(`enterprise logout responded ${String(response.status)}`, 'network')
  }
}
```

- [ ] **Step 5: Run the protocol tests**

Run: `pnpm exec vitest run packages/enterprise/account/tests/protocol.spec.ts`

Expected: PASS.

Record the account README pair:

```bash
pnpm run verify-translation-pairing --write packages/enterprise/account/README.md
pnpm run test:docs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/enterprise/account
git commit -m "feat(enterprise): add credential exchange"
```

---

### Task 3: Hardened Local Login Page

**Files:**
- Create: `packages/enterprise/account/src/login-page.ts`
- Create: `packages/enterprise/account/tests/login-page.spec.ts`

**Interfaces:**
- Consumes: product name, attempt nonce, locale, and an optional safe error code.
- Produces: `renderEnterpriseLoginPage(input): { html: string; headers: Record<string, string> }`.

- [ ] **Step 1: Write the failing page test**

```ts
import { describe, expect, it } from 'vitest'
import { renderEnterpriseLoginPage } from '../src/login-page.ts'

describe('enterprise login page', () => {
  it('renders an escaped password form with a one-use nonce and strict headers', () => {
    const page = renderEnterpriseLoginPage({
      productName: 'Northstar <Harness>',
      nonce: 'nonce-1',
      locale: 'zh-CN',
      error: 'invalid-credentials',
    })
    expect(page.html).toContain('Northstar &lt;Harness&gt;')
    expect(page.html).toContain('name="nonce" value="nonce-1"')
    expect(page.html).toContain('type="password"')
    expect(page.html).toContain('method="post"')
    expect(page.headers['content-security-policy']).toContain("frame-ancestors 'none'")
    expect(page.headers['cache-control']).toBe('no-store')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run packages/enterprise/account/tests/login-page.spec.ts`

Expected: FAIL because `login-page.ts` does not exist.

- [ ] **Step 3: Implement a self-contained form**

```ts
const escapeHtml = (value: string): string => value.replace(/[&<>"']/gu, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]!)

export function renderEnterpriseLoginPage(input: {
  productName: string
  nonce: string
  locale: string
  error?: 'invalid-credentials' | 'network' | 'protocol' | 'expired' | 'storage'
}) {
  const chinese = input.locale.toLowerCase().startsWith('zh')
  const title = chinese ? `登录 ${input.productName}` : `Sign in to ${input.productName}`
  const username = chinese ? '用户名' : 'Username'
  const password = chinese ? '密码' : 'Password'
  const submit = chinese ? '登录' : 'Sign in'
  const error = input.error === undefined ? '' : chinese ? '登录失败，请重试。' : 'Sign-in failed. Try again.'
  const styleNonce = input.nonce
  const html = `<!doctype html><html lang="${chinese ? 'zh-CN' : 'en'}"><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>`
    + `<style nonce="${escapeHtml(styleNonce)}">body{font:16px system-ui;max-width:28rem;margin:10vh auto;padding:2rem}`
    + `label,input,button{display:block;width:100%;box-sizing:border-box}label{margin-top:1rem}input,button{padding:.75rem;margin-top:.35rem}</style>`
    + `<main><h1>${escapeHtml(title)}</h1>${error === '' ? '' : `<p role="alert">${escapeHtml(error)}</p>`}`
    + `<form method="post">`
    + `<input type="hidden" name="nonce" value="${escapeHtml(input.nonce)}">`
    + `<label>${escapeHtml(username)}<input name="username" autocomplete="username" required></label>`
    + `<label>${escapeHtml(password)}<input name="password" type="password" autocomplete="current-password" required></label>`
    + `<button type="submit">${escapeHtml(submit)}</button></form></main></html>`
  return {
    html,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': `default-src 'none'; style-src 'nonce-${styleNonce}'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
    },
  }
}
```

- [ ] **Step 4: Run the page test**

Run: `pnpm exec vitest run packages/enterprise/account/tests/login-page.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/enterprise/account/src/login-page.ts packages/enterprise/account/tests/login-page.spec.ts
git commit -m "feat(enterprise): add local login page"
```

---

### Task 4: Enterprise Account Service

**Files:**
- Create: `packages/enterprise/account/src/index.ts`
- Create: `packages/enterprise/account/tests/account.spec.ts`
- Modify: `packages/enterprise/account/package.json`

**Interfaces:**
- Consumes: `ctx.credentials`, `ctx.webServer`, `exchangeEnterpriseCredentials`, `revokeEnterpriseToken`, and `renderEnterpriseLoginPage`.
- Produces: the `deepseekAccount` service, `ENTERPRISE_LLM_TOKEN`, `Config`, and account events required by the existing account controller.

- [ ] **Step 1: Write service behavior tests**

```ts
describe('EnterpriseAccount', () => {
  it('creates the login URL and commits the token only after the form posts', async () => {
    const subject = await createAccountFixture()
    const started = await subject.account.startSignIn(client, subject.origin, 'desktop')
    expect(started.status).toBe('signed-out')
    expect(started.attempt?.phase).toBe('waiting-browser')
    expect(started.attempt?.authorizeUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/enterprise-login\//)

    const form = await fetch(started.attempt!.authorizeUrl!)
    expect(form.status).toBe(200)
    const nonce = /name="nonce" value="([^"]+)"/u.exec(await form.text())?.[1]
    if (nonce === undefined) throw new Error('missing nonce')
    await fetch(started.attempt!.authorizeUrl!, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ nonce, username: 'alice', password: 'correct horse' }),
    })

    await expect(subject.credentials.resolve(subject.tokenRef)).resolves.toMatchObject({ value: 'token-1' })
    await expect(subject.account.getState()).resolves.toMatchObject({
      status: 'credential-stored',
      attempt: { phase: 'succeeded' },
    })
  })

  it('does not commit a token after cancellation', async () => {
    const subject = await createAccountFixture({ loginDelayMs: 100 })
    const started = await subject.account.startSignIn(client, subject.origin, 'desktop')
    const id = started.attempt!.id
    const formUrl = started.attempt!.authorizeUrl!
    const page = await (await fetch(formUrl)).text()
    const nonce = /name="nonce" value="([^"]+)"/u.exec(page)![1]
    const posting = fetch(formUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ nonce, username: 'alice', password: 'correct horse' }),
    })
    await subject.account.cancelSignIn(id)
    await posting.catch(() => undefined)
    await new Promise(resolve => setTimeout(resolve, 150))
    await expect(subject.credentials.resolve(subject.tokenRef)).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run packages/enterprise/account/tests/account.spec.ts`

Expected: FAIL because `src/index.ts` does not exist.

- [ ] **Step 3: Implement configuration and the token reference**

```ts
export const name = 'enterprise-account'
export const inject = ['credentials', 'webServer']
export const ENTERPRISE_LLM_TOKEN = credentialRef('ENTERPRISE_LLM_TOKEN')

export interface Config {
  productName: string
  loginUrl: string
  logoutUrl?: string
  usageUrl: string
  topUpUrl: string
  inferenceOrigin: string
  usernameField: string
  passwordField: string
  tokenField: string
  allowLoopbackHttp: boolean
  requestTimeoutMs: number
  attemptTimeoutMs: number
}
```

Use Schemastery for `Config`, validate the inference origin as an HTTP(S) origin without credentials, path, query, or fragment, and expose defaults only for the timeout and field names.

- [ ] **Step 4: Implement `EnterpriseAccount`**

```ts
export class EnterpriseAccount extends DeepSeekAccount {
  static inject = inject
  static Config = Config
  private readonly config: Config
  private attempt: EnterpriseAttempt | undefined
  private readonly listeners = new Set<() => void>()
  private closed = false

  constructor(ctx: Context, config: Config) {
    super(ctx)
    this.config = Config(config)
    installAccountTaskCancellation(ctx)
    ctx.on('credentials/reference-updated', ref => {
      if (ref === ENTERPRISE_LLM_TOKEN) this.changed()
    })
    ctx.effect(() => async () => {
      this.closed = true
      const attempt = this.attempt
      if (attempt !== undefined) {
        attempt.controller.abort()
        attempt.disposeRoute()
        await attempt.done
      }
      this.changed()
    }, 'enterprise account lifetime')
    this.config = resolved
  }

  async startSignIn(client: AccountClientMetadata, callbackOrigin: string, _loginSource: 'web' | 'desktop'): Promise<AccountView> {
    if (this.attempt !== undefined && !['succeeded', 'cancelled', 'expired', 'failed'].includes(this.attempt.view.phase)) {
      return this.getState()
    }
    const id = brandString<SignInAttemptId>(randomUUID())
    const nonce = randomBytes(32).toString('base64url')
    const origin = new URL(callbackOrigin)
    if (origin.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)) {
      throw new EnterpriseAuthError('enterprise login requires a loopback callback origin', 'protocol')
    }
    const path = `/enterprise-login/${id}`
    const attempt = {
      id, nonce, client, path, controller: new AbortController(),
      view: { id, phase: 'waiting-browser' as const, authorizeUrl: new URL(path, origin).href, expiresAt: Date.now() + this.config.attemptTimeoutMs },
      disposeRoute: () => undefined, done: Promise.resolve(),
    }
    attempt.disposeRoute = this.ctx.effect(() => this.ctx.webServer.register({
      kind: 'exact', path,
      handler: (request, response) => this.handleLogin(attempt, request, response),
    }), 'enterprise login route')
    this.attempt = attempt
    this.changed()
    return this.getState()
  }
}
```

`handleLogin` must accept only GET and POST; validate the `nonce`; cap the request body at 16 KiB; reject non-form content; validate POST `Origin` when present; exchange credentials; check `attempt.controller.signal` immediately before `ctx.credentials.set(ENTERPRISE_LLM_TOKEN, token)`; set phase `committing`; await the credential write; set phase `succeeded`; dispose the route; and render a success page. A failed exchange sets `phase: 'failed'` and the matching `SignInErrorCode`.

- [ ] **Step 5: Implement state, sign-out, token resolution, and watch**

```ts
override async getState(): Promise<AccountView> {
  const info = await this.ctx.credentials.describe(ENTERPRISE_LLM_TOKEN)
  return {
    status: info.configured ? 'credential-stored' : 'signed-out',
    attempt: this.attempt?.view ?? null,
    links: { usageUrl: this.config.usageUrl, topUpUrl: this.config.topUpUrl },
  }
}

override async signOut(client: AccountClientMetadata): Promise<AccountView> {
  const current = await this.ctx.credentials.resolve(ENTERPRISE_LLM_TOKEN)
  await this.ctx.credentials.unset(ENTERPRISE_LLM_TOKEN)
  this.ctx.emit('deepseek-account/signed-out')
  this.changed()
  if (current !== undefined) {
    void revokeEnterpriseToken(this.config, current.value, AbortSignal.timeout(this.config.requestTimeoutMs))
      .catch(() => undefined)
  }
  return this.getState()
}

override async resolveToken(url: string): Promise<string | undefined> {
  if (new URL(url).origin !== new URL(this.config.inferenceOrigin).origin) return undefined
  return (await this.ctx.credentials.resolve(ENTERPRISE_LLM_TOKEN))?.value
}
```

`rejectToken` resolves the reference, removes it only when its value equals the rejected token, emits `deepseek-account/session-expired` and `deepseek-account/signed-out`, and returns after removal. `getProfile`, `getBalance`, and `getUnnotifiedBonuses` return `null`; `ackBonusNotified` returns `false`; `getPlatformSession` returns `null`; `getDeviceIdentity` returns only the OS version. `watch` follows the existing PlatformAccount listener pattern and yields an initial state.

- [ ] **Step 6: Run service tests**

Run: `pnpm exec vitest run packages/enterprise/account/tests/account.spec.ts`

Expected: PASS, including cancellation and commit ordering.

- [ ] **Step 7: Commit**

```bash
git add packages/enterprise/account
git commit -m "feat(enterprise): add account provider"
```

---

### Task 5: Enterprise Bundle And Model Route

**Files:**
- Create: `packages/enterprise/bundle/package.json`
- Create: `packages/enterprise/bundle/README.md`
- Create: `packages/enterprise/bundle/README.zh.md`
- Create: `packages/enterprise/bundle/README.i18n.yaml`
- Create: `packages/enterprise/bundle/cordis.patch.yml`
- Create: `packages/enterprise/bundle/src/index.ts`
- Create: `packages/enterprise/bundle/tsconfig.json`
- Create: `packages/enterprise/bundle/tests/bundle.spec.ts`
- Modify: `tsconfig.host.json`

**Interfaces:**
- Consumes: the account package and model/auth environment supplied by Desktop.
- Produces: bundle `@dsh-enterprise/dsh-enterprise` with one patch that owns account, model route, and brand rows.

- [ ] **Step 1: Write the composition test**

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { composeEntries, bundlePatchPaths, loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'

describe('enterprise bundle patch', () => {
  it('replaces official account and model rows and adds enterprise rows', () => {
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    const patches = bundlePatchPaths(import.meta.dirname + '/..', manifest.dsh.bundle)
      .flatMap(path => loadOverlayPatches('test', path))
    const entries = composeEntries([patches])
    expect(entries.find(entry => entry.id === 'deepseek-account')?.disabled).toBe(true)
    expect(entries.find(entry => entry.id === 'llm-deepseek')?.disabled).toBe(true)
    expect(entries.find(entry => entry.id === 'llm-deepseek-account')?.disabled).toBe(true)
    expect(entries.find(entry => entry.id === 'enterprise-account')).toMatchObject({
      name: '@dsh-enterprise/dsh-enterprise-account',
    })
    expect(entries.find(entry => entry.id === 'llm-pi-ai')?.config).toMatchObject({
      providers: { enterprise: { api: 'openai-completions', apiKeyEnv: 'ENTERPRISE_LLM_TOKEN' } },
    })
    expect(entries.find(entry => entry.id === 'agent-default-model')?.config).toMatchObject({
      provider: 'enterprise',
    })
    expect(entries.find(entry => entry.id === 'ui-brand-official')?.disabled).toBe(true)
    expect(entries.find(entry => entry.id === 'ui-brand-enterprise')).toMatchObject({
      name: '@dsh-enterprise/dsh-enterprise-ui-brand',
    })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run packages/enterprise/bundle/tests/bundle.spec.ts`

Expected: FAIL because the package and patch do not exist.

- [ ] **Step 3: Create the ordered patch**

```yaml
- id: deepseek-account
  disabled: true

- id: llm-deepseek
  disabled: true

- id: llm-deepseek-account
  disabled: true

- id: ui-brand-official
  disabled: true

- id: llm-pi-ai
  config:
    providers:
      enterprise:
        displayName: !!js process.env.ENTERPRISE_PROVIDER_NAME
        api: !!js process.env.ENTERPRISE_MODEL_API
        baseURL: !!js process.env.ENTERPRISE_MODEL_BASE_URL
        apiKeyEnv: ENTERPRISE_LLM_TOKEN
        models: !!js JSON.parse(process.env.ENTERPRISE_MODEL_CATALOG_JSON)

- id: agent-default-model
  config:
    provider: enterprise
    model: !!js process.env.ENTERPRISE_DEFAULT_MODEL

- insert:
    - id: enterprise-account
      name: '@dsh-enterprise/dsh-enterprise-account'
      config:
        productName: !!js process.env.ENTERPRISE_PRODUCT_NAME
        loginUrl: !!js process.env.ENTERPRISE_LOGIN_URL
        logoutUrl: !!js process.env.ENTERPRISE_LOGOUT_URL
        usageUrl: !!js process.env.ENTERPRISE_USAGE_URL
        topUpUrl: !!js process.env.ENTERPRISE_TOP_UP_URL
        inferenceOrigin: !!js process.env.ENTERPRISE_INFERENCE_ORIGIN
        usernameField: !!js process.env.ENTERPRISE_USERNAME_FIELD || 'username'
        passwordField: !!js process.env.ENTERPRISE_PASSWORD_FIELD || 'password'
        tokenField: !!js process.env.ENTERPRISE_TOKEN_FIELD || 'access_token'
        allowLoopbackHttp: !!js process.env.ENTERPRISE_ALLOW_LOOPBACK_HTTP === '1'
        requestTimeoutMs: !!js Number(process.env.ENTERPRISE_REQUEST_TIMEOUT_MS || '30000')
        attemptTimeoutMs: !!js Number(process.env.ENTERPRISE_ATTEMPT_TIMEOUT_MS || '600000')

    - id: ui-brand-enterprise
      name: '@dsh-enterprise/dsh-enterprise-ui-brand'
```

- [ ] **Step 4: Add bundle metadata and inert Host entry**

```ts
/** @module @dsh-enterprise/dsh-enterprise */
export {}
```

The package manifest declares `dsh.bundle.patch: "./cordis.patch.yml"`, depends on `@dsh-enterprise/dsh-enterprise-account`, `@dsh-enterprise/dsh-enterprise-ui-brand`, and the Service Definitions named by the patch, and includes the patch file in `files`.

- [ ] **Step 5: Run the patch test**

Run: `pnpm exec vitest run packages/enterprise/bundle/tests/bundle.spec.ts`

Expected: PASS.

Record the bundle README pair:

```bash
pnpm run verify-translation-pairing --write packages/enterprise/bundle/README.md
pnpm run test:docs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/enterprise/bundle tsconfig.host.json
git commit -m "feat(enterprise): add profile bundle"
```

---

### Task 6: Enterprise Client Brand

**Files:**
- Create: `packages/enterprise/ui-brand/package.json`
- Create: `packages/enterprise/ui-brand/README.md`
- Create: `packages/enterprise/ui-brand/README.zh.md`
- Create: `packages/enterprise/ui-brand/README.i18n.yaml`
- Create: `packages/enterprise/ui-brand/tsconfig.json`
- Create: `packages/enterprise/ui-brand/tsdown.config.ts`
- Create: `packages/enterprise/ui-brand/src/index.ts`
- Create: `packages/enterprise/ui-brand/src/css-modules.d.ts`
- Create: `packages/enterprise/ui-brand/src/client/index.ts`
- Create: `packages/enterprise/ui-brand/src/client/Brand.tsx`
- Create: `packages/enterprise/ui-brand/src/client/Brand.module.css`
- Create: `packages/enterprise/ui-brand/tests/browser-plugin.client.spec.tsx`
- Modify: `tsconfig.client.json`

**Interfaces:**
- Consumes: `DSH_CLIENT_TITLE` as the public build-time product name and the sidebar/conversation slot declarations.
- Produces: sidebar mark, sidebar name, hero mark occupants, and a layout-neutral `conversation.hero.frame` layer.

- [ ] **Step 1: Write the registration and rendering test**

```tsx
// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { apply, inject } from '../src/client/index.ts'
import { EnterpriseBrandMark, EnterpriseBrandName } from '../src/client/Brand.tsx'

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

describe('enterprise brand', () => {
  it('registers all four holes and removes them on disposal', async () => {
    vi.stubEnv('DSH_CLIENT_TITLE', 'Northstar Harness')
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    const slots = ctx.get('slots') as SlotRegistry
    slots.register({
      name: 'root',
      children: {
        'sidebar.brand.mark': { kind: 'single', scope: 'root' },
        'sidebar.brand.name': { kind: 'single', scope: 'root' },
        'conversation.hero.brand.mark': { kind: 'single', scope: 'root' },
        'conversation.hero.frame': { kind: 'hoc', scope: 'root' },
      },
    } as never, () => null)
    const fiber = ctx.plugin({ inject, apply })
    await fiber.await()
    expect(slots.entries('sidebar.brand.mark')).toHaveLength(1)
    expect(slots.entries('sidebar.brand.name')).toHaveLength(1)
    expect(slots.entries('conversation.hero.brand.mark')).toHaveLength(1)
    expect(slots.entries('conversation.hero.frame')).toHaveLength(1)
    await fiber.dispose()
    expect(slots.entries('sidebar.brand.mark')).toHaveLength(0)
  })

  it('renders the configured product name and monogram', () => {
    vi.stubEnv('DSH_CLIENT_TITLE', 'Northstar Harness')
    const name = render(<EnterpriseBrandName />)
    expect(name.getByText('Northstar Harness')).toBeTruthy()
    const mark = render(<EnterpriseBrandMark size={24} />)
    expect(mark.getByText('N')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run packages/enterprise/ui-brand/tests/browser-plugin.client.spec.tsx`

Expected: FAIL because the package does not exist.

- [ ] **Step 3: Implement the components**

```tsx
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import css from './Brand.module.css'

function productName(): string {
  const value = process.env.DSH_CLIENT_TITLE
  if (value === undefined || value.trim() === '') throw new Error('enterprise brand: DSH_CLIENT_TITLE is required')
  return value
}

export function EnterpriseBrandMark({ size }: SidebarBrandMarkOwnerProps) {
  const initial = Array.from(productName().trim())[0]?.toUpperCase() ?? 'E'
  return <span className={css.mark} style={{ width: size, height: size }} aria-hidden="true">{initial}</span>
}

export function EnterpriseBrandName() {
  return <span className={css.name}>{productName()}</span>
}
```

Create `src/client/index.ts` with nested `ctx.slots.inject()` calls, matching the official package's declaration-aware rollback pattern. The hero frame wraps children in `<div className={css.frame}>{children}</div>` and uses `display: contents` in CSS. Register the hero mark with the same mark component.

- [ ] **Step 4: Run the client test**

Run: `pnpm exec vitest run packages/enterprise/ui-brand/tests/browser-plugin.client.spec.tsx`

Expected: PASS.

- [ ] **Step 5: Run GUI tests**

Run: `pnpm run test:gui`

Expected: PASS.

Record the UI brand README pair:

```bash
pnpm run verify-translation-pairing --write packages/enterprise/ui-brand/README.md
pnpm run test:docs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/enterprise/ui-brand tsconfig.client.json
git commit -m "feat(enterprise): add client brand"
```

---

### Task 7: Desktop Distribution Loader

**Files:**
- Create: `apps/desktop/src/distribution.ts`
- Create: `apps/desktop/tests/distribution.spec.ts`
- Modify: `apps/desktop/tsconfig.host.json`
- Modify: `apps/desktop/package.json`

**Interfaces:**
- Consumes: `DSH_DESKTOP_DISTRIBUTION` in unpackaged launches and `process.resourcesPath/distribution.json` in packaged launches.
- Produces: `loadDesktopDistribution()`, `officialDesktopDistribution`, and `distributionHostEnvironment(distribution)`.

- [ ] **Step 1: Write the loader test**

```ts
import { describe, expect, it } from 'vitest'
import { parseDesktopDistribution, distributionHostEnvironment } from '../src/distribution.ts'

const enterprise = {
  schemaVersion: 1,
  product: { name: 'Northstar Harness', appId: 'com.northstar.harness', dataDirectory: 'NorthstarHarness' },
}

describe('desktop distribution', () => {
  it('derives the Host environment from the validated manifest', () => {
    const parsed = parseDesktopDistribution(enterprise)
    if (parsed.kind !== 'enterprise') throw new Error('expected enterprise distribution')
    expect(distributionHostEnvironment(parsed)).toMatchObject({
      ENTERPRISE_PRODUCT_NAME: 'Northstar Harness',
      ENTERPRISE_MODEL_CATALOG_JSON: JSON.stringify(parsed.model.models.map(model => ({
        id: model.id,
        ...(model.name === undefined ? {} : { name: model.name }),
        contextWindow: model.contextWindow,
        maxTokens: model.maxTokens,
        input: model.input ?? ['text'],
      }))),
    })
  })

  it('keeps official defaults when no manifest is supplied', () => {
    expect(parseDesktopDistribution(undefined).product).toMatchObject({
      name: 'DeepSeek Harness',
      appId: 'com.deepseek.harness',
    })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run apps/desktop/tests/distribution.spec.ts`

Expected: FAIL because `distribution.ts` does not exist.

- [ ] **Step 3: Implement official fallback and manifest loading**

```ts
export const officialDesktopDistribution = {
  kind: 'official',
  schemaVersion: 1,
  product: {
    name: 'DeepSeek Harness',
    executableName: 'DeepSeek Harness',
    companyName: 'DeepSeek',
    copyright: 'Copyright © DeepSeek Harness',
    appId: 'com.deepseek.harness',
    protocolName: 'DeepSeek Harness',
    protocolScheme: 'dsh',
    dataDirectory: 'DeepSeek Harness',
  },
  bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'],
  update: { mode: 'disabled' },
} as const
```

`loadDesktopDistribution` chooses `process.env.DSH_DESKTOP_DISTRIBUTION` when unpackaged and `join(process.resourcesPath, 'distribution.json')` when packaged. It parses a supplied file with `parseEnterpriseDistribution`; it returns `officialDesktopDistribution` only when no file is supplied. A supplied but unreadable or invalid file fails startup.

Define the result as a discriminated union:

```ts
export type DesktopDistribution =
  | typeof officialDesktopDistribution
  | ({ readonly kind: 'enterprise' } & EnterpriseDistribution)

export function parseDesktopDistribution(value: unknown): DesktopDistribution {
  if (value === undefined) return officialDesktopDistribution
  return { kind: 'enterprise', ...parseEnterpriseDistribution(value) }
}
```

- [ ] **Step 4: Implement Host environment mapping**

```ts
export function distributionHostEnvironment(value: EnterpriseDistribution): NodeJS.ProcessEnv {
  return {
    ENTERPRISE_PRODUCT_NAME: value.product.name,
    ENTERPRISE_LOGIN_URL: value.auth.loginUrl,
    ...(value.auth.logoutUrl === undefined ? {} : { ENTERPRISE_LOGOUT_URL: value.auth.logoutUrl }),
    ENTERPRISE_USAGE_URL: value.auth.usageUrl,
    ENTERPRISE_TOP_UP_URL: value.auth.topUpUrl,
    ENTERPRISE_INFERENCE_ORIGIN: value.auth.inferenceOrigin,
    ENTERPRISE_USERNAME_FIELD: value.auth.usernameField,
    ENTERPRISE_PASSWORD_FIELD: value.auth.passwordField,
    ENTERPRISE_TOKEN_FIELD: value.auth.tokenField,
    ENTERPRISE_ALLOW_LOOPBACK_HTTP: value.auth.allowLoopbackHttp ? '1' : '0',
    ENTERPRISE_REQUEST_TIMEOUT_MS: String(value.auth.requestTimeoutMs),
    ENTERPRISE_ATTEMPT_TIMEOUT_MS: String(value.auth.attemptTimeoutMs),
    ENTERPRISE_PROVIDER_NAME: value.model.displayName,
    ENTERPRISE_MODEL_API: value.model.api,
    ENTERPRISE_MODEL_BASE_URL: value.model.baseUrl,
    ENTERPRISE_DEFAULT_MODEL: value.model.defaultModel,
    ENTERPRISE_MODEL_CATALOG_JSON: JSON.stringify(value.model.models.map(model => ({
      id: model.id,
      ...(model.name === undefined ? {} : { name: model.name }),
      contextWindow: model.contextWindow,
      maxTokens: model.maxTokens,
      input: model.input ?? ['text'],
    }))),
  }
}
```

- [ ] **Step 5: Run the loader test**

Run: `pnpm exec vitest run apps/desktop/tests/distribution.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/distribution.ts apps/desktop/tests/distribution.spec.ts apps/desktop/tsconfig.host.json apps/desktop/package.json
git commit -m "feat(enterprise): load desktop distribution"
```

---

### Task 8: Desktop Bundle Closure And Profile Selection

**Files:**
- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/src/core-package-set.ts`
- Modify: `apps/desktop/src/project-manager.ts`
- Modify: `apps/desktop/scripts/prepare-package-set.ts`
- Modify: `apps/desktop-host/src/index.ts`
- Create: `apps/desktop/tests/enterprise-profile.spec.ts`
- Modify: `apps/desktop/tests/core-package-set.spec.ts`
- Modify: `apps/desktop-host/tests/index.spec.ts` or the existing host startup spec using that anchor.

**Interfaces:**
- Consumes: `distribution.bundles` from Task 7 and packed `@dsh-enterprise/dsh-enterprise`.
- Produces: a Desktop profile whose bundle list includes the enterprise bundle, and a runtime resolution anchor whose dependency table contains it.

- [ ] **Step 1: Write the profile selection test**

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { desktopProfileBundles } from '../src/project-manager.ts'
import { officialDesktopDistribution, parseDesktopDistribution } from '../src/distribution.ts'

describe('desktop enterprise profile', () => {
  it('appends the enterprise bundle only for the enterprise manifest', () => {
    expect(desktopProfileBundles(officialDesktopDistribution)).toEqual([
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-web-app',
    ])
    const enterprise = parseDesktopDistribution(JSON.parse(readFileSync(
      new URL('../../enterprise/distribution/tests/fixtures/distribution.json', import.meta.url),
      'utf8',
    )))
    expect(desktopProfileBundles(enterprise)).toContain('@dsh-enterprise/dsh-enterprise')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run apps/desktop/tests/enterprise-profile.spec.ts`

Expected: FAIL because `desktopProfileBundles` does not exist.

- [ ] **Step 3: Add the bundle as a Desktop root**

```ts
export const ENTERPRISE_BUNDLE_PACKAGE = '@dsh-enterprise/dsh-enterprise'

const ROOT_PACKAGES = [DSH_PACKAGE, DESKTOP_HOST_PACKAGE, ENTERPRISE_BUNDLE_PACKAGE] as const
```

Add `@dsh-enterprise/dsh-enterprise` to `apps/desktop/package.json` `devDependencies` so workspace build order and type resolution include it.

- [ ] **Step 4: Pass bundles through the project manager**

```ts
export function desktopProfileBundles(distribution: DesktopDistribution): readonly string[] {
  return distribution.kind === 'enterprise'
    ? [...distribution.bundles]
    : [...WEB_PROFILE.bundles]
}

export class DesktopProjectManager {
  constructor(
    readonly paths: DesktopPaths,
    readonly runtime: { readonly dsh: string },
    readonly bundles: readonly string[],
  ) {}
}
```

Replace each `WEB_PROFILE.bundles` use with `this.bundles`; change `createRuntimeProjectMetadata` and `createDevelopmentProjectMetadata` to accept the bundle list.

- [ ] **Step 5: Fix Desktop installation-scope resolution**

Change `apps/desktop-host/src/index.ts` to use the generated Desktop runtime root manifest:

```ts
const installAnchor = join(runtimeDir, 'package.json')
```

Update the host startup test to write a runtime-root manifest containing the Host package and enterprise bundle dependencies, then assert both resolve as installation-scope packages.

- [ ] **Step 6: Run focused tests**

Run: `pnpm exec vitest run apps/desktop/tests/enterprise-profile.spec.ts apps/desktop/tests/core-package-set.spec.ts apps/desktop-host/tests`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop apps/desktop-host
git commit -m "feat(enterprise): bundle private profile"
```

---

### Task 9: Packaging Identity And Isolated Application State

**Files:**
- Modify: `apps/desktop/src/main.ts`
- Modify: `apps/desktop/src/paths.ts`
- Modify: `apps/desktop/src/locale.ts`
- Modify: `apps/desktop/src/ipc.ts`
- Modify: `apps/desktop/scripts/electron-builder-config.mjs`
- Modify: `apps/desktop/scripts/desktop-release-environment.mjs`
- Modify: `apps/desktop/scripts/dev.ts`
- Modify: `apps/desktop/scripts/development-app.ts`
- Modify: `apps/desktop/scripts/package-target.ts`
- Modify: `apps/desktop/scripts/package-macos.ts`
- Modify: `apps/desktop/scripts/smoke-packaged-runtime.ts`
- Modify: `apps/desktop/scripts/installer-locales.mjs`
- Create: `apps/desktop/tests/enterprise-distribution-identity.spec.ts`
- Modify: `apps/desktop/tests/electron-builder-config.spec.ts`
- Modify: `apps/desktop/tests/welcome-renderer.client.spec.tsx`

**Interfaces:**
- Consumes: `loadDesktopDistribution()` and `distributionHostEnvironment()`.
- Produces: enterprise product name, application ID, protocol scheme, icon paths, isolated data roots, branded shell copy, installer strings, and an in-memory Host environment.

- [ ] **Step 1: Write failing identity tests**

```ts
describe('enterprise desktop identity', () => {
  it('uses an isolated userData and Harness home', () => {
    const paths = resolveDesktopApplicationPaths('/home/alice/.config', enterpriseDistribution)
    expect(paths.userData).toBe('/home/alice/.config/NorthstarHarness')
    expect(paths.dshHome).toBe('/home/alice/.config/NorthstarHarness/harness')
  })

  it('uses the manifest protocol and product name', () => {
    expect(enterpriseProtocol(enterpriseDistribution)).toEqual({
      name: 'Northstar Harness', schemes: ['northstar-harness'],
    })
    expect(resolveDesktopLocale('en', 'Northstar Harness').messages.aboutMenu)
      .toBe('About Northstar Harness')
  })

  it('renders installer strings with the enterprise name', () => {
    const locales = readInstallerLocales()
    expect(renderInstallerStrings(locales, 'Northstar Harness'))
      .toContain('Northstar Harness is running')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run apps/desktop/tests/enterprise-distribution-identity.spec.ts`

Expected: FAIL because the helpers do not exist.

- [ ] **Step 3: Apply the distribution before window creation**

At the start of `main.ts`, after loading the distribution but before `app` becomes ready:

```ts
const distribution = loadDesktopDistribution()
if (distribution.kind === 'enterprise') {
  app.setName(distribution.product.dataDirectory)
  app.setPath('userData', join(app.getPath('appData'), distribution.product.dataDirectory))
  app.setPath('sessionData', app.getPath('userData'))
  process.env.DSH_HOME = join(app.getPath('userData'), 'harness')
}
```

For an enterprise distribution, set `hostEnvironment = { ...(await loginShell), ...distributionHostEnvironment(distribution) }` in `prepareHostEnvironment`. Keep enterprise values after login-shell values so a login script cannot override them. For the official fallback, retain the existing login-shell environment unchanged.

- [ ] **Step 4: Route shell identity through the distribution**

Use `distribution.product.name` for the About panel, external protocol registration, tray labels, welcome locale, and installer copy. Pass `distribution.product.protocolScheme` into the external-link handler:

```ts
if (url === `${distribution.product.protocolScheme}://open`
  || url === `${distribution.product.protocolScheme}://open/`) focusPrimaryWindow()
```

Change `resolveDesktopLocale(locale, productName = 'DeepSeek Harness')` to replace every `DeepSeek Harness` product-label occurrence in the selected dictionary. Replace the welcome image with localized text so the enterprise name does not depend on the official SVG:

```tsx
<div className="brand" role="img" aria-label={m.welcomeBrand}>{m.welcomeBrand}</div>
```

- [ ] **Step 5: Make electron-builder consume the manifest**

`electron-builder-config.mjs` reads `DSH_DESKTOP_DISTRIBUTION`, validates it through `parseEnterpriseDistribution`, and uses:

```js
appId: distribution.product.appId,
productName: distribution.product.name,
protocols: [{ name: distribution.product.protocolName, schemes: [distribution.product.protocolScheme] }],
artifactName: `${slug(distribution.product.name)}-\${version}-\${os}-\${arch}${output.suffix}.\${ext}`,
copyright: distribution.product.copyright,
extraResources: [
  { from: distribution.branding.windowsIcon, to: 'icon.png' },
  { from: distribution.branding.trayIcon, to: 'tray.ico' },
  { from: manifestPath, to: 'distribution.json' },
],
```

The macOS icon and installer sidebar use their manifest paths. When `update.mode === 'disabled'`, `publish` is `null` and mandatory-update policy is omitted. When `update.mode === 'enterprise'`, pass its feed and channel through the existing update configuration functions.

Resolve every `branding.*` path relative to the directory containing `DSH_DESKTOP_DISTRIBUTION`, verify each selected file is a regular file before electron-builder starts, and reject paths outside that directory.

In `package-target.ts`, set `DSH_CLIENT_TITLE` from the validated manifest before the client build. Set `DSH_CLIENT_BUILD_PROFILE=enterprise` only when the enterprise client plugin is present.

- [ ] **Step 6: Update hardcoded application paths**

Pass `DSH_DESKTOP_PRODUCT_NAME` from `electron-builder-config.mjs` into packaging and smoke subprocesses. Replace hardcoded `DeepSeek Harness.app`, `DeepSeek Harness.exe`, and artifact filename prefixes in `package-target.ts`, `package-macos.ts`, and `smoke-packaged-runtime.ts` with that value. Add a negative test that omits the value and expects an explicit error.

- [ ] **Step 7: Guard disabled updates**

When `distribution.update.mode === 'disabled'`, omit the Check for Updates menu, skip automatic and mandatory policy checks, and do not construct network update requests. Keep the update coordinator's existing behavior for the official fallback and enterprise-feed modes.

- [ ] **Step 8: Run desktop tests**

Run: `pnpm exec vitest run apps/desktop/tests/enterprise-distribution-identity.spec.ts apps/desktop/tests/electron-builder-config.spec.ts apps/desktop/tests/welcome-renderer.client.spec.tsx`

Expected: PASS.

- [ ] **Step 9: Build the Desktop shell**

Run: `pnpm --dir apps/desktop run build`

Expected: exit 0.

- [ ] **Step 10: Commit**

```bash
git add apps/desktop
git commit -m "feat(enterprise): brand desktop distribution"
```

---

### Task 10: Enterprise Composition, Snapshot, And Staging E2E

**Files:**
- Create: `packages/enterprise/bundle/tests/fixtures/enterprise-server.ts`
- Create: `packages/enterprise/bundle/tests/composition.spec.ts`
- Create: `snapshots/session/enterprise-desktop/snapshot.yml`
- Create: `snapshots/session/enterprise-desktop/session.jsonl`
- Create: `packages/enterprise/bundle/tests/staging.e2e.ts`

**Interfaces:**
- Consumes: the enterprise bundle, real `llm-pi-ai`, real local JSONL persistence, and a loopback OpenAI-compatible server.
- Produces: keyless end-to-end proof and an opt-in enterprise staging check.

- [ ] **Step 1: Create the owned OpenAI-compatible server**

```ts
export async function startEnterpriseServer(options: { token: string; model: string }) {
  const requests: unknown[] = []
  const server = createServer(async (request, response) => {
    if (request.method === 'POST' && request.url === '/v1/chat/completions') {
      if (request.headers.authorization !== `Bearer ${options.token}`) {
        response.writeHead(401).end()
        return
      }
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      requests.push(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.end([
        `data: ${JSON.stringify({ id: 'chat-1', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { role: 'assistant', content: 'enterprise-ok' }, finish_reason: null }] })}`,
        '',
        `data: ${JSON.stringify({ id: 'chat-1', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 2, completion_tokens: 2, total_tokens: 4 } })}`,
        '',
        'data: [DONE]',
        '',
      ].join('\n'))
      return
    }
    response.writeHead(404).end()
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return { server, requests, baseURL: `http://127.0.0.1:${(server.address() as AddressInfo).port}` }
}
```

- [ ] **Step 2: Write the failing real-composition test**

Boot the desktop enterprise profile through `dsh` with `ENTERPRISE_ALLOW_LOOPBACK_HTTP=1`, the fake server base URL, a test token stored through the credential API, and a temporary `DSH_HOME`. Submit one prompt. Assert:

```ts
expect(fake.requests).toHaveLength(1)
expect(fake.requests[0]).toMatchObject({ model: 'northstar-chat', stream: true })
const sessions = await readJsonlSessions(home)
expect(sessions).toHaveLength(1)
expect(sessions[0]?.events).toEqual(expect.arrayContaining([
  expect.objectContaining({ type: 'assistant/message' }),
]))
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm exec vitest run packages/enterprise/bundle/tests/composition.spec.ts`

Expected: FAIL until the Desktop environment and enterprise bundle are both wired.

- [ ] **Step 4: Add the keyless Session snapshot**

Create `snapshots/session/enterprise-desktop` through the repository snapshot harness. The scenario uses the enterprise bundle with a replay model, one prompt, one tool call, and a local Session. Record no enterprise credentials. Assert the persisted parent and child generations in the normal snapshot lane.

- [ ] **Step 5: Add the opt-in staging e2e**

Use `ENTERPRISE_E2E_LOGIN_URL`, `ENTERPRISE_E2E_USERNAME`, `ENTERPRISE_E2E_PASSWORD`, `ENTERPRISE_E2E_BASE_URL`, and `ENTERPRISE_E2E_MODEL`. Skip with a printed reason when any variable is absent. Never print values. Assert login succeeds, the token is stored, the model replies, and the Session is local.

- [ ] **Step 6: Run the composition and snapshot tests**

Run: `pnpm exec vitest run packages/enterprise/bundle/tests/composition.spec.ts`

Expected: PASS.

Run: `pnpm run test:snapshot snapshots/session/enterprise-desktop.snapshot.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/enterprise/bundle/tests snapshots/session/enterprise-desktop
git commit -m "test(enterprise): cover proxy and local sessions"
```

---

### Task 11: Upstream Touchpoint Guard

**Files:**
- Create: `scripts/enterprise/upstream-touchpoints.json`
- Create: `scripts/verify-enterprise-touchpoints.ts`
- Create: `scripts/verify-enterprise-touchpoints.spec.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: explicit base ref and changed repository paths.
- Produces: `verifyEnterpriseTouchpoints(changedPaths, policy)` and the command `pnpm run verify-enterprise-touchpoints --base <ref>`.

- [ ] **Step 1: Write the pure policy test**

```ts
import { describe, expect, it } from 'vitest'
import { verifyEnterpriseTouchpoints } from './verify-enterprise-touchpoints.ts'

const policy = {
  allowedPrefixes: ['packages/enterprise/', '.agents/notes/proposed/feature/2026-11-11-enterprise-desktop-distribution'],
  allowedFiles: ['apps/desktop/src/main.ts', 'apps/desktop/src/project-manager.ts'],
}

describe('enterprise upstream touchpoints', () => {
  it('accepts custom packages and allowlisted Desktop files', () => {
    expect(verifyEnterpriseTouchpoints([
      'packages/enterprise/account/src/index.ts',
      'apps/desktop/src/main.ts',
    ], policy)).toEqual([])
  })

  it('rejects an unlisted core edit', () => {
    expect(verifyEnterpriseTouchpoints(['packages/core/agent-loop/src/agent.ts'], policy)).toEqual([
      'packages/core/agent-loop/src/agent.ts',
    ])
  })
})
```

- [ ] **Step 2: Run it to verify failure**

Run: `pnpm exec vitest run scripts/verify-enterprise-touchpoints.spec.ts`

Expected: FAIL because the script does not exist.

- [ ] **Step 3: Implement the guard**

```ts
export interface TouchpointPolicy {
  readonly allowedPrefixes: readonly string[]
  readonly allowedFiles: readonly string[]
}

export function verifyEnterpriseTouchpoints(paths: readonly string[], policy: TouchpointPolicy): string[] {
  return paths.filter(path => !policy.allowedFiles.includes(path)
    && !policy.allowedPrefixes.some(prefix => path.startsWith(prefix)))
}
```

Use this production allowlist:

```json
{
  "allowedPrefixes": [
    "packages/enterprise/",
    "apps/desktop/tests/",
    "apps/desktop-host/tests/",
    "snapshots/session/enterprise-desktop",
    ".agents/plans/",
    ".agents/notes/proposed/feature/2026-11-11-enterprise-desktop-distribution",
    ".agents/notes/implemented/feature/2026-11-11-enterprise-desktop-distribution"
  ],
  "allowedFiles": [
    "package.json",
    "packages/README.md",
    "packages/README.zh.md",
    "packages/README.i18n.yaml",
    "tsconfig.host.json",
    "tsconfig.client.json",
    "apps/desktop/package.json",
    "apps/desktop/tsconfig.host.json",
    "apps/desktop/tsconfig.client.json",
    "apps/desktop/src/core-package-set.ts",
    "apps/desktop/src/distribution.ts",
    "apps/desktop/src/ipc.ts",
    "apps/desktop/src/locale.ts",
    "apps/desktop/src/main.ts",
    "apps/desktop/src/paths.ts",
    "apps/desktop/src/project-manager.ts",
    "apps/desktop/scripts/desktop-release-environment.mjs",
    "apps/desktop/scripts/dev.ts",
    "apps/desktop/scripts/development-app.ts",
    "apps/desktop/scripts/electron-builder-config.mjs",
    "apps/desktop/scripts/installer-locales.mjs",
    "apps/desktop/scripts/package-macos.ts",
    "apps/desktop/scripts/package-target.ts",
    "apps/desktop/scripts/prepare-package-set.ts",
    "apps/desktop/scripts/smoke-packaged-runtime.ts",
    "apps/desktop-host/src/index.ts"
  ]
}
```

The CLI requires `--base`, resolves the merge base, runs `git diff --name-only <merge-base> HEAD`, prints every rejected path, and exits 1 when any exists.

- [ ] **Step 4: Run the guard against the current branch**

Run: `pnpm run verify-enterprise-touchpoints --base upstream/master`

Expected: exit 0 after the custom branch contains all planned tasks and no other upstream edits.

- [ ] **Step 5: Commit**

```bash
git add scripts/enterprise scripts/verify-enterprise-touchpoints.ts scripts/verify-enterprise-touchpoints.spec.ts package.json
git commit -m "chore(enterprise): guard upstream touchpoints"
```

---

### Task 12: Documentation, UI Evidence, And Agent Note Lifecycle

**Files:**
- Modify: `packages/enterprise/README.md`
- Modify: `packages/enterprise/README.zh.md`
- Modify: `packages/enterprise/distribution/README.md`
- Modify: `packages/enterprise/distribution/README.zh.md`
- Modify: `packages/enterprise/account/README.md`
- Modify: `packages/enterprise/account/README.zh.md`
- Modify: `packages/enterprise/bundle/README.md`
- Modify: `packages/enterprise/bundle/README.zh.md`
- Modify: `packages/enterprise/ui-brand/README.md`
- Modify: `packages/enterprise/ui-brand/README.zh.md`
- Move: `.agents/notes/proposed/feature/2026-11-11-enterprise-desktop-distribution.md`
  to `.agents/notes/implemented/feature/2026-11-11-enterprise-desktop-distribution.md`
- Move: `.agents/notes/proposed/feature/2026-11-11-enterprise-desktop-distribution.zh.md`
  to `.agents/notes/implemented/feature/2026-11-11-enterprise-desktop-distribution.zh.md`
- Move: `.agents/notes/proposed/feature/2026-11-11-enterprise-desktop-distribution.i18n.yaml`
  to `.agents/notes/implemented/feature/2026-11-11-enterprise-desktop-distribution.i18n.yaml`

**Interfaces:**
- Consumes: the implemented packages and tests.
- Produces: current package contracts, operational instructions, and the final decision record.

- [ ] **Step 1: Write the package documentation**

Each package README states its configuration, failure behavior, lifecycle, model-visible effects, and known limitations. The account README includes the exact login JSON request and token response field mapping. The bundle README lists every replaced row. The UI brand README states the build-time `DSH_CLIENT_TITLE` requirement. The distribution README documents `DSH_DESKTOP_DISTRIBUTION` and every manifest field.

- [ ] **Step 2: Record visual and interaction evidence**

Run the assembled enterprise Desktop/Web flow with the local fake enterprise server. Capture deterministic screenshots for light and dark themes, welcome, login form, invalid credentials, successful workspace, sidebar brand, hero, and long product name. Record one GIF of username/password login through the enterprise proxy response and local Session creation. Keep the artifacts in the existing Desktop qualification output directory; do not commit generated build output.

- [ ] **Step 3: Move the proposal to implemented**

Change the first lines to:

```markdown
# Agent Note: enterprise-branded desktop distribution

Status: implemented
```

Rewrite `## Proposal` as present-tense `## Decision`. Fold `## Acceptance criteria` and `## Risks` into present-tense `## Consequences`, `## Testing`, and current limitations. Keep `## Alternatives considered`. Update every package path and configuration name to match the implementation.

- [ ] **Step 4: Record the bilingual pair**

Run: `pnpm run verify-translation-pairing --write .agents/notes/implemented/feature/2026-11-11-enterprise-desktop-distribution.md`

Expected: one record written; rerun without `--write` and expect consistency.

- [ ] **Step 5: Run the complete affected checks**

Run: `pnpm run test:gui`

Expected: PASS.

Run: `pnpm run test:docs`

Expected: PASS.

Run: `pnpm run build`

Expected: PASS.

Run: `pnpm run lint`

Expected: PASS.

Run: `pnpm run verify-enterprise-touchpoints --base upstream/master`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/enterprise docs .agents/notes
git commit -m "docs(enterprise): document branded distribution"
```

## Execution Notes

- Start with Task 1 and keep one commit per task. A later task may update an earlier task's interface, but it must update every consumer and test in the same commit.
- Use a worktree for execution because the branch changes package configuration, Electron assets, generated runtime inputs, and package manifests.
- Real enterprise credentials are not required for Tasks 1–11. Task 10's staging e2e self-skips without them.
- A production manifest and signing assets are release inputs under `DSH_DESKTOP_DISTRIBUTION`; they are never committed with credentials or private certificate material.
