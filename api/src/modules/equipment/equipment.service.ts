import { EquipmentStatus, EquipmentType, WorkOrderStatus, MaintenanceSessionStatus } from '@prisma/client'
import { prisma } from '../../config/database'

function calcOdometerStats(logs: { km: any; recordedAt: Date }[], nextMaintenanceKm: number | null) {
  if (logs.length === 0) return { avgKmPerDay: null, estimatedDate: null, kmRemaining: null }

  // Promedio km/día con los últimos 30 días (mínimo 2 logs para calcular velocidad)
  let avgKmPerDay: number | null = null
  if (logs.length >= 2) {
    const newest = logs[0]
    const oldest = logs[logs.length - 1]
    const days = (newest.recordedAt.getTime() - oldest.recordedAt.getTime()) / (1000 * 60 * 60 * 24)
    if (days > 0) avgKmPerDay = (Number(newest.km) - Number(oldest.km)) / days
  }

  const currentKm = logs.length > 0 ? Number(logs[0].km) : null
  const kmRemaining = nextMaintenanceKm && currentKm !== null ? nextMaintenanceKm - currentKm : null

  let estimatedDate: string | null = null
  if (avgKmPerDay && avgKmPerDay > 0 && kmRemaining !== null && kmRemaining > 0) {
    const daysUntil = kmRemaining / avgKmPerDay
    const d = new Date()
    d.setDate(d.getDate() + Math.round(daysUntil))
    estimatedDate = d.toISOString().slice(0, 10)
  }

  return { avgKmPerDay: avgKmPerDay ? Math.round(avgKmPerDay * 10) / 10 : null, estimatedDate, kmRemaining }
}

