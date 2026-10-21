import { BillingType, WorkOrderStatus } from '@prisma/client'
import { prisma } from '../../config/database'

export const workOrdersService = {
  async findAll(companyId: string, status?: WorkOrderStatus) {
    const [wos, curs] = await Promise.all([
      prisma.workOrder.findMany({
        where: { companyId, ...(status ? { status } : {}) },
        include: {
          client: { select: { businessName: true, ruc: true, phone: true, whatsapp: true, email: true, contactName: true } },
          equipment: { select: { name: true, type: true } },
          operator: { select: { name: true } },
          costs: true,
          invoice: { select: { id: true, series: true, number: true, total: true, detraccion: true, status: true } },
          quote: { select: { id: true, number: true } },
          serviceReports: {
            select: {
              id: true, number: true, reportDate: true,
              startTime: true, endTime: true, travelKm: true, totalHours: true,
              unitRate: true, amount: true, currency: true, workDescription: true,
              equipment: { select: { name: true } },
              operator: { select: { name: true } },
            },
            orderBy: { number: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.$queryRaw<{ id: string; currency: string }[]>`SELECT id, currency FROM work_orders WHERE "companyId" = ${companyId}`,
    ])
    const curMap = new Map(curs.map((c) => [c.id, c.currency]))
    return wos.map((wo) => ({ ...wo, currency: curMap.get(wo.id) ?? 'PEN' }))
  },

  async findOne(companyId: string, id: string) {
    const wo = await prisma.workOrder.findFirst({
      where: { companyId, id },
      include: {
        client: { select: { businessName: true, ruc: true, phone: true, whatsapp: true, email: true, contactName: true } },
        equipment: { select: { name: true, type: true, hourlyRate: true, dailyRate: true, hourlyRatePen: true, hourlyRateUsd: true, dailyRatePen: true, dailyRateUsd: true } },
        operator: { select: { name: true } },
        costs: true,
        invoice: { select: { id: true, series: true, number: true, total: true, detraccion: true, dueDate: true, status: true } },
        quote: { select: { id: true, number: true } },
        serviceReports: {
          select: {
            id: true, number: true, reportDate: true,
            startTime: true, endTime: true, travelKm: true, totalHours: true,
            unitRate: true, amount: true, currency: true, workDescription: true,
            equipment: { select: { name: true } },
            operator: { select: { name: true } },
          },
          orderBy: { number: 'asc' },
        },
      },
    })
    if (!wo) throw new Error('Orden de trabajo no encontrada')
    const [cur] = await prisma.$queryRaw<{ currency: string }[]>`SELECT currency FROM work_orders WHERE id = ${id}`
    return { ...wo, currency: cur?.currency ?? 'PEN' }
  },

  async nextNumber(companyId: string): Promise<string> {
    const last = await prisma.workOrder.findFirst({
      where: { companyId },
      orderBy: { number: 'desc' },
      select: { number: true },
    })
    if (!last) return 'OT-0001'
    const n = parseInt(last.number.replace('OT-', '')) + 1
    return `OT-${String(n).padStart(4, '0')}`
  },

  async create(companyId: string, data: {
    clientId: string; equipmentId: string; operatorId: string
    location?: string; description?: string
    startDate: string; endDate?: string
    billingType?: BillingType; currency?: string; quantity?: number; unitRate?: number
    notes?: string
  }) {
    const qty = data.quantity ?? 0
    const rate = data.unitRate ?? 0
    const subtotal = qty * rate

    const wo = await prisma.workOrder.create({
      data: {
        companyId,
        number: await this.nextNumber(companyId),
        clientId: data.clientId,
        equipmentId: data.equipmentId,
        operatorId: data.operatorId,
        location: data.location,
        description: data.description,
        startDate: new Date(data.startDate),
        endDate: data.endDate ? new Date(data.endDate) : undefined,
        billingType: data.billingType ?? 'HOURLY',
        quantity: qty,
        unitRate: rate,
        subtotal,
        notes: data.notes,
      },
      include: {
        client: { select: { businessName: true } },
        equipment: { select: { name: true } },
        operator: { select: { name: true } },
        costs: true,
      },
    })
    const currency = data.currency ?? 'PEN'
    await prisma.$executeRaw`UPDATE work_orders SET currency = ${currency} WHERE id = ${wo.id}`
    return { ...wo, currency }
  },

  async update(companyId: string, id: string, data: Partial<{
    location: string; description: string
    startDate: string; endDate: string
    billingType: BillingType; currency: string; quantity: number; unitRate: number
    status: WorkOrderStatus; notes: string
  }>) {
    await this.findOne(companyId, id)
    const qty = data.quantity
    const rate = data.unitRate
    const subtotal = qty !== undefined && rate !== undefined ? qty * rate : undefined

    const { currency, ...rest } = data as any
    const updated = await prisma.workOrder.update({
      where: { id },
      data: {
        ...rest,
        startDate: rest.startDate ? new Date(rest.startDate) : undefined,
        endDate: rest.endDate ? new Date(rest.endDate) : undefined,
        ...(subtotal !== undefined ? { subtotal } : {}),
      },
    })
    if (currency) {
      await prisma.$executeRaw`UPDATE work_orders SET currency = ${currency} WHERE id = ${id}`
    }
    const cur = currency ?? (await prisma.$queryRaw<{ currency: string }[]>`SELECT currency FROM work_orders WHERE id = ${id}`)[0]?.currency ?? 'PEN'
    return { ...updated, currency: cur }
  },

  async updateStatus(companyId: string, id: string, status: WorkOrderStatus) {
    await this.findOne(companyId, id)
    return prisma.workOrder.update({ where: { id }, data: { status } })
  },

  // ─── Vincular OT a factura SUNAT ya importada ───────────────────────────────
  async linkInvoice(companyId: string, workOrderId: string, invoiceId: string) {
    const wo = await this.findOne(companyId, workOrderId)
    if (wo.status === 'BILLED' || wo.status === 'PAID') {
      throw new Error('Esta OT ya está vinculada a una factura')
    }
    const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, companyId } })
    if (!invoice) throw new Error('Factura no encontrada')

    return prisma.workOrder.update({
      where: { id: workOrderId },
      data: { invoiceId, status: 'BILLED' },
      include: {
        invoice: { select: { id: true, series: true, number: true, total: true, detraccion: true, status: true } },
      },
    })
  },

  // ─── Obtener facturas SUNAT disponibles para vincular (mismo cliente) ───────
  async getAvailableInvoices(companyId: string, workOrderId: string) {
    const wo = await this.findOne(companyId, workOrderId)
    return prisma.invoice.findMany({
      where: {
        companyId,
        clientId: wo.clientId,
        workOrders: { none: {} },          // no vinculadas a ninguna OT
      },
      select: {
        id: true, series: true, number: true, total: true, totalUsd: true,
        detraccion: true, issueDate: true, dueDate: true, status: true, currency: true,
      },
      orderBy: { issueDate: 'desc' },
      take: 50,
    })
  },

  // ─── Marcar como enviada al cliente (WhatsApp / Email) ──────────────────────
  async markSent(companyId: string, workOrderId: string) {
    const wo = await this.findOne(companyId, workOrderId)
    if (!['DRAFT', 'ACTIVE', 'SENT'].includes(wo.status)) {
      throw new Error('Solo se pueden enviar OTs en borrador, activas o ya enviadas')
    }
    return prisma.workOrder.update({
      where: { id: workOrderId },
      data: { status: 'SENT' },
    })
  },

  // ─── Marcar como aceptada por el cliente ─────────────────────────────────────
  async markAccepted(companyId: string, workOrderId: string) {
    const wo = await this.findOne(companyId, workOrderId)
    if (!['SENT', 'DRAFT', 'ACTIVE'].includes(wo.status)) {
      throw new Error('Estado inválido para aceptar')
    }
    return prisma.workOrder.update({
      where: { id: workOrderId },
      data: { status: 'ACCEPTED' },
    })
  },

  async addCost(companyId: string, workOrderId: string, data: {
    category?: string; description?: string; amount: number
  }) {
    await this.findOne(companyId, workOrderId)
    return prisma.workOrderCost.create({
      data: {
        workOrderId,
        category: (data.category as any) ?? 'OTHER',
        description: data.description,
        amount: data.amount,
      },
    })
  },

  async deleteCost(companyId: string, workOrderId: string, costId: string) {
    await this.findOne(companyId, workOrderId)
    return prisma.workOrderCost.delete({ where: { id: costId, workOrderId } })
  },

  async updateActualHours(companyId: string, workOrderId: string, quantity: number) {
    const wo = await this.findOne(companyId, workOrderId)
    if (['BILLED', 'PAID'].includes(wo.status)) {
      throw new Error('No se puede modificar una OT ya facturada')
    }
    const subtotal = quantity * Number(wo.unitRate)
    return prisma.workOrder.update({
      where: { id: workOrderId },
      data: { quantity, subtotal },
    })
  },
}
