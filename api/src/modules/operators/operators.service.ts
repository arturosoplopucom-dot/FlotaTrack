import { OperatorStatus } from '@prisma/client'
import { prisma } from '../../config/database'

export const operatorsService = {
  async findAll(companyId: string) {
    return prisma.operator.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
    })
  },

  async findOne(companyId: string, id: string) {
    const op = await prisma.operator.findFirst({ where: { companyId, id } })
    if (!op) throw new Error('Operario no encontrado')
    return op
  },

  async create(companyId: string, data: {
    name: string; dni: string; licenseNumber?: string
    licenseExpiry?: string; phone?: string; status?: OperatorStatus
  }) {
    return prisma.operator.create({
      data: {
        companyId,
        name: data.name,
        dni: data.dni,
        licenseNumber: data.licenseNumber,
        licenseExpiry: data.licenseExpiry ? new Date(data.licenseExpiry) : undefined,
        phone: data.phone,
        status: data.status ?? 'ACTIVE',
      },
    })
  },

  async update(companyId: string, id: string, data: Partial<{
    name: string; dni: string; licenseNumber: string
    licenseExpiry: string; phone: string; status: OperatorStatus
  }>) {
    await this.findOne(companyId, id)
    return prisma.operator.update({
      where: { id },
      data: {
        ...data,
        licenseExpiry: data.licenseExpiry ? new Date(data.licenseExpiry) : undefined,
      },
    })
  },
}
