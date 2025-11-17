import { LinearClient } from '@linear/sdk'
import Conf from 'conf'
import * as os from 'node:os'
import path from 'node:path'

import type { ConfigSchema } from '../types/commands.js'

// Config store for API keys and other settings
const config = new Conf<ConfigSchema>({
  configName: 'config',
  cwd: path.join(os.homedir(), '.linearctl'),
  projectName: 'linearctl',
})

// Singleton client instance
let linearClient: LinearClient | null = null

/**
 * Migrate legacy single-key config to profiles structure
 */
export function migrateConfigIfNeeded(): void {
  const legacyKey = config.get('apiKey')
  const profiles = config.get('profiles')

  // Only migrate if legacy key exists and profiles don't
  if (legacyKey && !profiles) {
    config.set('profiles', {
      default: { apiKey: legacyKey },
    })
    config.set('defaultProfile', 'default')
    config.delete('apiKey')
    config.delete('currentKey')
  }
}

/**
 * Get or create a Linear API client
 */
export function getLinearClient(options?: { profile?: string }): LinearClient {
  // Run migration on first access
  migrateConfigIfNeeded()

  const apiKey = getApiKey(options?.profile)

  if (!apiKey) {
    const profileMsg = options?.profile ? ` for profile "${options.profile}"` : ''
    throw new Error(`No API key found${profileMsg}. Run "lc init" to set up your Linear API key.`)
  }

  // Return existing client if API key hasn't changed
  const currentKey = config.get('currentKey') as string | undefined
  if (linearClient && currentKey === apiKey) {
    return linearClient
  }

  // Create new client
  linearClient = new LinearClient({ apiKey })
  config.set('currentKey', apiKey)

  return linearClient
}

/**
 * Get API key from environment, profile, or default
 * Priority: --profile flag > LINEAR_API_KEY env > LINEAR_PROFILE env > default profile
 */
export function getApiKey(profileName?: string): string | undefined {
  // 1. Run migration to ensure profiles exist
  migrateConfigIfNeeded()

  // 2. If explicit profile is requested, use it (highest priority)
  if (profileName) {
    const profiles = config.get('profiles')
    if (profiles && profiles[profileName]) {
      return profiles[profileName].apiKey
    }

    // Profile doesn't exist
    return undefined
  }

  // 3. Check environment variable for direct API key (overrides default profile)
  const envKey = process.env.LINEAR_API_KEY || process.env.LINEAR_CLI_KEY
  if (envKey) {
    return envKey
  }

  // 4. Use LINEAR_PROFILE env to select profile
  const profile = process.env.LINEAR_PROFILE || config.get('defaultProfile') || 'default'

  // 5. Get API key from selected profile
  const profiles = config.get('profiles')
  if (!profiles || !profiles[profile]) {
    return undefined
  }

  return profiles[profile].apiKey
}

/**
 * Store API key for a profile
 */
export function setApiKey(apiKey: string, profileName = 'default'): void {
  migrateConfigIfNeeded()

  const profiles = config.get('profiles') || {}
  profiles[profileName] = { apiKey }
  config.set('profiles', profiles)

  // Set as default profile if it's the first one
  if (!config.get('defaultProfile')) {
    config.set('defaultProfile', profileName)
  }
}

/**
 * Clear a profile or all profiles
 */
export function clearApiKey(profileName?: string): void {
  if (profileName) {
    // Clear specific profile
    const profiles = config.get('profiles')
    if (profiles && profiles[profileName]) {
      delete profiles[profileName]
      config.set('profiles', profiles)

      // Clear default if it was this profile
      if (config.get('defaultProfile') === profileName) {
        config.delete('defaultProfile')
      }
    }
  } else {
    // Clear all (legacy behavior)
    config.delete('profiles')
    config.delete('defaultProfile')
    config.delete('apiKey')
    config.delete('currentKey')
  }

  linearClient = null
}

/**
 * Check if API key is configured
 */
export function hasApiKey(profileName?: string): boolean {
  return Boolean(getApiKey(profileName))
}

/**
 * Get all configured profiles
 */
export function getProfiles(): Record<string, { apiKey: string; name?: string }> {
  migrateConfigIfNeeded()
  return config.get('profiles') || {}
}

/**
 * Get default profile name
 */
export function getDefaultProfile(): string | undefined {
  migrateConfigIfNeeded()
  return config.get('defaultProfile')
}

/**
 * Set default profile
 */
export function setDefaultProfile(profileName: string): void {
  const profiles = getProfiles()
  if (!profiles[profileName]) {
    throw new Error(`Profile "${profileName}" does not exist`)
  }

  config.set('defaultProfile', profileName)
}

/**
 * Test the API connection
 */
export async function testConnection(profileName?: string): Promise<boolean> {
  try {
    const client = getLinearClient({ profile: profileName })
    const viewer = await client.viewer
    return Boolean(viewer.id)
  } catch {
    return false
  }
}