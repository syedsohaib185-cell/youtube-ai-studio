import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { analyzeVideo, deleteVideo, fetchVideo } from '../api'
import type { Analysis, Video } from '../types'
import AnalysisPanel from '../components/AnalysisPanel'

function formatDate(iso: string | null): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

export default function VideoDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [video, setVideo] = useState<Video | null>(null)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchVideo(id)
      setVideo(data.video)
      setAnalysis(data.analysis)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load video')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [id])

  const generate = async () => {
    setGenerating(true)
    setWarning(null)
    setError(null)
    try {
      const data = await analyzeVideo(id)
      setAnalysis(data.analysis)
      if (data.warning) setWarning(data.warning)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setGenerating(false)
    }
  }

  const remove = async () => {
    await deleteVideo(id)
    navigate('/')
  }

  if (loading) {
    return <p className="muted">Loading…</p>
  }

  if (error && !video) {
    return (
      <div className="detail">
        <p className="form-error">{error}</p>
        <Link to="/" className="btn btn-ghost">
          Back to videos
        </Link>
      </div>
    )
  }

  if (!video) {
    return (
      <div className="detail">
        <p className="muted">Video not found.</p>
        <Link to="/" className="btn btn-ghost">
          Back to videos
        </Link>
      </div>
    )
  }

  return (
    <div className="detail">
      <Link to="/" className="back-link">
        ← Back to videos
      </Link>

      <div className="detail-head">
        <div className="detail-media">
          {video.thumbnailUrl && (
            <img src={video.thumbnailUrl} alt={video.title} className="detail-thumb" />
          )}
        </div>
        <div className="detail-info">
          <h1>{video.title}</h1>
          <p className="detail-channel">
            {video.channelUrl ? (
              <a href={video.channelUrl} target="_blank" rel="noreferrer">
                {video.channelTitle}
              </a>
            ) : (
              video.channelTitle
            )}
          </p>
          <p className="detail-meta">
            {video.viewCount !== null && <span>{video.viewCount.toLocaleString()} views</span>}
            {video.likeCount !== null && <span>{video.likeCount.toLocaleString()} likes</span>}
            {formatDate(video.publishedAt) && <span>{formatDate(video.publishedAt)}</span>}
            <a href={video.url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
              Watch on YouTube
            </a>
          </p>
          {video.description && <p className="detail-desc">{video.description.slice(0, 300)}</p>}
        </div>
      </div>

      <div className="detail-actions">
        <button className="btn btn-primary" onClick={() => void generate()} disabled={generating}>
          {generating ? 'Generating…' : analysis ? 'Regenerate analysis' : 'Generate AI analysis'}
        </button>
        <button className="btn btn-danger" onClick={() => void remove()}>
          Delete video
        </button>
      </div>

      {warning && <p className="form-warn">{warning}</p>}
      {error && <p className="form-error">{error}</p>}

      {analysis ? (
        <AnalysisPanel analysis={analysis} />
      ) : (
        <p className="muted">
          No analysis yet. Click “Generate AI analysis” to create titles, description, tags and a
          summary.
        </p>
      )}
    </div>
  )
}
