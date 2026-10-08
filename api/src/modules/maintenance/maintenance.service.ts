import { MaintenanceInterval, MaintenanceSessionStatus, Prisma } from '@prisma/client'
import { prisma } from '../../config/database'

// ── Helpers ──────────────────────────────────────────────────────────────────

function calcNextDueAt(lastServiceAt: Date, intervalDays: number): Date {
  const d = new Date(lastServiceAt)
  d.setDate(d.getDate() + intervalDays)
  return d
}

function calcNextDueHours(lastHours: number, intervalHours: number): number {
  return Math.round((lastHours + intervalHours) * 10) / 10
}

// Urgency: OVERDUE | DUE_SOON | OK
export function getPlanUrgency(
  nextDueAt: Date | null,
  nextDueHours: number | null,
  currentHours: number,
  nextDueKm?: number | null,
  currentKm?: number | null,
): 'OVERDUE' | 'DUE_SOON' | 'OK' {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const in7 = new Date(today); in7.setDate(in7.getDate() + 7)

  const dateOverdue  = nextDueAt  && nextDueAt  < today
  const dateDueSoon  = nextDueAt  && nextDueAt  >= today && nextDueAt <= in7
  const hoursOverdue = nextDueHours != null && nextDueHours <= currentHours
  const hoursDueSoon = nextDueHours != null && nextDueHours > currentHours && nextDueHours - currentHours <= 10
  const kmOverdue    = nextDueKm != null && currentKm != null && currentKm >= nextDueKm
  const kmDueSoon    = nextDueKm != null && currentKm != null && currentKm < nextDueKm && nextDueKm - currentKm <= 500

  if (dateOverdue || hoursOverdue || kmOverdue) return 'OVERDUE'
  if (dateDueSoon || hoursDueSoon || kmDueSoon) return 'DUE_SOON'
  return 'OK'
}

// ── Service ───────────────────────────────────────────────────────────────────

