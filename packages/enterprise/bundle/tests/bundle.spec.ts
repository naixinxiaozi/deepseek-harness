import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  bundlePatchPaths,
  composeEntries,
  loadOverlayPatches,
} from '@deepseek-ai/dsh-app-boot'

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = join(packageDir, '..', '..', '..')

beforeEach(() => {
  vi.stubEnv('ENTERPRISE_PROVIDER_NAME', 'Northstar Gateway')
  vi.stubEnv('ENTERPRISE_MODEL_API', 'openai-completions')
  vi.stubEnv('ENTERPRISE_MODEL_BASE_URL', 'https://services.northstar.example/v1')
  vi.stubEnv('ENTERPRISE_DEFAULT_MODEL', 'northstar-chat')
  vi.stubEnv('ENTERPRISE_MODEL_CATALOG_JSON', JSON.stringify([{
    id: 'northstar-chat',
    contextWindow: 131_072,
    maxTokens: 32_768,
    input: ['text'],
  }]))
})

afterEach(() => { vi.unstubAllEnvs() })

function patchesFor(directory: string) {
  const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as {
    dsh: { bundle: { patch: string } }
  }
  return bundlePatchPaths(directory, manifest.dsh.bundle)
    .flatMap(path => loadOverlayPatches('test', path))
}

function entries() {
  return composeEntries([
    patchesFor(join(repositoryRoot, 'packages', 'bundle', 'base')),
    patchesFor(join(repositoryRoot, 'packages', 'bundle', 'web-app')),
    patchesFor(packageDir),
  ])
}

describe('enterprise bundle patch', () => {
  it('replaces official account, model, and brand rows', () => {
    const composed = entries()
    expect(composed.find(entry => entry.id === 'deepseek-account')?.disabled).toBe(true)
    expect(composed.find(entry => entry.id === 'llm-deepseek')?.disabled).toBe(true)
    expect(composed.find(entry => entry.id === 'llm-deepseek-account')?.disabled).toBe(true)
    expect(composed.find(entry => entry.id === 'ui-brand-official')?.disabled).toBe(true)
  })

  it('inserts the enterprise account, model, and brand rows', () => {
    const composed = entries()
    expect(composed.find(entry => entry.id === 'enterprise-account')).toMatchObject({
      name: '@dsh-enterprise/dsh-enterprise-account',
    })
    expect(composed.find(entry => entry.id === 'llm-pi-ai')?.config).toMatchObject({
      providers: {
        enterprise: {
          api: { __jsExpr: "process.env.ENTERPRISE_MODEL_API || 'openai-completions'" },
          apiKeyEnv: 'ENTERPRISE_LLM_TOKEN',
          baseURL: { __jsExpr: "process.env.ENTERPRISE_MODEL_BASE_URL || 'https://services.invalid/v1'" },
        },
      },
    })
    expect(composed.find(entry => entry.id === 'agent-default-model')?.config).toMatchObject({
      provider: 'enterprise',
      model: { __jsExpr: "process.env.ENTERPRISE_DEFAULT_MODEL || 'enterprise-default'" },
    })
    expect(composed.find(entry => entry.id === 'ui-brand-enterprise')).toMatchObject({
      name: '@dsh-enterprise/dsh-enterprise-ui-brand',
    })
  })
})
