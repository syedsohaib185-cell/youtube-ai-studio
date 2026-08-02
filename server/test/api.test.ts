import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import type { Express } from 'express'
import request from 'supertest'
import { createApp } from '../src/app.js'
import type { AppConfig } from '../src/config.js'
import { StudioDatabase } from '../src/db.js'
import { createAnalyzer, type Analyzer } from '../src/services/ai.js'
import { YouTubeFetchError, type VideoMetadataClient } from '../src/services/youtube.js'
import type { VideoDraft } from '../src/types.js'

const config: AppConfig = {
  port: 0,
  databasePath: ':memory:',
  youtubeApiKey: null,
  llm: { apiKey: null, baseUrl: null, model: 'test-model' },
}

const sampleDraft: VideoDraft = {
  id: 'dQw4w9WgXcQ',
  url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  title: 'Building a Web Server with Rust',
  description: 'A step by step tutorial.',
  channelTitle: 'Code Channel',
  channelUrl: 'https://www.youtube.com/@code',
  thumbnailUrl: 'https://i.ytimg.com/vi/x/1.jpg',
  durationSeconds: 600,
  viewCount: 100,
  likeCount: 10,
  commentCount: 2,
  publishedAt: '2026-01-01T00:00:00Z',
  tags: ['rust'],
}

describe('API', () => {
  let db: StudioDatabase
  let app: Express
  let youtube: VideoMetadataClient
  let analyzer: Analyzer

  beforeAll(() => {
    db = new StudioDatabase(':memory:')
    youtube = {
      fetch: vi.fn(async (id: string): Promise<VideoDraft> => {
        if (id === 'aaaaaaaaaaa') throw new YouTubeFetchError('Video not found', 404)
        return { ...sampleDraft, id }
      }),
    }
    analyzer = createAnalyzer(config)
    app = createApp({ db, youtube, analyzer, config })
  })

  afterAll(() => {
    db.close()
  })

  it('reports health with provider info', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.aiProvider).toBe('rules')
    expect(res.body.youtubeApiConfigured).toBe(false)
  })

  it('adds a video from a URL', async () => {
    const res = await request(app)
      .post('/api/videos')
      .send({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })
    expect(res.status).toBe(201)
    expect(res.body.video.id).toBe('dQw4w9WgXcQ')
    expect(res.body.video.title).toBe('Building a Web Server with Rust')
  })

  it('rejects an invalid URL', async () => {
    const res = await request(app).post('/api/videos').send({ url: 'https://example.com' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/video id/i)
  })

  it('rejects an empty body', async () => {
    const res = await request(app).post('/api/videos').send({})
    expect(res.status).toBe(400)
  })

  it('returns 404 when the video is unknown to YouTube', async () => {
    const res = await request(app)
      .post('/api/videos')
      .send({ url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa' })
    expect(res.status).toBe(404)
  })

  it('lists videos with an analysis flag', async () => {
    const res = await request(app).get('/api/videos')
    expect(res.status).toBe(200)
    expect(res.body.videos).toHaveLength(1)
    expect(res.body.videos[0].hasAnalysis).toBe(false)
  })

  it('gets a single video (404 when absent)', async () => {
    const ok = await request(app).get('/api/videos/dQw4w9WgXcQ')
    expect(ok.status).toBe(200)
    expect(ok.body.video.id).toBe('dQw4w9WgXcQ')

    const missing = await request(app).get('/api/videos/abcdefghijk')
    expect(missing.status).toBe(404)
  })

  it('generates and stores an analysis', async () => {
    const res = await request(app).post('/api/videos/dQw4w9WgXcQ/analyze')
    expect(res.status).toBe(200)
    expect(res.body.analysis.provider).toBe('rules')
    expect(res.body.analysis.titles.length).toBeGreaterThan(0)
    expect(res.body.analysis.summary.length).toBeGreaterThan(0)
    expect(res.body.warning).toBeNull()

    const detail = await request(app).get('/api/videos/dQw4w9WgXcQ')
    expect(detail.body.analysis.id).toBe(res.body.analysis.id)

    const flagged = await request(app).get('/api/videos')
    expect(flagged.body.videos[0].hasAnalysis).toBe(true)
  })

  it('deletes a video', async () => {
    const res = await request(app).delete('/api/videos/dQw4w9WgXcQ')
    expect(res.status).toBe(204)
    const missing = await request(app).delete('/api/videos/dQw4w9WgXcQ')
    expect(missing.status).toBe(404)
  })

  it('returns 404 for analysis of an unknown video', async () => {
    const res = await request(app).get('/api/videos/abcdefghijk/analysis')
    expect(res.status).toBe(404)
  })
})
