/** Enterprise brand occupants for sidebar and blank-home slots. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import {
  EnterpriseBrandMark,
  EnterpriseBrandName,
  EnterpriseHeroFrame,
  EnterpriseHeroMark,
} from './Brand.tsx'

/** Required service: the UI slot registry. */
export const inject = ['slots']

/**
 * Install the enterprise brand occupants.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.inject('sidebar.brand.name', function* () {
      yield ctx.slots.register({ name: 'sidebar.brand.mark' }, EnterpriseBrandMark)
      yield ctx.slots.register({ name: 'sidebar.brand.name' }, EnterpriseBrandName)
    }))
  ctx.slots.inject('conversation.hero.brand.mark', () =>
    ctx.slots.register({ name: 'conversation.hero.brand.mark' }, EnterpriseHeroMark))
  ctx.slots.inject('conversation.hero.frame', () =>
    ctx.slots.register({ name: 'conversation.hero.frame', id: 'enterprise-brand' }, EnterpriseHeroFrame))
}
