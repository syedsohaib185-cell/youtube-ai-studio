import type { ChannelStats, VideoStats } from '../types.js'

export interface GoogleCredentials {
  clientId: string
  clientSecret: string
  redirectUri: string
}

export interface TokenSet {
  accessToken: string
  refreshToken: string | null
  expiresIn: number
}

export class YouTubeOAuthError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'YouTubeOAuthError'
  }
}

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ')

async function requestJson(url: string, init: RequestInit = {}, timeoutMs = 15000): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new YouTubeOAuthError(
        `Google API request failed with status ${res.status}: ${body.slice(0, 200)}`,
        res.status,
      )
    }
    return (await res.json()) as unknown
  } catch (err) {
    if (err instanceof YouTubeOAuthError) throw err
    if (err instanceof Error && err.name === 'AbortError') {
      throw new YouTubeOAuthError('Google API request timed out', 504)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export function buildAuthUrl(creds: GoogleCredentials, state: string): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', creds.clientId)
  url.searchParams.set('redirect_uri', creds.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', SCOPES)
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('state', state)
  return url.toString()
}

export async function exchangeCode(creds: GoogleCredentials, code: string): Promise<TokenSet> {
  const form = new URLSearchParams({
    code,
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    redirect_uri: creds.redirectUri,
    grant_type: 'authorization_code',
  })

  const payload = (await requestJson('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  })) as { access_token?: string; refresh_token?: string; expires_in?: number }

  if (!payload.access_token) throw new YouTubeOAuthError('No access token in exchange response')
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? null,
    expiresIn: payload.expires_in ?? 3600,
  }
}

export async function refreshAccessToken(creds: GoogleCredentials, refreshToken: string): Promise<TokenSet> {
  const form = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    grant_type: 'refresh_token',
  })

  const payload = (await requestJson('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  })) as { access_token?: string; expires_in?: number }

  if (!payload.access_token) throw new YouTubeOAuthError('No access token in refresh response')
  return {
    accessToken: payload.access_token,
    refreshToken: null,
    expiresIn: payload.expires_in ?? 3600,
  }
}

export async function fetchMineChannel(accessToken: string): Promise<{
  id: string
  title: string
  thumbnailUrl: string | null
  channelStats: ChannelStats
}> {
  const url = new URL('https://www.googleapis.com/youtube/v3/channels')
  url.searchParams.set('part', 'snippet,statistics')
  url.searchParams.set('mine', 'true')

  const payload = (await requestJson(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })) as {
    items?: Array<{
      id?: string
      snippet?: { title?: string; thumbnails?: Record<string, { url?: string }> }
      statistics?: { viewCount?: string; subscriberCount?: string; videoCount?: string }
    }>
  }

  const item = payload.items?.[0]
  if (!item) throw new YouTubeOAuthError('No channel found for this account', 404)

  const thumbs = item.snippet?.thumbnails ?? {}
  return {
    id: item.id ?? '',
    title: item.snippet?.title ?? 'YouTube channel',
    thumbnailUrl: thumbs.default?.url ?? null,
    channelStats: {
      viewCount: Number(item.statistics?.viewCount ?? 0),
      subscriberCount: Number(item.statistics?.subscriberCount ?? 0),
      videoCount: Number(item.statistics?.videoCount ?? 0),
    },
  }
}

export async function fetchChannelStats(accessToken: string, channelId: string): Promise<ChannelStats> {
  const url = new URL('https://www.googleapis.com/youtube/v3/channels')
  url.searchParams.set('part', 'statistics')
  url.searchParams.set('id', channelId)

  const payload = (await requestJson(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })) as {
    items?: Array<{ statistics?: { viewCount?: string; subscriberCount?: string; videoCount?: string } }>
  }

  const stats = payload.items?.[0]?.statistics
  if (!stats) throw new YouTubeOAuthError('Channel statistics not found', 404)
  return {
    viewCount: Number(stats.viewCount ?? 0),
    subscriberCount: Number(stats.subscriberCount ?? 0),
    videoCount: Number(stats.videoCount ?? 0),
  }
}

export async function fetchVideoStats(
  accessToken: string,
  ids: string[],
  maxResults = 12,
): Promise<VideoStats[]> {
  if (ids.length === 0) return []
  const url = new URL('https://www.googleapis.com/youtube/v3/videos')
  url.searchParams.set('part', 'snippet,statistics')
  url.searchParams.set('id', ids.slice(0, maxResults).join(','))
  url.searchParams.set('maxResults', String(maxResults))

  const payload = (await requestJson(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })) as {
    items?: Array<{
      id?: string
      snippet?: { title?: string; publishedAt?: string }
      statistics?: { viewCount?: string; likeCount?: string; commentCount?: string }
    }>
  }

  return (payload.items ?? [])
    .filter((item) => item.id)
    .map((item) => ({
      id: item.id!,
      title: item.snippet?.title ?? 'Untitled',
      viewCount: Number(item.statistics?.viewCount ?? 0),
      likeCount: item.statistics?.likeCount ? Number(item.statistics.likeCount) : null,
      commentCount: item.statistics?.commentCount ? Number(item.statistics.commentCount) : null,
      publishedAt: item.snippet?.publishedAt ?? null,
    }))
}

export interface UploadMetadata {
  title: string
  description?: string
  tags?: string[]
  privacyStatus?: 'public' | 'unlisted' | 'private'
}

/**
 * Uploads a video file to the authenticated channel using the resumable
 * upload protocol in a single-shot (non-resumable) request.
 */
export async function uploadVideo(
  accessToken: string,
  metadata: UploadMetadata,
  file: { buffer: Buffer; mimeType: string },
): Promise<string> {
  const metadataBody = JSON.stringify({
    snippet: {
      title: metadata.title.slice(0, 100),
      description: metadata.description ?? '',
      tags: metadata.tags ?? [],
    },
    status: { privacyStatus: metadata.privacyStatus ?? 'unlisted' },
  })

  const initUrl = new URL('https://www.googleapis.com/upload/youtube/v3/videos')
  initUrl.searchParams.set('part', 'snippet,status')
  initUrl.searchParams.set('uploadType', 'resumable')

  const initRes = await fetch(initUrl.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Upload-Content-Type': file.mimeType,
      'X-Upload-Content-Length': String(file.buffer.length),
    },
    body: metadataBody,
  })

  if (!initRes.ok) {
    const body = await initRes.text().catch(() => '')
    throw new YouTubeOAuthError(
      `YouTube upload initiation failed with status ${initRes.status}: ${body.slice(0, 200)}`,
      initRes.status,
    )
  }

  const uploadUrl = initRes.headers.get('location')
  if (!uploadUrl) throw new YouTubeOAuthError('No upload location header returned')

  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.mimeType,
      'Content-Length': String(file.buffer.length),
    },
    body: file.buffer,
  })

  if (!uploadRes.ok) {
    const body = await uploadRes.text().catch(() => '')
    throw new YouTubeOAuthError(
      `YouTube upload failed with status ${uploadRes.status}: ${body.slice(0, 200)}`,
      uploadRes.status,
    )
  }

  const payload = (await uploadRes.json()) as { id?: string }
  if (!payload.id) throw new YouTubeOAuthError('Upload succeeded but no video id returned')
  return payload.id
}
