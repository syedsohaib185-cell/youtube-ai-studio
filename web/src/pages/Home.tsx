import { useEffect, useState } from 'react'
import type { VideoListItem } from '../types'
import AddVideoForm from '../components/AddVideoForm'
import VideoCard from '../components/VideoCard'
import { addVideo, deleteVideo, fetchVideos } from '../api'

export default function Home() {
  const [videos, setVideos] = useState<VideoListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = async () => {
    try {
      setVideos(await fetchVideos())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load videos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const handleAdd = async (url: string) => {
    await addVideo(url)
    await refresh()
  }

  const handleDelete = async (id: string) => {
    await deleteVideo(id)
    setVideos((prev) => prev.filter((v) => v.id !== id))
  }

  if (loading) {
    return <p className="muted">Loading videos…</p>
  }

  return (
    <div className="home">
      <section className="hero">
        <h1>Turn any video into ready-to-publish content</h1>
        <p className="hero-sub">
          Paste a YouTube link and instantly generate optimized titles, descriptions, tags and
          summaries using AI.
        </p>
        <AddVideoForm onAdd={handleAdd} />
        {error && <p className="form-error">{error}</p>}
      </section>

      <section>
        <h2 className="section-title">{videos.length > 0 ? 'Your videos' : 'No videos yet'}</h2>
        {videos.length === 0 ? (
          <p className="muted">Add a video above to get started.</p>
        ) : (
          <div className="video-grid">
            {videos.map((video) => (
              <VideoCard key={video.id} video={video} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
