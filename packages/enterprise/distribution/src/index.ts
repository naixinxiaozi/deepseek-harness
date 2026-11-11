/** Enterprise distribution validation shared by Desktop packaging and runtime. */

import { z } from 'zod'
import {
  ENTERPRISE_DISTRIBUTION_SCHEMA_VERSION,
  type EnterpriseDistribution,
} from './types.ts'

export { ENTERPRISE_DISTRIBUTION_SCHEMA_VERSION } from './types.ts'
export type { EnterpriseDistribution, EnterpriseModel } from './types.ts'

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
    name: z.string().trim().min(1),
    executableName: z.string().trim().min(1),
    companyName: z.string().trim().min(1),
    copyright: z.string().trim().min(1),
    appId: z.string()
      .regex(/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/u)
      .refine(value => !value.startsWith('com.deepseek.'), 'enterprise appId required'),
    protocolName: z.string().trim().min(1),
    protocolScheme: z.string().regex(/^[a-z][a-z0-9+.-]*$/u),
    dataDirectory: z.string().min(1)
      .refine(value => value !== '.' && value !== '..' && !/[/\\\0]/u.test(value), 'expected one directory name'),
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
    displayName: z.string().trim().min(1),
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

function validateEndpoint(urlText: string, allowLoopbackHttp: boolean, allowPath: boolean): void {
  const url = new URL(urlText)
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
  const permittedProtocol = url.protocol === 'https:'
    || (allowLoopbackHttp && url.protocol === 'http:' && loopback)
  if (!permittedProtocol || url.username || url.password || url.search || url.hash
    || (!allowPath && url.pathname !== '/')) {
    throw new Error('enterprise distribution: invalid service URL')
  }
}

/**
 * Validate one distribution manifest and reject conflicting catalog values.
 * @param value - Parsed JSON or another candidate manifest value.
 * @returns A frozen, validated distribution.
 * @throws when a required value is absent, malformed, conflicting, or belongs to the official product.
 */
export function parseEnterpriseDistribution(value: unknown): EnterpriseDistribution {
  const parsed = schema.parse(value)
  validateEndpoint(parsed.auth.loginUrl, parsed.auth.allowLoopbackHttp, true)
  if (parsed.auth.logoutUrl !== undefined) {
    validateEndpoint(parsed.auth.logoutUrl, parsed.auth.allowLoopbackHttp, true)
  }
  validateEndpoint(parsed.auth.usageUrl, parsed.auth.allowLoopbackHttp, true)
  validateEndpoint(parsed.auth.topUpUrl, parsed.auth.allowLoopbackHttp, true)
  validateEndpoint(parsed.auth.inferenceOrigin, parsed.auth.allowLoopbackHttp, false)
  validateEndpoint(parsed.model.baseUrl, parsed.auth.allowLoopbackHttp, true)
  if (parsed.update.mode === 'enterprise') {
    validateEndpoint(parsed.update.feed, false, true)
  }
  const ids = parsed.model.models.map(entry => entry.id)
  if (new Set(ids).size !== ids.length) throw new Error('enterprise distribution: duplicate model id')
  if (!ids.includes(parsed.model.defaultModel)) {
    throw new Error('enterprise distribution: defaultModel is not in models')
  }
  return Object.freeze(parsed) as EnterpriseDistribution
}
