import { Router, type Response } from 'express'
import { z } from 'zod'
import type { StudioDatabase } from '../db.js'
import type { AuthenticatedRequest } from '../auth.js'

const DRAFT_STATUSES = ['idea', 'drafting', 'ready', 'scheduled', 'published'] as const

const draftSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  idea: z.string().max(5000).optional(),
  script: z.string().max(100000).optional(),
  description: z.string().max(10000).optional(),
  tags: z.array(z.string().max(60)).max(20).optional(),
  thumbnailPrompt: z.string().max(10000).optional(),
  status: z.enum(DRAFT_STATUSES).optional(),
  videoId: z.string().max(30).nullable().optional(),
})

const updateSchema = draftSchema.partial()

export interface DraftDeps {
  db: StudioDatabase
}

export function createDraftsRouter(deps: DraftDeps): Router {
  const router = Router()

  router.get('/', (req: AuthenticatedRequest, res: Response) => {
    res.json({ drafts: deps.db.listDrafts(req.user!.id) })
  })

  router.post('/', (req: AuthenticatedRequest, res: Response) => {
    const parsed = draftSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' })
      return
    }
    const draft = deps.db.createDraft(req.user!.id, parsed.data)
    res.status(201).json({ draft })
  })

  router.get('/:id', (req: AuthenticatedRequest, res: Response) => {
    const draft = deps.db.getDraft(Number(req.params.id), req.user!.id)
    if (!draft) {
      res.status(404).json({ error: 'Draft not found' })
      return
    }
    res.json({ draft })
  })

  router.put('/:id', (req: AuthenticatedRequest, res: Response) => {
    const parsed = updateSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' })
      return
    }
    const draft = deps.db.updateDraft(Number(req.params.id), req.user!.id, parsed.data)
    if (!draft) {
      res.status(404).json({ error: 'Draft not found' })
      return
    }
    res.json({ draft })
  })

  router.delete('/:id', (req: AuthenticatedRequest, res: Response) => {
    const deleted = deps.db.deleteDraft(Number(req.params.id), req.user!.id)
    if (!deleted) {
      res.status(404).json({ error: 'Draft not found' })
      return
    }
    res.status(204).end()
  })

  return router
}
