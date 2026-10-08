import { Router, Response } from 'express'
import { authenticate, AuthRequest } from '../../middlewares/auth.middleware'
import { invoicesService } from './invoices.service'
import { runAlertsCheck } from '../../jobs/alerts.job'
import { sunatService } from '../sunat/sunat.service'
import { generateInvoicePdfServer } from './invoice-pdf.server'
import { prisma } from '../../config/database'
import { emailService } from '../../utils/email.service'

const router = Router()
router.use(authenticate)

router.get('/dashboard', async (req: AuthRequest, res: Response) => {
  try {
    const data = await invoicesService.dashboard(req.user!.companyId)
    res.json(data)
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { status, clientId, dueBefore, dueAfter, search, page, limit } = req.query
    const data = await invoicesService.findAll(req.user!.companyId, {
      status: status as any,
      clientId: clientId as string,
      dueBefore: dueBefore ? new Date(dueBefore as string) : undefined,
      dueAfter: dueAfter ? new Date(dueAfter as string) : undefined,
      search: search as string | undefined,
      page: page ? parseInt(page as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
    })
    res.json(data)
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.get('/aging', async (req: AuthRequest, res: Response) => {
  try {
    const data = await invoicesService.aging(req.user!.companyId, req.query.asOf as string | undefined)
    res.json(data)
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.get('/aging/client/:clientId', async (req: AuthRequest, res: Response) => {
  try {
    const data = await invoicesService.agingClientDetail(
      req.user!.companyId,
      String(req.params.clientId),
      req.query.asOf as string | undefined,
    )
    res.json(data)
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.get('/analytics', async (req: AuthRequest, res: Response) => {
  try {
    const data = await invoicesService.analytics(req.user!.companyId)
    res.json(data)
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.get('/payments', async (req: AuthRequest, res: Response) => {
  try {
    const { page, limit } = req.query
    const data = await invoicesService.listPayments(
      req.user!.companyId,
      page ? parseInt(page as string) : 1,
      limit ? parseInt(limit as string) : 50,
    )
    res.json(data)
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.post('/bulk-pay', async (req: AuthRequest, res: Response) => {
  try {
    const { ids, paidAt, reference } = req.body
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ message: 'Se requiere al menos una factura' }); return
    }
    if (ids.length > 200) {
      res.status(400).json({ message: 'Máximo 200 facturas por operación' }); return
    }
    const paidDate = paidAt ? new Date(paidAt) : new Date()
    const ref      = (reference as string | undefined) || 'Cobro histórico'
    const invoices = await prisma.invoice.findMany({
      where: { id: { in: ids }, companyId: req.user!.companyId, status: { not: 'PAID' } },
      include: { payments: true },
    })
    let updated = 0
    for (const inv of invoices) {
      const alreadyPaid = inv.payments.reduce((s, p) => s + Number(p.amount), 0)
      const detraccion  = Number((inv as any).detraccion ?? 0)
      const remaining   = Math.max(0, Number(inv.total) - detraccion - alreadyPaid)
      if (remaining > 0) {
        await prisma.$transaction([
          prisma.payment.create({
            data: { invoiceId: inv.id, amount: remaining, method: 'TRANSFER', reference: ref, paidAt: paidDate },
          }),
          prisma.invoice.update({ where: { id: inv.id }, data: { status: 'PAID' } }),
        ])
      } else {
        await prisma.invoice.update({ where: { id: inv.id }, data: { status: 'PAID' } })
      }
      updated++
    }
    res.json({ updated, total: ids.length })
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.post('/alerts/run', async (req: AuthRequest, res: Response) => {
  try {
    const clientIds: string[] | undefined = Array.isArray(req.body?.clientIds) ? req.body.clientIds : undefined
    const sent = await runAlertsCheck(clientIds)
    res.json({ sent, message: `${sent} alerta${sent !== 1 ? 's' : ''} enviada${sent !== 1 ? 's' : ''}` })
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.post('/parse-xml', async (req: AuthRequest, res: Response) => {
  try {
    const { files } = req.body
    if (!Array.isArray(files) || files.length === 0) {
      res.status(400).json({ message: 'No se recibieron archivos XML' })
      return
    }
    if (files.length > 100) {
      res.status(400).json({ message: 'Máximo 100 archivos por solicitud' })
      return
    }
    const result = await invoicesService.parseXmlFiles(req.user!.companyId, files)
    res.json(result)
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.post('/:id/send-email', async (req: AuthRequest, res: Response) => {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id, companyId: req.user!.companyId },
      include: {
        client:  { select: { businessName: true, ruc: true, address: true, email: true, whatsapp: true } },
        company: { select: { name: true, ruc: true, address: true, phone: true, email: true, smtpConfig: true } },
      },
    })
    if (!invoice) { res.status(404).json({ message: 'Factura no encontrada' }); return }
    if (!invoice.client.email) { res.status(422).json({ message: 'El cliente no tiene email registrado' }); return }

    if (invoice.status === 'PAID') {
      const co = invoice.company as { name: string; ruc: string; address: string | null; phone: string | null; email: string | null; smtpConfig: unknown }
      const pdfBuffer = await generateInvoicePdfServer(invoice, {
        name:    co.name,
        ruc:     co.ruc,
        address: co.address,
        phone:   co.phone,
        email:   co.email,
      })
      await emailService.sendInvoiceReceipt(invoice, pdfBuffer)
    } else {
      const daysUntilDue = Math.floor((invoice.dueDate.getTime() - Date.now()) / 86400000)
      if (invoice.status === 'OVERDUE' || invoice.status === 'PARTIAL' || daysUntilDue < 0) {
        await emailService.sendOverdueAlert(invoice)
      } else {
        await emailService.sendDueSoonAlert(invoice, daysUntilDue)
      }
    }
    res.json({ ok: true, to: invoice.client.email })
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Error al enviar el correo' })
  }
})

router.get('/:id/pdf', async (req: AuthRequest, res: Response) => {
  try {
    const inv = await invoicesService.findOne(req.user!.companyId, req.params.id as string)
    const filename = `${inv.series}-${inv.number.padStart(8, '0')}.pdf`

    let buf: Buffer | undefined

    // Intento 1: archivo local o SUNAT CPE API
    try {
      buf = await sunatService.fetchInvoicePdf(req.user!.companyId, inv.series, inv.number)
    } catch {
      // Intento 2: generación local desde datos de la factura
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

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const data = await invoicesService.findOne(req.user!.companyId, req.params.id as string)
    res.json(data)
  } catch (err: unknown) {
    res.status(404).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const data = await invoicesService.create(req.user!.companyId, req.body)
    res.status(201).json(data)
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.patch('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const data = await invoicesService.update(req.user!.companyId, req.params.id as string, req.body)
    res.json(data)
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.post('/:id/payments', async (req: AuthRequest, res: Response) => {
  try {
    const data = await invoicesService.registerPayment(
      req.user!.companyId,
      req.params.id as string,
      req.body  // incluye cuotaId opcional
    )
    res.status(201).json(data)
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

export default router
