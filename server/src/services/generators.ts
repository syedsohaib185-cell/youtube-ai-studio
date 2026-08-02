import type {
  DescriptionResult,
  GeneratedResult,
  IdeaResult,
  ScriptResult,
  TagsResult,
  ThumbnailResult,
  TitlesResult,
} from '../types.js'
import { isLlmConfigured, type AppConfig } from '../config.js'
import { callStructuredJson } from './llm.js'
import { createRuleEngine, type GenerateInputs, type RuleEngine } from './rules.js'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map((s) => s.trim())
}

const GENERATOR_PROMPTS: Record<string, string> = {
  ideas:
    'You are a YouTube ideation expert. Given a topic, audience and count, produce creative video ideas. ' +
    'Respond ONLY with a JSON object shaped exactly like: ' +
    '{"ideas": [{"title": "<string>", "angle": "<string>", "hook": "<string>", "audience": "<string>"}]}. ' +
    'Each title must be compelling and under 80 characters.',
  script:
    'You are a YouTube scriptwriter. Given a title and topic, produce a structured video script. ' +
    'Respond ONLY with a JSON object shaped exactly like: ' +
    '{"outline": [{"heading": "<string>", "points": ["<string>"]}], "script": "<string with \\n line breaks>"}. ' +
    'The script must be the full spoken script, and the outline a summarized table of contents.',
  titles:
    'You are a YouTube SEO title expert. Given a topic, produce 5 optimized, click-worthy titles. ' +
    'Respond ONLY with a JSON object shaped exactly like: {"titles": ["<string>", ...]}. ' +
    'Each title under 80 characters, distinct, keyword-aware, no clickbait.',
  description:
    'You are a YouTube description copywriter. Given a title and topic, produce a description. ' +
    'Respond ONLY with a JSON object shaped exactly like: {"description": "<string with \\n line breaks>"}. ' +
    'Include a hook paragraph, a what-you-will-learn list, and relevant hashtags.',
  tags:
    'You are a YouTube SEO tags expert. Given a title and topic, produce up to 12 lowercase, relevant tags. ' +
    'Respond ONLY with a JSON object shaped exactly like: {"tags": ["<string>", ...]}.',
  thumbnail:
    'You are a YouTube thumbnail art director. Given a title, topic and style, produce a detailed text-to-image prompt. ' +
    'Respond ONLY with a JSON object shaped exactly like: {"prompt": "<string>"}. ' +
    'Cover subject, expression, background, text overlay, colors, composition and readability at small sizes.',
}

function validateIdeas(raw: unknown): IdeaResult {
  if (!isRecord(raw) || !Array.isArray(raw.ideas)) {
    throw new Error('Invalid ideas response')
  }
  const ideas = raw.ideas
    .filter((idea): idea is Record<string, unknown> => isRecord(idea))
    .filter((idea) => typeof idea.title === 'string' && idea.title.trim())
    .map((idea) => ({
      title: String(idea.title).trim(),
      angle: typeof idea.angle === 'string' ? idea.angle.trim() : '',
      hook: typeof idea.hook === 'string' ? idea.hook.trim() : '',
      audience: typeof idea.audience === 'string' ? idea.audience.trim() : '',
    }))
  if (ideas.length === 0) throw new Error('Invalid ideas response')
  return { ideas }
}

function validateScript(raw: unknown): ScriptResult {
  if (!isRecord(raw)) throw new Error('Invalid script response')
  const outlineRaw = Array.isArray(raw.outline) ? raw.outline : []
  const outline = outlineRaw
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .filter((item) => typeof item.heading === 'string' && item.heading.trim())
    .map((item) => ({
      heading: String(item.heading).trim(),
      points: asStringArray(item.points),
    }))
  const script = typeof raw.script === 'string' ? raw.script.trim() : ''
  if (outline.length === 0 || !script) throw new Error('Invalid script response')
  return { outline, script }
}

function validateTitles(raw: unknown): TitlesResult {
  const titles = isRecord(raw) ? asStringArray(raw.titles) : []
  if (titles.length === 0) throw new Error('Invalid titles response')
  return { titles: titles.slice(0, 5) }
}

function validateDescription(raw: unknown): DescriptionResult {
  if (!isRecord(raw) || typeof raw.description !== 'string' || !raw.description.trim()) {
    throw new Error('Invalid description response')
  }
  return { description: String(raw.description).trim() }
}

function validateTags(raw: unknown): TagsResult {
  const tags = isRecord(raw) ? asStringArray(raw.tags) : []
  if (tags.length === 0) throw new Error('Invalid tags response')
  return { tags: tags.slice(0, 12).map((t) => t.toLowerCase()) }
}

function validateThumbnail(raw: unknown): ThumbnailResult {
  if (!isRecord(raw) || typeof raw.prompt !== 'string' || !raw.prompt.trim()) {
    throw new Error('Invalid thumbnail response')
  }
  return { prompt: String(raw.prompt).trim() }
}

function buildUserPrompt(name: string, input: GenerateInputs): string {
  const lines: string[] = []
  if (input.topic) lines.push(`Topic: ${input.topic}`)
  if (input.title) lines.push(`Title: ${input.title}`)
  if (input.audience) lines.push(`Audience: ${input.audience}`)
  if (input.style) lines.push(`Style: ${input.style}`)
  if (input.length) lines.push(`Length: ${input.length}`)
  if (input.count) lines.push(`Count: ${input.count}`)
  return lines.join('\n')
}

export interface StudioGenerators {
  generateIdeas(input: GenerateInputs): Promise<GeneratedResult<IdeaResult>>
  generateScript(input: GenerateInputs): Promise<GeneratedResult<ScriptResult>>
  generateTitles(input: GenerateInputs): Promise<GeneratedResult<TitlesResult>>
  generateDescription(input: GenerateInputs): Promise<GeneratedResult<DescriptionResult>>
  generateTags(input: GenerateInputs): Promise<GeneratedResult<TagsResult>>
  generateThumbnail(input: GenerateInputs): Promise<GeneratedResult<ThumbnailResult>>
}

export function createStudioGenerators(config: AppConfig): StudioGenerators {
  const rules: RuleEngine = createRuleEngine()
  const llmConfigured = isLlmConfigured(config)

  async function run<T>(
    name: string,
    input: GenerateInputs,
    fallback: (i: GenerateInputs) => T,
    validate: (raw: unknown) => T,
  ): Promise<GeneratedResult<T>> {
    if (llmConfigured && config.llm.apiKey && config.llm.baseUrl) {
      try {
        const raw = await callStructuredJson(
          { apiKey: config.llm.apiKey, baseUrl: config.llm.baseUrl, model: config.llm.model },
          GENERATOR_PROMPTS[name],
          buildUserPrompt(name, input),
        )
        const result = validate(raw)
        return { result, provider: 'llm', warning: null }
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err)
        return {
          result: fallback(input),
          provider: 'rules',
          warning: `LLM generation failed (${detail}); fell back to the rule-based generator.`,
        }
      }
    }
    return { result: fallback(input), provider: 'rules', warning: null }
  }

  return {
    generateIdeas: (input) => run('ideas', input, (i) => rules.ideas(i), validateIdeas),
    generateScript: (input) => run('script', input, (i) => rules.script(i), validateScript),
    generateTitles: (input) => run('titles', input, (i) => rules.titles(i), validateTitles),
    generateDescription: (input) => run('description', input, (i) => rules.description(i), validateDescription),
    generateTags: (input) => run('tags', input, (i) => rules.tags(i), validateTags),
    generateThumbnail: (input) => run('thumbnail', input, (i) => rules.thumbnail(i), validateThumbnail),
  }
}
