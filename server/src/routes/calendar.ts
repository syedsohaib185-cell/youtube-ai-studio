import { Router, type Response } from 'express'
import { z } from 'zod'
import type { StudioDatabase } from '../db.js'
import type { AuthenticatedRequest } from '../auth.js'

const CALENDAR_STATUSES = ['planned', 'drafted', 'published'] as const

const itemSchema = z.object({
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  title: z.string().min(1, 'Title is required').max(200),
  draftId: z.number().int().nullable().optional(),
  status: z.enum(CALENDAR_STATUSES).optional(),
  notes: z.string().max(2000).optional(),
})

const updateSchema = itemSchema.partial()

export interface CalendarDeps {
  db: StudioDatabase
}

export function createCalendarRouter(deps: CalendarDeps): Router {
  const router = Router()

  router.get('/', (req: AuthenticatedRequest, res: Response) => {
    const month = typeof req.query.month === 'string' ? req.query.month : undefined
    res.json({ items: deps.db.listCalendarItems(req.user!.id, month) })
  })

  router.post('/', (req: AuthenticatedRequest, res: Response) => {
    const parsed = itemSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' })
      return
    }
    const item = deps.db.createCalendarItem(req.user!.id, parsed.data)
    res.status(201).json({ item })
  })

  router.put('/:id', (req: AuthenticatedRequest, res: Response) => {
    const parsed = updateSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' })
      return
    }
    const item = deps.db.updateCalendarItem(Number(req.params.id), req.user!.id, parsed.data)
    if (!item) {
      res.status(404).json({ error: 'Calendar item not found' })
      return
    }
    res.json({ item })
  })

  router.delete('/:id', (req: AuthenticatedRequest, res: Response) => {
    const deleted = deps.db.deleteCalendarItem(Number(req.params.id), req.user!.id)
    if (!deleted) {
      res.status(404).json({ error: 'Calendar item not found' })
      return
    }
    res.status(204).end()
  })

  return router
}
