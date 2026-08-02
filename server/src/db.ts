import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Analysis, AnalysisResult, Video, VideoDraft } from './types.js'

export interface VideoRow {
  id: string
  url: string
  title: string
  description: string
  channel_title: string
  channel_url: string
  thumbnail_url: string
  duration_seconds: number | null
  view_count: number | null
  like_count: number | null
  comment_count: number | null
  published_at: string | null
  tags: string
  created_at: string
  updated_at: string
}

export interface AnalysisRow {
  id: number
  video_id: string
  titles: string
  description: string
  tags: string
  summary: string
  provider: string
  created_at: string
}

function mapVideo(row: VideoRow): Video {
  return {
    id: row.id,
    url: row.url,
    title: row.title,
    description: row.description,
    channelTitle: row.channel_title,
    channelUrl: row.channel_url,
    thumbnailUrl: row.thumbnail_url,
    durationSeconds: row.duration_seconds,
    viewCount: row.view_count,
    likeCount: row.like_count,
    commentCount: row.comment_count,
    publishedAt: row.published_at,
    tags: safeParseJson<string[]>(row.tags, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapAnalysis(row: AnalysisRow): Analysis {
  return {
    id: row.id,
    videoId: row.video_id,
    titles: safeParseJson<string[]>(row.titles, []),
    description: row.description,
    tags: safeParseJson<string[]>(row.tags, []),
    summary: row.summary,
    provider: row.provider as Analysis['provider'],
    createdAt: row.created_at,
  }
}

function safeParseJson<T>(raw: string, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export class StudioDatabase {
  private db: DatabaseSync

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true })
    this.db = new DatabaseSync(dbPath)
    this.db.exec('PRAGMA journal_mode = WAL;')
    this.db.exec('PRAGMA foreign_keys = ON;')
    this.migrate()
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS videos (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        channel_title TEXT NOT NULL DEFAULT '',
        channel_url TEXT NOT NULL DEFAULT '',
        thumbnail_url TEXT NOT NULL DEFAULT '',
        duration_seconds INTEGER,
        view_count INTEGER,
        like_count INTEGER,
        comment_count INTEGER,
        published_at TEXT,
        tags TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS analyses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        video_id TEXT NOT NULL,
        titles TEXT NOT NULL DEFAULT '[]',
        description TEXT NOT NULL DEFAULT '',
        tags TEXT NOT NULL DEFAULT '[]',
        summary TEXT NOT NULL DEFAULT '',
        provider TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_analyses_video_id ON analyses(video_id);
    `)
  }

  close(): void {
    this.db.close()
  }

  listVideos(): Video[] {
    const rows = this.db
      .prepare('SELECT * FROM videos ORDER BY created_at DESC')
      .all() as unknown as VideoRow[]
    return rows.map(mapVideo)
  }

  getVideo(id: string): Video | null {
    const row = this.db
      .prepare('SELECT * FROM videos WHERE id = ?')
      .get(id) as unknown as VideoRow | undefined
    return row ? mapVideo(row) : null
  }

  upsertVideo(draft: VideoDraft): Video {
    const now = new Date().toISOString()
    const existing = this.getVideo(draft.id)
    const createdAt = existing?.createdAt ?? now

    this.db
      .prepare(
        `INSERT INTO videos (
          id, url, title, description, channel_title, channel_url,
          thumbnail_url, duration_seconds, view_count, like_count,
          comment_count, published_at, tags, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          url = excluded.url,
          title = excluded.title,
          description = excluded.description,
          channel_title = excluded.channel_title,
          channel_url = excluded.channel_url,
          thumbnail_url = excluded.thumbnail_url,
          duration_seconds = excluded.duration_seconds,
          view_count = excluded.view_count,
          like_count = excluded.like_count,
          comment_count = excluded.comment_count,
          published_at = excluded.published_at,
          tags = excluded.tags,
          updated_at = excluded.updated_at`,
      )
      .run(
        draft.id,
        draft.url,
        draft.title,
        draft.description,
        draft.channelTitle,
        draft.channelUrl,
        draft.thumbnailUrl,
        draft.durationSeconds,
        draft.viewCount,
        draft.likeCount,
        draft.commentCount,
        draft.publishedAt,
        JSON.stringify(draft.tags),
        createdAt,
        now,
      )

    const saved = this.getVideo(draft.id)
    if (!saved) throw new Error('Failed to save video')
    return saved
  }

  deleteVideo(id: string): boolean {
    const result = this.db.prepare('DELETE FROM videos WHERE id = ?').run(id)
    return Number(result.changes) > 0
  }

  saveAnalysis(videoId: string, result: AnalysisResult, provider: string): Analysis {
    const now = new Date().toISOString()
    const info = this.db
      .prepare(
        `INSERT INTO analyses (video_id, titles, description, tags, summary, provider, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        videoId,
        JSON.stringify(result.titles),
        result.description,
        JSON.stringify(result.tags),
        result.summary,
        provider,
        now,
      )
    const id = Number(info.lastInsertRowid)
    const row = this.db
      .prepare('SELECT * FROM analyses WHERE id = ?')
      .get(id) as unknown as AnalysisRow
    return mapAnalysis(row)
  }

  getLatestAnalysis(videoId: string): Analysis | null {
    const row = this.db
      .prepare('SELECT * FROM analyses WHERE video_id = ? ORDER BY id DESC LIMIT 1')
      .get(videoId) as unknown as AnalysisRow | undefined
    return row ? mapAnalysis(row) : null
  }

  listAnalyses(videoId: string): Analysis[] {
    const rows = this.db
      .prepare('SELECT * FROM analyses WHERE video_id = ? ORDER BY id DESC')
      .all(videoId) as unknown as AnalysisRow[]
    return rows.map(mapAnalysis)
  }
}
