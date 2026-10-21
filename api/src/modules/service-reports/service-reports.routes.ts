import { Router, Response } from 'express'
import { authenticate, AuthRequest } from '../../middlewares/auth.middleware'
import { serviceReportsService } from './service-reports.service'

const router = Router()
router.use(authenticate)

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { status, clientId, equipmentId, dateFrom, dateTo } = req.query as Record<string, string>
    res.json(await serviceReportsService.findAll(req.user!.companyId, { status, clientId, equipmentId, dateFrom, dateTo }))
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    res.json(await serviceReportsService.findOne(req.user!.companyId, String(req.params.id)))
  } catch (err: unknown) {
    res.status(404).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    res.status(201).json(await serviceReportsService.create(req.user!.companyId, req.body))
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    res.json(await serviceReportsService.update(req.user!.companyId, String(req.params.id), req.body))
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    res.json(await serviceReportsService.delete(req.user!.companyId, String(req.params.id)))
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.post('/liquidate', async (req: AuthRequest, res: Response) => {
  try {
    res.status(201).json(await serviceReportsService.liquidate(req.user!.companyId, req.body))
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.patch('/:id/unliquidate', async (req: AuthRequest, res: Response) => {
  try {
    res.json(await serviceReportsService.unliquidate(req.user!.companyId, String(req.params.id)))
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

export default router
