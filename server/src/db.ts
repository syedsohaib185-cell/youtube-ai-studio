import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  type Analysis,
  type AnalysisResult,
  type AnalyticsSnapshot,
  type CalendarItem,
  type ChannelConnection,
  type ChannelStats,
  type Draft,
  type QueueItem,
  type User,
  type Video,
  type VideoDraft,
  type VideoStats,
} from './types.js'

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

  close(): void {
    this.db.close()
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS videos (
        id TEXT PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
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

      CREATE TABLE IF NOT EXISTS channel_connections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        youtube_channel_id TEXT NOT NULL,
        title TEXT NOT NULL,
        thumbnail_url TEXT,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        token_expires_at INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS drafts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        idea TEXT NOT NULL DEFAULT '',
        script TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        tags TEXT NOT NULL DEFAULT '[]',
        thumbnail_prompt TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'idea',
        video_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS calendar_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        scheduled_date TEXT NOT NULL,
        title TEXT NOT NULL,
        draft_id INTEGER REFERENCES drafts(id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'planned',
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS queue_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        draft_id INTEGER REFERENCES drafts(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        scheduled_at TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        youtube_video_id TEXT,
        youtube_url TEXT,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS analytics_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        channel_stats TEXT NOT NULL DEFAULT '{}',
        video_stats TEXT NOT NULL DEFAULT '[]',
        captured_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_analyses_video_id ON analyses(video_id);
      CREATE INDEX IF NOT EXISTS idx_drafts_user_id ON drafts(user_id);
      CREATE INDEX IF NOT EXISTS idx_calendar_user_date ON calendar_items(user_id, scheduled_date);
      CREATE INDEX IF NOT EXISTS idx_queue_user_id ON queue_items(user_id);
    `)

    this.addColumnIfMissing('videos', 'user_id', 'INTEGER REFERENCES users(id) ON DELETE CASCADE')
  }

  private addColumnIfMissing(table: string, column: string, definition: string): void {
    const columns = this.db
      .prepare(`PRAGMA table_info(${table})`)
      .all() as unknown as Array<{ name: string }>
    if (!columns.some((c) => c.name === column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`)
    }
  }

  // ----- Users -----

  createUser(email: string, name: string, passwordHash: string): User {
    const now = new Date().toISOString()
    const info = this.db
      .prepare('INSERT INTO users (email, name, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run(email.toLowerCase(), name, passwordHash, now)
    return this.getUserById(Number(info.lastInsertRowid))!
  }

  getUserById(id: number): User | null {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined
    return row ? mapUser(row) : null
  }

  getUserByEmail(email: string): (User & { passwordHash: string }) | null {
    const row = this.db
      .prepare('SELECT * FROM users WHERE email = ?')
      .get(email.toLowerCase()) as Record<string, unknown> | undefined
    if (!row) return null
    return { ...mapUser(row), passwordHash: row.password_hash as string }
  }

  updateUserName(id: number, name: string): User | null {
    this.db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, id)
    return this.getUserById(id)
  }

  // ----- Videos & analyses -----

  listVideos(userId: number): Video[] {
    const rows = this.db
      .prepare('SELECT * FROM videos WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId) as unknown as VideoRow[]
    return rows.map(mapVideo)
  }

  getVideo(id: string, userId: number): Video | null {
    const row = this.db
      .prepare('SELECT * FROM videos WHERE id = ? AND user_id = ?')
      .get(id, userId) as unknown as VideoRow | undefined
    return row ? mapVideo(row) : null
  }

  upsertVideo(draft: VideoDraft, userId: number): Video {
    const now = new Date().toISOString()
    const existing = this.db
      .prepare('SELECT * FROM videos WHERE id = ?')
      .get(draft.id) as unknown as VideoRow | undefined
    const createdAt = existing?.created_at ?? now
    const owner = existing?.user_id ?? userId

    this.db
      .prepare(
        `INSERT INTO videos (
          id, user_id, url, title, description, channel_title, channel_url,
          thumbnail_url, duration_seconds, view_count, like_count,
          comment_count, published_at, tags, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        owner,
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

    return this.getVideo(draft.id, owner)!
  }

  deleteVideo(id: string, userId: number): boolean {
    const result = this.db
      .prepare('DELETE FROM videos WHERE id = ? AND user_id = ?')
      .run(id, userId)
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
    const row = this.db
      .prepare('SELECT * FROM analyses WHERE id = ?')
      .get(Number(info.lastInsertRowid)) as unknown as AnalysisRow
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

  // ----- Channel connection -----

  saveChannelConnection(connection: Omit<ChannelConnection, 'id' | 'createdAt' | 'updatedAt'>): ChannelConnection {
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO channel_connections (
          user_id, youtube_channel_id, title, thumbnail_url, access_token,
          refresh_token, token_expires_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          youtube_channel_id = excluded.youtube_channel_id,
          title = excluded.title,
          thumbnail_url = excluded.thumbnail_url,
          access_token = excluded.access_token,
          refresh_token = excluded.refresh_token,
          token_expires_at = excluded.token_expires_at,
          updated_at = excluded.updated_at`,
      )
      .run(
        connection.userId,
        connection.youtubeChannelId,
        connection.title,
        connection.thumbnailUrl,
        connection.accessToken,
        connection.refreshToken,
        connection.tokenExpiresAt,
        now,
        now,
      )
    return this.getChannelConnection(connection.userId)!
  }

  getChannelConnection(userId: number): ChannelConnection | null {
    const row = this.db
      .prepare('SELECT * FROM channel_connections WHERE user_id = ?')
      .get(userId) as unknown as ChannelRow | undefined
    return row ? mapChannel(row) : null
  }

  deleteChannelConnection(userId: number): boolean {
    const result = this.db
      .prepare('DELETE FROM channel_connections WHERE user_id = ?')
      .run(userId)
    return Number(result.changes) > 0
  }

  // ----- Drafts -----

  listDrafts(userId: number): Draft[] {
    const rows = this.db
      .prepare('SELECT * FROM drafts WHERE user_id = ? ORDER BY updated_at DESC')
      .all(userId) as unknown as DraftRow[]
    return rows.map(mapDraft)
  }

  getDraft(id: number, userId: number): Draft | null {
    const row = this.db
      .prepare('SELECT * FROM drafts WHERE id = ? AND user_id = ?')
      .get(id, userId) as unknown as DraftRow | undefined
    return row ? mapDraft(row) : null
  }

  createDraft(
    userId: number,
    data: {
      title: string
      idea?: string
      script?: string
      description?: string
      tags?: string[]
      thumbnailPrompt?: string
      status?: Draft['status']
      videoId?: string | null
    },
  ): Draft {
    const now = new Date().toISOString()
    const info = this.db
      .prepare(
        `INSERT INTO drafts (
          user_id, title, idea, script, description, tags, thumbnail_prompt,
          status, video_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        userId,
        data.title,
        data.idea ?? '',
        data.script ?? '',
        data.description ?? '',
        JSON.stringify(data.tags ?? []),
        data.thumbnailPrompt ?? '',
        data.status ?? 'idea',
        data.videoId ?? null,
        now,
        now,
      )
    return this.getDraft(Number(info.lastInsertRowid), userId)!
  }

  updateDraft(
    id: number,
    userId: number,
    data: Partial<{
      title: string
      idea: string
      script: string
      description: string
      tags: string[]
      thumbnailPrompt: string
      status: Draft['status']
      videoId: string | null
    }>,
  ): Draft | null {
    const current = this.getDraft(id, userId)
    if (!current) return null

    const next = {
      title: data.title ?? current.title,
      idea: data.idea ?? current.idea,
      script: data.script ?? current.script,
      description: data.description ?? current.description,
      tags: data.tags ?? current.tags,
      thumbnailPrompt: data.thumbnailPrompt ?? current.thumbnailPrompt,
      status: data.status ?? current.status,
      videoId: data.videoId !== undefined ? data.videoId : current.videoId,
    }

    this.db
      .prepare(
        `UPDATE drafts SET
          title = ?, idea = ?, script = ?, description = ?, tags = ?,
          thumbnail_prompt = ?, status = ?, video_id = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
      )
      .run(
        next.title,
        next.idea,
        next.script,
        next.description,
        JSON.stringify(next.tags),
        next.thumbnailPrompt,
        next.status,
        next.videoId,
        new Date().toISOString(),
        id,
        userId,
      )
    return this.getDraft(id, userId)
  }

  deleteDraft(id: number, userId: number): boolean {
    const result = this.db.prepare('DELETE FROM drafts WHERE id = ? AND user_id = ?').run(id, userId)
    return Number(result.changes) > 0
  }

  // ----- Calendar -----

  listCalendarItems(userId: number, month?: string): CalendarItem[] {
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const rows = this.db
        .prepare(
          'SELECT * FROM calendar_items WHERE user_id = ? AND scheduled_date LIKE ? ORDER BY scheduled_date ASC',
        )
        .all(userId, `${month}%`) as unknown as CalendarRow[]
      return rows.map(mapCalendar)
    }
    const rows = this.db
      .prepare('SELECT * FROM calendar_items WHERE user_id = ? ORDER BY scheduled_date ASC')
      .all(userId) as unknown as CalendarRow[]
    return rows.map(mapCalendar)
  }

  getCalendarItem(id: number, userId: number): CalendarItem | null {
    const row = this.db
      .prepare('SELECT * FROM calendar_items WHERE id = ? AND user_id = ?')
      .get(id, userId) as unknown as CalendarRow | undefined
    return row ? mapCalendar(row) : null
  }

  createCalendarItem(
    userId: number,
    data: {
      scheduledDate: string
      title: string
      draftId?: number | null
      status?: CalendarItem['status']
      notes?: string
    },
  ): CalendarItem {
    const now = new Date().toISOString()
    const info = this.db
      .prepare(
        `INSERT INTO calendar_items (user_id, scheduled_date, title, draft_id, status, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        userId,
        data.scheduledDate,
        data.title,
        data.draftId ?? null,
        data.status ?? 'planned',
        data.notes ?? '',
        now,
      )
    return this.getCalendarItem(Number(info.lastInsertRowid), userId)!
  }

  updateCalendarItem(
    id: number,
    userId: number,
    data: Partial<{
      scheduledDate: string
      title: string
      draftId: number | null
      status: CalendarItem['status']
      notes: string
    }>,
  ): CalendarItem | null {
    const current = this.getCalendarItem(id, userId)
    if (!current) return null
    this.db
      .prepare(
        `UPDATE calendar_items SET
          scheduled_date = ?, title = ?, draft_id = ?, status = ?, notes = ?
         WHERE id = ? AND user_id = ?`,
      )
      .run(
        data.scheduledDate ?? current.scheduledDate,
        data.title ?? current.title,
        data.draftId !== undefined ? data.draftId : current.draftId,
        data.status ?? current.status,
        data.notes ?? current.notes,
        id,
        userId,
      )
    return this.getCalendarItem(id, userId)
  }

  deleteCalendarItem(id: number, userId: number): boolean {
    const result = this.db
      .prepare('DELETE FROM calendar_items WHERE id = ? AND user_id = ?')
      .run(id, userId)
    return Number(result.changes) > 0
  }

  // ----- Queue -----

  listQueueItems(userId: number): QueueItem[] {
    const rows = this.db
      .prepare('SELECT * FROM queue_items WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId) as unknown as QueueRow[]
    return rows.map(mapQueue)
  }

  getQueueItem(id: number, userId: number): QueueItem | null {
    const row = this.db
      .prepare('SELECT * FROM queue_items WHERE id = ? AND user_id = ?')
      .get(id, userId) as unknown as QueueRow | undefined
    return row ? mapQueue(row) : null
  }

  createQueueItem(
    userId: number,
    data: {
      title: string
      draftId?: number | null
      scheduledAt?: string | null
      status?: QueueItem['status']
    },
  ): QueueItem {
    const now = new Date().toISOString()
    const info = this.db
      .prepare(
        `INSERT INTO queue_items (user_id, draft_id, title, scheduled_at, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        userId,
        data.draftId ?? null,
        data.title,
        data.scheduledAt ?? null,
        data.status ?? 'pending',
        now,
        now,
      )
    return this.getQueueItem(Number(info.lastInsertRowid), userId)!
  }

  updateQueueItem(
    id: number,
    userId: number,
    data: Partial<{
      draftId: number | null
      title: string
      scheduledAt: string | null
      status: QueueItem['status']
      youtubeVideoId: string | null
      youtubeUrl: string | null
      error: string | null
    }>,
  ): QueueItem | null {
    const current = this.getQueueItem(id, userId)
    if (!current) return null
    this.db
      .prepare(
        `UPDATE queue_items SET
          draft_id = ?, title = ?, scheduled_at = ?, status = ?,
          youtube_video_id = ?, youtube_url = ?, error = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
      )
      .run(
        data.draftId !== undefined ? data.draftId : current.draftId,
        data.title ?? current.title,
        data.scheduledAt !== undefined ? data.scheduledAt : current.scheduledAt,
        data.status ?? current.status,
        data.youtubeVideoId !== undefined ? data.youtubeVideoId : current.youtubeVideoId,
        data.youtubeUrl !== undefined ? data.youtubeUrl : current.youtubeUrl,
        data.error !== undefined ? data.error : current.error,
        new Date().toISOString(),
        id,
        userId,
      )
    return this.getQueueItem(id, userId)
  }

  deleteQueueItem(id: number, userId: number): boolean {
    const result = this.db.prepare('DELETE FROM queue_items WHERE id = ? AND user_id = ?').run(id, userId)
    return Number(result.changes) > 0
  }

  // ----- Analytics -----

  saveAnalyticsSnapshot(
    userId: number,
    channelStats: ChannelStats | null,
    videoStats: VideoStats[],
  ): AnalyticsSnapshot {
    const now = new Date().toISOString()
    const info = this.db
      .prepare(
        `INSERT INTO analytics_snapshots (user_id, channel_stats, video_stats, captured_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(userId, JSON.stringify(channelStats ?? {}), JSON.stringify(videoStats), now)
    const row = this.db
      .prepare('SELECT * FROM analytics_snapshots WHERE id = ?')
      .get(Number(info.lastInsertRowid)) as unknown as SnapshotRow
    return mapSnapshot(row)
  }

  getLatestAnalyticsSnapshot(userId: number): AnalyticsSnapshot | null {
    const row = this.db
      .prepare('SELECT * FROM analytics_snapshots WHERE user_id = ? ORDER BY id DESC LIMIT 1')
      .get(userId) as unknown as SnapshotRow | undefined
    return row ? mapSnapshot(row) : null
  }
}

// ----- Row mappers -----

interface VideoRow {
  id: string
  user_id: number | null
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

interface AnalysisRow {
  id: number
  video_id: string
  titles: string
  description: string
  tags: string
  summary: string
  provider: string
  created_at: string
}

interface ChannelRow {
  id: number
  user_id: number
  youtube_channel_id: string
  title: string
  thumbnail_url: string | null
  access_token: string
  refresh_token: string
  token_expires_at: number
  created_at: string
  updated_at: string
}

interface DraftRow {
  id: number
  user_id: number
  title: string
  idea: string
  script: string
  description: string
  tags: string
  thumbnail_prompt: string
  status: string
  video_id: string | null
  created_at: string
  updated_at: string
}

interface CalendarRow {
  id: number
  user_id: number
  scheduled_date: string
  title: string
  draft_id: number | null
  status: string
  notes: string
  created_at: string
}

interface QueueRow {
  id: number
  user_id: number
  draft_id: number | null
  title: string
  scheduled_at: string | null
  status: string
  youtube_video_id: string | null
  youtube_url: string | null
  error: string | null
  created_at: string
  updated_at: string
}

interface SnapshotRow {
  id: number
  user_id: number
  channel_stats: string
  video_stats: string
  captured_at: string
}

function mapUser(row: Record<string, unknown>): User {
  return {
    id: Number(row.id),
    email: String(row.email),
    name: String(row.name),
    createdAt: String(row.created_at),
  }
}

function mapVideo(row: VideoRow): Video {
  return {
    id: row.id,
    userId: row.user_id,
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

function mapChannel(row: ChannelRow): ChannelConnection {
  return {
    id: row.id,
    userId: row.user_id,
    youtubeChannelId: row.youtube_channel_id,
    title: row.title,
    thumbnailUrl: row.thumbnail_url,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    tokenExpiresAt: row.token_expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapDraft(row: DraftRow): Draft {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    idea: row.idea,
    script: row.script,
    description: row.description,
    tags: safeParseJson<string[]>(row.tags, []),
    thumbnailPrompt: row.thumbnail_prompt,
    status: row.status as Draft['status'],
    videoId: row.video_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapCalendar(row: CalendarRow): CalendarItem {
  return {
    id: row.id,
    userId: row.user_id,
    scheduledDate: row.scheduled_date,
    title: row.title,
    draftId: row.draft_id,
    status: row.status as CalendarItem['status'],
    notes: row.notes,
    createdAt: row.created_at,
  }
}

function mapQueue(row: QueueRow): QueueItem {
  return {
    id: row.id,
    userId: row.user_id,
    draftId: row.draft_id,
    title: row.title,
    scheduledAt: row.scheduled_at,
    status: row.status as QueueItem['status'],
    youtubeVideoId: row.youtube_video_id,
    youtubeUrl: row.youtube_url,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapSnapshot(row: SnapshotRow): AnalyticsSnapshot {
  const channelRaw = safeParseJson<Record<string, unknown> | null>(row.channel_stats, null)
  return {
    id: row.id,
    userId: row.user_id,
    channelStats: channelRaw
      ? {
          viewCount: Number(channelRaw.viewCount ?? 0),
          subscriberCount: Number(channelRaw.subscriberCount ?? 0),
          videoCount: Number(channelRaw.videoCount ?? 0),
        }
      : null,
    videoStats: safeParseJson<VideoStats[]>(row.video_stats, []),
    capturedAt: row.captured_at,
  }
}
