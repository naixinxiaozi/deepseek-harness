import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseEnterpriseDistribution } from '../src/index.ts'

const fixture: unknown = JSON.parse(readFileSync(new URL('./fixtures/distribution.json', import.meta.url), 'utf8'))

type MutableFixture = {
  product: Record<string, unknown>
  auth: Record<string, unknown>
  model: Record<string, unknown>
  update: Record<string, unknown>
}

describe('enterprise distribution', () => {
  it('accepts the fixed Northstar fixture', () => {
    expect(parseEnterpriseDistribution(fixture)).toMatchObject({
      product: { name: 'Northstar Harness', appId: 'com.northstar.harness' },
      model: { provider: 'enterprise', api: 'openai-completions', defaultModel: 'northstar-chat' },
    })
  })

  it.each([
    ['non-HTTPS login', (value: MutableFixture) => { value.auth.loginUrl = 'http://auth.northstar.example/login' }],
    ['empty model catalog', (value: MutableFixture) => { value.model.models = [] }],
    ['missing default model', (value: MutableFixture) => { value.model.defaultModel = 'missing' }],
    ['official application id', (value: MutableFixture) => { value.product.appId = 'com.deepseek.harness' }],
    ['official update feed', (value: MutableFixture) => {
      value.update.mode = 'enterprise'
      value.update.feed = 'https://download.deepseek.com/nightly.yml'
      value.update.channel = 'nightly'
    }],
  ])('rejects %s', (_name, mutate) => {
    const candidate = structuredClone(fixture) as MutableFixture
    mutate(candidate)
    expect(() => parseEnterpriseDistribution(candidate)).toThrow()
  })
})
