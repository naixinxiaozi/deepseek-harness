import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  parseEnterpriseTouchpointPolicy,
  verifyEnterpriseTouchpoints,
} from './verify-enterprise-touchpoints.ts'

const policy = parseEnterpriseTouchpointPolicy(JSON.parse(readFileSync(
  new URL('./enterprise/upstream-touchpoints.json', import.meta.url),
  'utf8',
)))

describe('enterprise upstream touchpoints', () => {
  it('accepts enterprise packages and allowlisted Desktop integration files', () => {
    expect(verifyEnterpriseTouchpoints([
      'packages/enterprise/account/src/index.ts',
      'apps/desktop/src/distribution.ts',
      'apps/desktop/scripts/electron-builder-config.mjs',
      'apps/desktop-host/src/index.ts',
    ], policy)).toEqual([])
  })

  it('rejects an unlisted upstream core edit', () => {
    expect(verifyEnterpriseTouchpoints([
      'packages/core/agent-loop/src/agent.ts',
    ], policy)).toEqual(['packages/core/agent-loop/src/agent.ts'])
  })
})
