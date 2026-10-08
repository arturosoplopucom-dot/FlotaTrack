import { QuoteStatus } from '@prisma/client'
import { prisma } from '../../config/database'

const IGV_RATE = 0.18

export const quotesService = {
  async findAll(companyId: string, status?: QuoteStatus) {
    return prisma.quote.findMany({
      where: { companyId, ...(status ? { status } : {}) },
      include: {
        client: { select: { businessName: true, ruc: true, phone: true, whatsapp: true, email: true } },
        equipment: { select: { name: true, type: true } },
        items: { orderBy: { order: 'asc' } },
        workOrder: { select: { id: true, number: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  },

  async findOne(companyId: string, id: string) {
    const q = await prisma.quote.findFirst({
      where: { companyId, id },
      include: {
        client: { select: { businessName: true, ruc: true, contactName: true, phone: true, whatsapp: true, email: true, address: true } },
        equipment: { select: { name: true, type: true, hourlyRate: true, dailyRate: true } },
        items: { orderBy: { order: 'asc' } },
        workOrder: { select: { id: true, number: true } },
      },
    })
    if (!q) throw new Error('Cotización no encontrada')
    return q
  },

  async nextNumber(companyId: string): Promise<string> {
    const last = await prisma.quote.findFirst({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      select: { number: true },
    })
    if (!last) return 'COT-0001'
    const match = last.number.match(/COT-(\d+)/)
    const n = match ? parseInt(match[1]) + 1 : 1
    return `COT-${String(n).padStart(4, '0')}`
  },

  async create(companyId: string, data: {
    clientId: string
    equipmentId?: string
    validUntil: string
    currency?: 'PEN' | 'USD'
    notes?: string
    items: { description: string; quantity: number; unitPrice: number; order?: number }[]
  }) {
    const subtotal = data.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
    const igv = Math.round(subtotal * IGV_RATE * 100) / 100
    const total = Math.round((subtotal + igv) * 100) / 100

    return prisma.quote.create({
      data: {
        companyId,
        number: await this.nextNumber(companyId),
        clientId: data.clientId,
        equipmentId: data.equipmentId ?? null,
        validUntil: new Date(data.validUntil),
        currency: data.currency ?? 'PEN',
        notes: data.notes ?? null,
        subtotal,
        igv,
        total,
        items: {
          create: data.items.map((it, idx) => ({
            description: it.description,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            total: Math.round(it.quantity * it.unitPrice * 100) / 100,
            order: it.order ?? idx,
          })),
        },
      },
      include: {
        client: { select: { businessName: true, ruc: true } },
        items: { orderBy: { order: 'asc' } },
      },
    })
  },

  async update(companyId: string, id: string, data: {
    clientId?: string
    equipmentId?: string
    validUntil?: string
    currency?: 'PEN' | 'USD'
    notes?: string
    items?: { description: string; quantity: number; unitPrice: number; order?: number }[]
  }) {
    await this.findOne(companyId, id)

    let totals: { subtotal: number; igv: number; total: number } | undefined
    if (data.items) {
      const subtotal = data.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
      const igv = Math.round(subtotal * IGV_RATE * 100) / 100
      totals = { subtotal, igv, total: Math.round((subtotal + igv) * 100) / 100 }
    }

    return prisma.quote.update({
      where: { id },
      data: {
        ...(data.clientId ? { clientId: data.clientId } : {}),
        ...(data.equipmentId !== undefined ? { equipmentId: data.equipmentId ?? null } : {}),
        ...(data.validUntil ? { validUntil: new Date(data.validUntil) } : {}),
        ...(data.currency ? { currency: data.currency } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(totals ?? {}),
        ...(data.items ? {
          items: {
            deleteMany: {},
            create: data.items.map((it, idx) => ({
              description: it.description,
              quantity: it.quantity,
              unitPrice: it.unitPrice,
              total: Math.round(it.quantity * it.unitPrice * 100) / 100,
              order: it.order ?? idx,
            })),
          },
        } : {}),
      },
      include: {
        client: { select: { businessName: true, ruc: true } },
        items: { orderBy: { order: 'asc' } },
      },
    })
  },

  async updateStatus(companyId: string, id: string, status: QuoteStatus, rejectionNotes?: string, workOrderId?: string) {
    await this.findOne(companyId, id)
    return prisma.quote.update({
      where: { id },
      data: {
        status,
        ...(status === 'REJECTED' ? { rejectionNotes: rejectionNotes ?? null } : {}),
        ...(status !== 'REJECTED' ? { rejectionNotes: null } : {}),
        ...(status === 'CONVERTED' && workOrderId ? { convertedToWorkOrderId: workOrderId } : {}),
      },
    })
  },

  async delete(companyId: string, id: string) {
    await this.findOne(companyId, id)
    return prisma.quote.delete({ where: { id } })
  },
}
