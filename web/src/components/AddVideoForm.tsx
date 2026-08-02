import { useState, type FormEvent } from 'react'

interface Props {
  onAdd: (url: string) => Promise<void>
}

export default function AddVideoForm({ onAdd }: Props) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const value = url.trim()
    if (!value || busy) return

    setBusy(true)
    setError(null)
    try {
      await onAdd(value)
      setUrl('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add video')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="add-form" onSubmit={submit}>
      <div className="add-form-row">
        <input
          type="text"
          className="add-input"
          placeholder="Paste a YouTube URL…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          aria-label="YouTube URL"
          disabled={busy}
        />
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Adding…' : 'Add video'}
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
    </form>
  )
}
