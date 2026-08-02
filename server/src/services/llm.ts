import type { AnalysisResult, Video } from '../types.js'

export interface LlmConfig {
  apiKey: string
  baseUrl: string
  model: string
}

export class LlmRequestError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'LlmRequestError'
  }
}

function buildMessages(systemPrompt: string, userPrompt: string): Array<{ role: string; content: string }> {
  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]
}

function extractJson(text: string): unknown {
  const stripped = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()
  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new LlmRequestError('LLM response did not contain a JSON object')
  }
  return JSON.parse(stripped.slice(start, end + 1))
}

/**
 * Calls an OpenAI-compatible /chat/completions endpoint and returns the parsed
 * JSON object from the first choice. Compatible with OpenAI, DeepSeek, etc.
 */
export async function callStructuredJson(
  config: LlmConfig,
  systemPrompt: string,
  userPrompt: string,
  timeoutMs = 30000,
): Promise<unknown> {
  const endpoint = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  const body = {
    model: config.model,
    messages: buildMessages(systemPrompt, userPrompt),
    temperature: 0.8,
    max_tokens: 2000,
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new LlmRequestError(
        `LLM request failed with status ${res.status}: ${detail.slice(0, 200)}`,
        res.status,
      )
    }

    const payload = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = payload.choices?.[0]?.message?.content
    if (!content) {
      throw new LlmRequestError('LLM response contained no message content')
    }

    return extractJson(content)
  } catch (err) {
    if (err instanceof LlmRequestError) throw err
    if (err instanceof Error && err.name === 'AbortError') {
      throw new LlmRequestError('LLM request timed out', 504)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

const VIDEO_ANALYSIS_SYSTEM_PROMPT = [
  'You are an expert YouTube content strategist and copywriter.',
  'Given video metadata, produce an analysis used to optimize the video.',
  'Respond ONLY with a single valid JSON object shaped exactly like this:',
  '{"titles": ["<string>", ...], "description": "<string>", "tags": ["<string>", ...], "summary": "<string>"}',
  'Rules: 5 distinct titles, each under 80 characters; 1 description of 3-6 short lines joined by \\n;',
  'up to 12 lowercase tags; a 2-3 sentence summary of what the video covers.',
].join('\n')

function buildVideoPrompt(video: Video): string {
  const lines = [
    'Video metadata:',
    `- title: ${video.title}`,
    `- channel: ${video.channelTitle}`,
    `- duration: ${video.durationSeconds ?? 'unknown'} seconds`,
    `- published: ${video.publishedAt ?? 'unknown'}`,
    `- views: ${video.viewCount ?? 'unknown'}`,
    `- likes: ${video.likeCount ?? 'unknown'}`,
    `- tags: ${video.tags.length > 0 ? video.tags.join(', ') : 'none'}`,
  ]
  if (video.description) {
    lines.push(`- description: ${video.description.slice(0, 1000)}`)
  }
  return lines.join('\n')
}

function validateAnalysisResult(raw: unknown): AnalysisResult {
  if (typeof raw !== 'object' || raw === null) {
    throw new LlmRequestError('LLM response was not a JSON object')
  }
  const obj = raw as Record<string, unknown>

  const asStringArray = (value: unknown): string[] => {
    if (!Array.isArray(value)) return []
    return value
      .filter((v): v is string => typeof v === 'string' && v.length > 0)
      .map((s) => s.trim())
  }

  const titles = asStringArray(obj.titles)
  const tags = asStringArray(obj.tags)
  const description = typeof obj.description === 'string' ? obj.description.trim() : ''
  const summary = typeof obj.summary === 'string' ? obj.summary.trim() : ''

  if (titles.length === 0 || !description || !summary) {
    throw new LlmRequestError('LLM response was missing required fields')
  }

  return {
    titles: titles.slice(0, 5),
    description,
    tags: tags.slice(0, 12),
    summary,
  }
}

export async function requestAnalysis(video: Video, config: LlmConfig): Promise<AnalysisResult> {
  const raw = await callStructuredJson(config, VIDEO_ANALYSIS_SYSTEM_PROMPT, buildVideoPrompt(video))
  return validateAnalysisResult(raw)
}
