// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { apply, inject } from '../src/client/index.ts'
import { EnterpriseBrandMark, EnterpriseBrandName } from '../src/client/Brand.tsx'

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const slots = ctx.get('slots')
  if (slots === undefined) throw new Error('slots service did not register')
  slots.register({
    name: 'root',
    children: {
      'sidebar.brand.mark': { kind: 'single', scope: 'root' },
      'sidebar.brand.name': { kind: 'single', scope: 'root' },
      'conversation.hero.brand.mark': { kind: 'single', scope: 'root' },
      'conversation.hero.frame': { kind: 'hoc', scope: 'root' },
    },
  } as never, () => null)
  return { ctx, slots }
}

describe('enterprise client brand', () => {
  it('registers all four brand holes and removes them with the plugin', async () => {
    vi.stubEnv('DSH_CLIENT_TITLE', 'Northstar Harness')
    const subject = await bench()
    const fiber = subject.ctx.plugin({ inject, apply })
    await fiber.await()
    expect(subject.slots.entries('sidebar.brand.mark')).toHaveLength(1)
    expect(subject.slots.entries('sidebar.brand.name')).toHaveLength(1)
    expect(subject.slots.entries('conversation.hero.brand.mark')).toHaveLength(1)
    expect(subject.slots.entries('conversation.hero.frame')).toHaveLength(1)
    await fiber.dispose()
    expect(subject.slots.entries('sidebar.brand.mark')).toHaveLength(0)
    expect(subject.slots.entries('sidebar.brand.name')).toHaveLength(0)
    expect(subject.slots.entries('conversation.hero.brand.mark')).toHaveLength(0)
    expect(subject.slots.entries('conversation.hero.frame')).toHaveLength(0)
  })

  it('renders the configured product name and visible initial', () => {
    vi.stubEnv('DSH_CLIENT_TITLE', 'Northstar Harness')
    const name = render(<EnterpriseBrandName />)
    expect(name.getByText('Northstar Harness')).toBeTruthy()
    name.unmount()
    const mark = render(<EnterpriseBrandMark size={24} />)
    expect(mark.getByText('N')).toBeTruthy()
  })
})
