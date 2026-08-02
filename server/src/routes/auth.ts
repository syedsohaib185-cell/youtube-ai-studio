import { Router, type Response } from 'express'
import { z } from 'zod'
import type { AppConfig } from '../config.js'
import type { StudioDatabase } from '../db.js'
import {
  type AuthenticatedRequest,
  hashPassword,
  signToken,
  verifyPassword,
} from '../auth.js'

const registerSchema = z.object({
  email: z.string().email('A valid email is required'),
  name: z.string().min(1, 'Name is required').max(80),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
})

const loginSchema = z.object({
  email: z.string().email('A valid email is required'),
  password: z.string().min(1, 'Password is required'),
})

const profileSchema = z.object({
  name: z.string().min(1, 'Name is required').max(80),
})

export interface AuthDeps {
  db: StudioDatabase
  config: AppConfig
}

function sendToken(res: Response, user: { id: number; email: string }, config: AppConfig): void {
  const token = signToken({ sub: user.id, email: user.email }, config.auth.jwtSecret, config.auth.tokenTtlSeconds)
  res.json({ token, user })
}

export function createAuthRouter(deps: AuthDeps, requireAuth: (req: AuthenticatedRequest, res: Response, next: import('express').NextFunction) => void): Router {
  const router = Router()

  router.post('/register', async (req, res) => {
    const parsed = registerSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' })
      return
    }

    if (deps.db.getUserByEmail(parsed.data.email)) {
      res.status(409).json({ error: 'An account with this email already exists' })
      return
    }

    const passwordHash = await hashPassword(parsed.data.password)
    const user = deps.db.createUser(parsed.data.email, parsed.data.name, passwordHash)
    sendToken(res, user, deps.config)
  })

  router.post('/login', async (req, res) => {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' })
      return
    }

    const user = deps.db.getUserByEmail(parsed.data.email)
    if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      res.status(401).json({ error: 'Invalid email or password' })
      return
    }

    const { passwordHash: _passwordHash, ...safeUser } = user
    sendToken(res, safeUser, deps.config)
  })

  router.get('/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    res.json({ user: req.user })
  })

  router.put('/profile', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const parsed = profileSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' })
      return
    }
    const user = deps.db.updateUserName(req.user!.id, parsed.data.name.trim())
    if (!user) {
      res.status(404).json({ error: 'User not found' })
      return
    }
    res.json({ user })
  })

  return router
}
