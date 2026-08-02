import { Router } from 'express'
import { z } from 'zod'
import type { StudioGenerators } from '../services/generators.js'

const generateSchema = z.object({
  topic: z.string().min(1, 'Topic is required').max(500),
  audience: z.string().max(200).optional(),
  title: z.string().max(200).optional(),
  style: z.string().max(200).optional(),
  length: z.enum(['short', 'medium', 'long']).optional(),
  count: z.number().int().min(3).max(10).optional(),
})

export interface GeneratorDeps {
  generators: StudioGenerators
}

function bodyParser(req: { body: unknown }): z.infer<typeof generateSchema> {
  const parsed = generateSchema.safeParse(req.body)
  if (!parsed.success) {
    const err = new Error(parsed.error.issues[0]?.message ?? 'Invalid request') as Error & {
      status?: number
    }
    err.status = 400
    throw err
  }
  return parsed.data
}

export function createGeneratorsRouter(deps: GeneratorDeps): Router {
  const router = Router()

  router.post('/ideas', async (req, res, next) => {
    try {
      const input = bodyParser(req)
      res.json(await deps.generators.generateIdeas(input))
    } catch (err) {
      next(err)
    }
  })

  router.post('/script', async (req, res, next) => {
    try {
      const input = bodyParser(req)
      res.json(await deps.generators.generateScript(input))
    } catch (err) {
      next(err)
    }
  })

  router.post('/titles', async (req, res, next) => {
    try {
      const input = bodyParser(req)
      res.json(await deps.generators.generateTitles(input))
    } catch (err) {
      next(err)
    }
  })

  router.post('/description', async (req, res, next) => {
    try {
      const input = bodyParser(req)
      res.json(await deps.generators.generateDescription(input))
    } catch (err) {
      next(err)
    }
  })

  router.post('/tags', async (req, res, next) => {
    try {
      const input = bodyParser(req)
      res.json(await deps.generators.generateTags(input))
    } catch (err) {
      next(err)
    }
  })

  router.post('/thumbnail', async (req, res, next) => {
    try {
      const input = bodyParser(req)
      res.json(await deps.generators.generateThumbnail(input))
    } catch (err) {
      next(err)
    }
  })

  return router
}
