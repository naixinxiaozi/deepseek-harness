import { createServer } from 'node:http'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bootProductionProfile } from '../../../test-support/loader-smoke/tests/fixtures/production-profile.ts'

const roots: string[] = []

afterEach(async () => {
  vi.unstubAllEnvs()
  while (roots.length > 0) await rm(roots.pop()!, { recursive: true, force: true })
})

function openAiChunk(content: string, finishReason: string | null): string {
  return `data: ${JSON.stringify({
    id: 'chatcmpl-test',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'northstar-chat',
    choices: [{ index: 0, delta: content === '' ? {} : { role: 'assistant', content }, finish_reason: finishReason }],
    ...(finishReason === null ? {} : { usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 } }),
  })}\n\n`
}

describe('enterprise model composition', () => {
  it('routes one real Loader turn through llm-pi-ai and persists the local Session', async () => {
    const requests: Array<{ authorization: string | undefined; body: unknown }> = []
    const server = createServer((request, response) => {
      void (async () => {
        const chunks: Uint8Array[] = []
        for await (const chunk of request) chunks.push(Buffer.from(chunk as Uint8Array))
        const text = Buffer.concat(chunks).toString('utf8')
        requests.push({
          authorization: request.headers.authorization,
          body: text === '' ? null : JSON.parse(text),
        })
        response.writeHead(200, { 'content-type': 'text/event-stream' })
        response.end([
          openAiChunk('enterprise-ok', null),
          openAiChunk('', 'stop'),
          'data: [DONE]\n\n',
        ].join(''))
      })()
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('model server did not bind')
    const home = await mkdtemp(join(tmpdir(), 'dsh-enterprise-composition-'))
    roots.push(home)
    await mkdir(join(home, 'sessions'), { recursive: true })
    await writeFile(join(home, '.credentials.yaml'), [
      'version: 1',
      'refs:',
      '  ENTERPRISE_LLM_TOKEN: northstar-token',
      '',
    ].join('\n'))
    vi.stubEnv('DSH_HOME', home)
    vi.stubEnv('DSH_TELEMETRY_DISABLED', '1')
    vi.stubEnv('ENTERPRISE_LLM_TOKEN', 'northstar-token')
    vi.stubEnv('ENTERPRISE_MODEL_BASE_URL', `http://127.0.0.1:${String(address.port)}/v1`)
    vi.stubEnv('ENTERPRISE_MODEL_CATALOG_JSON', JSON.stringify([{
      id: 'northstar-chat',
      contextWindow: 131_072,
      maxTokens: 32_768,
      input: ['text'],
    }]))
    let ctx
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    try {
      ctx = await bootProductionProfile({
        binName: 'enterprise-composition',
        profile: 'headless',
        overlayPaths: [fileURLToPath(new URL('./fixtures/enterprise-model.patch.yml', import.meta.url))],
        prepare: (context) => {
          context.provide('cmdlineArgs', { get: () => ['Reply with the enterprise marker.'] })
          context.provide('appExit', () => undefined)
          context.provide('appReady', { onReady: () => () => undefined })
        },
      })
      for (let attempt = 0; attempt < 100 && requests.length === 0; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      const agent = ctx.agents.list().find(candidate => candidate.session.header.origin !== 'subagent')
      if (agent === undefined) throw new Error('enterprise composition did not create a root agent')
      await agent.whenIdle()
      stdout.mockRestore()
      await ctx.sessions.flush(agent.session)
      const assistant = agent.session.snapshotEvents().findLast(event => event.type === 'assistant/message')
      expect(assistant?.data.message.content).toEqual([{ type: 'text', text: 'enterprise-ok' }])
      expect(requests[0]).toMatchObject({
        authorization: 'Bearer northstar-token',
        body: { model: 'northstar-chat' },
      })
      const stored = await ctx.sessionPersistence.stat(agent.session.id)
      expect(stored).toMatchObject({ header: { id: agent.session.id } })
      expect(JSON.stringify(agent.session.snapshotEvents())).not.toContain('northstar-token')
    } finally {
      stdout.mockRestore()
      await ctx?.fiber.dispose()
      await new Promise<void>(resolve => server.close(() => { resolve() }))
      server.closeAllConnections()
    }
  }, 30_000)
})
