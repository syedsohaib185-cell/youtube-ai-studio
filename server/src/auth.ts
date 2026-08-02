import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import type { User } from './types.js'

export interface AuthPayload {
  sub: number
  email: string
}

export interface AuthenticatedRequest extends Request {
  user?: User
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

export function signToken(payload: AuthPayload, secret: string, ttlSeconds: number): string {
  return jwt.sign(payload, secret, { expiresIn: ttlSeconds })
}

export function verifyToken(token: string, secret: string): AuthPayload | null {
  try {
    const decoded = jwt.verify(token, secret)
    if (typeof decoded === 'string' || typeof decoded.sub !== 'number') return null
    return { sub: decoded.sub, email: String(decoded.email ?? '') }
  } catch {
    return null
  }
}

export function createAuthMiddleware(getUser: (id: number) => User | null, secret: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const header = req.headers.authorization
    if (!header?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    const payload = verifyToken(header.slice('Bearer '.length).trim(), secret)
    if (!payload) {
      res.status(401).json({ error: 'Invalid or expired token' })
      return
    }

    const user = getUser(payload.sub)
    if (!user) {
      res.status(401).json({ error: 'User no longer exists' })
      return
    }

    req.user = user
    next()
  }
}
