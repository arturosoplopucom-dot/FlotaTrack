import { prisma } from '../../config/database'

export type ReportPeriod = '1m' | '3m' | '6m' | '1y' | 'all'

export interface DateRangeFilter {
  dateFrom?: Date
  dateTo?:   Date
}

function periodStart(period: ReportPeriod): Date | null {
  if (period === 'all') return null
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  if (period === '1m') d.setMonth(d.getMonth() - 1)
  if (period === '3m') d.setMonth(d.getMonth() - 3)
  if (period === '6m') d.setMonth(d.getMonth() - 6)
  if (period === '1y') d.setFullYear(d.getFullYear() - 1)
  return d
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function dateFilter(f: DateRangeFilter) {
  if (!f.dateFrom && !f.dateTo) return undefined
  return {
    ...(f.dateFrom ? { gte: f.dateFrom } : {}),
    ...(f.dateTo   ? { lte: f.dateTo }   : {}),
  }
}

const COMPLETED_STATUSES = ['COMPLETED', 'BILLED', 'PAID'] as const

export const reportsService = {

  // ─── GERENCIAL (Profitability) ────────────────────────────────────────────
  async getProfitability(companyId: string, period: ReportPeriod = '6m') {
    const since = periodStart(period)
    const df = since ? { gte: since } : undefined

    const workOrders = await prisma.workOrder.findMany({
      where: {
        companyId,
        status: { in: [...COMPLETED_STATUSES] },
        ...(df ? { startDate: df } : {}),
      },
      include: {
        costs:     true,
        client:    { select: { businessName: true } },
        equipment: { select: { name: true, type: true } },
      },
    })

    const allWOs = await prisma.workOrder.findMany({
      where: { companyId, ...(df ? { startDate: df } : {}) },
      select: { status: true },
    })

    const invoices = await prisma.invoice.findMany({
      where: { companyId, ...(df ? { issueDate: df } : {}) },
      select: { total: true, detraccion: true, status: true, payments: { select: { amount: true } } },
    })

    const maintRecords = await prisma.maintenanceRecord.findMany({
      where: { companyId, ...(df ? { performedAt: df } : {}) },
      select: { cost: true, performedAt: true },
    })

    const totalRevenue    = workOrders.reduce((s, wo) => s + Number(wo.subtotal), 0)
    const totalOpCosts    = workOrders.reduce((s, wo) => s + wo.costs.reduce((cs, c) => cs + Number(c.amount), 0), 0)
    const totalMaintCost  = maintRecords.reduce((s, r) => s + Number(r.cost), 0)
    const totalCosts      = totalOpCosts + totalMaintCost
    const grossMargin     = totalRevenue - totalCosts
    const marginPct       = totalRevenue > 0 ? (grossMargin / totalRevenue) * 100 : 0
    const totalInvoiced   = invoices.reduce((s, inv) => s + Number(inv.total), 0)
    // cobrado = efectivo real recibido (suma de registros Payment) — igual que Reporte de Pagos
    const totalCollected  = invoices.reduce((s, inv) => s + inv.payments.reduce((ps, p) => ps + Number(p.amount), 0), 0)
    // pendiente = balance real (total - detraccion - pagos parciales)
    const pendingCollectionReal = invoices
      .filter((inv) => inv.status !== 'PAID')
      .reduce((s, inv) => {
        const paid = inv.payments.reduce((ps, p) => ps + Number(p.amount), 0)
        const det  = Number((inv as any).detraccion ?? 0)
        return s + Math.max(0, Number(inv.total) - det - paid)
      }, 0)

    const completedOTs = allWOs.filter((wo) => (COMPLETED_STATUSES as readonly string[]).includes(wo.status)).length
    const activeOTs    = allWOs.filter((wo) => wo.status === 'ACTIVE' || wo.status === 'ACCEPTED').length
    const draftOTs     = allWOs.filter((wo) => wo.status === 'DRAFT').length

    const monthMap: Record<string, { revenue: number; costs: number; margin: number }> = {}
    for (const wo of workOrders) {
      const key = monthKey(wo.startDate)
      if (!monthMap[key]) monthMap[key] = { revenue: 0, costs: 0, margin: 0 }
      const rev  = Number(wo.subtotal)
      const cost = wo.costs.reduce((s, c) => s + Number(c.amount), 0)
      monthMap[key].revenue += rev
      monthMap[key].costs   += cost
      monthMap[key].margin  += rev - cost
    }
    const byMonth = Object.entries(monthMap).sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({ month, ...data }))

    const catMap: Record<string, number> = {}
    for (const wo of workOrders) {
      for (const c of wo.costs) catMap[c.category] = (catMap[c.category] ?? 0) + Number(c.amount)
    }
    if (totalMaintCost > 0) catMap['MAINTENANCE'] = (catMap['MAINTENANCE'] ?? 0) + totalMaintCost
    const byCostCategory = Object.entries(catMap)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)

    const clientMap: Record<string, { name: string; revenue: number; costs: number; otCount: number }> = {}
    for (const wo of workOrders) {
      if (!clientMap[wo.clientId]) clientMap[wo.clientId] = { name: wo.client.businessName, revenue: 0, costs: 0, otCount: 0 }
      const cost = wo.costs.reduce((s, c) => s + Number(c.amount), 0)
      clientMap[wo.clientId].revenue += Number(wo.subtotal)
      clientMap[wo.clientId].costs   += cost
      clientMap[wo.clientId].otCount++
    }
    const byClient = Object.values(clientMap)
      .map((c) => ({ ...c, margin: c.revenue - c.costs, marginPct: c.revenue > 0 ? ((c.revenue - c.costs) / c.revenue) * 100 : 0 }))
      .sort((a, b) => b.revenue - a.revenue).slice(0, 8)

    const equipMap: Record<string, { name: string; type: string; revenue: number; hours: number; otCount: number }> = {}
    for (const wo of workOrders) {
      if (!equipMap[wo.equipmentId]) equipMap[wo.equipmentId] = { name: wo.equipment.name, type: wo.equipment.type, revenue: 0, hours: 0, otCount: 0 }
      equipMap[wo.equipmentId].revenue += Number(wo.subtotal)
      equipMap[wo.equipmentId].otCount++
      if (wo.billingType === 'HOURLY') equipMap[wo.equipmentId].hours += Number(wo.quantity)
      if (wo.billingType === 'DAILY')  equipMap[wo.equipmentId].hours += Number(wo.quantity) * 8
    }
    const byEquipment = Object.values(equipMap).sort((a, b) => b.revenue - a.revenue).slice(0, 6)

    const woCurrencies = await prisma.$queryRaw<{ id: string; currency: string }[]>`SELECT id, currency FROM work_orders WHERE "companyId" = ${companyId}`
    const curMap = new Map(woCurrencies.map((r) => [r.id, r.currency]))

    let totalRevenuePen = 0, totalRevenueUsd = 0
    for (const wo of workOrders) {
      const rev = Number(wo.subtotal)
      if (curMap.get(wo.id) === 'USD') totalRevenueUsd += rev
      else totalRevenuePen += rev
    }

    const topOTs = workOrders
      .map((wo) => {
        const costs  = wo.costs.reduce((s, c) => s + Number(c.amount), 0)
        const margin = Number(wo.subtotal) - costs
        return { number: wo.number, clientName: wo.client.businessName, equipmentName: wo.equipment.name,
          revenue: Number(wo.subtotal), costs, margin,
          marginPct: Number(wo.subtotal) > 0 ? (margin / Number(wo.subtotal)) * 100 : 0,
          startDate: wo.startDate, currency: curMap.get(wo.id) ?? 'PEN' }
      })
      .sort((a, b) => b.margin - a.margin).slice(0, 5)

    return {
      period,
      summary: { totalRevenue, totalRevenuePen, totalRevenueUsd, totalCosts, grossMargin, marginPct,
        totalInvoiced, totalCollected, pendingCollection: pendingCollectionReal,
        completedOTs, activeOTs, draftOTs, totalMaintCost },
      byMonth, byCostCategory, byClient, byEquipment, topOTs,
    }
  },

  // ─── EQUIPMENT ────────────────────────────────────────────────────────────
  async getEquipmentReport(companyId: string, params: { status?: string } & DateRangeFilter) {
    const df = dateFilter(params)
    const equipment = await prisma.equipment.findMany({
      where: {
        companyId,
        active: true,
        ...(params.status ? { status: params.status as any } : {}),
      },
      include: {
        workOrders: {
          where: { ...(df ? { startDate: df } : {}), status: { in: ['COMPLETED', 'BILLED', 'PAID', 'ACTIVE'] } },
          select: { subtotal: true, quantity: true, billingType: true, status: true },
        },
        maintenanceRecords: {
          where: df ? { performedAt: df } : {},
          select: { cost: true },
        },
      },
      orderBy: { name: 'asc' },
    })

    return equipment.map((eq) => {
      const revenue   = eq.workOrders.reduce((s, wo) => s + Number(wo.subtotal), 0)
      const maintCost = eq.maintenanceRecords.reduce((s, r) => s + Number(r.cost), 0)
      const hours     = eq.workOrders.reduce((s, wo) => {
        if (wo.billingType === 'HOURLY') return s + Number(wo.quantity)
        if (wo.billingType === 'DAILY')  return s + Number(wo.quantity) * 8
        return s
      }, 0)
      return {
        id: eq.id, name: eq.name, brand: eq.brand, model: eq.model,
        type: eq.type, status: eq.status, capacity: eq.capacity,
        currentHours: Number(eq.currentHours),
        otCount: eq.workOrders.length, revenue, maintCost, hours,
      }
    })
  },

  // ─── WORK ORDERS ─────────────────────────────────────────────────────────
  async getWorkOrdersReport(companyId: string, params: { status?: string; clientId?: string; equipmentId?: string } & DateRangeFilter) {
    const df = dateFilter(params)
    const workOrders = await prisma.workOrder.findMany({
      where: {
        companyId,
        ...(params.status     ? { status: params.status as any } : {}),
        ...(params.clientId   ? { clientId: params.clientId }   : {}),
        ...(params.equipmentId ? { equipmentId: params.equipmentId } : {}),
        ...(df ? { startDate: df } : {}),
      },
      include: {
        client:    { select: { businessName: true, ruc: true } },
        equipment: { select: { name: true, type: true } },
        operator:  { select: { name: true } },
        costs:     { select: { amount: true, category: true } },
      },
      orderBy: { startDate: 'desc' },
    })

    const statusCounts: Record<string, number> = {}
    let totalRevenue = 0, totalCosts = 0

    const woCurs = await prisma.$queryRaw<{ id: string; currency: string }[]>`SELECT id, currency FROM work_orders WHERE "companyId" = ${companyId}`
    const curMap2 = new Map(woCurs.map((r) => [r.id, r.currency]))

    const items = workOrders.map((wo) => {
      statusCounts[wo.status] = (statusCounts[wo.status] ?? 0) + 1
      const rev  = Number(wo.subtotal)
      const cost = wo.costs.reduce((s, c) => s + Number(c.amount), 0)
      totalRevenue += rev; totalCosts += cost
      return {
        id: wo.id, number: wo.number,
        clientName: wo.client.businessName, clientRuc: wo.client.ruc,
        equipmentName: wo.equipment.name, equipmentType: wo.equipment.type,
        operatorName: wo.operator.name,
        location: wo.location, startDate: wo.startDate, endDate: wo.endDate,
        billingType: wo.billingType, quantity: Number(wo.quantity),
        unitRate: Number(wo.unitRate), subtotal: rev, costs: cost,
        margin: rev - cost, status: wo.status,
        currency: curMap2.get(wo.id) ?? 'PEN',
      }
    })

    return { items, summary: { total: items.length, totalRevenue, totalCosts, grossMargin: totalRevenue - totalCosts, statusCounts } }
  },

  // ─── INVOICES ─────────────────────────────────────────────────────────────
  async getInvoicesReport(companyId: string, params: { status?: string; clientId?: string } & DateRangeFilter) {
    const df = dateFilter(params)
    const today = new Date(); today.setHours(0, 0, 0, 0)

    const invoices = await prisma.invoice.findMany({
      where: {
        companyId,
        ...(params.status   ? { status: params.status as any } : {}),
        ...(params.clientId ? { clientId: params.clientId }   : {}),
        ...(df ? { issueDate: df } : {}),
      },
      include: {
        client:   { select: { businessName: true, ruc: true } },
        payments: { select: { amount: true, currency: true } },
      },
      orderBy: { issueDate: 'desc' },
    })

    let totalInvoiced = 0, totalPaid = 0, totalOverdue = 0
    let totalInvoicedUsd = 0, totalPaidUsd = 0, totalOverdueUsd = 0
    const statusCounts: Record<string, number> = {}

    const items = invoices.map((inv) => {
      const isUsd   = inv.currency === 'USD'
      const tc      = Number(inv.tcambio ?? 0)
      const totalUs = Number((inv as any).totalUsd ?? 0)
      const isPaid  = inv.status === 'PAID'
      const effectivelyOverdue = !isPaid && (inv.status === 'OVERDUE' || new Date(inv.dueDate) < today)

      let paid: number, balance: number, balanceUsd: number | null = null
      if (isUsd && totalUs > 0 && tc > 0) {
        const rawPaidUsd = inv.payments.reduce((s, p) => {
          const pCur = (p as any).currency ?? 'USD'
          return s + (pCur === 'PEN' ? Number(p.amount) / tc : Number(p.amount))
        }, 0)
        const paidUsd    = isPaid ? totalUs : rawPaidUsd
        balanceUsd       = isPaid ? 0 : Math.max(0, Math.round((totalUs - rawPaidUsd) * 100) / 100)
        paid             = Math.round(paidUsd * tc * 100) / 100
        balance          = Math.round(balanceUsd * tc * 100) / 100
        totalInvoicedUsd += totalUs
        totalPaidUsd     += paidUsd
        if (effectivelyOverdue) totalOverdueUsd += balanceUsd
      } else {
        const rawPaid = inv.payments.reduce((s, p) => s + Number(p.amount), 0)
        paid    = isPaid ? Number(inv.total) : rawPaid
        balance = isPaid ? 0 : Math.max(0, Number(inv.total) - rawPaid)
        totalInvoiced += Number(inv.total)
        totalPaid     += paid
        if (effectivelyOverdue) totalOverdue += balance
      }

      statusCounts[inv.status] = (statusCounts[inv.status] ?? 0) + 1
      return {
        id: inv.id, series: inv.series, number: inv.number,
        clientName: inv.client.businessName, clientRuc: inv.client.ruc,
        issueDate: inv.issueDate, dueDate: inv.dueDate,
        amount: Number(inv.amount), igv: Number(inv.igv), total: Number(inv.total),
        totalUsd: totalUs > 0 ? totalUs : null,
        tcambio: tc > 0 ? tc : null,
        detraccion: Number(inv.detraccion ?? 0),
        paid, balance, balanceUsd, currency: inv.currency, status: inv.status,
      }
    })

    return {
      items,
      summary: {
        total: items.length, totalInvoiced, totalPaid,
        totalPending: totalInvoiced - totalPaid, totalOverdue,
        totalInvoicedUsd, totalPaidUsd,
        totalPendingUsd: Math.max(0, totalInvoicedUsd - totalPaidUsd),
        totalOverdueUsd, statusCounts,
      },
    }
  },

  // ─── QUOTES ───────────────────────────────────────────────────────────────
  async getQuotesReport(companyId: string, params: { status?: string; clientId?: string } & DateRangeFilter) {
    const df = dateFilter(params)
    const quotes = await prisma.quote.findMany({
      where: {
        companyId,
        ...(params.status   ? { status: params.status as any } : {}),
        ...(params.clientId ? { clientId: params.clientId }   : {}),
        ...(df ? { issueDate: df } : {}),
      },
      include: {
        client:    { select: { businessName: true, ruc: true } },
        equipment: { select: { name: true } },
      },
      orderBy: { issueDate: 'desc' },
    })

    let totalAmount = 0, convertedAmount = 0
    const statusCounts: Record<string, number> = {}

    const items = quotes.map((q) => {
      totalAmount += Number(q.total)
      if (q.status === 'CONVERTED') convertedAmount += Number(q.total)
      statusCounts[q.status] = (statusCounts[q.status] ?? 0) + 1
      return {
        id: q.id, number: q.number,
        clientName: q.client.businessName, clientRuc: q.client.ruc,
        equipmentName: q.equipment?.name ?? '',
        issueDate: q.issueDate, validUntil: q.validUntil,
        total: Number(q.total), currency: q.currency, status: q.status,
      }
    })

    const conversionRate = items.length > 0 ? ((statusCounts['CONVERTED'] ?? 0) / items.length) * 100 : 0
    return { items, summary: { total: items.length, totalAmount, convertedAmount, conversionRate, statusCounts } }
  },

  // ─── MAINTENANCE ─────────────────────────────────────────────────────────
  async getMaintenanceReport(companyId: string, params: { equipmentId?: string } & DateRangeFilter) {
    const df = dateFilter(params)
    const [records, plans] = await Promise.all([
      prisma.maintenanceRecord.findMany({
        where: {
          companyId,
          ...(params.equipmentId ? { equipmentId: params.equipmentId } : {}),
          ...(df ? { performedAt: df } : {}),
        },
        include: {
          equipment: { select: { name: true, type: true } },
          plan:      { select: { name: true } },
        },
        orderBy: { performedAt: 'desc' },
      }),
      prisma.maintenancePlan.findMany({
        where: {
          companyId, active: true,
          ...(params.equipmentId ? { equipmentId: params.equipmentId } : {}),
        },
        include: { equipment: { select: { name: true, type: true } } },
        orderBy: { nextDueAt: 'asc' },
      }),
    ])

    let totalCost = 0
    const items = records.map((r) => {
      totalCost += Number(r.cost)
      return {
        id: r.id, equipmentName: r.equipment.name, equipmentType: r.equipment.type,
        planName: r.plan?.name ?? 'Registro manual',
        performedAt: r.performedAt,
        hoursAtService: r.hoursAtService ? Number(r.hoursAtService) : null,
        technician: r.technician, description: r.description, cost: Number(r.cost),
      }
    })

    const upcomingPlans = plans.map((p) => ({
      id: p.id, equipmentName: p.equipment.name, name: p.name,
      nextDueAt: p.nextDueAt, nextDueHours: p.nextDueHours ? Number(p.nextDueHours) : null,
      intervalType: p.intervalType,
    }))

    return { items, upcomingPlans, summary: { total: items.length, totalCost } }
  },

  // ─── CLIENTS ─────────────────────────────────────────────────────────────
  async getClientsReport(companyId: string, params: DateRangeFilter) {
    const df = dateFilter(params)
    const clients = await prisma.client.findMany({
      where: { companyId, active: true },
      include: {
        invoices: {
          where: df ? { issueDate: df } : {},
          include: { payments: { select: { amount: true } } },
        },
        workOrders: {
          where: {
            ...(df ? { startDate: df } : {}),
            status: { in: ['COMPLETED', 'BILLED', 'PAID'] },
          },
          select: { id: true, subtotal: true },
        },
      },
      orderBy: { businessName: 'asc' },
    })

    return clients.map((c) => {
      const totalInvoiced = c.invoices.reduce((s, inv) => s + Number(inv.total), 0)
      const totalPaid     = c.invoices.reduce((s, inv) => s + inv.payments.reduce((ps, p) => ps + Number(p.amount), 0), 0)
      const otRevenue     = c.workOrders.reduce((s, wo) => s + Number(wo.subtotal), 0)
      return {
        id: c.id, businessName: c.businessName, ruc: c.ruc, phone: c.phone, email: c.email,
        otCount: c.workOrders.length, invoiceCount: c.invoices.length,
        totalInvoiced, totalPaid, pending: totalInvoiced - totalPaid,
        overdueCount: c.invoices.filter((inv) => inv.status === 'OVERDUE').length,
        otRevenue,
      }
    }).sort((a, b) => b.totalInvoiced - a.totalInvoiced)
  },

  // ─── PAYMENTS ─────────────────────────────────────────────────────────────
  async getPaymentsReport(companyId: string, params: { method?: string } & DateRangeFilter) {
    const df = dateFilter(params)
    const where = {
      invoice: { companyId },
      ...(df ? { paidAt: df } : {}),
      ...(params.method ? { method: params.method as any } : {}),
    }

    const items = await prisma.payment.findMany({
      where,
      include: {
        invoice: {
          select: {
            series: true, number: true, total: true, currency: true,
            client: { select: { businessName: true, ruc: true } },
          },
        },
      },
      orderBy: { paidAt: 'desc' },
    })

    const totalAmount = items.reduce((s, p) => s + Number(p.amount), 0)
    const avgAmount   = items.length > 0 ? totalAmount / items.length : 0

    // Breakdown por método
    const byMethod: Record<string, { count: number; amount: number }> = {}
    for (const p of items) {
      const m = p.method
      if (!byMethod[m]) byMethod[m] = { count: 0, amount: 0 }
      byMethod[m].count  += 1
      byMethod[m].amount += Number(p.amount)
    }

    // Tendencia mensual (últimos 6 meses)
    const monthly: Record<string, number> = {}
    for (const p of items) {
      const key = monthKey(new Date(p.paidAt))
      monthly[key] = (monthly[key] ?? 0) + Number(p.amount)
    }

    return {
      items: items.map((p) => ({
        id:            p.id,
        paidAt:        p.paidAt.toISOString(),
        amount:        Number(p.amount),
        method:        p.method,
        reference:     p.reference,
        notes:         p.notes,
        invoiceSeries: p.invoice.series,
        invoiceNumber: p.invoice.number,
        invoiceTotal:  Number(p.invoice.total),
        currency:      p.invoice.currency,
        clientName:    p.invoice.client.businessName,
        clientRuc:     p.invoice.client.ruc,
      })),
      summary: {
        total:       items.length,
        totalAmount,
        avgAmount,
        byMethod,
        monthly,
      },
    }
  },

  // ─── EQUIPMENT PROFITABILITY ──────────────────────────────────────────────
  async getEquipmentProfitability(companyId: string, params: { period?: ReportPeriod } & DateRangeFilter) {
    const period = (params.period ?? '6m') as ReportPeriod
    const since  = params.dateFrom ?? (period !== 'all' ? periodStart(period) : null)
    const until  = params.dateTo   ?? null
    const df = (since || until) ? {
      ...(since ? { gte: since } : {}),
      ...(until ? { lte: until } : {}),
    } : undefined

    // Query work orders with costs + service reports for proportional attribution
    const workOrders = await prisma.workOrder.findMany({
      where: {
        companyId,
        status: { in: ['COMPLETED', 'BILLED', 'PAID', 'ACTIVE'] },
        ...(df ? { startDate: df } : {}),
      },
      include: {
        costs: { select: { amount: true, category: true } },
        serviceReports: { select: { equipmentId: true, amount: true, totalHours: true } },
      },
    })

    const equipmentList = await prisma.equipment.findMany({
      where: { companyId, active: true },
      include: {
        maintenanceRecords: {
          where: df ? { performedAt: df } : {},
          select: { cost: true },
        },
      },
      orderBy: { name: 'asc' },
    })

    // Per-equipment attribution maps
    const eqRevenue:  Map<string, number>             = new Map()
    const eqOpCosts:  Map<string, number>             = new Map()
    const eqHours:    Map<string, number>             = new Map()
    const eqOtIds:    Map<string, Set<string>>        = new Map()
    const eqCatCosts: Map<string, Record<string, number>> = new Map()
    const eqWONums:   Map<string, Map<string, string>> = new Map() // eqId → (woId → woNumber)
    const eqCurrency: Map<string, string>              = new Map() // eqId → dominant currency

    const addTo = (map: Map<string, number>, key: string, val: number) =>
      map.set(key, (map.get(key) ?? 0) + val)

    const trackWO = (eqId: string, woId: string, woNumber: string, woCurrency: string) => {
      if (!eqWONums.has(eqId)) eqWONums.set(eqId, new Map())
      eqWONums.get(eqId)!.set(woId, woNumber)
      // USD takes precedence: if any OT is USD the equipment's revenue is USD
      if (woCurrency === 'USD' || !eqCurrency.has(eqId)) eqCurrency.set(eqId, woCurrency)
    }

    for (const wo of workOrders) {
      const totalRevenue = Number(wo.subtotal)
      const totalOpCost  = wo.costs.reduce((s, c) => s + Number(c.amount), 0)

      // Group service reports by equipment
      const srByEquip = new Map<string, { amount: number; hours: number }>()
      let totalSrAmount = 0
      for (const sr of wo.serviceReports) {
        if (!sr.equipmentId) continue
        const cur = srByEquip.get(sr.equipmentId) ?? { amount: 0, hours: 0 }
        cur.amount += Number(sr.amount)
        cur.hours  += Number(sr.totalHours)
        srByEquip.set(sr.equipmentId, cur)
        totalSrAmount += Number(sr.amount)
      }

      if (srByEquip.size > 0) {
        // Multi-equipment OT: distribute revenue & costs proportionally by SR amount
        for (const [eqId, sr] of srByEquip) {
          const share     = totalSrAmount > 0 ? sr.amount / totalSrAmount : 1 / srByEquip.size
          const revShare  = totalRevenue * share
          const costShare = totalOpCost  * share

          addTo(eqRevenue, eqId, revShare)
          addTo(eqOpCosts, eqId, costShare)
          addTo(eqHours,   eqId, sr.hours)
          if (!eqOtIds.has(eqId)) eqOtIds.set(eqId, new Set())
          eqOtIds.get(eqId)!.add(wo.id)
          trackWO(eqId, wo.id, wo.number, (wo as any).currency ?? 'PEN')

          if (!eqCatCosts.has(eqId)) eqCatCosts.set(eqId, {})
          const catMap = eqCatCosts.get(eqId)!
          for (const c of wo.costs) {
            const catShare = totalOpCost > 0 ? (Number(c.amount) / totalOpCost) * costShare : 0
            catMap[c.category] = (catMap[c.category] ?? 0) + catShare
          }
        }
      } else if (wo.equipmentId) {
        // Single-equipment OT (no service reports or SRs without equipmentId)
        const eqId = wo.equipmentId
        const hours = wo.billingType === 'HOURLY' ? Number(wo.quantity) :
                      wo.billingType === 'DAILY'   ? Number(wo.quantity) * 8 : 0

        addTo(eqRevenue, eqId, totalRevenue)
        addTo(eqOpCosts, eqId, totalOpCost)
        addTo(eqHours,   eqId, hours)
        if (!eqOtIds.has(eqId)) eqOtIds.set(eqId, new Set())
        eqOtIds.get(eqId)!.add(wo.id)
        trackWO(eqId, wo.id, wo.number, (wo as any).currency ?? 'PEN')

        if (!eqCatCosts.has(eqId)) eqCatCosts.set(eqId, {})
        const catMap = eqCatCosts.get(eqId)!
        for (const c of wo.costs) {
          catMap[c.category] = (catMap[c.category] ?? 0) + Number(c.amount)
        }
      }
      // OT with no equipmentId and no service reports → unattributed
    }

    const items = equipmentList.map((eq) => {
      const revenue   = eqRevenue.get(eq.id) ?? 0
      const opCosts   = eqOpCosts.get(eq.id) ?? 0
      const maintCost = eq.maintenanceRecords.reduce((s, r) => s + Number(r.cost), 0)
      const totalCost = opCosts + maintCost
      const margin    = revenue - totalCost
      const marginPct = revenue > 0 ? (margin / revenue) * 100 : 0
      const hours     = eqHours.get(eq.id) ?? 0
      const otCount   = eqOtIds.get(eq.id)?.size ?? 0
      const costsByCategory = eqCatCosts.get(eq.id) ?? {}
      const workOrders = Array.from(eqWONums.get(eq.id)?.entries() ?? [])
        .map(([id, number]) => ({ id, number }))
        .sort((a, b) => a.number.localeCompare(b.number))

      return {
        id: eq.id, name: eq.name, brand: eq.brand, model: eq.model,
        type: eq.type, status: eq.status,
        otCount, revenue, opCosts, maintCost, totalCost,
        margin, marginPct, hours,
        costsByCategory, workOrders,
        currency: eqCurrency.get(eq.id) ?? 'PEN',
      }
    }).sort((a, b) => b.revenue - a.revenue)

    const totals = items.reduce(
      (s, it) => ({
        revenue:   s.revenue   + it.revenue,
        opCosts:   s.opCosts   + it.opCosts,
        maintCost: s.maintCost + it.maintCost,
        totalCost: s.totalCost + it.totalCost,
        margin:    s.margin    + it.margin,
        otCount:   s.otCount   + it.otCount,
        hours:     s.hours     + it.hours,
      }),
      { revenue: 0, opCosts: 0, maintCost: 0, totalCost: 0, margin: 0, otCount: 0, hours: 0 }
    )
    const avgMarginPct = totals.revenue > 0 ? (totals.margin / totals.revenue) * 100 : 0

    return { period, items, totals: { ...totals, marginPct: avgMarginPct } }
  },
}
