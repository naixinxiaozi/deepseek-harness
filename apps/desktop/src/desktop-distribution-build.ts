/** Read and resolve the enterprise distribution input used by Desktop packaging. */

import { lstatSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import {
  parseEnterpriseDistribution,
  type EnterpriseDistribution,
} from '@dsh-enterprise/dsh-enterprise-distribution'

/** Resolved enterprise manifest, source path, and branding assets. */
export interface DesktopDistributionBuild {
  readonly manifestPath: string
  readonly manifest: EnterpriseDistribution
  readonly assets: {
    readonly windowsIcon: string
    readonly macosIcon: string
    readonly trayIcon: string
    readonly welcomeMark: string
    readonly installerSidebar: string
  }
}

/**
 * Read the optional enterprise manifest and resolve every branding file beneath it.
 * @param env - Packaging environment.
 * @returns Resolved build input, or undefined for the official product.
 * @throws when the path, manifest, or branding files are invalid.
 */
export function readDesktopDistributionBuild(
  env: NodeJS.ProcessEnv = process.env,
): DesktopDistributionBuild | undefined {
  const configured = env.DSH_DESKTOP_DISTRIBUTION
  if (configured === undefined) return undefined
  if (!isAbsolute(configured)) {
    throw new Error('desktop distribution: DSH_DESKTOP_DISTRIBUTION must be an absolute file path')
  }
  const manifestPath = resolve(configured)
  let value: unknown
  try {
    value = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    throw new Error(`desktop distribution: failed to read ${manifestPath}`, { cause: error })
  }
  const manifest = parseEnterpriseDistribution(value)
  const root = dirname(manifestPath)
  const asset = (path: string): string => {
    if (isAbsolute(path)) throw new Error(`desktop distribution: asset path must be relative: ${path}`)
    const resolved = resolve(root, path)
    const inside = relative(root, resolved)
    if (inside === '' || inside.startsWith('..') || isAbsolute(inside)) {
      throw new Error(`desktop distribution: asset path escapes the manifest directory: ${path}`)
    }
    if (!lstatSync(resolved).isFile()) {
      throw new Error(`desktop distribution: asset is not a regular file: ${resolved}`)
    }
    return resolved
  }
  return {
    manifestPath,
    manifest,
    assets: {
      windowsIcon: asset(manifest.branding.windowsIcon),
      macosIcon: asset(manifest.branding.macosIcon),
      trayIcon: asset(manifest.branding.trayIcon),
      welcomeMark: asset(manifest.branding.welcomeMark),
      installerSidebar: asset(manifest.branding.installerSidebar),
    },
  }
}
