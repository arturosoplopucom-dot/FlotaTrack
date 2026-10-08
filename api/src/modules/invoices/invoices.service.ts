import { Prisma, InvoiceStatus } from '@prisma/client'
import { prisma } from '../../config/database'

// ─── Helpers ──────────────────────────────────────────────────────────────────

type ParsedCuota = { number: number; dueDate: Date; amount: number }

function parseInvoiceXml(xml: string): {
  series: string; number: string; detraccion: number; dueDate: Date | null
  detraccionCode: string; cuentaBN: string; cuotas: ParsedCuota[]
} | null {
  const idMatch = xml.match(/<cbc:ID>([A-Z][A-Z\d]{2,3}-\d+)<\/cbc:ID>/)
  if (!idMatch) return null
  const fullId = idMatch[1]
  const dash = fullId.lastIndexOf('-')
  const series = fullId.substring(0, dash)
  const number = fullId.substring(dash + 1)

  const blocks = xml.match(/<cac:PaymentTerms>[\s\S]*?<\/cac:PaymentTerms>/g) ?? []
  let detraccion = 0
  let detraccionCode = ''
  const cuotas: ParsedCuota[] = []

  for (const block of blocks) {
    const bid = (block.match(/<cbc:ID>([^<]+)<\/cbc:ID>/)?.[1] ?? '').trim()
    if (bid === 'Detraccion') {
      const amt = block.match(/<cbc:Amount[^>]*>([\d.]+)<\/cbc:Amount>/)
      if (amt) detraccion = parseFloat(amt[1])
      detraccionCode = (block.match(/<cbc:PaymentMeansID>([^<]+)<\/cbc:PaymentMeansID>/)?.[1] ?? '').trim()
    }
    const cuotaMatch = bid.match(/^Cuota(\d+)$/i)
    if (cuotaMatch) {
      const dateStr = block.match(/<cbc:PaymentDueDate>([\d-]+)<\/cbc:PaymentDueDate>/)?.[1]
      const amtStr  = block.match(/<cbc:Amount[^>]*>([\d.]+)<\/cbc:Amount>/)?.[1]
      if (dateStr) {
        cuotas.push({
          number: parseInt(cuotaMatch[1], 10),
          dueDate: new Date(dateStr),
          amount: amtStr ? parseFloat(amtStr) : 0,
        })
      }
    }
  }

  // dueDate de la factura = última cuota, o null si no hay cuotas
  cuotas.sort((a, b) => a.number - b.number)
  const dueDate = cuotas.length > 0 ? cuotas[cuotas.length - 1].dueDate : null

  const cuentaBN = (
    xml.match(/<cac:PaymentMeans>[\s\S]*?<cac:PayeeFinancialAccount>[\s\S]*?<cbc:ID>(\d{8,20})<\/cbc:ID>/)?.[1] ??
    xml.match(/<cac:FinancialInstitutionBranch>[\s\S]*?<cbc:ID>(\d{8,20})<\/cbc:ID>/)?.[1] ?? ''
  )

  return { series, number, detraccion, dueDate, detraccionCode, cuentaBN, cuotas }
}

// Calcula status de factura a partir de sus cuotas (si las tiene)
function computeStatusFromCuotas(
  cuotas: { status: string }[],
  totalPaid: number,
  netCollectible: number,
): InvoiceStatus {
  if (cuotas.length === 0) {
    return totalPaid >= netCollectible - 0.01 ? 'PAID'
         : totalPaid > 0                      ? 'PARTIAL'
         : 'PENDING'
  }
  const allPaid    = cuotas.every(c => c.status === 'PAID')
  const somePaid   = cuotas.some(c => c.status === 'PAID')
  const anyOverdue = cuotas.some(c => c.status === 'OVERDUE')
  if (allPaid)    return 'PAID'
  if (somePaid)   return 'PARTIAL'
  if (anyOverdue) return 'OVERDUE'
  return 'PENDING'
}

export type InvoiceFilters = {
  status?: InvoiceStatus
  clientId?: string
  dueBefore?: Date
  dueAfter?: Date
  search?: string
  page?: number
  limit?: number
}

