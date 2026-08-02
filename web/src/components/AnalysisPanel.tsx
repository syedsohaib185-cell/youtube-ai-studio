import type { Analysis } from '../types'

export default function AnalysisPanel({ analysis }: { analysis: Analysis }) {
  const providerLabel = analysis.provider === 'llm' ? 'LLM generated' : 'Local generator'

  return (
    <div className="analysis">
      <div className="analysis-head">
        <h2>AI analysis</h2>
        <span className={`badge ${analysis.provider === 'llm' ? 'badge-ok' : 'badge-muted'}`}>
          {providerLabel}
        </span>
      </div>

      <section className="analysis-block">
        <h3>Title options</h3>
        <ul className="title-list">
          {analysis.titles.map((title, i) => (
            <li key={`${title}-${i}`}>
              <span className="title-index">{i + 1}</span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => void navigator.clipboard.writeText(title)}
                aria-label={`Copy title ${i + 1}`}
              >
                Copy
              </button>
              <span className="title-text">{title}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="analysis-block">
        <h3>Description</h3>
        <pre className="preview">{analysis.description}</pre>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => void navigator.clipboard.writeText(analysis.description)}
        >
          Copy description
        </button>
      </section>

      <section className="analysis-block">
        <h3>Tags</h3>
        <div className="tag-cloud">
          {analysis.tags.map((tag) => (
            <span key={tag} className="tag">
              {tag}
            </span>
          ))}
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => void navigator.clipboard.writeText(analysis.tags.join(', '))}
        >
          Copy tags
        </button>
      </section>

      <section className="analysis-block">
        <h3>Summary</h3>
        <p>{analysis.summary}</p>
      </section>
    </div>
  )
}
