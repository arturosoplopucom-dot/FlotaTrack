import React, { useMemo } from 'react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { useInvoices } from '../hooks/useInvoices'
import { useEquipment } from '../hooks/useFlota'

type ActivityType = 'payment' | 'dispatch' | 'maintenance' | 'invoice'

interface ActivityItem {
  id: string
  type: ActivityType
  title: string
  detail: string
  badge: string
  timestamp: string
  amountFmt?: string
}

const TYPE_COLOR: Record<ActivityType, string> = {
  payment:     'var(--clr-success)',
  dispatch:    'var(--clr-primary)',
  maintenance: '#d97706',
  invoice:     'var(--clr-primary)',
}

const TYPE_BADGE_BG: Record<ActivityType, string> = {
  payment:     'var(--clr-success-bg)',
  dispatch:    'var(--clr-primary-bg)',
  maintenance: 'rgba(217,119,6,0.12)',
  invoice:     'var(--clr-primary-bg)',
}

const fmt = (n: number, currency: 'PEN' | 'USD' = 'PEN') =>
  (currency === 'PEN' ? 'S/ ' : '$ ') +
  n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const timeAgo = (dateStr: string) => {
  try {
    return formatDistanceToNow(parseISO(dateStr), { addSuffix: true, locale: es })
  } catch {
    return dateStr.slice(0, 10)
  }
}

const RecentActivities: React.FC = () => {
  const { data: invoicesData } = useInvoices()
  const { data: equipment = [] } = useEquipment()

  const activities = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = []
    const invoices = invoicesData?.items ?? []

    // Últimos pagos (facturas PAID ordenadas por vencimiento desc)
    const paid = [...invoices]
      .filter((inv) => inv.status === 'PAID')
      .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
      .slice(0, 3)

    for (const inv of paid) {
      items.push({
        id: `payment-${inv.id}`,
        type: 'payment',
        title: `Cobro registrado — ${inv.client.businessName}`,
        detail: `Factura ${inv.series}-${inv.number} · ${fmt(parseFloat(inv.total), inv.currency)}`,
        badge: 'COBRADO',
        timestamp: inv.dueDate,
        amountFmt: fmt(parseFloat(inv.total), inv.currency),
      })
    }

    // Facturas vencidas recientes (OVERDUE)
    const overdue = [...invoices]
      .filter((inv) => inv.status === 'OVERDUE')
      .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
      .slice(0, 2)

    for (const inv of overdue) {
      items.push({
        id: `overdue-${inv.id}`,
        type: 'invoice',
        title: `Factura vencida — ${inv.client.businessName}`,
        detail: `${inv.series}-${inv.number} · Venció ${timeAgo(inv.dueDate)}`,
        badge: 'VENCIDA',
        timestamp: inv.dueDate,
        amountFmt: fmt(parseFloat(inv.total), inv.currency),
      })
    }

    // Facturas pendientes emitidas recientemente (PENDING / PARTIAL)
    const recent = [...invoices]
      .filter((inv) => inv.status === 'PENDING' || inv.status === 'PARTIAL')
      .sort((a, b) => b.issueDate.localeCompare(a.issueDate))
      .slice(0, 2)

    for (const inv of recent) {
      items.push({
        id: `invoice-${inv.id}`,
        type: 'invoice',
        title: `Factura emitida — ${inv.client.businessName}`,
        detail: `${inv.series}-${inv.number} · Vence ${timeAgo(inv.dueDate)}`,
        badge: inv.status === 'PARTIAL' ? 'PARCIAL' : 'EMITIDA',
        timestamp: inv.issueDate,
        amountFmt: fmt(parseFloat(inv.total), inv.currency),
      })
    }

    // Equipos en mantenimiento
    const inMaint = equipment.filter((e) => e.status === 'MAINTENANCE').slice(0, 2)
    for (const eq of inMaint) {
      items.push({
        id: `maint-${eq.id}`,
        type: 'maintenance',
        title: `En mantenimiento — ${eq.name}`,
        detail: `${eq.brand ?? ''} ${eq.model ?? ''}`.trim() || 'Equipo en taller',
        badge: 'MANTENIMIENTO',
        timestamp: new Date().toISOString(),
      })
    }

    // Equipos despachados (IN_USE)
    const inUse = equipment.filter((e) => e.status === 'IN_USE').slice(0, 2)
    for (const eq of inUse) {
      items.push({
        id: `dispatch-${eq.id}`,
        type: 'dispatch',
        title: `Equipo despachado — ${eq.name}`,
        detail: `${eq.brand ?? ''} ${eq.model ?? ''}`.trim() || 'En operación',
        badge: 'EN OBRA',
        timestamp: new Date().toISOString(),
      })
    }

    // Ordenar por timestamp desc y limitar a 8
    return items
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 8)
  }, [invoicesData, equipment])

  return (
    <div
      style={{
        backgroundColor: 'var(--clr-surface)',
        border: '1px solid var(--clr-border)',
        borderRadius: 8,
        padding: 20,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 14,
          borderBottom: '1px solid var(--clr-border)',
          paddingBottom: 10,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 14, color: 'var(--clr-text)', fontWeight: 700 }}>
          Bitácora Reciente de Operaciones y Cobranza
        </h3>
        <span style={{ fontSize: 11, color: 'var(--clr-text-muted)' }}>Últimas actividades registradas</span>
      </div>

      {/* Activity list */}
      {activities.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--clr-text-muted)', textAlign: 'center', padding: '24px 0' }}>
          Sin actividad reciente
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {activities.map((act) => {
            const color = TYPE_COLOR[act.type]
            const badgeBg = TYPE_BADGE_BG[act.type]
            return (
              <div
                key={act.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '8px 10px',
                  borderRadius: 6,
                  backgroundColor: 'var(--clr-bg)',
                  border: '1px solid var(--clr-border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      backgroundColor: color,
                      marginTop: 5,
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: 'var(--clr-text)',
                        marginBottom: 2,
                      }}
                    >
                      {act.title}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--clr-text-muted)', lineHeight: '1.4' }}>
                      {act.detail}
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: 4,
                      backgroundColor: badgeBg,
                      color,
                      display: 'inline-block',
                      marginBottom: 4,
                      letterSpacing: '0.03em',
                    }}
                  >
                    {act.badge}
                  </span>
                  {act.amountFmt && (
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: 'var(--clr-text)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {act.amountFmt}
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: 'var(--clr-text-subtle)', marginTop: 2 }}>
                    {timeAgo(act.timestamp)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default RecentActivities

