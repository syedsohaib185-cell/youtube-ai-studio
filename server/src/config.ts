import 'dotenv/config'
import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

function loadJwtSecret(databasePath: string): string {
  const configured = process.env.AUTH_SECRET?.trim()
  if (configured) return configured

  const secretFile = join(dirname(databasePath), 'auth.secret')
  try {
    const existing = readFileSync(secretFile, 'utf8').trim()
    if (existing) return existing
  } catch {
    // fall through and generate
  }
  const generated = randomBytes(32).toString('hex')
  mkdirSync(dirname(secretFile), { recursive: true })
  writeFileSync(secretFile, generated, { mode: 0o600 })
  return generated
}

export interface AppConfig {
  port: number
  databasePath: string
  frontendUrl: string | null
  youtubeApiKey: string | null
  llm: {
    apiKey: string | null
    baseUrl: string | null
    model: string
  }
  auth: {
    jwtSecret: string
    tokenTtlSeconds: number
  }
  google: {
    clientId: string
    clientSecret: string
    redirectUri: string
  } | null
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const databasePath = env.DB_PATH ?? 'data/studio.db'
  const hasGoogleCredentials = Boolean(
    env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim(),
  )

  return {
    port: intFromEnv('PORT', 3001),
    databasePath,
    frontendUrl: env.FRONTEND_URL?.trim() || null,
    youtubeApiKey: env.YOUTUBE_API_KEY?.trim() || null,
    llm: {
      apiKey: env.USER_LLM_API_KEY?.trim() || null,
      baseUrl: env.USER_LLM_BASE_URL?.trim() || null,
      model: env.USER_LLM_MODEL?.trim() || 'deepseek-chat',
    },
    auth: {
      jwtSecret: loadJwtSecret(databasePath),
      tokenTtlSeconds: intFromEnv('AUTH_TOKEN_TTL', 60 * 60 * 24 * 7),
    },
    google: hasGoogleCredentials
      ? {
          clientId: env.GOOGLE_CLIENT_ID!.trim(),
          clientSecret: env.GOOGLE_CLIENT_SECRET!.trim(),
          redirectUri: env.GOOGLE_REDIRECT_URI?.trim() || 'http://localhost:3001/api/youtube/callback',
        }
      : null,
  }
}

export function isLlmConfigured(config: AppConfig): boolean {
  return Boolean(config.llm.apiKey && config.llm.baseUrl)
}
