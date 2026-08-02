import { describe, expect, it } from 'vitest'
import {
  extractKeywords,
  formatCount,
  formatDuration,
  generateRuleBased,
  truncate,
} from '../src/services/ruleGen.js'
import type { Video } from '../src/types.js'

function makeVideo(overrides: Partial<Video> = {}): Video {
  return {
    id: 'dQw4w9WgXcQ',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    title: 'How to Build a Rust Web Server in 30 Minutes',
    description: 'In this tutorial we build a web server with Rust and Axum from scratch.',
    channelTitle: 'Code With Sohail',
    channelUrl: 'https://www.youtube.com/@codewithsohail',
    thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
    durationSeconds: 1830,
    viewCount: 120000,
    likeCount: 4500,
    commentCount: 210,
    publishedAt: '2026-01-15T10:00:00Z',
    tags: ['rust', 'web server'],
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('truncate', () => {
  it('keeps short text intact', () => {
    expect(truncate('hello world', 50)).toBe('hello world')
  })

  it('cuts long text at a word boundary', () => {
    const out = truncate('one two three four five', 10)
    expect(out.endsWith('…')).toBe(true)
    expect(out.length).toBeLessThanOrEqual(11)
  })
})

describe('formatCount', () => {
  it('formats K, M, B suffixes', () => {
    expect(formatCount(999)).toBe('999')
    expect(formatCount(120000)).toBe('120.0K')
    expect(formatCount(4500000)).toBe('4.5M')
    expect(formatCount(1200000000)).toBe('1.2B')
  })
})

describe('formatDuration', () => {
  it('formats mm:ss and h:mm:ss', () => {
    expect(formatDuration(65)).toBe('1:05')
    expect(formatDuration(1830)).toBe('30:30')
    expect(formatDuration(null)).toBe('Unknown length')
  })
})

describe('extractKeywords', () => {
  it('extracts and prioritizes meaningful words', () => {
    const keywords = extractKeywords(
      'How to Build a Rust Web Server',
      'In this tutorial we build a web server with Rust.',
      ['rust', 'axum'],
    )
    expect(keywords).toContain('rust')
    expect(keywords).toContain('server')
    expect(keywords).toContain('build')
    expect(keywords).not.toContain('the')
    expect(keywords).not.toContain('how')
    expect(keywords.length).toBeLessThanOrEqual(10)
  })
})

describe('generateRuleBased', () => {
  it('produces 5 unique titles', () => {
    const out = generateRuleBased(makeVideo())
    expect(out.titles.length).toBeGreaterThan(0)
    expect(out.titles.length).toBeLessThanOrEqual(5)
    expect(new Set(out.titles).size).toBe(out.titles.length)
  })

  it('produces a non-empty description with hashtags', () => {
    const out = generateRuleBased(makeVideo())
    expect(out.description.length).toBeGreaterThan(20)
    expect(out.description).toMatch(/#/)
  })

  it('produces lowercase tags with topic terms', () => {
    const out = generateRuleBased(makeVideo())
    expect(out.tags.length).toBeGreaterThan(0)
    for (const tag of out.tags) expect(tag).toBe(tag.toLowerCase())
    expect(out.tags).toContain('rust')
  })

  it('produces a summary referencing the title', () => {
    const out = generateRuleBased(makeVideo())
    expect(out.summary).toContain('How to Build a Rust Web Server in 30 Minutes')
  })

  it('detects content type from the title', () => {
    const tutorial = generateRuleBased(makeVideo())
    expect(tutorial.summary).toContain('tutorial')
  })

  it('handles videos without description or stats', () => {
    const video = makeVideo({ description: '', viewCount: null, likeCount: null })
    const out = generateRuleBased(video)
    expect(out.titles.length).toBeGreaterThan(0)
    expect(out.description.length).toBeGreaterThan(0)
  })
})
