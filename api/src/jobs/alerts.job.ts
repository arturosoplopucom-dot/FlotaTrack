import cron from 'node-cron'
import { prisma } from '../config/database'
import { emailService } from '../utils/email.service'
import { getPlanUrgency } from '../modules/maintenance/maintenance.service'

// Corre todos los días a las 8:00 AM
export const startAlertsJob = () => {
  if (process.env.ALERTS_ENABLED === 'false') {
    console.log('[AlertsJob] ⏸️  Job PAUSADO — ALERTS_ENABLED=false')
    return
  }
  cron.schedule('0 8 * * *', async () => {
    console.log('[AlertsJob] Iniciando revisión de facturas por vencer...')
    await runAlertsCheck()
  })
  console.log('[AlertsJob] Job de alertas registrado — corre diariamente a las 8:00 AM')
}

export const runAlertsCheck = async (clientIds?: string[]) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const in7Days  = new Date(today); in7Days.setDate(in7Days.getDate() + 7)
  const in30Days = new Date(today); in30Days.setDate(in30Days.getDate() + 30)
  const clientFilter = clientIds && clientIds.length > 0 ? { clientId: { in: clientIds } } : {}

  let sent = 0

  // ── Alertas por CUOTA (facturas con cuotas) ───────────────────────────────

  // Cuotas vencidas sin alertar
  const cuotasOverdue = await prisma.invoiceCuota.findMany({
    where: { status: { in: ['PENDING', 'OVERDUE'] }, dueDate: { lt: today }, alert0Sent: false, invoice: clientFilter },
    include: { invoice: { include: { client: true, company: true } } },
  })

  // Cuotas que vencen en ≤7 días
  const cuotasDue7 = await prisma.invoiceCuota.findMany({
    where: { status: 'PENDING', dueDate: { gte: today, lte: in7Days }, alert7Sent: false, invoice: clientFilter },
    include: { invoice: { include: { client: true, company: true } } },
  })

  // Cuotas que vencen en ≤30 días (>7)
  const cuotasDue30 = await prisma.invoiceCuota.findMany({
    where: { status: 'PENDING', dueDate: { gt: in7Days, lte: in30Days }, alert30Sent: false, invoice: clientFilter },
    include: { invoice: { include: { client: true, company: true } } },
  })

  for (const cuota of cuotasOverdue) {
    const inv = cuota.invoice
    // Construir invoice-like object con datos de la cuota específica
    const invForAlert = {
      ...inv,
      dueDate: cuota.dueDate,
      total: cuota.amount,
      description: `${inv.series}-${inv.number} · Cuota ${cuota.number}`,
    }
    await emailService.sendOverdueAlert(invForAlert as any)
    await prisma.invoiceCuota.update({ where: { id: cuota.id }, data: { alert0Sent: true, status: 'OVERDUE' } })
    sent++
  }

  for (const cuota of cuotasDue7) {
    const inv = cuota.invoice
    const daysUntil = Math.ceil((cuota.dueDate.getTime() - today.getTime()) / 86400000)
    const invForAlert = {
      ...inv,
      dueDate: cuota.dueDate,
      total: cuota.amount,
      description: `${inv.series}-${inv.number} · Cuota ${cuota.number}`,
    }
    await emailService.sendDueSoonAlert(invForAlert as any, daysUntil)
    await prisma.invoiceCuota.update({ where: { id: cuota.id }, data: { alert7Sent: true } })
    sent++
  }

  for (const cuota of cuotasDue30) {
    const inv = cuota.invoice
    const daysUntil = Math.ceil((cuota.dueDate.getTime() - today.getTime()) / 86400000)
    const invForAlert = {
      ...inv,
      dueDate: cuota.dueDate,
      total: cuota.amount,
      description: `${inv.series}-${inv.number} · Cuota ${cuota.number}`,
    }
    await emailService.sendDueSoonAlert(invForAlert as any, daysUntil)
    await prisma.invoiceCuota.update({ where: { id: cuota.id }, data: { alert30Sent: true } })
    sent++
  }

  // ── Alertas por FACTURA (sin cuotas) ─────────────────────────────────────

  const overdue = await prisma.invoice.findMany({
    where: { status: { in: ['PENDING', 'PARTIAL'] }, dueDate: { lt: today }, alert0Sent: false, cuotas: { none: {} }, ...clientFilter },
    include: { client: true, company: true },
  })

  const dueSoon7 = await prisma.invoice.findMany({
    where: { status: { in: ['PENDING', 'PARTIAL'] }, dueDate: { gte: today, lte: in7Days }, alert7Sent: false, cuotas: { none: {} }, ...clientFilter },
    include: { client: true, company: true },
  })

  const dueSoon30 = await prisma.invoice.findMany({
    where: { status: { in: ['PENDING', 'PARTIAL'] }, dueDate: { gt: in7Days, lte: in30Days }, alert30Sent: false, cuotas: { none: {} }, ...clientFilter },
    include: { client: true, company: true },
  })

  for (const inv of overdue) {
    await emailService.sendOverdueAlert(inv)
    await prisma.invoice.update({ where: { id: inv.id }, data: { alert0Sent: true, status: 'OVERDUE' } })
    sent++
  }

  for (const inv of dueSoon7) {
    await emailService.sendDueSoonAlert(inv, 7)
    await prisma.invoice.update({ where: { id: inv.id }, data: { alert7Sent: true } })
    sent++
  }

  for (const inv of dueSoon30) {
    await emailService.sendDueSoonAlert(inv, 30)
    await prisma.invoice.update({ where: { id: inv.id }, data: { alert30Sent: true } })
    sent++
  }

  console.log(`[AlertsJob] ${sent} alertas de factura/cuota enviadas`)

  // ── Alertas de mantenimiento ─────────────────────────────────────────────
  const plans = await prisma.maintenancePlan.findMany({
    where: { active: true },
    include: { equipment: { select: { name: true, currentHours: true } } },
  })

  let maintSent = 0
  for (const plan of plans) {
    const urgency = getPlanUrgency(
      plan.nextDueAt,
      plan.nextDueHours ? Number(plan.nextDueHours) : null,
      Number(plan.equipment.currentHours),
    )
    if (urgency !== 'OK') {
      console.log(`[AlertsJob] Mant. ${urgency}: ${plan.equipment.name} — ${plan.name}`)
      maintSent++
    }
  }

  console.log(`[AlertsJob] ${maintSent} alertas de mantenimiento detectadas`)
  return sent
}
