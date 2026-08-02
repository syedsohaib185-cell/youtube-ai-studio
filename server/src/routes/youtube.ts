import { Router, type NextFunction, type Request, type Response } from 'express'
import multer from 'multer'
import type { AppConfig } from '../config.js'
import type { StudioDatabase } from '../db.js'
import type { AuthenticatedRequest } from '../auth.js'
import type { ChannelService } from '../services/channel.js'
import { uploadVideo, YouTubeOAuthError } from '../services/youtubeAuth.js'

export interface YouTubeDeps {
  db: StudioDatabase
  channel: ChannelService
  config: AppConfig
}

function redirectUrl(config: AppConfig, params: Record<string, string>): string {
  const base = config.frontendUrl ?? 'http://localhost:5173'
  const url = new URL(base)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return url.toString()
}

export function createYouTubeRouter(
  deps: YouTubeDeps,
  requireAuth: (req: AuthenticatedRequest, res: Response, next: NextFunction) => void,
): Router {
  const router = Router()
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 512 * 1024 * 1024 },
  })

  router.get('/callback', async (req: Request, res: Response) => {
    const code = typeof req.query.code === 'string' ? req.query.code : null
    const state = typeof req.query.state === 'string' ? req.query.state : null
    const error = typeof req.query.error === 'string' ? req.query.error : null

    if (error) {
      res.redirect(redirectUrl(deps.config, { youtube: 'error', message: error }))
      return
    }
    if (!code || !state) {
      res.redirect(redirectUrl(deps.config, { youtube: 'error', message: 'Missing code or state' }))
      return
    }

    try {
      await deps.channel.handleCallback(code, state)
      res.redirect(redirectUrl(deps.config, { youtube: 'success' }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'OAuth callback failed'
      res.redirect(redirectUrl(deps.config, { youtube: 'error', message }))
    }
  })

  router.use(requireAuth)

  router.get('/auth-url', (req: AuthenticatedRequest, res: Response) => {
    const url = deps.channel.getAuthUrl(req.user!.id)
    if (!url) {
      res.status(400).json({
        error:
          'YouTube OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI in the server environment.',
      })
      return
    }
    res.json({ url })
  })

  router.get('/status', (req: AuthenticatedRequest, res: Response) => {
    res.json(deps.channel.getStatus(req.user!.id))
  })

  router.post('/disconnect', async (req: AuthenticatedRequest, res: Response) => {
    await deps.channel.disconnect(req.user!.id)
    res.status(204).end()
  })

  router.post('/refresh-stats', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const stats = await deps.channel.refreshStats(req.user!.id)
      res.json(stats)
    } catch (err) {
      if (err instanceof YouTubeOAuthError) {
        res.status(err.status ?? 500).json({ error: err.message })
        return
      }
      res.status(500).json({ error: 'Failed to refresh analytics' })
    }
  })

  router.post('/upload', upload.single('file'), async (req: AuthenticatedRequest, res: Response) => {
    const accessToken = await deps.channel.getValidAccessToken(req.user!.id).catch(() => null)
    if (!accessToken) {
      res.status(400).json({ error: 'No connected YouTube channel with upload access' })
      return
    }

    const file = (req as AuthenticatedRequest & { file?: { buffer: Buffer; mimetype: string } }).file

    if (!file) {
      res.status(400).json({ error: 'No video file provided (multipart field "file")' })
      return
    }

    try {
      const uploadedId = await uploadVideo(accessToken, {
        title: String(req.body.title ?? 'Untitled').slice(0, 100),
        description: String(req.body.description ?? ''),
        tags: Array.isArray(req.body.tags) ? req.body.tags.map(String) : [],
        privacyStatus: req.body.privacyStatus ?? 'unlisted',
      }, {
        buffer: file.buffer,
        mimeType: file.mimetype || 'video/mp4',
      })
      res.json({ videoId: uploadedId, url: `https://www.youtube.com/watch?v=${uploadedId}` })
    } catch (err) {
      if (err instanceof YouTubeOAuthError) {
        res.status(err.status ?? 500).json({ error: err.message })
        return
      }
      res.status(500).json({ error: 'Upload failed' })
    }
  })

  return router
}
