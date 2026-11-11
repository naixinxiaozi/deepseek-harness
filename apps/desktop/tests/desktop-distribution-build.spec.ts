import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readDesktopDistributionBuild } from '../src/desktop-distribution-build.ts'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('desktop distribution build input', () => {
  it('resolves the manifest and regular asset files beneath its directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-desktop-distribution-'))
    roots.push(root)
    mkdirSync(join(root, 'assets'))
    for (const file of ['icon.png', 'tray.ico', 'welcome.svg', 'sidebar.bmp']) {
      writeFileSync(join(root, 'assets', file), 'fixture')
    }
    writeFileSync(join(root, 'distribution.json'), JSON.stringify({
      schemaVersion: 1,
      product: {
        name: 'Northstar Harness', executableName: 'Northstar Harness', companyName: 'Northstar',
        copyright: 'Copyright Northstar', appId: 'com.northstar.harness', protocolName: 'Northstar Harness',
        protocolScheme: 'northstar-harness', dataDirectory: 'NorthstarHarness',
      },
      auth: {
        loginUrl: 'https://services.northstar.example/auth/login', usageUrl: 'https://services.northstar.example/usage',
        topUpUrl: 'https://services.northstar.example/top-up', inferenceOrigin: 'https://services.northstar.example',
        usernameField: 'username', passwordField: 'password', tokenField: 'access_token', allowLoopbackHttp: false,
        requestTimeoutMs: 30_000, attemptTimeoutMs: 600_000,
      },
      model: {
        provider: 'enterprise', displayName: 'Northstar Gateway', baseUrl: 'https://services.northstar.example/v1',
        api: 'openai-completions', defaultModel: 'northstar-chat',
        models: [{ id: 'northstar-chat', contextWindow: 131_072, maxTokens: 32_768 }],
      },
      branding: {
        windowsIcon: 'assets/icon.png', macosIcon: 'assets/icon.png', trayIcon: 'assets/tray.ico',
        welcomeMark: 'assets/welcome.svg', installerSidebar: 'assets/sidebar.bmp',
      },
      update: { mode: 'disabled' },
      bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@dsh-enterprise/dsh-enterprise'],
    }))
    expect(readDesktopDistributionBuild({ DSH_DESKTOP_DISTRIBUTION: join(root, 'distribution.json') }))
      .toMatchObject({
        manifestPath: join(root, 'distribution.json'),
        manifest: { product: { name: 'Northstar Harness' } },
        assets: {
          windowsIcon: join(root, 'assets/icon.png'),
          macosIcon: join(root, 'assets/icon.png'),
          trayIcon: join(root, 'assets/tray.ico'),
          welcomeMark: join(root, 'assets/welcome.svg'),
          installerSidebar: join(root, 'assets/sidebar.bmp'),
        },
      })
  })

  it('returns undefined when no enterprise manifest is configured', () => {
    expect(readDesktopDistributionBuild({})).toBeUndefined()
  })

})
