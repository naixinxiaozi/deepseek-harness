/** Electron-owned loading of the Desktop enterprise distribution manifest. */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import {
  officialDesktopDistribution,
  parseDesktopDistribution,
  type DesktopDistribution,
} from './distribution.ts'

/**
 * Load the supplied enterprise manifest, or retain the official Desktop defaults.
 * @returns The validated distribution for this process.
 * @throws when an explicitly supplied or packaged manifest cannot be read or validated.
 */
export function loadDesktopDistribution(): DesktopDistribution {
  const path = app.isPackaged
    ? join(process.resourcesPath, 'distribution.json')
    : process.env.DSH_DESKTOP_DISTRIBUTION
  if (path === undefined) return officialDesktopDistribution
  let value: unknown
  try {
    value = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`desktop distribution: failed to read ${path}`, { cause: error })
  }
  return parseDesktopDistribution(value)
}
