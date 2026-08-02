import type { AIProvider, AnalysisResult, Video } from '../types.js'
import { isLlmConfigured, type AppConfig } from '../config.js'
import { generateRuleBased } from './ruleGen.js'
import { requestAnalysis } from './llm.js'

export interface AnalysisOutput {
  result: AnalysisResult
  provider: AIProvider
  warning: string | null
}

export interface Analyzer {
  analyze(video: Video): Promise<AnalysisOutput>
}

export function createAnalyzer(config: AppConfig): Analyzer {
  const llmConfigured = isLlmConfigured(config)

  return {
    async analyze(video: Video): Promise<AnalysisOutput> {
      if (llmConfigured && config.llm.apiKey && config.llm.baseUrl) {
        try {
          const result = await requestAnalysis(video, {
            apiKey: config.llm.apiKey,
            baseUrl: config.llm.baseUrl,
            model: config.llm.model,
          })
          return { result, provider: 'llm', warning: null }
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err)
          const fallback = generateRuleBased(video)
          return {
            result: fallback,
            provider: 'rules',
            warning: `LLM analysis failed (${detail}); fell back to the rule-based generator.`,
          }
        }
      }

      return { result: generateRuleBased(video), provider: 'rules', warning: null }
    },
  }
}
