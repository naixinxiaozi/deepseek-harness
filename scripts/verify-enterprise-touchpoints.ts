/** Enforce the allowlist of upstream files changed by the enterprise distribution. */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'

const ROOT = resolve(import.meta.dirname, '..')
const POLICY = resolve(import.meta.dirname, 'enterprise', 'upstream-touchpoints.json')

/** Allowed upstream path forms for the enterprise branch. */
export interface EnterpriseTouchpointPolicy {
  readonly allowedPrefixes: readonly string[]
  readonly allowedFiles: readonly string[]
}

function strings(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) {
    throw new Error(`enterprise touchpoints: ${field} must be a string array`)
  }
  return value
}

/**
 * Validate one parsed touchpoint policy.
 * @param value - Parsed JSON policy.
 * @returns Normalized path allowlist.
 * @throws when a field is malformed.
 */
export function parseEnterpriseTouchpointPolicy(value: unknown): EnterpriseTouchpointPolicy {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('enterprise touchpoints: policy must be an object')
  }
  return {
    allowedPrefixes: strings('allowedPrefixes' in value ? value.allowedPrefixes : undefined, 'allowedPrefixes'),
    allowedFiles: strings('allowedFiles' in value ? value.allowedFiles : undefined, 'allowedFiles'),
  }
}

/**
 * Return changed paths outside the explicit enterprise allowlist.
 * @param paths - Repository-relative changed paths.
 * @param policy - Allowed files and prefixes.
 * @returns Rejected paths in input order.
 */
export function verifyEnterpriseTouchpoints(
  paths: readonly string[],
  policy: EnterpriseTouchpointPolicy,
): string[] {
  return paths.filter(path => !policy.allowedFiles.includes(path)
    && !policy.allowedPrefixes.some(prefix => path.startsWith(prefix)))
}

function main(): void {
  const { values } = parseArgs({ options: { base: { type: 'string' } } })
  if (values.base === undefined || values.base.trim() === '') {
    throw new Error('usage: verify-enterprise-touchpoints.ts --base <upstream-ref>')
  }
  const mergeBase = execFileSync('git', ['merge-base', values.base, 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim()
  const changed = execFileSync('git', ['diff', '--name-only', mergeBase, 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim().split(/\r?\n/u).filter(Boolean).map(path => path.replaceAll('\\', '/'))
  const policy = parseEnterpriseTouchpointPolicy(JSON.parse(readFileSync(POLICY, 'utf8')))
  const rejected = verifyEnterpriseTouchpoints(changed, policy)
  if (rejected.length > 0) {
    process.stderr.write(`enterprise touchpoints: ${String(rejected.length)} unlisted upstream path(s)\n`)
    for (const path of rejected) process.stderr.write(`  ${path}\n`)
    process.exitCode = 1
    return
  }
  process.stdout.write(`enterprise touchpoints: ${String(changed.length)} changed path(s), all allowlisted\n`)
}

if (import.meta.main) main()
