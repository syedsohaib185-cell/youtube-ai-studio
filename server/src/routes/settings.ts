import { Router, type Response } from 'express'
import type { AuthenticatedRequest } from '../auth.js'
import type { ChannelService } from '../services/channel.js'
import { isLlmConfigured, type AppConfig } from '../config.js'

export interface SettingsDeps {
  channel: ChannelService
  config: AppConfig
}

export function createSettingsRouter(deps: SettingsDeps): Router {
  const router = Router()

  router.get('/', (req: AuthenticatedRequest, res: Response) => {
    res.json({
      ai: {
        provider: isLlmConfigured(deps.config) ? 'llm' : 'rules',
        configured: isLlmConfigured(deps.config),
        model: deps.config.llm.model,
        baseUrl: deps.config.llm.baseUrl,
      },
      youtube: {
        dataApiKeyConfigured: Boolean(deps.config.youtubeApiKey),
        oauthConfigured: deps.channel.isConfigured(),
        redirectUri: deps.config.google?.redirectUri ?? null,
      },
      channel: deps.channel.getStatus(req.user!.id),
      frontendUrl: deps.config.frontendUrl,
    })
  })

  return router
}