export const equipmentService = {
  async findAll(companyId: string) {
    return prisma.equipment.findMany({
      where: { companyId, active: true },
      orderBy: { name: 'asc' },
    })
  },

  async findOne(companyId: string, id: string) {
    const eq = await prisma.equipment.findFirst({ where: { companyId, id } })
    if (!eq) throw new Error('Equipo no encontrado')
    return eq
  },

  async create(companyId: string, data: {
    name: string; brand?: string; model?: string; serialNumber?: string
    type?: EquipmentType; capacity?: string
    hourlyRate?: number; dailyRate?: number
    status?: EquipmentStatus; notes?: string
  }) {
    return prisma.equipment.create({
      data: {
        companyId,
        name: data.name,
        brand: data.brand,
        model: data.model,
        serialNumber: data.serialNumber,
        type: data.type ?? 'CRANE',
        capacity: data.capacity,
        hourlyRate: data.hourlyRate ?? 0,
        dailyRate: data.dailyRate ?? 0,
        status: data.status ?? 'AVAILABLE',
        notes: data.notes,
      },
    })
  },

  async update(companyId: string, id: string, data: Partial<{
    name: string; brand: string; model: string; serialNumber: string
    type: EquipmentType; capacity: string
    hourlyRate: number; dailyRate: number
    status: EquipmentStatus; notes: string; active: boolean
    odometerKm: number; maintenanceIntervalKm: number; nextMaintenanceKm: number
    currentHours: number
  }>) {
    await this.findOne(companyId, id)
    const updateData: any = { ...data }
    if (data.odometerKm != null && data.maintenanceIntervalKm != null) {
      updateData.nextMaintenanceKm = Math.ceil((data.odometerKm + 1) / data.maintenanceIntervalKm) * data.maintenanceIntervalKm
    }
    return prisma.equipment.update({ where: { id }, data: updateData })
  },

  async registerOdometer(companyId: string, equipmentId: string, km: number, notes?: string) {
    const eq = await this.findOne(companyId, equipmentId)

    // Calcular nextMaintenanceKm si es el primer registro o si se supera el umbral
    const interval = eq.maintenanceIntervalKm ? Number(eq.maintenanceIntervalKm) : null
    let nextMaintenanceKm = eq.nextMaintenanceKm ? Number(eq.nextMaintenanceKm) : null

    if (interval && (!nextMaintenanceKm || km >= nextMaintenanceKm)) {
      // Avanzar al siguiente múltiplo del intervalo
      nextMaintenanceKm = Math.ceil((km + 1) / interval) * interval
    }

    const [log] = await prisma.$transaction([
      (prisma as any).odometerLog.create({
        data: { equipmentId, companyId, km, notes: notes ?? null, recordedAt: new Date() },
      }),
      prisma.equipment.update({
        where: { id: equipmentId },
        data: { odometerKm: km, ...(nextMaintenanceKm ? { nextMaintenanceKm } : {}) },
      }),
    ])

    return log
  },

  async getOdometerLogs(companyId: string, equipmentId: string) {
    await this.findOne(companyId, equipmentId)
    const eq = await prisma.equipment.findFirst({ where: { id: equipmentId } })
    const logs = await (prisma as any).odometerLog.findMany({
      where: { equipmentId, companyId },
      orderBy: { recordedAt: 'desc' },
      take: 60,
    })
    const stats = calcOdometerStats(logs, eq?.nextMaintenanceKm ? Number(eq.nextMaintenanceKm) : null)
    return { logs, stats, equipment: eq }
  },

  async getAvailability(companyId: string, dateFrom: string, dateTo: string) {
    const from = new Date(dateFrom + 'T00:00:00.000')
    const to = new Date(dateTo + 'T23:59:59.999')

    const [equipment, workOrders, sessions] = await Promise.all([
      prisma.equipment.findMany({
        where: { companyId, active: true },
        orderBy: { name: 'asc' },
      }),
      prisma.workOrder.findMany({
        where: {
          companyId,
          status: { notIn: ['DRAFT', 'CANCELLED'] as WorkOrderStatus[] },
          startDate: { lte: to },
          OR: [{ endDate: null }, { endDate: { gte: from } }],
        },
        include: { client: { select: { businessName: true } } },
      }),
      prisma.maintenanceSession.findMany({
        where: {
          companyId,
          status: { not: 'CANCELLED' as MaintenanceSessionStatus },
          startedAt: { lte: to },
          OR: [{ completedAt: null }, { completedAt: { gte: from } }],
        },
        include: { plan: { select: { name: true } } },
      }),
    ])

    const toDateStr = (d: Date) => d.toISOString().slice(0, 10)

    const woByEq = new Map<string, typeof workOrders>()
    for (const wo of workOrders) {
      if (!woByEq.has(wo.equipmentId)) woByEq.set(wo.equipmentId, [])
      woByEq.get(wo.equipmentId)!.push(wo)
    }

    const sessByEq = new Map<string, typeof sessions>()
    for (const s of sessions) {
      if (!sessByEq.has(s.equipmentId)) sessByEq.set(s.equipmentId, [])
      sessByEq.get(s.equipmentId)!.push(s)
    }

    return equipment.map((eq) => {
      const blocks: Array<{
        type: 'OT' | 'MAINTENANCE'
        id: string
        label: string
        dateFrom: string
        dateTo: string
        clientName?: string
        status: string
      }> = []

      for (const wo of woByEq.get(eq.id) ?? []) {
        blocks.push({
          type: 'OT',
          id: wo.id,
          label: wo.number,
          dateFrom: toDateStr(wo.startDate),
          dateTo: wo.endDate ? toDateStr(wo.endDate) : dateTo,
          clientName: wo.client.businessName,
          status: wo.status,
        })
      }

      for (const s of sessByEq.get(eq.id) ?? []) {
        blocks.push({
          type: 'MAINTENANCE',
          id: s.id,
          label: s.plan?.name ?? 'Mantenimiento',
          dateFrom: toDateStr(s.startedAt),
          dateTo: s.completedAt
            ? toDateStr(s.completedAt)
            : s.estimatedEnd
            ? toDateStr(s.estimatedEnd)
            : dateTo,
          status: s.status,
        })
      }

      return {
        id: eq.id,
        name: eq.name,
        type: eq.type,
        status: eq.status,
        brand: eq.brand,
        model: eq.model,
        serialNumber: eq.serialNumber,
        capacity: eq.capacity,
        currentHours: eq.currentHours ? Number(eq.currentHours) : null,
        odometerKm: eq.odometerKm ? Number(eq.odometerKm) : null,
        blocks,
      }
    })
  },
}
