/** Validated enterprise Desktop distribution configuration. */

/** Manifest shape version accepted by this build. */
export const ENTERPRISE_DISTRIBUTION_SCHEMA_VERSION = 1 as const

/** One model advertised by the enterprise OpenAI-compatible proxy. */
export interface EnterpriseModel {
  /** Request model id. */
  readonly id: string
  /** Display label for model selectors. */
  readonly name?: string
  /** Maximum model context window. */
  readonly contextWindow: number
  /** Maximum model output tokens. */
  readonly maxTokens: number
  /** Accepted request modalities. */
  readonly input?: readonly ('text' | 'image')[]
}

/** Complete product, authentication, model, branding, and update configuration. */
export interface EnterpriseDistribution {
  /** Manifest schema version. */
  readonly schemaVersion: typeof ENTERPRISE_DISTRIBUTION_SCHEMA_VERSION
  /** Native application and product identity. */
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
  /** Enterprise login and account-page endpoints. */
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
  /** Enterprise OpenAI-compatible provider and catalog. */
  readonly model: {
    readonly provider: 'enterprise'
    readonly displayName: string
    readonly baseUrl: string
    readonly api: 'openai-completions' | 'openai-responses'
    readonly defaultModel: string
    readonly models: readonly EnterpriseModel[]
  }
  /** Build-time artwork paths relative to the manifest file. */
  readonly branding: {
    readonly windowsIcon: string
    readonly macosIcon: string
    readonly trayIcon: string
    readonly welcomeMark: string
    readonly installerSidebar: string
  }
  /** Update behavior; disabled mode makes no update request. */
  readonly update:
    | { readonly mode: 'disabled' }
    | { readonly mode: 'enterprise'; readonly feed: string; readonly channel: string }
  /** Ordered profile bundle list. */
  readonly bundles: readonly string[]
}
