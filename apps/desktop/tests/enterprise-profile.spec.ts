import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  officialDesktopDistribution,
  parseDesktopDistribution,
} from '../src/distribution.ts'
import { desktopProfileBundles } from '../src/project-manager.ts'

const enterprise = parseDesktopDistribution(JSON.parse(readFileSync(
  new URL('../../../packages/enterprise/distribution/tests/fixtures/distribution.json', import.meta.url),
  'utf8',
)))

describe('desktop enterprise profile', () => {
  it('uses the official profile template for the official product', () => {
    expect(desktopProfileBundles(officialDesktopDistribution)).toEqual([
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-web-app',
    ])
  })

  it('uses the validated enterprise bundle order', () => {
    expect(desktopProfileBundles(enterprise)).toEqual([
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-web-app',
      '@dsh-enterprise/dsh-enterprise',
    ])
  })
})
