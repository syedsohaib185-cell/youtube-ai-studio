import type { Analysis, HealthInfo, Video, VideoListItem } from './types'

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      // keep the generic message
    }
    throw new Error(message)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export async function fetchHealth(): Promise<HealthInfo> {
  return handle<HealthInfo>(await fetch('/api/health'))
}

export async function fetchVideos(): Promise<VideoListItem[]> {
  const body = (await handle<{ videos: VideoListItem[] }>(await fetch('/api/videos'))) as {
    videos: VideoListItem[]
  }
  return body.videos
}

export async function fetchVideo(id: string): Promise<{ video: Video; analysis: Analysis | null }> {
  return handle<{ video: Video; analysis: Analysis | null }>(
    await fetch(`/api/videos/${encodeURIComponent(id)}`),
  )
}

export async function addVideo(url: string): Promise<Video> {
  const body = (await handle<{ video: Video }>(
    await fetch('/api/videos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    }),
  )) as { video: Video }
  return body.video
}

export async function deleteVideo(id: string): Promise<void> {
  await handle<void>(await fetch(`/api/videos/${encodeURIComponent(id)}`, { method: 'DELETE' }))
}

export async function analyzeVideo(
  id: string,
): Promise<{ analysis: Analysis; warning: string | null }> {
  return handle<{ analysis: Analysis; warning: string | null }>(
    await fetch(`/api/videos/${encodeURIComponent(id)}/analyze`, { method: 'POST' }),
  )
}
