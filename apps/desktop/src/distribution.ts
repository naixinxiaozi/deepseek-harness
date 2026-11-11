/** Desktop product distribution selection and Host environment projection. */

import {
  parseEnterpriseDistribution,
  type EnterpriseDistribution,
} from '@dsh-enterprise/dsh-enterprise-distribution'

/** Product and native application identity shared by official and enterprise Desktop builds. */
export interface DesktopProduct {
  readonly name: string
  readonly executableName: string
  readonly companyName: string
  readonly copyright: string
  readonly appId: string
  readonly protocolName: string
  readonly protocolScheme: string
  readonly dataDirectory: string
}

/** Official Desktop defaults used when no enterprise manifest is supplied. */
export const officialDesktopDistribution = {
  kind: 'official',
  product: {
    name: 'DeepSeek Harness',
    executableName: 'DeepSeek Harness',
    companyName: 'DeepSeek',
    copyright: 'Copyright DeepSeek Harness',
    appId: 'com.deepseek.harness',
    protocolName: 'DeepSeek Harness',
    protocolScheme: 'dsh',
    dataDirectory: 'DeepSeek Harness',
  },
  bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'],
} as const satisfies {
  readonly kind: 'official'
  readonly product: DesktopProduct
  readonly bundles: readonly string[]
}

/** One Desktop distribution selected at startup. */
export type DesktopDistribution =
  | typeof officialDesktopDistribution
  | ({ readonly kind: 'enterprise' } & EnterpriseDistribution)

/**
 * Parse one supplied manifest, or select the official fallback.
 * @param value - Parsed enterprise manifest JSON, or undefined for the official product.
 * @returns The validated Desktop distribution.
 * @throws when an enterprise manifest is invalid.
 */
export function parseDesktopDistribution(value: unknown): DesktopDistribution {
  if (value === undefined) return officialDesktopDistribution
  return { kind: 'enterprise', ...parseEnterpriseDistribution(value) }
}

/**
 * Project the native external-link registration for an enterprise distribution.
 * @param value - Validated enterprise distribution.
 * @returns Protocol display name and sole scheme.
 */
export function enterpriseProtocol(value: EnterpriseDistribution): {
  readonly name: string
  readonly schemes: readonly [string]
} {
  return { name: value.product.protocolName, schemes: [value.product.protocolScheme] }
}

/**
 * Map the enterprise manifest to Host plugin configuration.
 * @param value - Validated enterprise distribution.
 * @returns Environment values consumed by the enterprise bundle patch.
 */
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
