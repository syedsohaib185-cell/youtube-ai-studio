import { Link } from 'react-router'
import type { VideoListItem } from '../types'

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function formatDuration(seconds: number | null): string | null {
  if (seconds === null) return null
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function VideoCard({
  video,
  onDelete,
}: {
  video: VideoListItem
  onDelete: (id: string) => void
}) {
  return (
    <article className="video-card">
      <Link to={`/videos/${video.id}`} className="video-card-media">
        {video.thumbnailUrl ? (
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            loading="lazy"
            className="video-thumb"
          />
        ) : (
          <div className="video-thumb video-thumb-empty" />
        )}
        {formatDuration(video.durationSeconds) && (
          <span className="video-duration">{formatDuration(video.durationSeconds)}</span>
        )}
      </Link>
      <div className="video-card-body">
        <h3 className="video-card-title">
          <Link to={`/videos/${video.id}`}>{video.title}</Link>
        </h3>
        <p className="video-card-channel">{video.channelTitle}</p>
        <div className="video-card-meta">
          {video.viewCount !== null && (
            <span>{formatCount(video.viewCount)} views</span>
          )}
          {video.hasAnalysis && <span className="badge badge-ok">Analyzed</span>}
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => onDelete(video.id)}
            aria-label={`Delete ${video.title}`}
          >
            Delete
          </button>
        </div>
      </div>
    </article>
  )
}
