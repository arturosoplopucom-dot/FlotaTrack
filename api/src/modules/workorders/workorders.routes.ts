import { Router, Response } from 'express'
import { authenticate, AuthRequest } from '../../middlewares/auth.middleware'
import { workOrdersService } from './workorders.service'
import { sunatService } from '../sunat/sunat.service'
import { generateInvoicePdfServer } from '../invoices/invoice-pdf.server'
import { prisma } from '../../config/database'

const router = Router()
router.use(authenticate)

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    res.json(await workOrdersService.findAll(req.user!.companyId, req.query.status as any))
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    res.json(await workOrdersService.findOne(req.user!.companyId, String(req.params.id)))
  } catch (err: unknown) {
    res.status(404).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.get('/:id/invoice-pdf', async (req: AuthRequest, res: Response) => {
  try {
    const wo = await workOrdersService.findOne(req.user!.companyId, String(req.params.id))
    if (!wo.invoice) { res.status(404).json({ message: 'Esta OT no tiene factura vinculada' }); return }
    const { series, number } = wo.invoice
    const filename = `${series}-${number.padStart(8, '0')}.pdf`

    let buf: Buffer | undefined
    try {
      buf = await sunatService.fetchInvoicePdf(req.user!.companyId, series, number)
    } catch {
      const inv = await prisma.invoice.findFirst({
        where: { companyId: req.user!.companyId, series, number },
        include: { client: true },
      })
      if (!inv) throw new Error('Factura no encontrada')
      const company = await prisma.company.findUnique({ where: { id: req.user!.companyId } })
      if (!company) throw new Error('Empresa no encontrada')
      buf = await generateInvoicePdfServer(inv, company)
    }

    res.set('Content-Type', 'application/pdf')
    res.set('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(buf)
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'PDF no disponible' })
  }
})

router.get('/:id/available-invoices', async (req: AuthRequest, res: Response) => {
  try {
    res.json(await workOrdersService.getAvailableInvoices(req.user!.companyId, String(req.params.id)))
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    res.status(201).json(await workOrdersService.create(req.user!.companyId, req.body))
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    res.json(await workOrdersService.update(req.user!.companyId, String(req.params.id), req.body))
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.patch('/:id/status', async (req: AuthRequest, res: Response) => {
  try {
    res.json(await workOrdersService.updateStatus(req.user!.companyId, String(req.params.id), req.body.status))
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.patch('/:id/send', async (req: AuthRequest, res: Response) => {
  try {
    res.json(await workOrdersService.markSent(req.user!.companyId, String(req.params.id)))
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.patch('/:id/accept', async (req: AuthRequest, res: Response) => {
  try {
    res.json(await workOrdersService.markAccepted(req.user!.companyId, String(req.params.id)))
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.patch('/:id/link-invoice', async (req: AuthRequest, res: Response) => {
  try {
    const { invoiceId } = req.body
    if (!invoiceId) { res.status(400).json({ message: 'invoiceId requerido' }); return }
    res.json(await workOrdersService.linkInvoice(req.user!.companyId, String(req.params.id), invoiceId))
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.post('/:id/costs', async (req: AuthRequest, res: Response) => {
  try {
    res.status(201).json(await workOrdersService.addCost(req.user!.companyId, String(req.params.id), req.body))
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.delete('/:id/costs/:costId', async (req: AuthRequest, res: Response) => {
  try {
    res.json(await workOrdersService.deleteCost(req.user!.companyId, String(req.params.id), String(req.params.costId)))
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.patch('/:id/hours', async (req: AuthRequest, res: Response) => {
  try {
    const qty = parseFloat(req.body.quantity)
    if (isNaN(qty) || qty < 0) { res.status(400).json({ message: 'Cantidad inválida' }); return }
    res.json(await workOrdersService.updateActualHours(req.user!.companyId, String(req.params.id), qty))
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

export default router
