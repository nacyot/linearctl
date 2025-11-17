import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as linearService from '../../src/services/linear.js'

// Mock the linear service
vi.mock('../../src/services/linear.js', () => ({
  clearApiKey: vi.fn(),
  getLinearClient: vi.fn(),
  hasApiKey: vi.fn(),
  setApiKey: vi.fn(),
  testConnection: vi.fn(),
}))

// Mock inquirer for interactive prompts
vi.mock('@inquirer/prompts', () => ({
  confirm: vi.fn(),
  input: vi.fn(),
  password: vi.fn(),
}))

describe('init command', () => {
  let logSpy: any
  let errorSpy: any

  beforeEach(() => {
    vi.clearAllMocks()
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    // Clear environment variables
    delete process.env.LINEAR_API_KEY
    delete process.env.LINEAR_CLI_KEY
  })

  afterEach(() => {
    logSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('should set API key when provided', async () => {
    // Mock successful connection test
    vi.mocked(linearService.hasApiKey).mockReturnValue(false)
    vi.mocked(linearService.testConnection).mockResolvedValue(true)

    const Init = (await import('../../src/commands/init.js')).default
    const cmd = new Init([], {} as any)

    await cmd.runWithFlags({ 'api-key': 'test-api-key-123' })

    expect(linearService.setApiKey).toHaveBeenCalledWith('test-api-key-123', 'default')
    expect(linearService.testConnection).toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('successfully'))
  })

  it('should prompt for API key when not provided', async () => {
    const { password } = await import('@inquirer/prompts')
    vi.mocked(password).mockResolvedValue('lin_api_prompted123')
    vi.mocked(linearService.hasApiKey).mockReturnValue(false)
    vi.mocked(linearService.testConnection).mockResolvedValue(true)

    const Init = (await import('../../src/commands/init.js')).default
    const cmd = new Init([], {} as any)

    await cmd.runWithFlags({})

    expect(password).toHaveBeenCalled()
    expect(linearService.setApiKey).toHaveBeenCalledWith('lin_api_prompted123', 'default')
  })

  it('should handle invalid API key', async () => {
    vi.mocked(linearService.hasApiKey).mockReturnValue(false)
    vi.mocked(linearService.testConnection).mockResolvedValue(false)
    
    const Init = (await import('../../src/commands/init.js')).default
    const cmd = new Init([], {} as any)
    
    await expect(cmd.runWithFlags({ 'api-key': 'invalid-key' })).rejects.toThrow('Invalid API key')
  })

  it('should confirm overwrite when key already exists', async () => {
    const { confirm } = await import('@inquirer/prompts')
    const { password } = await import('@inquirer/prompts')
    vi.mocked(linearService.hasApiKey).mockReturnValue(true)
    vi.mocked(confirm).mockResolvedValue(true)
    vi.mocked(password).mockResolvedValue('lin_api_new123')
    vi.mocked(linearService.testConnection).mockResolvedValue(true)

    const Init = (await import('../../src/commands/init.js')).default
    const cmd = new Init([], {} as any)

    await cmd.runWithFlags({})

    expect(confirm).toHaveBeenCalled()
    expect(linearService.setApiKey).toHaveBeenCalledWith('lin_api_new123', 'default')
  })

  it('should abort when user declines overwrite', async () => {
    const { confirm } = await import('@inquirer/prompts')
    vi.mocked(linearService.hasApiKey).mockReturnValue(true)
    vi.mocked(confirm).mockResolvedValue(false)

    const Init = (await import('../../src/commands/init.js')).default
    const cmd = new Init([], {} as any)

    await cmd.runWithFlags({})

    expect(linearService.setApiKey).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('aborted'))
  })

  describe('profile support', () => {
    it('should initialize specific profile when --profile flag is provided', async () => {
      vi.mocked(linearService.hasApiKey).mockReturnValue(false)
      vi.mocked(linearService.testConnection).mockResolvedValue(true)

      const Init = (await import('../../src/commands/init.js')).default
      const cmd = new Init([], {} as any)

      await cmd.runWithFlags({ 'api-key': 'test-profile-key', profile: 'work' })

      expect(linearService.setApiKey).toHaveBeenCalledWith('test-profile-key', 'work')
      expect(linearService.testConnection).toHaveBeenCalledWith('work')
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('work'))
    })

    it('should check specific profile when overwriting with --profile', async () => {
      const { confirm } = await import('@inquirer/prompts')
      const { password } = await import('@inquirer/prompts')

      // Mock that 'work' profile exists but 'personal' does not
      vi.mocked(linearService.hasApiKey).mockImplementation((profile) => profile === 'work')
      vi.mocked(confirm).mockResolvedValue(true)
      vi.mocked(password).mockResolvedValue('lin_api_new_work')
      vi.mocked(linearService.testConnection).mockResolvedValue(true)

      const Init = (await import('../../src/commands/init.js')).default
      const cmd = new Init([], {} as any)

      await cmd.runWithFlags({ profile: 'work' })

      expect(confirm).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('work'),
      }))
      expect(linearService.setApiKey).toHaveBeenCalledWith('lin_api_new_work', 'work')
    })

    it('should show profile-specific usage hint after initialization', async () => {
      vi.mocked(linearService.hasApiKey).mockReturnValue(false)
      vi.mocked(linearService.testConnection).mockResolvedValue(true)

      const Init = (await import('../../src/commands/init.js')).default
      const cmd = new Init([], {} as any)

      await cmd.runWithFlags({ 'api-key': 'test-key', profile: 'work' })

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('--profile work'))
    })

    it('should show default usage hint when no profile specified', async () => {
      vi.mocked(linearService.hasApiKey).mockReturnValue(false)
      vi.mocked(linearService.testConnection).mockResolvedValue(true)

      const Init = (await import('../../src/commands/init.js')).default
      const cmd = new Init([], {} as any)

      await cmd.runWithFlags({ 'api-key': 'test-key' })

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('lc issue list'))
      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('--profile'))
    })
  })
})