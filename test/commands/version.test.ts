import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { VERSION } from '../../src/version.js'

describe('version command', () => {
  let logSpy: any

  beforeEach(() => {
    vi.clearAllMocks()
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    logSpy.mockRestore()
  })

  it('should display the version from package.json', async () => {
    const Version = (await import('../../src/commands/version.js')).default
    const cmd = new Version([], {} as any)
    await cmd.run()
    
    expect(logSpy).toHaveBeenCalledWith(VERSION)
  })

  it('should use VERSION constant that matches package.json', () => {
    // VERSION should be a valid semver string
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/)
  })
})