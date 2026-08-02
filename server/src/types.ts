export interface Video {
  id: string
  userId: number | null
  url: string
  title: string
  description: string
  channelTitle: string
  channelUrl: string
  thumbnailUrl: string
  durationSeconds: number | null
  viewCount: number | null
  likeCount: number | null
  commentCount: number | null
  publishedAt: string | null
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface VideoDraft {
  id: string
  url: string
  title: string
  description: string
  channelTitle: string
  channelUrl: string
  thumbnailUrl: string
  durationSeconds: number | null
  viewCount: number | null
  likeCount: number | null
  commentCount: number | null
  publishedAt: string | null
  tags: string[]
}

export type AIProvider = 'llm' | 'rules'

export interface Analysis {
  id: number
  videoId: string
  titles: string[]
  description: string
  tags: string[]
  summary: string
  provider: AIProvider
  createdAt: string
}

export interface AnalysisResult {
  titles: string[]
  description: string
  tags: string[]
  summary: string
}

export interface User {
  id: number
  email: string
  name: string
  createdAt: string
}

export type DraftStatus = 'idea' | 'drafting' | 'ready' | 'scheduled' | 'published'

export interface Draft {
  id: number
  userId: number
  title: string
  idea: string
  script: string
  description: string
  tags: string[]
  thumbnailPrompt: string
  status: DraftStatus
  videoId: string | null
  createdAt: string
  updatedAt: string
}

export type CalendarStatus = 'planned' | 'drafted' | 'published'

export interface CalendarItem {
  id: number
  userId: number
  scheduledDate: string
  title: string
  draftId: number | null
  status: CalendarStatus
  notes: string
  createdAt: string
}

export type QueueStatus = 'pending' | 'publishing' | 'published' | 'failed'

export interface QueueItem {
  id: number
  userId: number
  draftId: number | null
  title: string
  scheduledAt: string | null
  status: QueueStatus
  youtubeVideoId: string | null
  youtubeUrl: string | null
  error: string | null
  createdAt: string
  updatedAt: string
}

export interface ChannelConnection {
  id: number
  userId: number
  youtubeChannelId: string
  title: string
  thumbnailUrl: string | null
  accessToken: string
  refreshToken: string
  tokenExpiresAt: number
  createdAt: string
  updatedAt: string
}

export interface ChannelStats {
  viewCount: number
  subscriberCount: number
  videoCount: number
}

export interface VideoStats {
  id: string
  title: string
  viewCount: number
  likeCount: number | null
  commentCount: number | null
  publishedAt: string | null
}

export interface AnalyticsSnapshot {
  id: number
  userId: number
  channelStats: ChannelStats | null
  videoStats: VideoStats[]
  capturedAt: string
}

export interface IdeaResult {
  ideas: Array<{
    title: string
    angle: string
    hook: string
    audience: string
  }>
}

export interface ScriptResult {
  outline: Array<{ heading: string; points: string[] }>
  script: string
}

export interface TitlesResult {
  titles: string[]
}

export interface DescriptionResult {
  description: string
}

export interface TagsResult {
  tags: string[]
}

export interface ThumbnailResult {
  prompt: string
}

export interface GeneratedResult<T> {
  result: T
  provider: AIProvider
  warning: string | null
}
