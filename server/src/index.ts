import { isLlmConfigured, loadConfig } from './config.js'
import { StudioDatabase } from './db.js'
import { createAnalyzer } from './services/ai.js'
import { createYouTubeClient } from './services/youtube.js'
import { createApp } from './app.js'

const config = loadConfig()

const db = new StudioDatabase(config.databasePath)
const youtube = createYouTubeClient(config.youtubeApiKey)
const analyzer = createAnalyzer(config)

const app = createApp({ db, youtube, analyzer, config })

const server = app.listen(config.port, () => {
  console.log(`youtube-ai-studio API listening on http://localhost:${config.port}`)
  console.log(`AI provider: ${isLlmConfigured(config) ? 'llm' : 'rules'} (rule-based fallback active)`)
  console.log(`YouTube API key: ${config.youtubeApiKey ? 'configured' : 'not set (using oEmbed)'}`)
})

function shutdown(): void {
  server.close(() => {
    db.close()
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
