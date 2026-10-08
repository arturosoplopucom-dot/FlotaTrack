import { Router, Response } from 'express'
import { authenticate, AuthRequest } from '../../middlewares/auth.middleware'
import { prisma } from '../../config/database'
import { emailService } from '../../utils/email.service'

const router = Router()
router.use(authenticate)

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.user!.companyId },
      select: {
        id: true, name: true, ruc: true, phone: true, email: true,
        address: true, logoUrl: true, smtpConfig: true, plan: true,
      },
    })
    if (!company) { res.status(404).json({ message: 'Empresa no encontrada' }); return }
    res.json(company)
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.patch('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, ruc, phone, email, address, logoUrl, smtpConfig } = req.body
    const updated = await prisma.company.update({
      where: { id: req.user!.companyId },
      data: {
        ...(name       !== undefined && { name }),
        ...(ruc        !== undefined && { ruc }),
        ...(phone      !== undefined && { phone }),
        ...(email      !== undefined && { email }),
        ...(address    !== undefined && { address }),
        ...(logoUrl    !== undefined && { logoUrl }),
        ...(smtpConfig !== undefined && { smtpConfig }),
      },
      select: {
        id: true, name: true, ruc: true, phone: true, email: true,
        address: true, logoUrl: true, smtpConfig: true, plan: true,
      },
    })
    res.json(updated)
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.post('/smtp/test', async (req: AuthRequest, res: Response) => {
  try {
    const { host, port, user, pass, from, secure } = req.body
    if (!host || !user || !pass) {
      res.status(400).json({ ok: false, error: 'host, user y pass son requeridos' })
      return
    }
    const result = await emailService.testConnection({ host, port, user, pass, from, secure })
    res.json(result)
  } catch (err: unknown) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Error' })
  }
})

export default router
