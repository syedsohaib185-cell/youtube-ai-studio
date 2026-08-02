import { Router, type Response } from 'express'
import type { AuthenticatedRequest } from '../auth.js'
import type { ChannelService } from '../services/channel.js'
import { YouTubeOAuthError } from '../services/youtubeAuth.js'

export interface AnalyticsDeps {
  channel: ChannelService
}

export function createAnalyticsRouter(deps: AnalyticsDeps): Router {
  const router = Router()

  router.get('/', (req: AuthenticatedRequest, res: Response) => {
    res.json(deps.channel.getAnalytics(req.user!.id))
  })

  router.post('/refresh', async (req: AuthenticatedRequest, res: Response) => {
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

  return router
}
