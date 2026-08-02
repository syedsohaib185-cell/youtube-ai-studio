import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Express } from 'express'
import request from 'supertest'
import { buildTestApp } from './helpers.js'

describe('Auth API', () => {
  let app: Express
  let db: { close: () => void }

  beforeAll(() => {
    const built = buildTestApp()
    app = built.app
    db = built.db
  })

  afterAll(() => {
    db.close()
  })

  it('registers a user and returns a token', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'alice@example.com',
      name: 'Alice',
      password: 'password123',
    })
    expect(res.status).toBe(200)
    expect(res.body.token).toBeTruthy()
    expect(res.body.user.email).toBe('alice@example.com')
    expect(res.body.user.passwordHash).toBeUndefined()
  })

  it('rejects duplicate registration', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'alice@example.com',
      name: 'Alice',
      password: 'password123',
    })
    expect(res.status).toBe(409)
  })

  it('validates registration input', async () => {
    const shortPw = await request(app).post('/api/auth/register').send({
      email: 'bob@example.com',
      name: 'Bob',
      password: 'short',
    })
    expect(shortPw.status).toBe(400)

    const badEmail = await request(app).post('/api/auth/register').send({
      email: 'not-an-email',
      name: 'Bob',
      password: 'password123',
    })
    expect(badEmail.status).toBe(400)
  })

  it('logs in with valid credentials and rejects bad ones', async () => {
    const ok = await request(app).post('/api/auth/login').send({
      email: 'alice@example.com',
      password: 'password123',
    })
    expect(ok.status).toBe(200)
    expect(ok.body.token).toBeTruthy()

    const bad = await request(app).post('/api/auth/login').send({
      email: 'alice@example.com',
      password: 'wrong-password',
    })
    expect(bad.status).toBe(401)
  })

  it('protects /me and rejects invalid tokens', async () => {
    const noToken = await request(app).get('/api/auth/me')
    expect(noToken.status).toBe(401)

    const login = await request(app).post('/api/auth/login').send({
      email: 'alice@example.com',
      password: 'password123',
    })
    const token = login.body.token as string

    const ok = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)
    expect(ok.status).toBe(200)
    expect(ok.body.user.name).toBe('Alice')

    const invalid = await request(app).get('/api/auth/me').set('Authorization', 'Bearer nope')
    expect(invalid.status).toBe(401)
  })

  it('updates the profile name', async () => {
    const login = await request(app).post('/api/auth/login').send({
      email: 'alice@example.com',
      password: 'password123',
    })
    const token = login.body.token as string
    const res = await request(app)
      .put('/api/auth/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Alice Cooper' })
    expect(res.status).toBe(200)
    expect(res.body.user.name).toBe('Alice Cooper')
  })
})
