import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseEnterpriseDistribution } from '@dsh-enterprise/dsh-enterprise-distribution'
import { readInstallerLocales, renderInstallerStrings } from '../scripts/installer-locales.mjs'
import { enterpriseProtocol } from '../src/distribution.ts'
import { resolveDesktopLocale } from '../src/locale.ts'
import { resolveDesktopApplicationPaths } from '../src/paths.ts'

const distribution = parseEnterpriseDistribution(JSON.parse(readFileSync(
  new URL('../../../packages/enterprise/distribution/tests/fixtures/distribution.json', import.meta.url),
  'utf8',
)))

describe('enterprise desktop identity', () => {
  it('uses isolated userData and Harness home directories', () => {
    expect(resolveDesktopApplicationPaths('/home/alice/.config', distribution)).toEqual({
      userData: join('/home/alice/.config', 'NorthstarHarness'),
      dshHome: join('/home/alice/.config', 'NorthstarHarness', 'harness'),
    })
  })

  it('uses the manifest protocol and product name', () => {
    expect(enterpriseProtocol(distribution)).toEqual({
      name: 'Northstar Harness',
      schemes: ['northstar-harness'],
    })
    expect(resolveDesktopLocale('en', 'Northstar Harness').messages.aboutMenu)
      .toBe('About Northstar Harness')
  })

  it('renders installer strings with the enterprise name', () => {
    expect(renderInstallerStrings(readInstallerLocales(), 'Northstar Harness'))
      .toContain('Northstar Harness is running')
  })
})
