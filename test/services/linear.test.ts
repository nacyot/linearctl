import { LinearClient } from '@linear/sdk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

// 테스트할 서비스
import { getApiKey, getLinearClient, setApiKey } from '../../src/services/linear.js'

vi.mock('@linear/sdk', () => ({
  LinearClient: vi.fn().mockImplementation(() => ({
    viewer: vi.fn().mockResolvedValue({ id: 'test-user-id' }),
  })),
}))

describe('Linear Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock storage 초기화
    mockConfigStore = {}
    // 환경변수 초기화
    delete process.env.LINEAR_API_KEY
    delete process.env.LINEAR_CLI_KEY
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getLinearClient', () => {
    it('should create a LinearClient with API key from environment', () => {
      process.env.LINEAR_API_KEY = 'test-api-key'

      const client = getLinearClient()

      expect(LinearClient).toHaveBeenCalledWith({ apiKey: 'test-api-key' })
      expect(client).toBeDefined()
    })

    it('should create a LinearClient with stored profile when env is not set', () => {
      setApiKey('stored-api-key', 'default')

      getLinearClient()

      expect(LinearClient).toHaveBeenCalledWith({ apiKey: 'stored-api-key' })
    })

    it('should create a LinearClient with specific profile', () => {
      setApiKey('personal-key', 'personal')
      setApiKey('company-key', 'company')

      const client = getLinearClient({ profile: 'company' })

      expect(LinearClient).toHaveBeenCalledWith({ apiKey: 'company-key' })
      expect(client).toBeDefined()
    })

    it('should throw error when no API key is available', () => {
      expect(() => getLinearClient()).toThrow(/API key/)
    })

    it('should throw error when profile does not exist', () => {
      expect(() => getLinearClient({ profile: 'nonexistent' })).toThrow(/API key/)
    })
  })

  describe('API Key Management', () => {
    it('should store and retrieve API key', () => {
      const testKey = 'test-api-key-123'
      
      setApiKey(testKey)
      const retrievedKey = getApiKey()
      
      expect(retrievedKey).toBe(testKey)
    })

    it('should prioritize environment variable over stored key', () => {
      process.env.LINEAR_API_KEY = 'env-key'
      setApiKey('stored-key')
      
      const key = getApiKey()
      
      expect(key).toBe('env-key')
    })
  })
})