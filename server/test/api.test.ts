import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Express } from 'express'
import request from 'supertest'
import { buildTestApp } from './helpers.js'

describe('Studio API (videos, generators, drafts, calendar, queue, dashboard)', () => {
  let app: Express
  let db: { close: () => void }
  let token: string

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` })

  beforeAll(async () => {
    const built = buildTestApp()
    app = built.app
    db = built.db

    const register = await request(app).post('/api/auth/register').send({
      email: 'creator@example.com',
      name: 'Creator',
      password: 'password123',
    })
    token = register.body.token as string
  })

  afterAll(() => {
    db.close()
  })

  it('reports health', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.aiProvider).toBe('rules')
  })

  it('requires auth for protected endpoints', async () => {
    const res = await request(app).get('/api/drafts')
    expect(res.status).toBe(401)
  })

  describe('videos', () => {
    it('adds a video from a URL', async () => {
      const res = await request(app)
        .post('/api/videos')
        .set(auth(token))
        .send({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })
      expect(res.status).toBe(201)
      expect(res.body.video.id).toBe('dQw4w9WgXcQ')
    })

    it('rejects an invalid URL', async () => {
      const res = await request(app).post('/api/videos').set(auth(token)).send({ url: 'https://example.com' })
      expect(res.status).toBe(400)
    })

    it('returns 404 for an unknown video id', async () => {
      const res = await request(app)
        .post('/api/videos')
        .set(auth(token))
        .send({ url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa' })
      expect(res.status).toBe(404)
    })

    it('lists, details, analyzes and deletes videos', async () => {
      const list = await request(app).get('/api/videos').set(auth(token))
      expect(list.status).toBe(200)
      expect(list.body.videos).toHaveLength(1)

      const detail = await request(app).get('/api/videos/dQw4w9WgXcQ').set(auth(token))
      expect(detail.body.video.title).toBe('Building a Web Server with Rust')

      const analysis = await request(app).post('/api/videos/dQw4w9WgXcQ/analyze').set(auth(token))
      expect(analysis.status).toBe(200)
      expect(analysis.body.analysis.provider).toBe('rules')
      expect(analysis.body.analysis.titles.length).toBeGreaterThan(0)

      const del = await request(app).delete('/api/videos/dQw4w9WgXcQ').set(auth(token))
      expect(del.status).toBe(204)
    })
  })

  describe('generators', () => {
    it('generates ideas', async () => {
      const res = await request(app)
        .post('/api/generate/ideas')
        .set(auth(token))
        .send({ topic: 'sustainable gardening', audience: 'beginners', count: 5 })
      expect(res.status).toBe(200)
      expect(res.body.provider).toBe('rules')
      expect(res.body.result.ideas.length).toBe(5)
      expect(res.body.result.ideas[0].title).toBeTruthy()
    })

    it('generates a script', async () => {
      const res = await request(app)
        .post('/api/generate/script')
        .set(auth(token))
        .send({ title: 'How to Compost', topic: 'composting', length: 'short' })
      expect(res.status).toBe(200)
      expect(res.body.result.outline.length).toBeGreaterThan(0)
      expect(res.body.result.script).toContain('Introduction')
    })

    it('generates titles, description, tags and thumbnail prompt', async () => {
      const titles = await request(app)
        .post('/api/generate/titles')
        .set(auth(token))
        .send({ topic: 'indoor plants' })
      expect(titles.body.result.titles.length).toBe(5)

      const description = await request(app)
        .post('/api/generate/description')
        .set(auth(token))
        .send({ title: 'Indoor Plants 101', topic: 'indoor plants' })
      expect(description.body.result.description).toContain('#')

      const tags = await request(app)
        .post('/api/generate/tags')
        .set(auth(token))
        .send({ title: 'Indoor Plants 101', topic: 'indoor plants' })
      expect(tags.body.result.tags.length).toBeGreaterThan(0)

      const thumb = await request(app)
        .post('/api/generate/thumbnail')
        .set(auth(token))
        .send({ title: 'Indoor Plants 101', topic: 'indoor plants', style: 'vibrant' })
      expect(thumb.body.result.prompt).toContain('thumbnail')
    })

    it('validates generator input', async () => {
      const res = await request(app).post('/api/generate/ideas').set(auth(token)).send({ topic: '' })
      expect(res.status).toBe(400)
    })
  })

  describe('drafts', () => {
    let draftId: number

    it('creates, lists and updates drafts', async () => {
      const created = await request(app)
        .post('/api/drafts')
        .set(auth(token))
        .send({ title: 'Sustainable Gardening Guide', idea: 'Grow food at home' })
      expect(created.status).toBe(201)
      draftId = created.body.draft.id as number

      const updated = await request(app)
        .put(`/api/drafts/${draftId}`)
        .set(auth(token))
        .send({ status: 'ready', script: 'Intro...' })
      expect(updated.body.draft.status).toBe('ready')
      expect(updated.body.draft.script).toBe('Intro...')

      const list = await request(app).get('/api/drafts').set(auth(token))
      expect(list.body.drafts).toHaveLength(1)
    })

    it('scopes drafts to the user and 404s for missing ones', async () => {
      const missing = await request(app).get('/api/drafts/9999').set(auth(token))
      expect(missing.status).toBe(404)
    })

    it('deletes a draft', async () => {
      const del = await request(app).delete(`/api/drafts/${draftId}`).set(auth(token))
      expect(del.status).toBe(204)
    })
  })

  describe('calendar', () => {
    it('creates and lists items for a month', async () => {
      const created = await request(app)
        .post('/api/calendar')
        .set(auth(token))
        .send({ scheduledDate: '2026-08-15', title: 'Publish gardening video', notes: 'Upload before noon' })
      expect(created.status).toBe(201)

      const list = await request(app).get('/api/calendar?month=2026-08').set(auth(token))
      expect(list.body.items).toHaveLength(1)
      expect(list.body.items[0].status).toBe('planned')

      const otherMonth = await request(app).get('/api/calendar?month=2026-09').set(auth(token))
      expect(otherMonth.body.items).toHaveLength(0)

      const del = await request(app).delete(`/api/calendar/${created.body.item.id}`).set(auth(token))
      expect(del.status).toBe(204)
    })

    it('validates the date format', async () => {
      const res = await request(app)
        .post('/api/calendar')
        .set(auth(token))
        .send({ scheduledDate: '15/08/2026', title: 'Bad date' })
      expect(res.status).toBe(400)
    })
  })

  describe('queue', () => {
    it('creates, publishes and deletes queue items', async () => {
      const created = await request(app)
        .post('/api/queue')
        .set(auth(token))
        .send({ title: 'Gardening video', scheduledAt: '2026-08-16T10:00:00.000Z' })
      expect(created.status).toBe(201)
      const id = created.body.item.id as number

      const published = await request(app)
        .post(`/api/queue/${id}/publish`)
        .set(auth(token))
        .send({ youtubeUrl: 'https://www.youtube.com/watch?v=abcdefghijk' })
      expect(published.status).toBe(200)
      expect(published.body.item.status).toBe('published')
      expect(published.body.item.youtubeVideoId).toBe('abcdefghijk')

      const list = await request(app).get('/api/queue').set(auth(token))
      expect(list.body.items).toHaveLength(1)

      const del = await request(app).delete(`/api/queue/${id}`).set(auth(token))
      expect(del.status).toBe(204)
    })

    it('marks an item failed when publishing without a url', async () => {
      const created = await request(app)
        .post('/api/queue')
        .set(auth(token))
        .send({ title: 'Unpublishable' })
      const id = created.body.item.id as number
      const failed = await request(app).post(`/api/queue/${id}/publish`).set(auth(token)).send({})
      expect(failed.body.item.status).toBe('failed')
    })
  })

  describe('dashboard, analytics and settings', () => {
    it('returns aggregated dashboard data', async () => {
      const res = await request(app).get('/api/dashboard').set(auth(token))
      expect(res.status).toBe(200)
      expect(res.body.counts).toBeDefined()
      expect(res.body.channel.connected).toBe(false)
      expect(res.body.aiProvider).toBe('rules')
    })

    it('returns analytics with content counts', async () => {
      const res = await request(app).get('/api/analytics').set(auth(token))
      expect(res.status).toBe(200)
      expect(res.body.content).toBeDefined()
    })

    it('returns settings with provider status', async () => {
      const res = await request(app).get('/api/settings').set(auth(token))
      expect(res.status).toBe(200)
      expect(res.body.ai.configured).toBe(false)
      expect(res.body.youtube.oauthConfigured).toBe(false)
    })
  })

  describe('youtube connection', () => {
    it('rejects auth-url generation when OAuth is not configured', async () => {
      const res = await request(app).get('/api/youtube/auth-url').set(auth(token))
      expect(res.status).toBe(400)
    })

    it('reports not-connected status', async () => {
      const res = await request(app).get('/api/youtube/status').set(auth(token))
      expect(res.status).toBe(200)
      expect(res.body.connected).toBe(false)
    })
  })
})
