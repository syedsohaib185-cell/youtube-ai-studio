import type { Express } from 'express'
import { createApp } from '../src/app.js'
import type { AppConfig } from '../src/config.js'
import { StudioDatabase } from '../src/db.js'
import { createAnalyzer } from '../src/services/ai.js'
import { createStudioGenerators } from '../src/services/generators.js'
import { ChannelService } from '../src/services/channel.js'
import { YouTubeFetchError, type VideoMetadataClient } from '../src/services/youtube.js'
import type { VideoDraft } from '../src/types.js'

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    databasePath: ':memory:',
    frontendUrl: 'http://localhost:5173',
    youtubeApiKey: null,
    llm: { apiKey: null, baseUrl: null, model: 'test-model' },
    auth: { jwtSecret: 'test-secret', tokenTtlSeconds: 3600 },
    google: null,
    ...overrides,
  }
}

export const sampleDraft: VideoDraft = {
  id: 'dQw4w9WgXcQ',
  url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  title: 'Building a Web Server with Rust',
  description: 'A step by step tutorial.',
  channelTitle: 'Code Channel',
  channelUrl: 'https://www.youtube.com/@code',
  thumbnailUrl: 'https://i.ytimg.com/vi/x/1.jpg',
  durationSeconds: 600,
  viewCount: 100,
  likeCount: 10,
  commentCount: 2,
  publishedAt: '2026-01-01T00:00:00Z',
  tags: ['rust'],
}

export function buildTestApp(overrides: {
  config?: AppConfig
  youtube?: VideoMetadataClient
} = {}): { app: Express; db: StudioDatabase; config: AppConfig } {
  const config = overrides.config ?? testConfig()
  const db = new StudioDatabase(config.databasePath)
  const youtube =
    overrides.youtube ??
    ({
      fetch: async (id: string): Promise<VideoDraft> => {
        if (id === 'aaaaaaaaaaa') throw new YouTubeFetchError('Video not found', 404)
        return { ...sampleDraft, id }
      },
    } as VideoMetadataClient)

  const analyzer = createAnalyzer(config)
  const generators = createStudioGenerators(config)
  const channel = new ChannelService(db, config)
  const app = createApp({ db, youtube, analyzer, generators, channel, config })
  return { app, db, config }
}
