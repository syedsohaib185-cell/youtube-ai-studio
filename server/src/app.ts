import express, { type Express } from 'express'
import cors from 'cors'
import type { AppConfig } from './config.js'
import type { StudioDatabase } from './db.js'
import type { Analyzer } from './services/ai.js'
import type { VideoMetadataClient } from './services/youtube.js'
import { createHealthRouter, createVideosRouter } from './routes/videos.js'

export interface AppDeps {
  db: StudioDatabase
  youtube: VideoMetadataClient
  analyzer: Analyzer
  config: AppConfig
}

export function createApp(deps: AppDeps): Express {
  const app = express()

  app.use(cors())
  app.use(express.json({ limit: '1mb' }))

  app.get('/', (_req, res) => {
    res.json({ name: 'youtube-ai-studio API', health: '/api/health' })
  })

  app.use('/api/health', createHealthRouter(deps.config))
  app.use('/api/videos', createVideosRouter(deps))

  app.use((req, res) => {
    res.status(404).json({ error: `Not found: ${req.method} ${req.path}` })
  })

  return app
}
