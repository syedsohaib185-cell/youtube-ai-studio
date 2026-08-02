import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import type { AppConfig } from '../config.js'
import { isLlmConfigured } from '../config.js'
import type { StudioDatabase } from '../db.js'
import type { AuthenticatedRequest } from '../auth.js'
import type { Analyzer } from '../services/ai.js'
import { extractVideoId, YouTubeFetchError, type VideoMetadataClient } from '../services/youtube.js'

export interface VideoDeps {
  db: StudioDatabase
  youtube: VideoMetadataClient
  analyzer: Analyzer
  config: AppConfig
}

const addVideoSchema = z.object({
  url: z.string().min(1, 'A YouTube URL is required').max(2048),
})

export function createVideosRouter(deps: VideoDeps): Router {
  const router = Router()

  router.get('/', (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id
    const videos = deps.db.listVideos(userId).map((video) => ({
      ...video,
      hasAnalysis: deps.db.getLatestAnalysis(video.id) !== null,
    }))
    res.json({ videos })
  })

  router.post('/', async (req: AuthenticatedRequest, res: Response) => {
    const parsed = addVideoSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' })
      return
    }

    const videoId = extractVideoId(parsed.data.url)
    if (!videoId) {
      res.status(400).json({ error: 'Could not extract a valid YouTube video id from that URL' })
      return
    }

    try {
      const draft = await deps.youtube.fetch(videoId)
      const video = deps.db.upsertVideo(draft, req.user!.id)
      res.status(201).json({ video })
    } catch (err) {
      if (err instanceof YouTubeFetchError) {
        res.status(err.status === 404 ? 404 : 502).json({ error: err.message })
        return
      }
      res.status(502).json({ error: 'Failed to fetch video metadata' })
    }
  })

  router.get('/:id', (req: AuthenticatedRequest, res: Response) => {
    const video = deps.db.getVideo(req.params.id, req.user!.id)
    if (!video) {
      res.status(404).json({ error: 'Video not found' })
      return
    }
    const analysis = deps.db.getLatestAnalysis(video.id)
    res.json({ video, analysis })
  })

  router.delete('/:id', (req: AuthenticatedRequest, res: Response) => {
    const deleted = deps.db.deleteVideo(req.params.id, req.user!.id)
    if (!deleted) {
      res.status(404).json({ error: 'Video not found' })
      return
    }
    res.status(204).end()
  })

  router.post('/:id/analyze', async (req: AuthenticatedRequest, res: Response) => {
    const video = deps.db.getVideo(req.params.id, req.user!.id)
    if (!video) {
      res.status(404).json({ error: 'Video not found' })
      return
    }

    try {
      const { result, provider, warning } = await deps.analyzer.analyze(video)
      const analysis = deps.db.saveAnalysis(video.id, result, provider)
      res.json({ analysis, warning })
    } catch (_err) {
      res.status(500).json({ error: 'Analysis generation failed' })
    }
  })

  router.get('/:id/analysis', (req: AuthenticatedRequest, res: Response) => {
    const analysis = deps.db.getLatestAnalysis(req.params.id)
    if (!analysis) {
      res.status(404).json({ error: 'No analysis found for this video' })
      return
    }
    res.json({ analysis })
  })

  return router
}

export function createHealthRouter(config: AppConfig): Router {
  const router = Router()

  router.get('/', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      aiProvider: isLlmConfigured(config) ? 'llm' : 'rules',
      youtubeApiConfigured: Boolean(config.youtubeApiKey),
      authEnabled: true,
      uptimeSeconds: Math.round(process.uptime()),
    })
  })

  return router
}
