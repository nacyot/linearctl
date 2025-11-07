/**
 * Query parser for batch operations
 * Supports basic AND-only queries with key:value syntax
 * Example: "state:Todo team:ENG assignee:John"
 */

export interface QueryFilter {
  assignee?: string
  cycle?: string
  label?: string
  priority?: number
  project?: string
  state?: string
  team?: string
}

/**
 * Parse a query string into filter conditions
 * @param query Query string in format "key:value key:value"
 * @returns Parsed filter conditions
 */
export function parseQuery(query: string): QueryFilter {
  const filter: QueryFilter = {}

  if (!query || !query.trim()) {
    return filter
  }

  // First, normalize spaces around colons
  const normalized = query.replaceAll(/\s*:\s*/g, ':')

  // Split by spaces, but preserve quoted values
  const parts = normalized.match(/(?:[^\s"]+|"[^"]*")+/g) || []

  for (const part of parts) {
    const colonIndex = part.indexOf(':')

    if (colonIndex === -1) {
      continue
    }

    const key = part.slice(0, colonIndex).trim().toLowerCase()
    let value = part.slice(colonIndex + 1).trim()

    // Remove quotes if present
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1)
    }

    // Map to filter fields
    switch (key) {
      case 'assignee': {
        filter.assignee = value
        break
      }

      case 'cycle': {
        filter.cycle = value
        break
      }

      case 'label': {
        filter.label = value
        break
      }

      case 'priority': {
        const priority = Number.parseInt(value, 10)

        if (!Number.isNaN(priority) && priority >= 0 && priority <= 4) {
          filter.priority = priority
        }

        break
      }

      case 'project': {
        filter.project = value
        break
      }

      case 'state': {
        filter.state = value
        break
      }

      case 'team': {
        filter.team = value
        break
      }

      // Skip unknown keys
      default: {
        break
      }
    }
  }

  return filter
}

/**
 * Get supported query keys
 */
export function getSupportedQueryKeys(): string[] {
  return ['state', 'team', 'assignee', 'label', 'project', 'cycle', 'priority']
}
