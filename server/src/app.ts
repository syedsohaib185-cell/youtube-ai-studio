import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import cors from 'cors'
import type { AppConfig } from './config.js'
import type { StudioDatabase } from './db.js'
import { createAuthMiddleware, type AuthenticatedRequest } from './auth.js'
import type { Analyzer } from './services/ai.js'
import type { VideoMetadataClient } from './services/youtube.js'
import type { StudioGenerators } from './services/generators.js'
import type { ChannelService } from './services/channel.js'
import { createHealthRouter, createVideosRouter } from './routes/videos.js'
import { createAuthRouter } from './routes/auth.js'
import { createYouTubeRouter } from './routes/youtube.js'
import { createGeneratorsRouter } from './routes/generators.js'
import { createDraftsRouter } from './routes/drafts.js'
import { createCalendarRouter } from './routes/calendar.js'
import { createQueueRouter } from './routes/queue.js'
import { createAnalyticsRouter } from './routes/analytics.js'
import { createDashboardRouter } from './routes/dashboard.js'
import { createSettingsRouter } from './routes/settings.js'

export interface AppDeps {
  db: StudioDatabase
  youtube: VideoMetadataClient
  analyzer: Analyzer
  generators: StudioGenerators
  channel: ChannelService
  config: AppConfig
}

export function createApp(deps: AppDeps): Express {
  const app = express()

  app.use(cors())
  app.use(express.json({ limit: '1mb' }))

  const requireAuth = createAuthMiddleware(
    (id) => deps.db.getUserById(id),
    deps.config.auth.jwtSecret,
  )

  app.get('/', (_req, res) => {
    res.json({ name: 'youtube-ai-studio API', health: '/api/health' })
  })

  app.use('/api/health', createHealthRouter(deps.config))
  app.use('/api/auth', createAuthRouter({ db: deps.db, config: deps.config }, requireAuth))
  app.use(
    '/api/youtube',
    createYouTubeRouter({ db: deps.db, channel: deps.channel, config: deps.config }, requireAuth),
  )

  app.use('/api', requireAuth, (_req: Request, _res: Response, next: NextFunction) => {
    next()
  })

  app.use('/api/videos', createVideosRouter(deps))
  app.use('/api/generate', createGeneratorsRouter({ generators: deps.generators }))
  app.use('/api/drafts', createDraftsRouter({ db: deps.db }))
  app.use('/api/calendar', createCalendarRouter({ db: deps.db }))
  app.use('/api/queue', createQueueRouter({ db: deps.db }))
  app.use('/api/analytics', createAnalyticsRouter({ channel: deps.channel }))
  app.use('/api/dashboard', createDashboardRouter(deps))
  app.use('/api/settings', createSettingsRouter({ channel: deps.channel, config: deps.config }))

  app.use((req, res) => {
    res.status(404).json({ error: `Not found: ${req.method} ${req.path}` })
  })

  app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status && err.status < 500 ? err.status : 500
    const message = status < 500 ? err.message : 'Internal server error'
    res.status(status).json({ error: message })
  })

  return app
}

export type { AuthenticatedRequest }
