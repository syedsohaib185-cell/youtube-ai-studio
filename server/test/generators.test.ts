import { describe, expect, it } from 'vitest'
import { createRuleEngine } from '../src/services/rules.js'

const engine = createRuleEngine()

describe('RuleEngine ideas', () => {
  it('respects the requested count within bounds', () => {
    expect(engine.ideas({ topic: 'coffee', count: 3 }).ideas).toHaveLength(3)
    expect(engine.ideas({ topic: 'coffee', count: 10 }).ideas).toHaveLength(10)
    expect(engine.ideas({ topic: 'coffee', count: 999 }).ideas.length).toBeLessThanOrEqual(10)
  })

  it('includes the topic in the first idea', () => {
    const out = engine.ideas({ topic: 'sourdough baking' })
    expect(out.ideas[0].title).toContain('sourdough baking')
  })

  it('threads the audience through the ideas', () => {
    const out = engine.ideas({ topic: 'astrophotography', audience: 'hobbyists' })
    expect(out.ideas[0].audience).toBe('hobbyists')
  })
})

describe('RuleEngine script', () => {
  it('builds an outline with intro and conclusion', () => {
    const out = engine.script({ title: 'Composting 101', topic: 'composting', length: 'long' })
    expect(out.outline[0].heading.toLowerCase()).toContain('introduction')
    expect(out.outline.at(-1)?.heading.toLowerCase()).toContain('conclusion')
    expect(out.outline.length).toBeGreaterThanOrEqual(5)
    expect(out.script).toContain('Introduction')
  })
})

describe('RuleEngine titles', () => {
  it('returns exactly 5 distinct titles', () => {
    const out = engine.titles({ topic: 'guitar practice' })
    expect(out.titles).toHaveLength(5)
    expect(new Set(out.titles).size).toBe(5)
  })
})

describe('RuleEngine description', () => {
  it('contains a learning list and hashtags', () => {
    const out = engine.description({ title: 'Guitar Practice Routine', topic: 'guitar practice' })
    expect(out.description).toContain('What you will learn')
    expect(out.description).toMatch(/#/)
  })
})

describe('RuleEngine tags', () => {
  it('returns lowercase, de-duplicated tags', () => {
    const out = engine.tags({ title: 'Guitar Practice', topic: 'guitar practice' })
    expect(out.tags.length).toBeGreaterThan(0)
    expect(out.tags.length).toBeLessThanOrEqual(12)
    for (const tag of out.tags) expect(tag).toBe(tag.toLowerCase())
  })
})

describe('RuleEngine thumbnail', () => {
  it('produces a detailed text-to-image prompt', () => {
    const out = engine.thumbnail({ title: 'Night Sky Photography', topic: 'astrophotography', style: 'dramatic' })
    expect(out.prompt).toContain('thumbnail prompt')
    expect(out.prompt).toContain('dramatic')
    expect(out.prompt).toContain('1280x720')
  })
})
