import { distance } from 'fastest-levenshtein'

interface FuzzyMatch<T> {
  item: T
  score: number
}

/**
 * Find similar items using fuzzy matching based on Levenshtein distance
 * @param query The search query
 * @param items Array of items to search
 * @param key Function to extract searchable string from item
 * @param threshold Minimum similarity threshold (0-1, higher is more strict)
 * @returns Array of matched items sorted by relevance
 */
export function findSimilar<T>(
  query: string,
  items: T[],
  key: (item: T) => string,
  threshold = 0.4,
): FuzzyMatch<T>[] {
  if (!query || items.length === 0) {
    return []
  }

  const queryLower = query.toLowerCase()

  // Calculate similarity for each item
  const scored = items
    .map((item) => {
      const itemName = key(item).toLowerCase()
      const dist = distance(queryLower, itemName)
      const maxLength = Math.max(queryLower.length, itemName.length)

      // Similarity score: 1.0 = perfect match, 0.0 = completely different
      const similarity = 1 - dist / maxLength

      return {
        item,
        score: similarity,
      }
    })
    .filter((match) => match.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)

  return scored
}

/**
 * Get a suggestion message for similar items
 * @param similar Array of similar items
 * @param getName Function to get display name from item
 * @returns Suggestion message or null
 */
export function getSuggestionMessage<T>(
  similar: FuzzyMatch<T>[],
  getName: (item: T) => string,
): null | string {
  if (similar.length === 0) {
    return null
  }

  const suggestions = similar.slice(0, 3).map((match) => `"${getName(match.item)}"`)

  if (suggestions.length === 1) {
    return `Did you mean ${suggestions[0]}?`
  }

  if (suggestions.length === 2) {
    return `Did you mean ${suggestions[0]} or ${suggestions[1]}?`
  }

  const last = suggestions.pop()
  return `Did you mean ${suggestions.join(', ')}, or ${last}?`
}
