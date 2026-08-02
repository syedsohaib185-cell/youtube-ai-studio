import jwt from 'jsonwebtoken'
import type { AppConfig } from '../config.js'
import type { StudioDatabase } from '../db.js'
import type { ChannelConnection, ChannelStats, VideoStats } from '../types.js'
import {
  buildAuthUrl,
  exchangeCode,
  fetchChannelStats,
  fetchMineChannel,
  fetchVideoStats,
  refreshAccessToken,
  YouTubeOAuthError,
} from './youtubeAuth.js'

export interface ChannelPublicInfo {
  connected: boolean
  configured: boolean
  channel: {
    id: string
    title: string
    thumbnailUrl: string | null
  } | null
  scopes: string[]
}

interface OAuthStatePayload {
  uid: number
}

export class ChannelService {
  constructor(
    private db: StudioDatabase,
    private config: AppConfig,
  ) {}

  isConfigured(): boolean {
    return this.config.google !== null
  }

  getAuthUrl(userId: number): string | null {
    if (!this.config.google) return null
    const state = jwt.sign({ uid: userId } satisfies OAuthStatePayload, this.config.auth.jwtSecret, {
      expiresIn: 600,
    })
    return buildAuthUrl(this.config.google, state)
  }

  /**
   * Exchanges an OAuth code for tokens, verifies the signed state payload, and
   * stores the connection. Returns the created connection and its owner id.
   */
  async handleCallback(
    code: string,
    state: string,
  ): Promise<{ connection: ChannelConnection; userId: number }> {
    if (!this.config.google) {
      throw new YouTubeOAuthError('YouTube OAuth is not configured on this server')
    }

    let payload: OAuthStatePayload
    try {
      const decoded = jwt.verify(state, this.config.auth.jwtSecret)
      payload =
        typeof decoded === 'string'
          ? (JSON.parse(decoded) as OAuthStatePayload)
          : (decoded as OAuthStatePayload)
    } catch {
      throw new YouTubeOAuthError('Invalid OAuth state', 400)
    }

    const userId = payload.uid
    const tokens = await exchangeCode(this.config.google, code)
    const mine = await fetchMineChannel(tokens.accessToken)
    const expiresAt = Date.now() + tokens.expiresIn * 1000

    const connection = await this.db.saveChannelConnection({
      userId,
      youtubeChannelId: mine.id,
      title: mine.title,
      thumbnailUrl: mine.thumbnailUrl,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? '',
      tokenExpiresAt: expiresAt,
    })
    return { connection, userId }
  }

  async disconnect(userId: number): Promise<boolean> {
    return this.db.deleteChannelConnection(userId)
  }

  getStatus(userId: number): ChannelPublicInfo {
    const connection = this.db.getChannelConnection(userId)
    return {
      connected: connection !== null,
      configured: this.isConfigured(),
      channel: connection
        ? {
            id: connection.youtubeChannelId,
            title: connection.title,
            thumbnailUrl: connection.thumbnailUrl,
          }
        : null,
      scopes: ['youtube.readonly', 'youtube.upload'],
    }
  }

  async getValidAccessToken(userId: number): Promise<string> {
    const connection = this.db.getChannelConnection(userId)
    if (!connection) throw new YouTubeOAuthError('No connected YouTube channel', 400)

    if (connection.tokenExpiresAt > Date.now() + 60_000) {
      return connection.accessToken
    }

    if (!connection.refreshToken) {
      throw new YouTubeOAuthError('No refresh token available; reconnect the channel', 400)
    }
    if (!this.config.google) {
      throw new YouTubeOAuthError('YouTube OAuth is not configured on this server')
    }

    const refreshed = await refreshAccessToken(this.config.google, connection.refreshToken)
    const updated = this.db.saveChannelConnection({
      userId,
      youtubeChannelId: connection.youtubeChannelId,
      title: connection.title,
      thumbnailUrl: connection.thumbnailUrl,
      accessToken: refreshed.accessToken,
      refreshToken: connection.refreshToken,
      tokenExpiresAt: Date.now() + refreshed.expiresIn * 1000,
    })
    return updated.accessToken
  }

  async refreshStats(userId: number): Promise<{ channel: ChannelStats | null; videos: VideoStats[] }> {
    const connection = this.db.getChannelConnection(userId)
    let channel: ChannelStats | null = null
    let videos: VideoStats[] = []

    if (connection) {
      const accessToken = await this.getValidAccessToken(userId)
      try {
        channel = await fetchChannelStats(accessToken, connection.youtubeChannelId)
      } catch (err) {
        if (!(err instanceof YouTubeOAuthError)) throw err
      }
      try {
        const storedIds = this.db
          .listVideos(userId)
          .map((v) => v.id)
          .filter(Boolean)
        videos = await fetchVideoStats(accessToken, storedIds)
      } catch {
        videos = []
      }
    } else {
      videos = this.db
        .listVideos(userId)
        .map((v) => ({
          id: v.id,
          title: v.title,
          viewCount: v.viewCount ?? 0,
          likeCount: v.likeCount,
          commentCount: v.commentCount,
          publishedAt: v.publishedAt,
        }))
    }

    this.db.saveAnalyticsSnapshot(userId, channel, videos)
    return { channel, videos }
  }

  getAnalytics(userId: number): {
    snapshot: { channel: ChannelStats | null; videos: VideoStats[]; capturedAt: string } | null
    content: {
      drafts: number
      ready: number
      published: number
      scheduled: number
      pending: number
    }
  } {
    const snapshot = this.db.getLatestAnalyticsSnapshot(userId)
    const drafts = this.db.listDrafts(userId)
    const queue = this.db.listQueueItems(userId)

    return {
      snapshot: snapshot
        ? {
            channel: snapshot.channelStats,
            videos: snapshot.videoStats,
            capturedAt: snapshot.capturedAt,
          }
        : null,
      content: {
        drafts: drafts.length,
        ready: drafts.filter((d) => d.status === 'ready').length,
        published: drafts.filter((d) => d.status === 'published').length,
        scheduled: queue.filter((q) => q.status === 'pending').length,
        pending: queue.filter((q) => q.status === 'publishing').length,
      },
    }
  }
}
