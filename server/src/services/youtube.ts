import type { VideoDraft } from '../types.js'

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be',
])

/**
 * Extract a YouTube video id from a variety of URL formats.
 * Supported: watch?v=, youtu.be/, /shorts/, /embed/, /live/, /v/
 */
export function extractVideoId(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  const match = trimmed.match(/^[\w-]{11}$/)
  if (match) return match[0]

  let url: URL
  try {
    url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }

  if (!YOUTUBE_HOSTS.has(url.hostname)) return null

  if (url.hostname === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0]
    return id && /^[\w-]{11}$/.test(id) ? id : null
  }

  const v = url.searchParams.get('v')
  if (v && /^[\w-]{11}$/.test(v)) return v

  const segments = url.pathname.split('/').filter(Boolean)
  if (segments.length >= 2 && ['shorts', 'embed', 'live', 'v'].includes(segments[0])) {
    const id = segments[1]
    return /^[\w-]{11}$/.test(id) ? id : null
  }

  return null
}

export class YouTubeFetchError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'YouTubeFetchError'
    this.status = status
  }
}

interface OEmbedResponse {
  title?: string
  author_name?: string
  author_url?: string
  thumbnail_url?: string
  html?: string
}

interface YoutubeApiVideo {
  id?: string
  snippet?: {
    title?: string
    description?: string
    channelTitle?: string
    channelId?: string
    publishedAt?: string
    thumbnails?: Record<string, { url?: string }>
    tags?: string[]
    categoryId?: string
  }
  statistics?: {
    viewCount?: string
    likeCount?: string
    commentCount?: string
  }
  contentDetails?: {
    duration?: string
  }
}

function parseIsoDuration(duration: string | undefined): number | null {
  if (!duration) return null
  const match = duration.match(/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
  if (!match) return null
  const [, days, hours, minutes, seconds] = match
  return (
    (Number(days ?? 0) * 86400) +
    (Number(hours ?? 0) * 3600) +
    (Number(minutes ?? 0) * 60) +
    Number(seconds ?? 0)
  )
}

async function fetchJson(url: string, timeoutMs = 10000): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) {
      throw new YouTubeFetchError(`YouTube request failed with status ${res.status}`, res.status)
    }
    return (await res.json()) as unknown
  } catch (err) {
    if (err instanceof YouTubeFetchError) throw err
    if (err instanceof Error && err.name === 'AbortError') {
      throw new YouTubeFetchError('YouTube request timed out', 504)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

async function fetchViaApi(id: string, apiKey: string): Promise<VideoDraft | null> {
  const url = new URL('https://www.googleapis.com/youtube/v3/videos')
  url.searchParams.set('part', 'snippet,statistics,contentDetails')
  url.searchParams.set('id', id)
  url.searchParams.set('key', apiKey)

  const payload = (await fetchJson(url.toString())) as { items?: YoutubeApiVideo[] }
  const item = payload.items?.[0]
  if (!item) return null

  const snippet = item.snippet ?? {}
  const stats = item.statistics ?? {}
  const thumbs = snippet.thumbnails ?? {}
  const bestThumb =
    thumbs.maxres?.url ?? thumbs.high?.url ?? thumbs.medium?.url ?? thumbs.default?.url ?? ''

  return {
    id: item.id ?? id,
    url: `https://www.youtube.com/watch?v=${item.id ?? id}`,
    title: snippet.title ?? 'Untitled video',
    description: snippet.description ?? '',
    channelTitle: snippet.channelTitle ?? '',
    channelUrl: snippet.channelId
      ? `https://www.youtube.com/channel/${snippet.channelId}`
      : '',
    thumbnailUrl: bestThumb,
    durationSeconds: parseIsoDuration(item.contentDetails?.duration),
    viewCount: stats.viewCount ? Number(stats.viewCount) : null,
    likeCount: stats.likeCount ? Number(stats.likeCount) : null,
    commentCount: stats.commentCount ? Number(stats.commentCount) : null,
    publishedAt: snippet.publishedAt ?? null,
    tags: snippet.tags ?? [],
  }
}

async function fetchViaOEmbed(id: string): Promise<VideoDraft> {
  const url = new URL('https://www.youtube.com/oembed')
  url.searchParams.set('url', `https://www.youtube.com/watch?v=${id}`)
  url.searchParams.set('format', 'json')

  const payload = (await fetchJson(url.toString())) as OEmbedResponse

  return {
    id,
    url: `https://www.youtube.com/watch?v=${id}`,
    title: payload.title ?? 'Untitled video',
    description: '',
    channelTitle: payload.author_name ?? '',
    channelUrl: payload.author_url ?? '',
    thumbnailUrl: payload.thumbnail_url ?? '',
    durationSeconds: null,
    viewCount: null,
    likeCount: null,
    commentCount: null,
    publishedAt: null,
    tags: [],
  }
}

export interface VideoMetadataClient {
  fetch(id: string): Promise<VideoDraft>
}

/**
 * Fetches metadata for a video. Uses the YouTube Data API when an API key is
 * configured, otherwise falls back to the key-less oEmbed endpoint.
 */
export function createYouTubeClient(apiKey: string | null): VideoMetadataClient {
  return {
    async fetch(id: string): Promise<VideoDraft> {
      if (apiKey) {
        try {
          const draft = await fetchViaApi(id, apiKey)
          if (draft) return draft
        } catch (err) {
          if (err instanceof YouTubeFetchError && err.status === 404) {
            throw new YouTubeFetchError('Video not found', 404)
          }
          throw err
        }
      }
      return fetchViaOEmbed(id)
    },
  }
}
