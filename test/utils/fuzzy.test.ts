import { describe, expect, it } from 'vitest'

import { findSimilar, getSuggestionMessage } from '../../src/utils/fuzzy.js'

describe('fuzzy matching utilities', () => {
  describe('findSimilar', () => {
    it('should find similar items', () => {
      const items = [
        { name: 'Engineering' },
        { name: 'Design' },
        { name: 'Marketing' },
        { name: 'Sales' },
      ]

      const results = findSimilar('Enginering', items, (item) => item.name)

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].item.name).toBe('Engineering')
    })

    it('should return empty array for no matches', () => {
      const items = [
        { name: 'Engineering' },
        { name: 'Design' },
      ]

      const results = findSimilar('xyz123', items, (item) => item.name)

      expect(results.length).toBe(0)
    })

    it('should handle empty items array', () => {
      const results = findSimilar('test', [], (item: any) => item.name)

      expect(results.length).toBe(0)
    })

    it('should handle empty query', () => {
      const items = [{ name: 'Test' }]
      const results = findSimilar('', items, (item) => item.name)

      expect(results.length).toBe(0)
    })

    it('should sort by relevance', () => {
      const items = [
        { name: 'Design' },
        { name: 'Designer' },
        { name: 'Designing' },
      ]

      const results = findSimilar('Design', items, (item) => item.name)

      expect(results[0].item.name).toBe('Design')
    })

    it('should filter by threshold', () => {
      const items = [
        { name: 'Engineering' },
        { name: 'xyz' },
      ]

      const results = findSimilar('Enginering', items, (item) => item.name, 0.5)

      // Should only return Engineering, not xyz
      expect(results.length).toBeLessThanOrEqual(1)
      if (results.length > 0) {
        expect(results[0].item.name).toBe('Engineering')
      }
    })
  })

  describe('getSuggestionMessage', () => {
    it('should suggest single match', () => {
      const similar = [
        { item: { name: 'Engineering' }, score: 0.9 },
      ]

      const message = getSuggestionMessage(similar, (item) => item.name)

      expect(message).toBe('Did you mean "Engineering"?')
    })

    it('should suggest two matches', () => {
      const similar = [
        { item: { name: 'Engineering' }, score: 0.9 },
        { item: { name: 'Design' }, score: 0.8 },
      ]

      const message = getSuggestionMessage(similar, (item) => item.name)

      expect(message).toBe('Did you mean "Engineering" or "Design"?')
    })

    it('should suggest three matches', () => {
      const similar = [
        { item: { name: 'Engineering' }, score: 0.9 },
        { item: { name: 'Design' }, score: 0.8 },
        { item: { name: 'Marketing' }, score: 0.7 },
      ]

      const message = getSuggestionMessage(similar, (item) => item.name)

      expect(message).toBe('Did you mean "Engineering", "Design", or "Marketing"?')
    })

    it('should limit to 3 suggestions', () => {
      const similar = [
        { item: { name: 'A' }, score: 0.9 },
        { item: { name: 'B' }, score: 0.8 },
        { item: { name: 'C' }, score: 0.7 },
        { item: { name: 'D' }, score: 0.6 },
        { item: { name: 'E' }, score: 0.5 },
      ]

      const message = getSuggestionMessage(similar, (item) => item.name)

      // Should only include first 3
      expect(message).toBe('Did you mean "A", "B", or "C"?')
    })

    it('should return null for empty array', () => {
      const message = getSuggestionMessage([], (item: any) => item.name)

      expect(message).toBeNull()
    })
  })
})
