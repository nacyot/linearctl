import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ConfigSchema } from '../../src/types/commands.js'

// Mock storage for testing
let mockConfigStore: Record<string, unknown> = {}

// Mock Conf to prevent file system side effects
vi.mock('conf', () => ({
  default: vi.fn().mockImplementation(() => ({
    clear: vi.fn(() => {
      mockConfigStore = {}
    }),
    delete: vi.fn((key: string) => {
      delete mockConfigStore[key]
    }),
    get: vi.fn((key: string) => mockConfigStore[key]),
    set: vi.fn((key: string, value: unknown) => {
      mockConfigStore[key] = value
    }),
  })),
}))

// Mock LinearClient
vi.mock('@linear/sdk', () => ({
  LinearClient: vi.fn().mockImplementation(() => ({
    viewer: vi.fn().mockResolvedValue({ id: 'test-user-id' }),
  })),
}))

import { LinearClient } from '@linear/sdk'

import { getApiKey, getLinearClient, setApiKey } from '../../src/services/linear.js'

describe('Profile Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConfigStore = {}
    delete process.env.LINEAR_API_KEY
    delete process.env.LINEAR_CLI_KEY
    delete process.env.LINEAR_PROFILE

    // Reset the linear client singleton
    mockConfigStore.currentKey = undefined
  })

  describe('Multi-profile support', () => {
    it('should handle multiple profiles independently', () => {
      // Set up multiple profiles
      setApiKey('personal-key', 'personal')
      setApiKey('work-key', 'work')
      setApiKey('default-key', 'default')

      // Verify each profile has its own API key
      expect(getApiKey('personal')).toBe('personal-key')
      expect(getApiKey('work')).toBe('work-key')
      expect(getApiKey('default')).toBe('default-key')
    })

    it('should use default profile when no profile specified', () => {
      setApiKey('default-key', 'default')

      expect(getApiKey()).toBe('default-key')
    })

    it('should create LinearClient with correct profile API key', () => {
      setApiKey('personal-key', 'personal')
      setApiKey('work-key', 'work')

      // Clear currentKey to force new client creation
      mockConfigStore.currentKey = undefined

      // Get client with work profile
      getLinearClient({ profile: 'work' })
      expect(vi.mocked(LinearClient)).toHaveBeenLastCalledWith({ apiKey: 'work-key' })

      // Clear currentKey again to force new client creation
      mockConfigStore.currentKey = undefined

      // Get client with personal profile
      getLinearClient({ profile: 'personal' })
      expect(vi.mocked(LinearClient)).toHaveBeenLastCalledWith({ apiKey: 'personal-key' })
    })

    it('should prioritize explicit profile flag over environment variable', () => {
      process.env.LINEAR_API_KEY = 'env-key'
      setApiKey('profile-key', 'personal')

      // Explicit profile flag should take precedence
      expect(getApiKey('personal')).toBe('profile-key')

      // Without profile flag, env should be used
      expect(getApiKey()).toBe('env-key')
    })

    it('should use LINEAR_PROFILE env to select profile', () => {
      setApiKey('work-key', 'work')
      setApiKey('personal-key', 'personal')
      process.env.LINEAR_PROFILE = 'work'

      expect(getApiKey()).toBe('work-key')
    })

    it('should throw error when profile does not exist', () => {
      expect(() => getLinearClient({ profile: 'nonexistent' })).toThrow(/No API key found/)
    })
  })

  describe('Profile configuration structure', () => {
    it('should store profiles in correct structure', () => {
      setApiKey('test-key', 'test-profile')

      const config = mockConfigStore as ConfigSchema
      expect(config.profiles).toBeDefined()
      expect(config.profiles!['test-profile']).toEqual({
        apiKey: 'test-key',
      })
    })

    it('should set default profile when creating first profile', () => {
      setApiKey('first-key', 'first')

      const config = mockConfigStore as ConfigSchema
      expect(config.defaultProfile).toBe('first')
    })

    it('should not change default profile when adding second profile', () => {
      setApiKey('first-key', 'first')
      setApiKey('second-key', 'second')

      const config = mockConfigStore as ConfigSchema
      expect(config.defaultProfile).toBe('first')
    })
  })

  describe('Command integration with profiles', () => {
    it('should pass profile to getLinearClient in commands', () => {
      setApiKey('test-key', 'test')

      // Clear currentKey to force new client creation
      mockConfigStore.currentKey = undefined

      // Simulate command calling getLinearClient with profile
      getLinearClient({ profile: 'test' })

      expect(vi.mocked(LinearClient)).toHaveBeenLastCalledWith({ apiKey: 'test-key' })
    })

    it('should use default profile when no profile flag provided', () => {
      setApiKey('default-key', 'default')

      // Clear currentKey to force new client creation
      mockConfigStore.currentKey = undefined

      // Simulate command calling getLinearClient without profile
      getLinearClient()

      expect(vi.mocked(LinearClient)).toHaveBeenLastCalledWith({ apiKey: 'default-key' })
    })
  })

  describe('Profile priority resolution', () => {
    it('should follow correct priority: profile flag > env > LINEAR_PROFILE > default', () => {
      // Set up all possible sources
      setApiKey('default-key', 'default')
      setApiKey('profile-key', 'myprofile')

      // Test 1: No env, use profile flag
      expect(getApiKey('myprofile')).toBe('profile-key')

      // Test 2: LINEAR_PROFILE env, no profile flag
      process.env.LINEAR_PROFILE = 'myprofile'
      expect(getApiKey()).toBe('profile-key')

      // Test 3: LINEAR_API_KEY env, but explicit profile flag takes precedence
      process.env.LINEAR_API_KEY = 'env-key'
      expect(getApiKey('myprofile')).toBe('profile-key')  // Profile flag wins
      expect(getApiKey()).toBe('env-key')  // Without flag, env wins
    })
  })
})
