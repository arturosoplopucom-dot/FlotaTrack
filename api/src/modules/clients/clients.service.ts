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
}
