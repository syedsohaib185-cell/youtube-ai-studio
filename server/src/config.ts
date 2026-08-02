import 'dotenv/config'

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

export interface AppConfig {
  port: number
  databasePath: string
  youtubeApiKey: string | null
  llm: {
    apiKey: string | null
    baseUrl: string | null
    model: string
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: intFromEnv('PORT', 3001),
    databasePath: env.DB_PATH ?? 'data/studio.db',
    youtubeApiKey: env.YOUTUBE_API_KEY?.trim() || null,
    llm: {
      apiKey: env.USER_LLM_API_KEY?.trim() || null,
      baseUrl: env.USER_LLM_BASE_URL?.trim() || null,
      model: env.USER_LLM_MODEL?.trim() || 'deepseek-chat',
    },
  }
}

export function isLlmConfigured(config: AppConfig): boolean {
  return Boolean(config.llm.apiKey && config.llm.baseUrl)
}
