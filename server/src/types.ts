export interface Video {
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

export type LLMKind = 'configured' | 'unconfigured'
