import type {
  DescriptionResult,
  IdeaResult,
  ScriptResult,
  TagsResult,
  ThumbnailResult,
  TitlesResult,
} from '../types.js'
import { extractKeywords, titleCase } from './ruleGen.js'

export interface GenerateInputs {
  topic: string
  audience?: string
  title?: string
  style?: string
  length?: 'short' | 'medium' | 'long'
  count?: number
}

export interface RuleEngine {
  ideas(input: GenerateInputs): IdeaResult
  script(input: GenerateInputs): ScriptResult
  titles(input: GenerateInputs): TitlesResult
  description(input: GenerateInputs): DescriptionResult
  tags(input: GenerateInputs): TagsResult
  thumbnail(input: GenerateInputs): ThumbnailResult
}

function clampCount(count: number | undefined): number {
  const value = Number.isInteger(count) ? (count as number) : 5
  return Math.min(10, Math.max(3, value))
}

function buildIdeas(topic: string, audience: string, count: number): IdeaResult {
  const keywords = extractKeywords(topic, '', [])
  const primary = titleCase(keywords[0] ?? topic)
  const templates = [
    { angle: 'Complete guide', hook: 'Covers everything from the basics to advanced techniques.' },
    { angle: 'Beginner friendly', hook: 'No prior knowledge required - perfect for newcomers.' },
    { angle: 'Mistakes to avoid', hook: 'Learn what most people get wrong and how to fix it.' },
    { angle: 'Underrated insights', hook: 'Practical knowledge that is rarely shared publicly.' },
    { angle: 'Before you start', hook: 'Things you should know before diving in.' },
    { angle: 'Quick wins', hook: 'Fast, actionable results you can apply today.' },
    { angle: 'Deep dive', hook: 'A thorough look at the details most videos skip.' },
    { angle: 'Myths busted', hook: 'Separating fact from fiction with clear explanations.' },
    { angle: 'Tools & resources', hook: 'The exact tools and resources professionals use.' },
    { angle: 'Real examples', hook: 'Walk throughs grounded in real, concrete examples.' },
  ]

  const ideas = templates.slice(0, count).map((template, index) => {
    const title =
      index === 0
        ? `${topic}: The Complete Guide`
        : index === 1
          ? `${topic} for Beginners`
          : index === 2
            ? `The Top Mistakes in ${topic} (and How to Avoid Them)`
            : index === 3
              ? `What Nobody Tells You About ${topic}`
              : index === 4
                ? `${primary}: What to Know Before You Start`
                : index === 5
                  ? `5 ${primary} Quick Wins You Can Use Today`
                  : index === 6
                    ? `A Deep Dive into ${primary}`
                    : index === 7
                      ? `${primary} Myths, Busted`
                      : index === 8
                        ? `The Best ${primary} Tools and Resources`
                        : `${primary}: Lessons from Real Examples`
    return {
      title,
      angle: template.angle,
      hook: template.hook,
      audience,
    }
  })

  return { ideas }
}

function buildScript(input: GenerateInputs): ScriptResult {
  const topic = input.topic.trim()
  const title = input.title?.trim() || topic
  const keywords = extractKeywords(topic, title, [])
  const primary = titleCase(keywords[0] ?? topic)
  const length = input.length ?? 'medium'
  const sections = length === 'short' ? 3 : length === 'long' ? 6 : 4

  const headingSections: Array<{ heading: string; points: string[] }> = [
    {
      heading: 'Introduction',
      points: [
        `Open with a bold statement or question that hooks the viewer immediately.`,
        `Introduce "${title}" and why it matters to the audience.`,
        `Preview what viewers will learn by the end of the video.`,
      ],
    },
  ]

  for (let i = 1; i <= sections; i++) {
    headingSections.push({
      heading: `Key point ${i}: ${primary}${i > 1 ? ` (part ${i})` : ''}`,
      points: [
        `Explain the core idea of "${title}" in simple, concrete terms.`,
        `Give a practical example the audience can relate to.`,
        `Summarize the takeaway before moving to the next point.`,
      ],
    })
  }

  headingSections.push({
    heading: 'Conclusion & call to action',
    points: [
      'Recap the three most important takeaways.',
      'Ask viewers to like, comment, and subscribe.',
      `Tease the next video related to ${topic}.`,
    ],
  })

  const script = headingSections
    .map((section) => `## ${section.heading}\n${section.points.map((p) => `- ${p}`).join('\n')}`)
    .join('\n\n')

  return { outline: headingSections, script }
}

function buildTitles(topic: string): TitlesResult {
  const keywords = extractKeywords(topic, '', [])
  const primary = titleCase(keywords[0] ?? topic)
  const titles = [
    topic.trim(),
    `${topic}: The Complete Guide`,
    `Why ${primary} Matters Right Now`,
    `${primary} Explained in 2026`,
    `The Truth About ${primary}`,
  ]
  return { titles: [...new Set(titles)].slice(0, 5) }
}

function buildDescription(input: GenerateInputs): DescriptionResult {
  const title = input.title?.trim() || input.topic.trim()
  const keywords = extractKeywords(input.topic, title, [])
  const primary = titleCase(keywords[0] ?? input.topic)

  const lines = [
    title,
    '',
    `In this video we take a close look at ${input.topic} and break down ${primary} step by step.`,
    'Whether you are just starting out or already experienced, there is something here for you.',
    '',
    'What you will learn:',
    ...keywords.slice(0, 4).map((k, i) => `${i + 1}. ${titleCase(k)}`),
    '',
    'Subscribe for more videos like this, and leave a comment with your thoughts.',
    '',
    `#${keywords.slice(0, 6).map((k) => k.replace(/[^a-z0-9]/gi, '')).join(' #')}`,
  ]

  return { description: lines.join('\n') }
}

function buildTags(input: GenerateInputs): TagsResult {
  const keywords = extractKeywords(input.topic, input.title ?? '', [])
  const base = [...keywords, input.topic.toLowerCase(), 'youtube', 'tutorial']
  return { tags: [...new Set(base)].slice(0, 12).map((t) => t.toLowerCase()) }
}

function buildThumbnail(input: GenerateInputs): ThumbnailResult {
  const title = input.title?.trim() || input.topic.trim()
  const style = input.style?.trim() || 'bold, high-contrast, modern YouTube thumbnail'
  const keywords = extractKeywords(input.topic, title, [])
  const primary = titleCase(keywords[0] ?? input.topic)

  const prompt =
    `YouTube thumbnail prompt for "${title}": ` +
    `${style}. Subject: ${primary}, front and center, looking directly at the viewer with an expressive face. ` +
    `Background: vibrant gradient with a subtle ${keywords[1] ?? 'thematic'} texture. ` +
    `Text overlay: up to 4 short words in a thick white font with a dark outline, such as "${primary}". ` +
    `Composition: rule of thirds, strong contrast, saturated colors, high detail, 1280x720. ` +
    `Make the thumbnail instantly readable at small sizes and stand out in a crowded sidebar.`

  return { prompt }
}

export function createRuleEngine(): RuleEngine {
  return {
    ideas(input) {
      const audience = input.audience?.trim() || 'everyone interested in the topic'
      return buildIdeas(input.topic, audience, clampCount(input.count))
    },
    script: buildScript,
    titles(input) {
      return buildTitles(input.topic)
    },
    description: buildDescription,
    tags: buildTags,
    thumbnail: buildThumbnail,
  }
}
