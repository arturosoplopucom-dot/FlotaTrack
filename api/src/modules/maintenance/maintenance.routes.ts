import { Router, Response } from 'express'
import { authenticate, AuthRequest } from '../../middlewares/auth.middleware'
import { maintenanceService } from './maintenance.service'

const router = Router()
router.use(authenticate)

// ── Plans ─────────────────────────────────────────────────────────────────────

router.get('/plans', async (req: AuthRequest, res: Response) => {
  try {
    res.json(await maintenanceService.findAllPlans(
      req.user!.companyId,
      req.query.equipmentId as string | undefined,
    ))
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.get('/plans/:id', async (req: AuthRequest, res: Response) => {
  try {
    res.json(await maintenanceService.findPlan(req.user!.companyId, String(req.params.id)))
  } catch (err: unknown) {
    res.status(404).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.post('/plans', async (req: AuthRequest, res: Response) => {
  try {
    res.status(201).json(await maintenanceService.createPlan(req.user!.companyId, req.body))
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.put('/plans/:id', async (req: AuthRequest, res: Response) => {
  try {
    res.json(await maintenanceService.updatePlan(req.user!.companyId, String(req.params.id), req.body))
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.delete('/plans/:id', async (req: AuthRequest, res: Response) => {
  try {
    res.json(await maintenanceService.deletePlan(req.user!.companyId, String(req.params.id)))
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

// ── Records ───────────────────────────────────────────────────────────────────

router.get('/records', async (req: AuthRequest, res: Response) => {
  try {
    res.json(await maintenanceService.findAllRecords(
      req.user!.companyId,
      req.query.equipmentId as string | undefined,
    ))
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.post('/records', async (req: AuthRequest, res: Response) => {
  try {
    res.status(201).json(await maintenanceService.createRecord(req.user!.companyId, req.body))
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.delete('/records/:id', async (req: AuthRequest, res: Response) => {
  try {
    res.json(await maintenanceService.deleteRecord(req.user!.companyId, String(req.params.id)))
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

// ── Sessions ──────────────────────────────────────────────────────────────────

router.get('/sessions/history', async (req: AuthRequest, res: Response) => {
  try {
    const { from, to, equipmentId } = req.query as Record<string, string>
    res.json(await maintenanceService.getSessionHistory(req.user!.companyId, { from, to, equipmentId }))
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.get('/sessions/active', async (req: AuthRequest, res: Response) => {
  try {
    res.json(await maintenanceService.findActiveSessions(req.user!.companyId))
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.post('/sessions', async (req: AuthRequest, res: Response) => {
  try {
    res.status(201).json(await maintenanceService.startSession(req.user!.companyId, req.body))
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.patch('/sessions/:id/complete', async (req: AuthRequest, res: Response) => {
  try {
    res.json(await maintenanceService.completeSession(req.user!.companyId, String(req.params.id), req.body))
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.patch('/sessions/:id/cancel', async (req: AuthRequest, res: Response) => {
  try {
    await maintenanceService.cancelSession(req.user!.companyId, String(req.params.id))
    res.json({ ok: true })
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

// ── Summary ───────────────────────────────────────────────────────────────────

router.get('/summary', async (req: AuthRequest, res: Response) => {
  try {
    res.json(await maintenanceService.getSummary(req.user!.companyId))
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

export default router
