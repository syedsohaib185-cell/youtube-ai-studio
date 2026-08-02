import { describe, expect, it } from 'vitest'
import { extractVideoId } from '../src/services/youtube.js'

describe('extractVideoId', () => {
  it('accepts a bare 11-char id', () => {
    expect(extractVideoId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('parses a standard watch URL', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('parses youtu.be short links', () => {
    expect(extractVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('parses shorts, embed, live and /v/ URLs', () => {
    expect(extractVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(extractVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(extractVideoId('https://www.youtube.com/live/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(extractVideoId('https://www.youtube.com/v/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('ignores extra query parameters', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&ab_channel=X')).toBe(
      'dQw4w9WgXcQ',
    )
  })

  it('accepts URLs without a scheme', () => {
    expect(extractVideoId('youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('rejects invalid input', () => {
    expect(extractVideoId('')).toBeNull()
    expect(extractVideoId('not a url')).toBeNull()
    expect(extractVideoId('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull()
    expect(extractVideoId('https://www.youtube.com/watch?v=tooshort')).toBeNull()
  })
})
