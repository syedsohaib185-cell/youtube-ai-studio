import { Router, type Response } from 'express'
import { z } from 'zod'
import type { StudioDatabase } from '../db.js'
import type { AuthenticatedRequest } from '../auth.js'

const QUEUE_STATUSES = ['pending', 'publishing', 'published', 'failed'] as const

const itemSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  draftId: z.number().int().nullable().optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  status: z.enum(QUEUE_STATUSES).optional(),
})

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  draftId: z.number().int().nullable().optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  status: z.enum(QUEUE_STATUSES).optional(),
  youtubeVideoId: z.string().max(30).nullable().optional(),
  youtubeUrl: z.string().max(300).nullable().optional(),
  error: z.string().max(1000).nullable().optional(),
})

const publishSchema = z.object({
  youtubeUrl: z.string().url('A valid YouTube URL is required').optional(),
  status: z.enum(['published', 'failed']).optional(),
  error: z.string().max(1000).optional(),
})

export interface QueueDeps {
  db: StudioDatabase
}

export function createQueueRouter(deps: QueueDeps): Router {
  const router = Router()

  router.get('/', (req: AuthenticatedRequest, res: Response) => {
    res.json({ items: deps.db.listQueueItems(req.user!.id) })
  })

  router.post('/', (req: AuthenticatedRequest, res: Response) => {
    const parsed = itemSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' })
      return
    }
    const item = deps.db.createQueueItem(req.user!.id, parsed.data)
    res.status(201).json({ item })
  })

  router.put('/:id', (req: AuthenticatedRequest, res: Response) => {
    const parsed = updateSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' })
      return
    }
    const item = deps.db.updateQueueItem(Number(req.params.id), req.user!.id, parsed.data)
    if (!item) {
      res.status(404).json({ error: 'Queue item not found' })
      return
    }
    res.json({ item })
  })

  router.post('/:id/publish', (req: AuthenticatedRequest, res: Response) => {
    const parsed = publishSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' })
      return
    }
    const existing = deps.db.getQueueItem(Number(req.params.id), req.user!.id)
    if (!existing) {
      res.status(404).json({ error: 'Queue item not found' })
      return
    }

    let youtubeVideoId: string | null = existing.youtubeVideoId
    let youtubeUrl: string | null = existing.youtubeUrl
    if (parsed.data.youtubeUrl) {
      const match = parsed.data.youtubeUrl.match(/(?:v=|youtu\.be\/|\/shorts\/|\/embed\/)([\w-]{11})/)
      youtubeVideoId = match ? match[1] : null
      youtubeUrl = parsed.data.youtubeUrl
    }

    const item = deps.db.updateQueueItem(existing.id, req.user!.id, {
      youtubeVideoId,
      youtubeUrl,
      status: parsed.data.status ?? (youtubeVideoId ? 'published' : 'failed'),
      error: parsed.data.status === 'failed' ? (parsed.data.error ?? null) : null,
    })
    res.json({ item })
  })

  router.delete('/:id', (req: AuthenticatedRequest, res: Response) => {
    const deleted = deps.db.deleteQueueItem(Number(req.params.id), req.user!.id)
    if (!deleted) {
      res.status(404).json({ error: 'Queue item not found' })
      return
    }
    res.status(204).end()
  })

  return router
}
