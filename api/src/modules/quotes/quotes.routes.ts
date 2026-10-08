import { Router, Response } from 'express'
import { QuoteStatus } from '@prisma/client'
import { authenticate, AuthRequest } from '../../middlewares/auth.middleware'
import { quotesService } from './quotes.service'

const router = Router()
router.use(authenticate)

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    res.json(await quotesService.findAll(req.user!.companyId, req.query.status as QuoteStatus | undefined))
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    res.json(await quotesService.findOne(req.user!.companyId, String(req.params.id)))
  } catch (err: unknown) {
    res.status(404).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    res.status(201).json(await quotesService.create(req.user!.companyId, req.body))
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    res.json(await quotesService.update(req.user!.companyId, String(req.params.id), req.body))
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.patch('/:id/status', async (req: AuthRequest, res: Response) => {
  try {
    const { status, rejectionNotes, workOrderId } = req.body
    if (!status) { res.status(400).json({ message: 'status requerido' }); return }
    res.json(await quotesService.updateStatus(req.user!.companyId, String(req.params.id), status, rejectionNotes, workOrderId))
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    res.json(await quotesService.delete(req.user!.companyId, String(req.params.id)))
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

export default router
