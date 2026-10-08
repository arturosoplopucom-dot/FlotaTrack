import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'

export interface AuthPayload {
  userId: string
  companyId: string
  role: string
}

export interface AuthRequest extends Request {
  user?: AuthPayload
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Token requerido' })
    return
  }
  const token = header.split(' ')[1]
  try {
    const payload = jwt.verify(token, env.jwtSecret) as AuthPayload
    req.user = payload
    next()
  } catch {
    res.status(401).json({ message: 'Token inválido o expirado' })
  }
}
