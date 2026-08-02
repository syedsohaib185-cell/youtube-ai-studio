import type { Video } from '../types.js'

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'in',
  'into', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the', 'this', 'to',
  'was', 'were', 'will', 'with', 'you', 'your', 'our', 'we', 'they', 'them',
  'he', 'she', 'his', 'her', 'i', 'me', 'my', 'not', 'no', 'so', 'do', 'does',
  'did', 'can', 'could', 'should', 'would', 'what', 'which', 'when', 'where',
  'how', 'why', 'who', 'all', 'any', 'about', 'more', 'most', 'have', 'has',
  'had', 'some', 'only', 'just', 'get', 'got', 'then', 'than', 'too', 'very',
  'up', 'down', 'out', 'off', 'over', 'under', 'again', 'also', 'etc',
])

const CONTENT_TYPES: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /tutorial|how to|guide|walkthrough|step by step|tips/i, label: 'tutorial' },
  { pattern: /review|unboxing|first look|hands on/i, label: 'review' },
  { pattern: /top \d+|best \d+|countdown|ranking/i, label: 'list' },
  { pattern: /vs\.?\b|comparison|compare/i, label: 'comparison' },
  { pattern: /travel|vlog|vlogging|day in the life/i, label: 'vlog' },
  { pattern: /cook|recipe|meal|kitchen/i, label: 'cooking' },
  { pattern: /fitness|workout|gym|exercise|health/i, label: 'fitness' },
  { pattern: /tech|gadget|smartphone|laptop|camera|ai\b|software|app/i, label: 'tech' },
  { pattern: /game|gaming|gameplay|let's play|playthrough/i, label: 'gaming' },
  { pattern: /news|breaking|update|announcement/i, label: 'news' },
  { pattern: /podcast|interview|talk show|conversation/i, label: 'podcast' },
  { pattern: /music|song|album|cover|remix|band/i, label: 'music' },
  { pattern: /explainer|explained|what is|documentary/i, label: 'explainer' },
  { pattern: /mystery|true crime|story|documentary/i, label: 'story' },
]

function detectContentType(title: string, description: string): string {
  const haystack = `${title} ${description}`
  for (const { pattern, label } of CONTENT_TYPES) {
    if (pattern.test(haystack)) return label
  }
  return 'content'
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
}

export function extractKeywords(title: string, description: string, existingTags: string[]): string[] {
  const counts = new Map<string, number>()
  const bump = (word: string, weight: number): void => {
    counts.set(word, (counts.get(word) ?? 0) + weight)
  }

  for (const word of tokenize(`${title} ${description}`)) bump(word, 1)
  for (const tag of existingTags) bump(tag.toLowerCase().trim(), 2)

  const sorted = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word)

  const titleWords = tokenize(title)
  const prioritized = [...titleWords, ...sorted.filter((w) => !titleWords.includes(w))]

  return [...new Set(prioritized)].slice(0, 10)
}

export function titleCase(word: string): string {
  return word.replace(/\b\w/g, (c) => c.toUpperCase())
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : max).trimEnd()}…`
}

export function formatCount(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return 'Unknown length'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`
}

export interface RuleBasedOutput {
  titles: string[]
  description: string
  tags: string[]
  summary: string
}

export function generateRuleBased(video: Video): RuleBasedOutput {
  const title = video.title.trim()
  const keywords = extractKeywords(title, video.description, video.tags)
  const primary = keywords[0] ?? titleCase(title.split(/\s+/).slice(0, 3).join(' '))
  const type = detectContentType(title, video.description)
  const channel = video.channelTitle.trim()

  const titles = [
    title,
    `${title} | ${truncate(channel, 40)}`,
    `${titleCase(primary)}: Everything You Need to Know`,
    `Why ${titleCase(primary)} Matters Right Now`,
    `The Real Story Behind ${titleCase(primary)}`,
    `${title} - Full Breakdown`,
  ]
  const uniqueTitles = [...new Set(titles)].slice(0, 5)

  const descriptionLines: string[] = []
  descriptionLines.push(title)
  if (channel) descriptionLines.push(`From ${channel}: a ${type} video you don't want to miss.`)
  if (keywords.length > 0) {
    descriptionLines.push('')
    descriptionLines.push('In this video:')
    keywords.slice(0, 5).forEach((k, i) => {
      descriptionLines.push(`${i + 1}. ${titleCase(k)}`)
    })
  }
  if (video.description) {
    descriptionLines.push('')
    descriptionLines.push(truncate(video.description.replace(/\s+/g, ' '), 300))
  }
  descriptionLines.push('')
  descriptionLines.push('Don\'t forget to like, comment, and subscribe for more content.')
  descriptionLines.push('')
  descriptionLines.push(`#${keywords.slice(0, 5).map((k) => k.replace(/[^a-z0-9]/gi, '')).join(' #')}`)
  const description = descriptionLines.join('\n')

  const broadTags = {
    tutorial: ['tutorial', 'how to', 'guide'],
    review: ['review', 'unboxing', 'honest review'],
    list: ['top 10', 'best of', 'ranking'],
    comparison: ['comparison', 'vs', 'which is better'],
    vlog: ['vlog', 'day in the life', 'lifestyle'],
    cooking: ['cooking', 'recipe', 'meal prep'],
    fitness: ['fitness', 'workout', 'exercise'],
    tech: ['tech', 'technology', 'gadgets'],
    gaming: ['gaming', 'gameplay', 'gamer'],
    news: ['news', 'update', 'breaking'],
    podcast: ['podcast', 'interview', 'conversation'],
    music: ['music', 'song', 'artist'],
    explainer: ['explainer', 'education', 'learning'],
    story: ['story', 'documentary', 'true story'],
  } as const

  const typeTags = broadTags[type as keyof typeof broadTags] ?? ['video', 'youtube']
  const tagList = [...keywords, ...(channel ? [channel.toLowerCase()] : []), ...typeTags]
  const tags = [...new Set(tagList)].slice(0, 12).map((t) => t.toLowerCase())

  const statsBits: string[] = []
  if (video.viewCount !== null) statsBits.push(`${formatCount(video.viewCount)} views`)
  if (video.likeCount !== null) statsBits.push(`${formatCount(video.likeCount)} likes`)
  if (video.durationSeconds !== null) statsBits.push(`a ${formatDuration(video.durationSeconds)} run time`)

  const summary =
    `Auto-generated overview from metadata: "${title}" is a ${type} video` +
    (channel ? ` from ${channel}` : '') +
    (statsBits.length > 0 ? ` with ${statsBits.join(', ')}` : '') +
    (keywords.length > 0
      ? `. It centers around ${keywords.slice(0, 3).join(', ')}.`
      : '.') +
    (video.description
      ? ` Description preview: ${truncate(video.description.replace(/\s+/g, ' '), 200)}`
      : '')

  return { titles: uniqueTitles, description, tags, summary }
}
