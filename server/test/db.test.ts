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
    const user = db.createUser('a@test.com', 'Alice', 'hash')
    const saved = db.upsertVideo(makeDraft(), user.id)
    expect(saved.id).toBe('dQw4w9WgXcQ')
    expect(saved.tags).toEqual(['rust', 'server'])
    expect(db.getVideo('dQw4w9WgXcQ', user.id)?.channelTitle).toBe('Code Channel')
    expect(db.listVideos(user.id)).toHaveLength(1)
    db.close()
  })

  it('refreshes metadata on re-upsert but keeps the original created_at', () => {
    const db = newDb()
    const user = db.createUser('a@test.com', 'Alice', 'hash')
    const first = db.upsertVideo(makeDraft(), user.id)
    const second = db.upsertVideo(makeDraft({ title: 'Updated Title', viewCount: 999 }), user.id)
    expect(second.title).toBe('Updated Title')
    expect(second.viewCount).toBe(999)
    expect(second.createdAt).toBe(first.createdAt)
    expect(second.updatedAt >= first.updatedAt).toBe(true)
    expect(db.listVideos(user.id)).toHaveLength(1)
    db.close()
  })

  it('scopes videos to the owning user', () => {
    const db = newDb()
    const alice = db.createUser('a@test.com', 'Alice', 'hash')
    const bob = db.createUser('b@test.com', 'Bob', 'hash')
    db.upsertVideo(makeDraft(), alice.id)
    expect(db.listVideos(alice.id)).toHaveLength(1)
    expect(db.listVideos(bob.id)).toHaveLength(0)
    expect(db.getVideo('dQw4w9WgXcQ', bob.id)).toBeNull()
    expect(db.deleteVideo('dQw4w9WgXcQ', bob.id)).toBe(false)
    expect(db.deleteVideo('dQw4w9WgXcQ', alice.id)).toBe(true)
    db.close()
  })

  it('returns null for a missing video', () => {
    const db = newDb()
    const user = db.createUser('a@test.com', 'Alice', 'hash')
    expect(db.getVideo('nope', user.id)).toBeNull()
    db.close()
  })

  it('deletes a video and cascades its analyses', () => {
    const db = newDb()
    const user = db.createUser('a@test.com', 'Alice', 'hash')
    db.upsertVideo(makeDraft(), user.id)
    db.saveAnalysis('dQw4w9WgXcQ', {
      titles: ['A title'],
      description: 'desc',
      tags: ['a'],
      summary: 'sum',
    }, 'rules')

    expect(db.deleteVideo('dQw4w9WgXcQ', user.id)).toBe(true)
    expect(db.getVideo('dQw4w9WgXcQ', user.id)).toBeNull()
    expect(db.getLatestAnalysis('dQw4w9WgXcQ')).toBeNull()
    expect(db.deleteVideo('dQw4w9WgXcQ', user.id)).toBe(false)
    db.close()
  })

  it('stores and returns the latest analysis', () => {
    const db = newDb()
    const user = db.createUser('a@test.com', 'Alice', 'hash')
    db.upsertVideo(makeDraft(), user.id)
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

  it('supports users, drafts, calendar and queue with scoping', () => {
    const db = newDb()
    const user = db.createUser('a@test.com', 'Alice', 'hash')

    const draft = db.createDraft(user.id, { title: 'My Video Idea' })
    expect(draft.status).toBe('idea')
    const updated = db.updateDraft(draft.id, user.id, { status: 'ready', tags: ['ai'] })
    expect(updated?.status).toBe('ready')
    expect(updated?.tags).toEqual(['ai'])
    expect(db.listDrafts(user.id)).toHaveLength(1)

    const item = db.createCalendarItem(user.id, {
      scheduledDate: '2026-08-10',
      title: 'Post video',
      draftId: draft.id,
    })
    expect(db.listCalendarItems(user.id, '2026-08')).toHaveLength(1)
    void item
    expect(db.listCalendarItems(user.id, '2026-09')).toHaveLength(0)

    const queueItem = db.createQueueItem(user.id, { title: 'Publish', draftId: draft.id })
    const published = db.updateQueueItem(queueItem.id, user.id, { status: 'published', youtubeVideoId: 'abc' })
    expect(published?.youtubeVideoId).toBe('abc')

    expect(db.getUserByEmail('A@test.com')?.name).toBe('Alice')
    expect(db.deleteDraft(draft.id, user.id)).toBe(true)
    db.close()
  })
})
