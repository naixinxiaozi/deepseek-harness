import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { desktopInstallAnchor } from '../src/index.ts'

describe('Desktop Host installation anchor', () => {
  it('uses the runtime root manifest so its full dependency table is visible to profile resolution', () => {
    expect(desktopInstallAnchor('/opt/dsh/runtime')).toBe(join('/opt/dsh/runtime', 'package.json'))
  })
})
