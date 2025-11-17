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

// Import after mocking
import { migrateConfigIfNeeded } from '../../src/services/linear.js'

describe('Config Migration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConfigStore = {}
  })

  it('should migrate legacy apiKey to profiles structure', () => {
    // Given: Legacy config with single apiKey
    mockConfigStore.apiKey = 'lin_api_legacy_key'
    mockConfigStore.currentKey = 'lin_api_current_key'

    // When: Migration runs
    migrateConfigIfNeeded()

    // Then: Should convert to profiles structure
    const config = mockConfigStore as ConfigSchema
    expect(config.profiles).toBeDefined()
    expect(config.profiles!.default).toEqual({
      apiKey: 'lin_api_legacy_key',
    })
    expect(config.defaultProfile).toBe('default')

    // Legacy keys should be removed
    expect(config.apiKey).toBeUndefined()
    expect(config.currentKey).toBeUndefined()
  })

  it('should not migrate if profiles already exist', () => {
    // Given: Already migrated config
    mockConfigStore.profiles = {
      personal: { apiKey: 'lin_api_personal' },
    }
    mockConfigStore.defaultProfile = 'personal'

    // When: Migration runs
    migrateConfigIfNeeded()

    // Then: Should not change anything
    const config = mockConfigStore as ConfigSchema
    expect(config.profiles).toEqual({
      personal: { apiKey: 'lin_api_personal' },
    })
    expect(config.defaultProfile).toBe('personal')
  })

  it('should not migrate if no legacy apiKey exists', () => {
    // Given: Empty config
    mockConfigStore = {}

    // When: Migration runs
    migrateConfigIfNeeded()

    // Then: Should not create profiles
    const config = mockConfigStore as ConfigSchema
    expect(config.profiles).toBeUndefined()
    expect(config.defaultProfile).toBeUndefined()
  })

  it('should handle migration with only apiKey (no currentKey)', () => {
    // Given: Legacy config with only apiKey
    mockConfigStore.apiKey = 'lin_api_only_key'

    // When: Migration runs
    migrateConfigIfNeeded()

    // Then: Should still migrate successfully
    const config = mockConfigStore as ConfigSchema
    expect(config.profiles!.default).toEqual({
      apiKey: 'lin_api_only_key',
    })
    expect(config.apiKey).toBeUndefined()
  })
})
