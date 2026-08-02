import { describe, expect, it } from 'vitest'
import { buildAuthUrl, YouTubeOAuthError } from '../src/services/youtubeAuth.js'

const creds = {
  clientId: 'client-id',
  clientSecret: 'secret',
  redirectUri: 'http://localhost:3001/api/youtube/callback',
}

describe('buildAuthUrl', () => {
  it('builds a Google OAuth consent URL with the right params', () => {
    const url = new URL(buildAuthUrl(creds, 'state-123'))
    expect(url.hostname).toBe('accounts.google.com')
    expect(url.searchParams.get('client_id')).toBe('client-id')
    expect(url.searchParams.get('redirect_uri')).toBe(creds.redirectUri)
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('prompt')).toBe('consent')
    expect(url.searchParams.get('state')).toBe('state-123')
    expect(url.searchParams.get('scope')).toContain('youtube.readonly')
    expect(url.searchParams.get('scope')).toContain('youtube.upload')
  })
})

describe('YouTubeOAuthError', () => {
  it('carries a status code', () => {
    const err = new YouTubeOAuthError('boom', 503)
    expect(err.status).toBe(503)
    expect(err.name).toBe('YouTubeOAuthError')
  })
})
