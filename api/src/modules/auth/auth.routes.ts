import { Router, Request, Response } from 'express'
import { authService } from './auth.service'

const router = Router()

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password, ruc } = req.body
    if (!email || !password || !ruc) {
      res.status(400).json({ message: 'email, password y ruc son requeridos' })
      return
    }
    const result = await authService.login(email, password, ruc)
    res.json(result)
  } catch (err: unknown) {
    res.status(401).json({ message: err instanceof Error ? err.message : 'Error de autenticación' })
  }
})

router.post('/register', async (req: Request, res: Response) => {
  try {
    const result = await authService.register(req.body)
    res.status(201).json(result)
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : 'Error al registrar' })
  }
})

export default router