export const maintenanceService = {

  // ── Plans ─────────────────────────────────────────────────────────────────

  async findAllPlans(companyId: string, equipmentId?: string) {
    const plans = await prisma.maintenancePlan.findMany({
      where: { companyId, active: true, ...(equipmentId ? { equipmentId } : {}) },
      include: {
        equipment: { select: { id: true, name: true, type: true, currentHours: true, status: true, odometerKm: true } },
        records: { orderBy: { performedAt: 'desc' }, take: 1 },
        sessions: {
          where: { status: 'IN_PROGRESS' },
          orderBy: { startedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return plans.map((p) => ({
      ...p,
      activeSession: p.sessions[0] ?? null,
      urgency: getPlanUrgency(
        p.nextDueAt,
        p.nextDueHours ? Number(p.nextDueHours) : null,
        Number(p.equipment.currentHours),
        p.nextDueKm ? Number(p.nextDueKm) : null,
        p.equipment.odometerKm ? Number(p.equipment.odometerKm) : null,
      ),
    }))
  },

  async findPlan(companyId: string, id: string) {
    const p = await prisma.maintenancePlan.findFirst({
      where: { companyId, id },
      include: {
        equipment: { select: { id: true, name: true, type: true, currentHours: true } },
        records: {
          orderBy: { performedAt: 'desc' },
          include: { plan: { select: { name: true } } },
        },
      },
    })
    if (!p) throw new Error('Plan de mantenimiento no encontrado')
    return {
      ...p,
      urgency: getPlanUrgency(
        p.nextDueAt,
        p.nextDueHours ? Number(p.nextDueHours) : null,
        Number(p.equipment.currentHours),
      ),
    }
  },

  async createPlan(companyId: string, data: {
    equipmentId: string
    name: string
    description?: string
    intervalType: MaintenanceInterval
    intervalDays?: number
    intervalHours?: number
    intervalKm?: number
    lastServiceAt?: string
    lastServiceHours?: number
    lastServiceKm?: number
  }) {
    const lastAt    = data.lastServiceAt ? new Date(data.lastServiceAt) : null
    const lastHours = data.lastServiceHours ?? null
    const lastKm    = data.lastServiceKm ?? null

    const nextDueAt    = (data.intervalType !== 'HOURS' && data.intervalType !== 'KM' && lastAt && data.intervalDays)
      ? calcNextDueAt(lastAt, data.intervalDays) : null
    const nextDueHours = (data.intervalType === 'HOURS' || data.intervalType === 'BOTH') && lastHours != null && data.intervalHours
      ? calcNextDueHours(lastHours, data.intervalHours) : null
    const nextDueKm    = data.intervalType === 'KM' && data.intervalKm != null
      ? (lastKm != null ? lastKm + data.intervalKm : data.intervalKm) : null

    return prisma.maintenancePlan.create({
      data: {
        companyId,
        equipmentId: data.equipmentId,
        name: data.name,
        description: data.description ?? null,
        intervalType: data.intervalType,
        intervalDays: data.intervalDays ?? null,
        intervalHours: data.intervalHours ?? null,
        intervalKm: data.intervalKm ?? null,
        lastServiceAt: lastAt,
        lastServiceHours: lastHours,
        lastServiceKm: lastKm,
        nextDueAt,
        nextDueHours,
        nextDueKm,
      },
      include: { equipment: { select: { name: true, type: true, currentHours: true } } },
    })
  },

  async updatePlan(companyId: string, id: string, data: {
    equipmentId?: string
    name?: string
    description?: string
    intervalType?: MaintenanceInterval
    intervalDays?: number
    intervalHours?: number
    intervalKm?: number
    lastServiceAt?: string
    lastServiceHours?: number
    lastServiceKm?: number
    active?: boolean
  }) {
    const plan = await prisma.maintenancePlan.findFirst({ where: { companyId, id } })
    if (!plan) throw new Error('Plan no encontrado')

    const intervalType  = data.intervalType ?? plan.intervalType
    const intervalDays  = data.intervalDays ?? (plan.intervalDays ? Number(plan.intervalDays) : undefined)
    const intervalHours = data.intervalHours ?? (plan.intervalHours ? Number(plan.intervalHours) : undefined)
    const intervalKm    = data.intervalKm ?? (plan.intervalKm ? Number(plan.intervalKm) : undefined)
    const lastAt        = data.lastServiceAt ? new Date(data.lastServiceAt) : plan.lastServiceAt
    const lastHours     = data.lastServiceHours !== undefined ? data.lastServiceHours : (plan.lastServiceHours ? Number(plan.lastServiceHours) : null)
    const lastKm        = data.lastServiceKm !== undefined ? data.lastServiceKm : (plan.lastServiceKm ? Number(plan.lastServiceKm) : null)

    const nextDueAt    = (intervalType !== 'HOURS' && intervalType !== 'KM' && lastAt && intervalDays)
      ? calcNextDueAt(lastAt, intervalDays) : null
    const nextDueHours = (intervalType === 'HOURS' || intervalType === 'BOTH') && lastHours != null && intervalHours
      ? calcNextDueHours(lastHours, intervalHours) : null
    const nextDueKm    = intervalType === 'KM' && intervalKm != null
      ? (lastKm != null ? lastKm + intervalKm : intervalKm) : null

    return prisma.maintenancePlan.update({
      where: { id },
      data: {
        ...(data.equipmentId ? { equipmentId: data.equipmentId } : {}),
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
        intervalType,
        intervalDays: intervalDays ?? null,
        intervalHours: intervalHours ?? null,
        intervalKm: intervalKm ?? null,
        lastServiceAt: lastAt,
        lastServiceHours: lastHours,
        lastServiceKm: lastKm,
        nextDueAt,
        nextDueHours,
        nextDueKm,
      },
      include: { equipment: { select: { name: true, type: true, currentHours: true } } },
    })
  },

  async deletePlan(companyId: string, id: string) {
    const plan = await prisma.maintenancePlan.findFirst({ where: { companyId, id } })
    if (!plan) throw new Error('Plan no encontrado')
    // Bloquear si hay sesión activa vinculada al plan O si el equipo está en mantenimiento
    const activeSession = await prisma.maintenanceSession.findFirst({
      where: { companyId, status: 'IN_PROGRESS', OR: [{ planId: id }, { equipmentId: plan.equipmentId }] },
    })
    if (activeSession) throw new Error('No se puede eliminar el plan mientras el equipo está en mantenimiento. Cierre primero la sesión en curso.')
    return prisma.maintenancePlan.update({ where: { id }, data: { active: false } })
  },

  // ── Records ───────────────────────────────────────────────────────────────

  async findAllRecords(companyId: string, equipmentId?: string) {
    return prisma.maintenanceRecord.findMany({
      where: { companyId, ...(equipmentId ? { equipmentId } : {}) },
      include: {
        equipment: { select: { name: true, type: true } },
        plan: { select: { name: true } },
      },
      orderBy: { performedAt: 'desc' },
    })
  },

  async createRecord(companyId: string, data: {
    equipmentId: string
    planId?: string
    performedAt: string
    hoursAtService?: number
    technician?: string
    description?: string
    cost?: number
    notes?: string
    updateEquipmentHours?: boolean
  }) {
    const record = await prisma.maintenanceRecord.create({
      data: {
        companyId,
        equipmentId: data.equipmentId,
        planId: data.planId ?? null,
        performedAt: new Date(data.performedAt),
        hoursAtService: data.hoursAtService ?? null,
        technician: data.technician ?? null,
        description: data.description ?? null,
        cost: data.cost ?? 0,
        notes: data.notes ?? null,
      },
    })

    // Actualizar horómetro del equipo si corresponde
    if (data.updateEquipmentHours && data.hoursAtService != null) {
      await prisma.equipment.update({
        where: { id: data.equipmentId },
        data: { currentHours: data.hoursAtService },
      })
    }

    // Actualizar el plan asociado con la nueva fecha/horas de servicio
    if (data.planId) {
      const plan = await prisma.maintenancePlan.findUnique({ where: { id: data.planId } })
      if (plan) {
        const newLastAt    = new Date(data.performedAt)
        const newLastHours = data.hoursAtService ?? (plan.lastServiceHours ? Number(plan.lastServiceHours) : null)

        const nextDueAt = (plan.intervalType !== 'HOURS' && plan.intervalDays)
          ? calcNextDueAt(newLastAt, plan.intervalDays) : plan.nextDueAt

        const nextDueHours = (plan.intervalType !== 'DATE' && newLastHours != null && plan.intervalHours)
          ? calcNextDueHours(newLastHours, Number(plan.intervalHours)) : plan.nextDueHours

        await prisma.maintenancePlan.update({
          where: { id: data.planId },
          data: {
            lastServiceAt: newLastAt,
            lastServiceHours: newLastHours,
            nextDueAt,
            nextDueHours,
          },
        })
      }
    }

    return record
  },

  async deleteRecord(companyId: string, id: string) {
    const rec = await prisma.maintenanceRecord.findFirst({ where: { companyId, id } })
    if (!rec) throw new Error('Registro no encontrado')
    return prisma.maintenanceRecord.delete({ where: { id } })
  },

  // ── Sessions ──────────────────────────────────────────────────────────────

  async findActiveSessions(companyId: string) {
    return prisma.maintenanceSession.findMany({
      where: { companyId, status: 'IN_PROGRESS' },
      include: {
        equipment: { select: { id: true, name: true, type: true, currentHours: true } },
        plan: { select: { id: true, name: true } },
      },
      orderBy: { startedAt: 'desc' },
    })
  },

  async startSession(companyId: string, data: {
    equipmentId: string
    planId?: string
    startedAt: string
    estimatedEnd?: string
    technician?: string
    workDescription?: string
    estimatedCost?: number
  }) {
    const equipment = await prisma.equipment.findFirst({ where: { companyId, id: data.equipmentId } })
    if (!equipment) throw new Error('Equipo no encontrado')
    if (equipment.status === 'MAINTENANCE') throw new Error('El equipo ya está en mantenimiento')
    if (equipment.status === 'IN_USE') throw new Error('El equipo está en uso activo, no puede entrar a mantenimiento')

    const existing = await prisma.maintenanceSession.findFirst({
      where: { companyId, equipmentId: data.equipmentId, status: 'IN_PROGRESS' },
    })
    if (existing) throw new Error('Ya existe una sesión de mantenimiento activa para este equipo')

    const [session] = await prisma.$transaction([
      prisma.maintenanceSession.create({
        data: {
          companyId,
          equipmentId: data.equipmentId,
          planId: data.planId ?? null,
          startedAt: new Date(data.startedAt),
          estimatedEnd: data.estimatedEnd ? new Date(data.estimatedEnd) : null,
          technician: data.technician ?? null,
          workDescription: data.workDescription ?? null,
          estimatedCost: data.estimatedCost ?? null,
          status: 'IN_PROGRESS',
        },
        include: {
          equipment: { select: { id: true, name: true, type: true, currentHours: true } },
          plan: { select: { id: true, name: true } },
        },
      }),
      prisma.equipment.update({
        where: { id: data.equipmentId },
        data: { status: 'MAINTENANCE' },
      }),
    ])

    return session
  },

  async completeSession(companyId: string, sessionId: string, data: {
    completedAt: string
    hoursAtClose?: number
    actualCost?: number
    completionNotes?: string
    technician?: string
    updateEquipmentHours?: boolean
    odometerKmAtClose?: number
    nextMaintenanceKm?: number
  }) {
    const session = await prisma.maintenanceSession.findFirst({
      where: { companyId, id: sessionId, status: 'IN_PROGRESS' },
      include: { plan: true },
    })
    if (!session) throw new Error('Sesión de mantenimiento no encontrada o ya cerrada')

    const completedAt     = new Date(data.completedAt)
    const hoursAtClose    = data.hoursAtClose ?? null
    const actualCost      = data.actualCost ?? 0
    const technician      = data.technician ?? session.technician
    const odometerKm      = data.odometerKmAtClose ?? null
    const nextMaintKm     = data.nextMaintenanceKm ?? null

    const [updatedSession, record] = await prisma.$transaction(async (tx) => {
      const s = await tx.maintenanceSession.update({
        where: { id: sessionId },
        data: {
          status: 'COMPLETED',
          completedAt,
          hoursAtClose,
          actualCost,
          completionNotes: data.completionNotes ?? null,
        },
        include: {
          equipment: { select: { id: true, name: true, type: true, currentHours: true } },
          plan: { select: { id: true, name: true } },
        },
      })

      // Los campos odometerKmAtClose y nextMaintenanceKm son nuevos en el schema.
      // Hasta regenerar el Prisma client usamos $executeRaw parametrizado.
      if (odometerKm != null) {
        await tx.$executeRaw`UPDATE maintenance_sessions SET "odometerKmAtClose" = ${odometerKm} WHERE id = ${sessionId}`
      }
      if (nextMaintKm != null) {
        await tx.$executeRaw`UPDATE maintenance_sessions SET "nextMaintenanceKm" = ${nextMaintKm} WHERE id = ${sessionId}`
      }

      // Devolver equipo a AVAILABLE + actualizar odómetro y próximo mantenimiento si aplica
      const equipUpdate: any = {
        status: 'AVAILABLE',
        ...(data.updateEquipmentHours && hoursAtClose != null ? { currentHours: hoursAtClose } : {}),
        ...(odometerKm != null ? { odometerKm } : {}),
        ...(nextMaintKm != null ? { nextMaintenanceKm: nextMaintKm } : {}),
      }
      await tx.equipment.update({ where: { id: session.equipmentId }, data: equipUpdate })

      // Registrar log de odómetro si se ingresó km
      if (odometerKm != null) {
        await (tx as any).odometerLog.create({
          data: {
            equipmentId: session.equipmentId,
            companyId,
            km: odometerKm,
            notes: `Salida de taller — ${technician ?? 'mantenimiento'}`,
            recordedAt: completedAt,
          },
        })
      }

      // Crear registro de mantenimiento vinculado a la sesión
      const r = await tx.maintenanceRecord.create({
        data: {
          companyId,
          equipmentId: session.equipmentId,
          planId: session.planId ?? null,
          sessionId,
          performedAt: completedAt,
          hoursAtService: hoursAtClose,
          technician,
          description: session.workDescription ?? undefined,
          cost: actualCost,
          notes: data.completionNotes ?? null,
        },
      })

      // Actualizar el plan (nextDueAt/nextDueHours) si hay plan asociado
      if (session.planId) {
        const plan = await tx.maintenancePlan.findUnique({ where: { id: session.planId } })
        if (plan) {
          const newLastHours = hoursAtClose ?? (plan.lastServiceHours ? Number(plan.lastServiceHours) : null)
          const nextDueAt = (plan.intervalType !== 'HOURS' && plan.intervalDays)
            ? calcNextDueAt(completedAt, plan.intervalDays) : plan.nextDueAt
          const nextDueHours = (plan.intervalType !== 'DATE' && newLastHours != null && plan.intervalHours)
            ? calcNextDueHours(newLastHours, Number(plan.intervalHours)) : plan.nextDueHours

          await tx.maintenancePlan.update({
            where: { id: session.planId },
            data: { lastServiceAt: completedAt, lastServiceHours: newLastHours, nextDueAt, nextDueHours },
          })
        }
      }

      return [s, r]
    })

    return { session: updatedSession, record }
  },

  async getSessionHistory(companyId: string, params: {
    from?: string; to?: string; equipmentId?: string
  } = {}) {
    const where: any = { companyId, status: 'COMPLETED' }
    if (params.equipmentId) where.equipmentId = params.equipmentId
    if (params.from || params.to) {
      where.completedAt = {}
      if (params.from) where.completedAt.gte = new Date(params.from)
      if (params.to)   where.completedAt.lte = new Date(params.to + 'T23:59:59')
    }

    const sessions = await prisma.maintenanceSession.findMany({
      where,
      orderBy: { completedAt: 'desc' },
      take: 200,
      include: {
        equipment: { select: { id: true, name: true, type: true } },
        plan:      { select: { id: true, name: true } },
      },
    })

    // Enriquecer con campos nuevos via raw (odometerKmAtClose, nextMaintenanceKm)
    const ids = sessions.map((s) => s.id)
    let rawData: Array<{ id: string; odometerKmAtClose: any; nextMaintenanceKm: any }> = []
    if (ids.length > 0) {
      rawData = await prisma.$queryRaw(
        Prisma.sql`SELECT id, "odometerKmAtClose", "nextMaintenanceKm" FROM maintenance_sessions WHERE id IN (${Prisma.join(ids)})`
      ) as any
    }
    const rawMap = new Map(rawData.map((r) => [r.id, r]))

    return sessions.map((s) => ({
      ...s,
      odometerKmAtClose: rawMap.get(s.id)?.odometerKmAtClose ?? null,
      nextMaintenanceKm: rawMap.get(s.id)?.nextMaintenanceKm ?? null,
    }))
  },

  async cancelSession(companyId: string, sessionId: string) {
    const session = await prisma.maintenanceSession.findFirst({
      where: { companyId, id: sessionId, status: 'IN_PROGRESS' },
    })
    if (!session) throw new Error('Sesión no encontrada o ya cerrada')

    await prisma.$transaction([
      prisma.maintenanceSession.update({
        where: { id: sessionId },
        data: { status: 'CANCELLED', completedAt: new Date() },
      }),
      prisma.equipment.update({
        where: { id: session.equipmentId },
        data: { status: 'AVAILABLE' },
      }),
    ])
  },

  // ── Dashboard summary ─────────────────────────────────────────────────────

  async getSummary(companyId: string) {
    const plans = await this.findAllPlans(companyId)
    return {
      total:    plans.length,
      overdue:  plans.filter((p) => p.urgency === 'OVERDUE').length,
      dueSoon:  plans.filter((p) => p.urgency === 'DUE_SOON').length,
      ok:       plans.filter((p) => p.urgency === 'OK').length,
      alerts:   plans.filter((p) => p.urgency !== 'OK'),
    }
  },
}
