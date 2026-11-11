/** Filesystem ownership for the Electron-managed desktop installation. */

import { join } from 'node:path'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import type { EnterpriseDistribution } from '@dsh-enterprise/dsh-enterprise-distribution'

/** Stable desktop installation paths under the shared Harness home. */
export interface DesktopPaths {
  readonly profile: string
  readonly lock: string
}

/**
 * Resolve every Electron-owned path without changing the shared data roots.
 * @param dshHome - Harness home shared with npm-installed dsh.
 * @returns immutable desktop path set.
 */
export function resolveDesktopPaths(dshHome: string = resolveDshHome()): DesktopPaths {
  return {
    profile: join(dshHome, 'profiles', 'desktop'),
    lock: join(dshHome, 'profiles', 'desktop', 'lock'),
  }
}

/**
 * Resolve isolated Electron and Harness data roots for an enterprise product.
 * @param appData - Electron application-data root.
 * @param distribution - Validated enterprise distribution.
 * @returns Independent userData and Harness-home roots.
 */
export function resolveDesktopApplicationPaths(
  appData: string,
  distribution: EnterpriseDistribution,
): { readonly userData: string; readonly dshHome: string } {
  const userData = join(appData, distribution.product.dataDirectory)
  return { userData, dshHome: join(userData, 'harness') }
}
