import { Router, type Response } from 'express'
import type { AuthenticatedRequest } from '../auth.js'
import type { StudioDatabase } from '../db.js'
import type { ChannelService } from '../services/channel.js'
import { isLlmConfigured, type AppConfig } from '../config.js'

export interface DashboardDeps {
  db: StudioDatabase
  channel: ChannelService
  config: AppConfig
}

export function createDashboardRouter(deps: DashboardDeps): Router {
  const router = Router()

  router.get('/', (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id
    const drafts = deps.db.listDrafts(userId)
    const queue = deps.db.listQueueItems(userId)
    const today = new Date().toISOString().slice(0, 10)
    const upcoming = deps.db
      .listCalendarItems(userId)
      .filter((item) => item.scheduledDate >= today)
      .slice(0, 5)
    const recentDrafts = drafts.slice(0, 5)
    const recentQueue = queue.slice(0, 5)
    const videos = deps.db.listVideos(userId).slice(0, 5)
    const snapshot = deps.db.getLatestAnalyticsSnapshot(userId)

    const byStatus = (status: string): number => drafts.filter((d) => d.status === status).length

    res.json({
      channel: deps.channel.getStatus(userId),
      aiProvider: isLlmConfigured(deps.config) ? 'llm' : 'rules',
      counts: {
        drafts: drafts.length,
        ideas: byStatus('idea'),
        ready: byStatus('ready'),
        scheduled: byStatus('scheduled'),
        published: byStatus('published'),
        queuePending: queue.filter((q) => q.status === 'pending').length,
        queuePublishing: queue.filter((q) => q.status === 'publishing').length,
        queuePublished: queue.filter((q) => q.status === 'published').length,
        upcoming: upcoming.length,
      },
      channelStats: snapshot?.channelStats ?? null,
      recentDrafts,
      upcoming,
      recentQueue,
      recentVideos: videos,
    })
  })

  return router
}
