import { describe, expect, it } from 'vitest'
import { StudioDatabase } from '../src/db.js'
import type { VideoDraft } from '../src/types.js'

function makeDraft(overrides: Partial<VideoDraft> = {}): VideoDraft {
  return {
    id: 'dQw4w9WgXcQ',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    title: 'Building a Web Server',
    description: 'A tutorial.',
    channelTitle: 'Code Channel',
    channelUrl: 'https://www.youtube.com/@code',
    thumbnailUrl: 'https://i.ytimg.com/vi/x/1.jpg',
    durationSeconds: 600,
    viewCount: 100,
    likeCount: 10,
    commentCount: 2,
    publishedAt: '2026-01-01T00:00:00Z',
    tags: ['rust', 'server'],
    ...overrides,
  }
}

function newDb(): StudioDatabase {
  return new StudioDatabase(':memory:')
}

describe('StudioDatabase', () => {
  it('upserts and retrieves a video', () => {
    const db = newDb()
    const saved = db.upsertVideo(makeDraft())
    expect(saved.id).toBe('dQw4w9WgXcQ')
    expect(saved.tags).toEqual(['rust', 'server'])
    expect(db.getVideo('dQw4w9WgXcQ')?.channelTitle).toBe('Code Channel')
    expect(db.listVideos()).toHaveLength(1)
    db.close()
  })

  it('refreshes metadata on re-upsert but keeps the original created_at', () => {
    const db = newDb()
    const first = db.upsertVideo(makeDraft())
    const second = db.upsertVideo(makeDraft({ title: 'Updated Title', viewCount: 999 }))
    expect(second.title).toBe('Updated Title')
    expect(second.viewCount).toBe(999)
    expect(second.createdAt).toBe(first.createdAt)
    expect(second.updatedAt >= first.updatedAt).toBe(true)
    expect(db.listVideos()).toHaveLength(1)
    db.close()
  })

  it('returns null for a missing video', () => {
    const db = newDb()
    expect(db.getVideo('nope')).toBeNull()
    db.close()
  })

  it('deletes a video and cascades its analyses', () => {
    const db = newDb()
    db.upsertVideo(makeDraft())
    db.saveAnalysis('dQw4w9WgXcQ', {
      titles: ['A title'],
      description: 'desc',
      tags: ['a'],
      summary: 'sum',
    }, 'rules')

    expect(db.deleteVideo('dQw4w9WgXcQ')).toBe(true)
    expect(db.getVideo('dQw4w9WgXcQ')).toBeNull()
    expect(db.getLatestAnalysis('dQw4w9WgXcQ')).toBeNull()
    expect(db.deleteVideo('dQw4w9WgXcQ')).toBe(false)
    db.close()
  })

  it('stores and returns the latest analysis', () => {
    const db = newDb()
    db.upsertVideo(makeDraft())
    const a1 = db.saveAnalysis('dQw4w9WgXcQ', {
      titles: ['First'],
      description: 'd1',
      tags: ['t1'],
      summary: 's1',
    }, 'rules')
    const a2 = db.saveAnalysis('dQw4w9WgXcQ', {
      titles: ['Second'],
      description: 'd2',
      tags: ['t2'],
      summary: 's2',
    }, 'llm')

    expect(db.getLatestAnalysis('dQw4w9WgXcQ')?.titles).toEqual(['Second'])
    expect(db.getLatestAnalysis('dQw4w9WgXcQ')?.provider).toBe('llm')
    expect(a1.id).not.toBe(a2.id)
    expect(db.listAnalyses('dQw4w9WgXcQ')).toHaveLength(2)
    db.close()
  })
})
