/** Validated enterprise authentication configuration passed from the private profile patch. */

import z from '@deepseek-ai/schemastery'

/** Host-only enterprise authentication settings. */
export interface EnterpriseAuthConfig {
  /** Enterprise login endpoint. */
  readonly loginUrl: string
  /** Optional enterprise logout endpoint. */
  readonly logoutUrl?: string
  /** Exact inference origin allowed to receive the stored token. */
  readonly inferenceOrigin: string
  /** JSON field carrying the username. */
  readonly usernameField: string
  /** JSON field carrying the password. */
  readonly passwordField: string
  /** Dot-separated JSON path carrying the access token in the login response. */
  readonly tokenField: string
  /** Permit loopback HTTP for owned tests. */
  readonly allowLoopbackHttp: boolean
  /** Maximum duration of one login or logout HTTP request. */
  readonly requestTimeoutMs: number
  /** Maximum lifetime of one local browser login attempt. */
  readonly attemptTimeoutMs: number
}

/** Runtime schema for enterprise authentication settings. */
export const EnterpriseAuthConfig: z<EnterpriseAuthConfig> = z.object({
  loginUrl: z.string().required(),
  logoutUrl: z.string(),
  inferenceOrigin: z.string().required(),
  usernameField: z.string().default('username'),
  passwordField: z.string().default('password'),
  tokenField: z.string().default('access_token'),
  allowLoopbackHttp: z.boolean().default(false),
  requestTimeoutMs: z.number().min(1).max(120_000).default(30_000),
  attemptTimeoutMs: z.number().min(1).max(3_600_000).default(600_000),
})
