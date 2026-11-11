import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  distributionHostEnvironment,
  officialDesktopDistribution,
  parseDesktopDistribution,
} from '../src/distribution.ts'

const fixture: unknown = JSON.parse(readFileSync(
  new URL('../../../packages/enterprise/distribution/tests/fixtures/distribution.json', import.meta.url),
  'utf8',
))

describe('desktop distribution', () => {
  it('keeps the official application defaults when no manifest is supplied', () => {
    expect(parseDesktopDistribution(undefined)).toBe(officialDesktopDistribution)
  })

  it('derives the enterprise Host environment from the validated manifest', () => {
    const parsed = parseDesktopDistribution(fixture)
    if (parsed.kind !== 'enterprise') throw new Error('expected enterprise distribution')
    expect(distributionHostEnvironment(parsed)).toMatchObject({
      ENTERPRISE_PRODUCT_NAME: 'Northstar Harness',
      ENTERPRISE_LOGIN_URL: 'https://services.northstar.example/auth/login',
      ENTERPRISE_MODEL_BASE_URL: 'https://services.northstar.example/v1',
      ENTERPRISE_DEFAULT_MODEL: 'northstar-chat',
      ENTERPRISE_ALLOW_LOOPBACK_HTTP: '0',
    })
    expect(JSON.parse(distributionHostEnvironment(parsed).ENTERPRISE_MODEL_CATALOG_JSON ?? 'null'))
      .toEqual([{
        id: 'northstar-chat',
        name: 'Northstar Chat',
        contextWindow: 131_072,
        maxTokens: 32_768,
        input: ['text', 'image'],
      }])
  })

  it('rejects an invalid enterprise manifest', () => {
    expect(() => parseDesktopDistribution({ schemaVersion: 1 })).toThrow()
  })
})
