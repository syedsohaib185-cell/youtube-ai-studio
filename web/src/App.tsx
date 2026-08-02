import { useEffect, useState } from 'react'
import { Link, NavLink, Route, Routes } from 'react-router'
import { fetchHealth } from './api'
import type { HealthInfo } from './types'
import Home from './pages/Home'
import VideoDetail from './pages/VideoDetail'

function HealthBadge() {
  const [health, setHealth] = useState<HealthInfo | null>(null)

  useEffect(() => {
    let active = true
    fetchHealth()
      .then((info) => {
        if (active) setHealth(info)
      })
      .catch(() => {
        if (active) setHealth(null)
      })
    return () => {
      active = false
    }
  }, [])

  if (!health) {
    return <span className="badge badge-warn">API offline</span>
  }

  return (
    <>
      <span className={`badge ${health.aiProvider === 'llm' ? 'badge-ok' : 'badge-muted'}`}>
        AI: {health.aiProvider === 'llm' ? 'LLM' : 'local rules'}
      </span>
      <span className={`badge ${health.youtubeApiConfigured ? 'badge-ok' : 'badge-muted'}`}>
        {health.youtubeApiConfigured ? 'YouTube API' : 'oEmbed'}
      </span>
    </>
  )
}

export default function App() {
  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <Link to="/" className="brand">
            YouTube AI Studio
          </Link>
          <nav className="nav">
            <NavLink to="/" end className="nav-link">
              Videos
            </NavLink>
            <span className="nav-spacer" />
            <HealthBadge />
          </nav>
        </div>
      </header>
      <main className="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/videos/:id" element={<VideoDetail />} />
          <Route
            path="*"
            element={
              <p className="muted">
                Page not found. <Link to="/">Go home</Link>
              </p>
            }
          />
        </Routes>
      </main>
      <footer className="footer">
        AI titles, descriptions, tags and summaries for your YouTube content.
      </footer>
    </div>
  )
}
