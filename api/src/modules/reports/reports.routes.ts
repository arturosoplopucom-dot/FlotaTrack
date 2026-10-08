import { Router, Response } from 'express'
import { authenticate, AuthRequest } from '../../middlewares/auth.middleware'
import { reportsService, ReportPeriod } from './reports.service'

const VALID_PERIODS: ReportPeriod[] = ['1m', '3m', '6m', '1y', 'all']

function parseDates(q: Record<string, any>): { dateFrom?: Date; dateTo?: Date } {
  const dateFrom = q.dateFrom ? new Date(q.dateFrom as string) : undefined
  const dateTo   = q.dateTo   ? new Date(q.dateTo   as string) : undefined
  return { dateFrom, dateTo }
}

const router = Router()
router.use(authenticate)

router.get('/profitability', async (req: AuthRequest, res: Response) => {
  try {
    const period = (VALID_PERIODS.includes(req.query.period as ReportPeriod)
      ? req.query.period : '6m') as ReportPeriod
    res.json(await reportsService.getProfitability(req.user!.companyId, period))
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.get('/equipment', async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.query
    res.json(await reportsService.getEquipmentReport(
      req.user!.companyId,
      { status: status as string | undefined, ...parseDates(req.query) },
    ))
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.get('/work-orders', async (req: AuthRequest, res: Response) => {
  try {
    const { status, clientId, equipmentId } = req.query
    res.json(await reportsService.getWorkOrdersReport(
      req.user!.companyId,
      {
        status:      status      as string | undefined,
        clientId:    clientId    as string | undefined,
        equipmentId: equipmentId as string | undefined,
        ...parseDates(req.query),
      },
    ))
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.get('/invoices', async (req: AuthRequest, res: Response) => {
  try {
    const { status, clientId } = req.query
    res.json(await reportsService.getInvoicesReport(
      req.user!.companyId,
      { status: status as string | undefined, clientId: clientId as string | undefined, ...parseDates(req.query) },
    ))
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.get('/quotes', async (req: AuthRequest, res: Response) => {
  try {
    const { status, clientId } = req.query
    res.json(await reportsService.getQuotesReport(
      req.user!.companyId,
      { status: status as string | undefined, clientId: clientId as string | undefined, ...parseDates(req.query) },
    ))
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.get('/maintenance', async (req: AuthRequest, res: Response) => {
  try {
    const { equipmentId } = req.query
    res.json(await reportsService.getMaintenanceReport(
      req.user!.companyId,
      { equipmentId: equipmentId as string | undefined, ...parseDates(req.query) },
    ))
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.get('/clients', async (req: AuthRequest, res: Response) => {
  try {
    res.json(await reportsService.getClientsReport(req.user!.companyId, parseDates(req.query)))
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.get('/payments', async (req: AuthRequest, res: Response) => {
  try {
    const { method } = req.query
    res.json(await reportsService.getPaymentsReport(
      req.user!.companyId,
      { method: method as string | undefined, ...parseDates(req.query) },
    ))
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.get('/equipment-profitability', async (req: AuthRequest, res: Response) => {
  try {
    const period = (VALID_PERIODS.includes(req.query.period as ReportPeriod)
      ? req.query.period : '6m') as ReportPeriod
    res.json(await reportsService.getEquipmentProfitability(
      req.user!.companyId,
      { period, ...parseDates(req.query) },
    ))
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

export default router