export const invoicesService = {
  async dashboard(companyId: string) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const in7Days = new Date(today)
    in7Days.setDate(in7Days.getDate() + 7)

    // Usar findMany para calcular saldo real (total - detraccion - pagos parciales)
    const [unpaidInvoices, paidAgg] = await Promise.all([
      prisma.invoice.findMany({
        where: { companyId, status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } },
        select: { total: true, detraccion: true, dueDate: true, payments: { select: { amount: true } } },
      }),
      prisma.invoice.aggregate({
        where: { companyId, status: 'PAID' },
        _sum: { total: true },
        _count: true,
      }),
    ])

    const balance = (inv: { total: unknown; detraccion: unknown; payments: { amount: unknown }[] }) => {
      const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0)
      const det  = Number((inv as any).detraccion ?? 0)
      return Math.max(0, Number(inv.total) - det - paid)
    }

    const overdueInvs  = unpaidInvoices.filter((i) => i.dueDate < today)
    const dueSoonInvs  = unpaidInvoices.filter((i) => i.dueDate >= today && i.dueDate <= in7Days)
    const currentInvs  = unpaidInvoices.filter((i) => i.dueDate > in7Days)

    return {
      overdue: { amount: overdueInvs.reduce((s, i) => s + balance(i), 0), count: overdueInvs.length },
      dueSoon: { amount: dueSoonInvs.reduce((s, i) => s + balance(i), 0), count: dueSoonInvs.length },
      current: { amount: currentInvs.reduce((s, i) => s + balance(i), 0), count: currentInvs.length },
      paid: { amount: Number(paidAgg._sum.total || 0), count: paidAgg._count },
      totalPending: unpaidInvoices.reduce((s, i) => s + balance(i), 0),
    }
  },

  async findAll(companyId: string, filters: InvoiceFilters = {}) {
    const { status, clientId, dueBefore, dueAfter, search, page = 1, limit = 50 } = filters
    const skip = (page - 1) * limit

    const today2 = new Date(); today2.setHours(0, 0, 0, 0)
    const where: Prisma.InvoiceWhereInput = { companyId }
    if (status === 'OVERDUE') {
      where.status = { in: ['PENDING', 'PARTIAL', 'OVERDUE'] }
      where.dueDate = { lt: today2 }
    } else if (status) {
      where.status = status
    }
    if (clientId) where.clientId = clientId
    if (dueBefore || dueAfter) {
      where.dueDate = {}
      if (dueBefore) where.dueDate.lte = dueBefore
      if (dueAfter) where.dueDate.gte = dueAfter
    }
    if (search) {
      const q = search.trim()
      // Detectar si buscan por número de factura (ej: F001-00245 o solo 00245)
      const invoiceNumMatch = q.match(/^([A-Z]\d{3})-?(\d+)$/i)
      where.OR = invoiceNumMatch
        ? [
            { series: { equals: invoiceNumMatch[1].toUpperCase(), mode: 'insensitive' },
              number: { contains: invoiceNumMatch[2], mode: 'insensitive' } },
            { number: { contains: q, mode: 'insensitive' } },
          ]
        : [
            { client: { businessName: { contains: q, mode: 'insensitive' } } },
            { client: { ruc: { contains: q, mode: 'insensitive' } } },
            { series: { contains: q, mode: 'insensitive' } },
            { number: { contains: q, mode: 'insensitive' } },
          ]
    }

    const [items, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          client: { select: { businessName: true, ruc: true, whatsapp: true, email: true } },
          cuotas: { orderBy: { number: 'asc' } },
          workOrders: {
            select: {
              id: true, number: true, location: true, description: true,
              startDate: true, endDate: true, subtotal: true, status: true,
              equipment: { select: { name: true, type: true } },
              operator:  { select: { name: true } },
            },
          },
        },
        orderBy: { dueDate: 'asc' },
        skip,
        take: limit,
      }),
      prisma.invoice.count({ where }),
    ])

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const enriched = items.map((inv) => {
      const daysUntilDue = Math.ceil(
        (inv.dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      )
      let urgency: 'overdue' | 'critical' | 'warning' | 'ok' = 'ok'
      if (inv.status === 'PAID') urgency = 'ok'
      else if (daysUntilDue < 0) urgency = 'overdue'
      else if (daysUntilDue <= 7) urgency = 'critical'
      else if (daysUntilDue <= 15) urgency = 'warning'

      return { ...inv, daysUntilDue, urgency }
    })

    return { items: enriched, total, page, totalPages: Math.ceil(total / limit) }
  },

  async findOne(companyId: string, id: string) {
    const invoice = await prisma.invoice.findFirst({
      where: { id, companyId },
      include: {
        client: true,
        payments: { orderBy: { paidAt: 'desc' } },
        cuotas: { orderBy: { number: 'asc' } },
      },
    })
    if (!invoice) throw new Error('Factura no encontrada')
    return invoice
  },

  async create(companyId: string, data: {
    clientId: string
    number: string
    series?: string
    description?: string
    amount: number
    igv?: number
    detraccion?: number
    issueDate: string
    dueDate: string
    currency?: 'PEN' | 'USD'
    notes?: string
  }) {
    const client = await prisma.client.findFirst({ where: { id: data.clientId, companyId } })
    if (!client) throw new Error('Cliente no encontrado')

    const amount = new Prisma.Decimal(data.amount)
    const igv = new Prisma.Decimal(data.igv ?? 0)
    const total = amount.plus(igv)

    return prisma.invoice.create({
      data: {
        companyId,
        clientId: data.clientId,
        number: data.number,
        series: data.series ?? 'F001',
        description: data.description,
        amount,
        igv,
        total,
        detraccion: new Prisma.Decimal(data.detraccion ?? 0),
        issueDate: new Date(data.issueDate),
        dueDate: new Date(data.dueDate),
        currency: data.currency ?? 'PEN',
        notes: data.notes,
      },
      include: { client: { select: { businessName: true, ruc: true } } },
    })
  },

  async update(companyId: string, invoiceId: string, data: {
    detraccion?: number
    dueDate?: string
    notes?: string
    status?: InvoiceStatus
  }) {
    const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, companyId } })
    if (!invoice) throw new Error('Factura no encontrada')
    return prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        ...(data.detraccion !== undefined && { detraccion: new Prisma.Decimal(data.detraccion) }),
        ...(data.dueDate    !== undefined && { dueDate: new Date(data.dueDate) }),
        ...(data.notes      !== undefined && { notes: data.notes }),
        ...(data.status     !== undefined && { status: data.status }),
      },
      include: { client: { select: { businessName: true, ruc: true } } },
    })
  },

  async registerPayment(companyId: string, invoiceId: string, data: {
    amount: number
    method?: 'CASH' | 'TRANSFER' | 'CHECK' | 'DEPOSIT'
    reference?: string
    paidAt?: string
    notes?: string
    cuotaId?: string   // si se paga una cuota específica
  }) {
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, companyId },
      include: {
        payments: { select: { amount: true } },
        cuotas:   { orderBy: { number: 'asc' } },
      },
    })
    if (!invoice) throw new Error('Factura no encontrada')
    if (invoice.status === 'PAID') throw new Error('La factura ya está pagada')

    // Validar cuota si se especificó
    if (data.cuotaId) {
      const cuota = invoice.cuotas.find(c => c.id === data.cuotaId)
      if (!cuota) throw new Error('Cuota no encontrada en esta factura')
      if (cuota.status === 'PAID') throw new Error('Esta cuota ya está pagada')
      // pago existente vinculado a esta cuota?
      const existing = await prisma.payment.findUnique({ where: { cuotaId: data.cuotaId } })
      if (existing) throw new Error('Ya existe un pago registrado para esta cuota')
    }

    const paidAt = data.paidAt ? new Date(data.paidAt) : new Date()

    const payment = await prisma.payment.create({
      data: {
        invoiceId,
        cuotaId: data.cuotaId ?? null,
        amount: new Prisma.Decimal(data.amount),
        method: data.method ?? 'TRANSFER',
        reference: data.reference,
        paidAt,
        notes: data.notes,
      },
    })

    // Actualizar estado de la cuota pagada
    if (data.cuotaId) {
      await prisma.invoiceCuota.update({
        where: { id: data.cuotaId },
        data: { status: 'PAID', paidAt },
      })
    }

    // Recalcular estado de la factura
    const allPayments = await prisma.payment.aggregate({
      where: { invoiceId },
      _sum: { amount: true },
    })
    const totalPaid      = Number(allPayments._sum.amount ?? 0)
    const totalInvoice   = Number(invoice.total)
    const detraccion     = Number((invoice as any).detraccion ?? 0)
    const netCollectible = Math.round((totalInvoice - detraccion) * 100) / 100

    // Recargar cuotas actualizadas para calcular status correcto
    const updatedCuotas = await prisma.invoiceCuota.findMany({ where: { invoiceId } })
    const newStatus      = computeStatusFromCuotas(updatedCuotas, totalPaid, netCollectible)

    await prisma.invoice.update({ where: { id: invoiceId }, data: { status: newStatus } })

    // Sincronizar WorkOrders vinculadas: BILLED si parcial/pendiente, PAID si completamente pagada
    if (invoice.workOrders === undefined) {
      // No vienen en este query, actualizar por invoiceId
    }
    await prisma.workOrder.updateMany({
      where: { invoiceId },
      data: { status: newStatus === 'PAID' ? 'PAID' : 'BILLED' },
    })

    return { payment, status: newStatus, totalPaid, balance: netCollectible - totalPaid }
  },

  async aging(companyId: string, asOfParam?: string) {
    const today = asOfParam ? new Date(asOfParam) : new Date()
    today.setHours(0, 0, 0, 0)

    const invoices = await prisma.invoice.findMany({
      where: { companyId, status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } },
      include: {
        client: { select: { businessName: true, ruc: true, email: true, whatsapp: true } },
        payments: { select: { amount: true } },
      },
      orderBy: [{ client: { businessName: 'asc' } }, { dueDate: 'asc' }],
    })

    const clientMap = new Map<string, {
      clientName: string; ruc: string; email: string | null; whatsapp: string | null
      current: number; d1_30: number; d31_60: number; d61_90: number; d90plus: number
      total: number; count: number
    }>()

    for (const inv of invoices) {
      const totalPaid = inv.payments.reduce((s, p) => s + Number(p.amount), 0)
      const balance = Math.round((Number(inv.total) - totalPaid) * 100) / 100
      if (balance <= 0.01) continue

      const daysOverdue = Math.floor(
        (today.getTime() - inv.dueDate.getTime()) / (1000 * 60 * 60 * 24)
      )

      if (!clientMap.has(inv.clientId)) {
        clientMap.set(inv.clientId, {
          clientName: inv.client.businessName, ruc: inv.client.ruc,
          email: inv.client.email ?? null, whatsapp: inv.client.whatsapp ?? null,
          current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0, total: 0, count: 0,
        })
      }

      const entry = clientMap.get(inv.clientId)!
      if (daysOverdue <= 0) entry.current += balance
      else if (daysOverdue <= 30) entry.d1_30 += balance
      else if (daysOverdue <= 60) entry.d31_60 += balance
      else if (daysOverdue <= 90) entry.d61_90 += balance
      else entry.d90plus += balance

      entry.total += balance
      entry.count++
    }

    const rows = Array.from(clientMap.entries()).map(([clientId, d]) => ({
      clientId, clientName: d.clientName, ruc: d.ruc, email: d.email, whatsapp: d.whatsapp, count: d.count,
      current: Math.round(d.current * 100) / 100,
      d1_30: Math.round(d.d1_30 * 100) / 100,
      d31_60: Math.round(d.d31_60 * 100) / 100,
      d61_90: Math.round(d.d61_90 * 100) / 100,
      d90plus: Math.round(d.d90plus * 100) / 100,
      total: Math.round(d.total * 100) / 100,
    }))

    const totals = rows.reduce(
      (acc, r) => ({
        current: acc.current + r.current,
        d1_30: acc.d1_30 + r.d1_30,
        d31_60: acc.d31_60 + r.d31_60,
        d61_90: acc.d61_90 + r.d61_90,
        d90plus: acc.d90plus + r.d90plus,
        total: acc.total + r.total,
      }),
      { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0, total: 0 }
    )

    return { rows, totals, asOf: today.toISOString() }
  },

  async agingClientDetail(companyId: string, clientId: string, asOfParam?: string) {
    const today = asOfParam ? new Date(asOfParam) : new Date()
    today.setHours(0, 0, 0, 0)

    const invoices = await prisma.invoice.findMany({
      where: { companyId, clientId, status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } },
      include: {
        client: { select: { businessName: true, ruc: true, phone: true, whatsapp: true, email: true } },
        payments: { select: { amount: true } },
      },
      orderBy: { dueDate: 'asc' },
    })

    const result = []
    for (const inv of invoices) {
      const totalPaid = inv.payments.reduce((s, p) => s + Number(p.amount), 0)
      const balance = Math.round((Number(inv.total) - totalPaid) * 100) / 100
      if (balance <= 0.01) continue

      const daysOverdue = Math.floor(
        (today.getTime() - inv.dueDate.getTime()) / (1000 * 60 * 60 * 24)
      )
      const bucket =
        daysOverdue <= 0 ? 'current' :
        daysOverdue <= 30 ? 'd1_30' :
        daysOverdue <= 60 ? 'd31_60' :
        daysOverdue <= 90 ? 'd61_90' : 'd90plus'

      result.push({
        id: inv.id,
        series: inv.series,
        number: inv.number,
        issueDate: inv.issueDate.toISOString(),
        dueDate: inv.dueDate.toISOString(),
        total: Number(inv.total),
        totalPaid: Math.round(totalPaid * 100) / 100,
        balance,
        daysOverdue,
        bucket,
      })
    }

    const client = invoices[0]?.client ?? null
    return { client, invoices: result, asOf: today.toISOString() }
  },

  async listPayments(companyId: string, page = 1, limit = 50) {
    const skip = (page - 1) * limit
    const [items, total] = await Promise.all([
      prisma.payment.findMany({
        where: { invoice: { companyId } },
        include: {
          invoice: {
            select: { series: true, number: true, client: { select: { businessName: true } } },
          },
        },
        orderBy: { paidAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.payment.count({ where: { invoice: { companyId } } }),
    ])
    return { items, total, page, totalPages: Math.ceil(total / limit) }
  },

  async analytics(companyId: string) {
    const now = new Date()

    // últimos 6 meses
    const months: { key: string; label: string; from: Date; to: Date }[] = []
    for (let i = 5; i >= 0; i--) {
      const from = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const to   = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59)
      const label = from.toLocaleString('es-PE', { month: 'short', year: '2-digit' })
      months.push({ key: `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}`, label, from, to })
    }

    const monthlyData = await Promise.all(months.map(async (m) => {
      const [emitido, cobrado] = await Promise.all([
        prisma.invoice.aggregate({
          where: { companyId, issueDate: { gte: m.from, lte: m.to } },
          _sum: { total: true },
        }),
        prisma.payment.aggregate({
          where: { invoice: { companyId }, paidAt: { gte: m.from, lte: m.to } },
          _sum: { amount: true },
        }),
      ])
      return {
        mes: m.label,
        emitido: Number(emitido._sum.total ?? 0),
        cobrado: Number(cobrado._sum.amount ?? 0),
      }
    }))

    // saldo pendiente por cliente
    const pending = await prisma.invoice.findMany({
      where: { companyId, status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } },
      include: { client: { select: { businessName: true } }, payments: { select: { amount: true } } },
    })
    const clientMap = new Map<string, { name: string; pendiente: number }>()
    for (const inv of pending) {
      const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0)
      const balance = Number(inv.total) - paid
      const entry = clientMap.get(inv.clientId) ?? { name: inv.client.businessName, pendiente: 0 }
      entry.pendiente = Math.round((entry.pendiente + balance) * 100) / 100
      clientMap.set(inv.clientId, entry)
    }
    const porCliente = Array.from(clientMap.values())
      .sort((a, b) => b.pendiente - a.pendiente)
      .slice(0, 8)

    return { monthly: monthlyData, porCliente }
  },

  async parseXmlFiles(
    companyId: string,
    files: { filename: string; content: string }[],
  ) {
    type Detail = {
      filename: string; series: string; number: string
      status: 'updated' | 'not_found' | 'no_changes' | 'error'
      detraccion?: number; dueDate?: string; error?: string
    }
    const details: Detail[] = []

    for (const file of files) {
      try {
        const parsed = parseInvoiceXml(file.content)
        if (!parsed) {
          details.push({ filename: file.filename, series: '', number: '', status: 'error', error: 'Formato XML no reconocido' })
          continue
        }
        const { series, number, detraccion, dueDate, detraccionCode, cuentaBN, cuotas } = parsed
        const invoice = await prisma.invoice.findFirst({ where: { companyId, series, number } })
        if (!invoice) {
          details.push({ filename: file.filename, series, number, status: 'not_found' })
          continue
        }
        if (detraccion === 0 && !dueDate && !detraccionCode && !cuentaBN && cuotas.length === 0) {
          details.push({ filename: file.filename, series, number, status: 'no_changes' })
          continue
        }
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            ...(detraccion > 0      && { detraccion: new Prisma.Decimal(detraccion) }),
            ...(dueDate             && { dueDate }),
            ...(detraccionCode      && { detraccionCode }),
            ...(cuentaBN            && { cuentaBN }),
          },
        })

        // Crear/actualizar cuotas si el XML las trae
        if (cuotas.length > 0) {
          for (const c of cuotas) {
            await prisma.invoiceCuota.upsert({
              where: { invoiceId_number: { invoiceId: invoice.id, number: c.number } },
              create: {
                invoiceId: invoice.id,
                number: c.number,
                dueDate: c.dueDate,
                amount: new Prisma.Decimal(c.amount),
              },
              update: {
                dueDate: c.dueDate,
                amount: new Prisma.Decimal(c.amount),
              },
            })
          }
        }

        details.push({
          filename: file.filename, series, number, status: 'updated',
          detraccion, dueDate: dueDate?.toISOString().slice(0, 10),
          cuotas: cuotas.length,
        } as any)
      } catch (e) {
        details.push({ filename: file.filename, series: '', number: '', status: 'error', error: e instanceof Error ? e.message : String(e) })
      }
    }

    return {
      updated:   details.filter(d => d.status === 'updated').length,
      notFound:  details.filter(d => d.status === 'not_found').length,
      noChanges: details.filter(d => d.status === 'no_changes').length,
      errors:    details.filter(d => d.status === 'error').length,
      total:     files.length,
      details,
    }
  },

  async markOverdue(companyId: string) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Marcar cuotas PENDING vencidas como OVERDUE
    await prisma.invoiceCuota.updateMany({
      where: {
        invoice: { companyId },
        status: 'PENDING',
        dueDate: { lt: today },
      },
      data: { status: 'OVERDUE' },
    })

    // Facturas sin cuotas: marcar directamente
    const result = await prisma.invoice.updateMany({
      where: {
        companyId,
        status: { in: ['PENDING', 'PARTIAL'] },
        dueDate: { lt: today },
        cuotas: { none: {} },
      },
      data: { status: 'OVERDUE' },
    })

    // Facturas con cuotas: recalcular estado según cuotas actualizadas
    const invoicesWithCuotas = await prisma.invoice.findMany({
      where: {
        companyId,
        status: { in: ['PENDING', 'PARTIAL'] },
        cuotas: { some: {} },
      },
      include: { cuotas: true, payments: { select: { amount: true } } },
    })

    for (const inv of invoicesWithCuotas) {
      const totalPaid      = inv.payments.reduce((s, p) => s + Number(p.amount), 0)
      const detraccion     = Number((inv as any).detraccion ?? 0)
      const netCollectible = Math.round((Number(inv.total) - detraccion) * 100) / 100
      const newStatus      = computeStatusFromCuotas(inv.cuotas, totalPaid, netCollectible)
      if (newStatus !== inv.status) {
        await prisma.invoice.update({ where: { id: inv.id }, data: { status: newStatus } })
      }
    }

    return result.count
  },
}
