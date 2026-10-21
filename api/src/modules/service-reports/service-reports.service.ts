import { prisma } from '../../config/database'
import { Currency } from '@prisma/client'

const REPORT_INCLUDE = {
  client: { select: { id: true, businessName: true, ruc: true } },
  equipment: { select: { id: true, name: true, type: true } },
  operator: { select: { id: true, name: true } },
  quote: { select: { id: true, number: true } },
  workOrder: { select: { id: true, number: true, status: true } },
}

async function nextNumber(companyId: string): Promise<string> {
  const last = await prisma.serviceReport.findFirst({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    select: { number: true },
  })
  if (!last) return '1000'
  const n = parseInt(last.number, 10)
  return isNaN(n) ? '1000' : String(n + 1)
}

export const serviceReportsService = {
  async findAll(companyId: string, filters: {
    status?: string
    clientId?: string
    equipmentId?: string
    dateFrom?: string
    dateTo?: string
  }) {
    const where: Record<string, unknown> = { companyId }
    if (filters.status) where.status = filters.status
    if (filters.clientId) where.clientId = filters.clientId
    if (filters.equipmentId) where.equipmentId = filters.equipmentId
    if (filters.dateFrom || filters.dateTo) {
      where.reportDate = {
        ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
        ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
      }
    }
    return prisma.serviceReport.findMany({
      where,
      include: REPORT_INCLUDE,
      orderBy: [{ reportDate: 'desc' }, { number: 'desc' }],
    })
  },

  async findOne(companyId: string, id: string) {
    const report = await prisma.serviceReport.findFirst({
      where: { id, companyId },
      include: REPORT_INCLUDE,
    })
    if (!report) throw new Error('Reporte no encontrado')
    return report
  },

  async create(companyId: string, data: {
    clientId: string
    equipmentId?: string
    operatorId?: string
    quoteId?: string
    reportDate: string
    startTime: string
    endTime: string
    totalHours: number
    travelKm?: number
    workDescription?: string
    location?: string
    unitRate: number
    currency?: string
  }) {
    const number = await nextNumber(companyId)
    return prisma.serviceReport.create({
      data: {
        companyId,
        number,
        clientId: data.clientId,
        equipmentId: data.equipmentId || null,
        operatorId: data.operatorId || null,
        quoteId: data.quoteId || null,
        reportDate: new Date(data.reportDate),
        startTime: data.startTime,
        endTime: data.endTime,
        totalHours: data.totalHours,
        travelKm: data.travelKm ?? null,
        workDescription: data.workDescription || null,
        location: data.location || null,
        unitRate: data.unitRate,
        amount: data.totalHours * data.unitRate,
        currency: (data.currency as Currency) ?? 'PEN',
        status: 'PENDING',
      },
      include: REPORT_INCLUDE,
    })
  },

  async update(companyId: string, id: string, data: {
    clientId?: string
    equipmentId?: string
    operatorId?: string
    quoteId?: string
    reportDate?: string
    startTime?: string
    endTime?: string
    totalHours?: number
    travelKm?: number
    workDescription?: string
    location?: string
    unitRate?: number
    currency?: string
  }) {
    const report = await prisma.serviceReport.findFirst({ where: { id, companyId } })
    if (!report) throw new Error('Reporte no encontrado')
    if (report.status === 'LIQUIDATED') throw new Error('No se puede editar un reporte liquidado')

    const totalHours = data.totalHours ?? Number(report.totalHours)
    const unitRate = data.unitRate ?? Number(report.unitRate)

    return prisma.serviceReport.update({
      where: { id },
      data: {
        ...(data.clientId && { clientId: data.clientId }),
        ...(data.equipmentId !== undefined && { equipmentId: data.equipmentId || null }),
        ...(data.operatorId !== undefined && { operatorId: data.operatorId || null }),
        ...(data.quoteId !== undefined && { quoteId: data.quoteId || null }),
        ...(data.reportDate && { reportDate: new Date(data.reportDate) }),
        ...(data.startTime && { startTime: data.startTime }),
        ...(data.endTime && { endTime: data.endTime }),
        ...(data.totalHours !== undefined && { totalHours: data.totalHours }),
        ...(data.travelKm !== undefined && { travelKm: data.travelKm }),
        ...(data.workDescription !== undefined && { workDescription: data.workDescription }),
        ...(data.location !== undefined && { location: data.location }),
        ...(data.unitRate !== undefined && { unitRate: data.unitRate }),
        ...(data.currency && { currency: data.currency as Currency }),
        amount: totalHours * unitRate,
      },
      include: REPORT_INCLUDE,
    })
  },

  async delete(companyId: string, id: string) {
    const report = await prisma.serviceReport.findFirst({ where: { id, companyId } })
    if (!report) throw new Error('Reporte no encontrado')
    if (report.status === 'LIQUIDATED') throw new Error('No se puede eliminar un reporte liquidado')
    return prisma.serviceReport.delete({ where: { id } })
  },

  // Creates a WorkOrder (Liquidación) from selected service reports
  async liquidate(companyId: string, data: {
    reportIds: string[]
    location?: string
    notes?: string
  }) {
    const reports = await prisma.serviceReport.findMany({
      where: { id: { in: data.reportIds }, companyId, status: 'PENDING' },
      include: { client: true, quote: true },
    })

    if (reports.length === 0) throw new Error('No se encontraron reportes pendientes')
    if (reports.length !== data.reportIds.length) {
      throw new Error('Algunos reportes ya están liquidados o no existen')
    }

    // Validate all reports belong to same client
    const clientIds = [...new Set(reports.map(r => r.clientId))]
    if (clientIds.length > 1) throw new Error('Todos los reportes deben pertenecer al mismo cliente')

    // Validate all reports same currency
    const currencies = [...new Set(reports.map(r => r.currency))]
    if (currencies.length > 1) throw new Error('Todos los reportes deben tener la misma moneda')

    const clientId = clientIds[0]
    const currency = currencies[0]
    const subtotal = reports.reduce((sum, r) => sum + Number(r.amount), 0)
    const totalHours = reports.reduce((sum, r) => sum + Number(r.totalHours), 0)

    // Get next OT number
    const lastOt = await prisma.workOrder.findFirst({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      select: { number: true },
    })
    const lastNum = lastOt ? parseInt(lastOt.number.replace(/\D/g, ''), 10) : 0
    const woNumber = `OT-${String(lastNum + 1).padStart(4, '0')}`

    // Earliest reportDate as startDate
    const startDate = reports.reduce((earliest, r) => {
      const d = new Date(r.reportDate)
      return d < earliest ? d : earliest
    }, new Date(reports[0].reportDate))

    // Get the quote reference (from first report that has one)
    const quoteRef = reports.find(r => r.quoteId)

    const workOrder = await prisma.$transaction(async (tx) => {
      const wo = await tx.workOrder.create({
        data: {
          companyId,
          number: woNumber,
          clientId,
          location: data.location || null,
          description: reports[0].workDescription || null,
          startDate,
          billingType: 'HOURLY',
          currency,
          quantity: totalHours,
          unitRate: reports.length > 0 ? Number(reports[0].unitRate) : 0,
          subtotal,
          status: 'DRAFT',
          notes: data.notes || null,
        },
      })

      // If there was a quote, link it
      if (quoteRef?.quoteId) {
        await tx.quote.update({
          where: { id: quoteRef.quoteId },
          data: { convertedToWorkOrderId: wo.id, status: 'CONVERTED' },
        }).catch(() => { /* quote might already be converted */ })
      }

      // Mark all reports as LIQUIDATED and link to workOrder
      await tx.serviceReport.updateMany({
        where: { id: { in: data.reportIds } },
        data: { status: 'LIQUIDATED', workOrderId: wo.id },
      })

      return wo
    })

    return prisma.workOrder.findUnique({
      where: { id: workOrder.id },
      include: {
        client: true,
        equipment: true,
        operator: true,
        serviceReports: { include: { equipment: true, operator: true } },
      },
    })
  },

  // Remove a report from its liquidación (unliquidate)
  async unliquidate(companyId: string, id: string) {
    const report = await prisma.serviceReport.findFirst({ where: { id, companyId } })
    if (!report) throw new Error('Reporte no encontrado')
    if (report.status !== 'LIQUIDATED') throw new Error('El reporte no está liquidado')
    return prisma.serviceReport.update({
      where: { id },
      data: { status: 'PENDING', workOrderId: null },
      include: REPORT_INCLUDE,
    })
  },
}
