import { prisma } from '../../config/database'

export const clientsService = {
  async findAll(companyId: string) {
    return prisma.client.findMany({
      where: { companyId, active: true },
      orderBy: { businessName: 'asc' },
    })
  },

  async findOne(companyId: string, id: string) {
    const client = await prisma.client.findFirst({ where: { id, companyId } })
    if (!client) throw new Error('Cliente no encontrado')
    return client
  },

  async create(companyId: string, data: {
    businessName: string
    ruc: string
    contactName?: string
    phone?: string
    whatsapp?: string
    email?: string
    address?: string
    creditDays?: number
    detraccionPct?: number
  }) {
    const existing = await prisma.client.findUnique({
      where: { companyId_ruc: { companyId, ruc: data.ruc } },
    })
    if (existing) throw new Error('Ya existe un cliente con ese RUC')
    return prisma.client.create({ data: { companyId, ...data } })
  },

  async update(companyId: string, id: string, data: Partial<{
    businessName: string
    contactName: string
    phone: string
    whatsapp: string
    email: string
    address: string
    creditDays: number
    detraccionPct: number
  }>) {
    await this.findOne(companyId, id)
    return prisma.client.update({ where: { id }, data })
  },

  async remove(companyId: string, id: string) {
    await this.findOne(companyId, id)
    return prisma.client.update({ where: { id }, data: { active: false } })
  },

  async recalculateDetraccion(companyId: string, clientId: string) {
    const client = await prisma.client.findFirst({ where: { id: clientId, companyId } })
    if (!client) throw new Error('Cliente no encontrado')

    let effectivePct = Number(client.detraccionPct ?? 0)

    // Fallback to company default pct
    if (effectivePct === 0) {
      const company = await prisma.company.findFirst({ where: { id: companyId } })
      const cfg = company?.sunatConfig as Record<string, string> | null
      effectivePct = Number(cfg?.defaultDetraccionPct ?? 0)
    }

    if (effectivePct === 0) {
      return { updated: 0, effectivePct: 0 }
    }

    // Solo facturas no cobradas (PENDING, PARTIAL, OVERDUE) — las PAID ya tienen detracción depositada
    const invoices = await prisma.invoice.findMany({
      where: { clientId, companyId, status: { not: 'PAID' } },
      select: { id: true, total: true, currency: true, tcambio: true },
    })

    let updated = 0
    for (const inv of invoices) {
      const totalPen = inv.currency === 'PEN'
        ? Number(inv.total)
        : Number(inv.total) * Number(inv.tcambio ?? 0)

      if (totalPen < 700) continue

      const detraccion = Math.round(totalPen * (effectivePct / 100))
      await prisma.invoice.update({ where: { id: inv.id }, data: { detraccion } })
      updated++
    }

    return { updated, effectivePct }
  },
}
