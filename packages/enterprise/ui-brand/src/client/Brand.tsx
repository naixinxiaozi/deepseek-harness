/** Enterprise product mark, wordmark, and layout-neutral home frame. */

import type { ReactNode } from 'react'
import type {
  HeroBrandMarkOwnerProps,
  HeroFrameOwnerProps,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import css from './Brand.module.css'

function productName(): string {
  const value = process.env.DSH_CLIENT_TITLE
  if (value === undefined || value.trim() === '') {
    throw new Error('enterprise brand: DSH_CLIENT_TITLE is required')
  }
  return value
}

function initial(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? 'E'
}

/**
 * Render the product initial as the sidebar mark.
 * @param props - Requested square edge.
 * @returns Product initial in the brand tile.
 */
export function EnterpriseBrandMark({ size }: SidebarBrandMarkOwnerProps) {
  return (
    <span className={css.mark} style={{ width: size, height: size, fontSize: Math.max(10, size * 0.55) }}>
      {initial(productName())}
    </span>
  )
}

/**
 * Render the configured product wordmark.
 * @returns Plain product name.
 */
export function EnterpriseBrandName() {
  return <span className={css.name}>{productName()}</span>
}

/**
 * Render the product initial before the blank-session headline.
 * @param props - Requested square edge and host geometry class.
 * @returns Product initial in the hero tile.
 */
export function EnterpriseHeroMark({ size, className }: HeroBrandMarkOwnerProps) {
  return (
    <span
      className={[css.mark, css.heroMark, className].filter(Boolean).join(' ')}
      style={{ width: size, height: size, fontSize: Math.max(12, size * 0.5) }}
    >
      {initial(productName())}
    </span>
  )
}

/**
 * Wrap the Conversation scroll body without changing its layout.
 * @param props - Blank-home state and wrapped content.
 * @returns Layout-neutral frame.
 */
export function EnterpriseHeroFrame({ hero: _hero, children }: HeroFrameOwnerProps & { children: ReactNode }) {
  return <div className={css.frame}>{children}</div>
}
