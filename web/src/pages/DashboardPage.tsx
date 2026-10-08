import { useState, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  AlertTriangle, Clock, CheckCircle, DollarSign, CreditCard,
  FileText, Download, Truck, TrendingUp, Zap,
} from 'lucide-react'
import { WhatsAppIcon } from '../components/WhatsAppIcon'
import { useDashboard, useInvoices, type Invoice } from '../hooks/useInvoices'
import { useEquipment } from '../hooks/useFlota'
import { useQuotes } from '../hooks/useQuotes'
import { generateInvoicePdf } from '../lib/generateInvoicePdf'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth.store'
import AppShell from '../components/AppShell'
import { PaymentModal } from '../components/PaymentModal'
import ExecutiveSummaryBar from '../components/ExecutiveSummaryBar'
import KPICard from '../components/KPICard'
import RevenueChart from '../components/RevenueChart'
import AlertRibbon, { type AlertItem } from '../components/AlertRibbon'
import FleetUtilizationVisual from '../components/FleetUtilizationVisual'
import QuickActionsPanel from '../components/QuickActionsPanel'
import RecentActivities from '../components/RecentActivities'

// ─── Formatters ──────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  'S/ ' + n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtCompact = (n: number) => {
  if (n >= 1_000_000) return `S/ ${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `S/ ${(n / 1_000).toFixed(1)}k`
  return fmt(n)
}

// ─── Urgency config ───────────────────────────────────────────────────────────
const urgencyConfig: Record<string, {
  borderColor: string; bgColor: string
  badgeBg: string; badgeText: string; badgeBorder: string
  iconColor: string; iconBg: string
  text: string; icon: typeof AlertTriangle
}> = {
  overdue:  {
    borderColor: 'var(--clr-danger-border)', bgColor: 'var(--clr-danger-bg)',
    badgeBg: 'var(--clr-danger-bg)', badgeText: 'var(--clr-danger)', badgeBorder: 'var(--clr-danger-border)',
    iconColor: 'var(--clr-danger)', iconBg: 'var(--clr-danger-bg)',
    text: 'VENCIDA', icon: AlertTriangle,
  },
  critical: {
    borderColor: 'rgba(217,119,6,0.40)', bgColor: 'rgba(217,119,6,0.12)',
    badgeBg: 'rgba(217,119,6,0.14)', badgeText: '#92400e', badgeBorder: 'rgba(217,119,6,0.35)',
    iconColor: '#d97706', iconBg: 'rgba(217,119,6,0.14)',
    text: 'URGENTE', icon: Clock,
  },
  warning: {
    borderColor: 'rgba(194,65,12,0.40)', bgColor: 'rgba(194,65,12,0.12)',
    badgeBg: 'rgba(194,65,12,0.14)', badgeText: '#9a3412', badgeBorder: 'rgba(194,65,12,0.35)',
    iconColor: '#c2410c', iconBg: 'rgba(194,65,12,0.14)',
    text: 'PRÓXIMA', icon: Clock,
  },
  ok: {
    borderColor: 'var(--clr-success-border)', bgColor: 'var(--clr-surface)',
    badgeBg: 'var(--clr-success-bg)', badgeText: 'var(--clr-success)', badgeBorder: 'var(--clr-success-border)',
    iconColor: 'var(--clr-success)', iconBg: 'var(--clr-success-bg)',
    text: 'VIGENTE', icon: FileText,
  },
}

// ─── buildWhatsAppUrl ─────────────────────────────────────────────────────────
function buildWhatsAppUrl(invoice: Invoice, companyName: string): string {
  const phone = invoice.client.whatsapp!.replace(/\D/g, '')
  const fullPhone = phone.startsWith('51') ? phone : `51${phone}`
  const dueFormatted = format(parseISO(invoice.dueDate), 'dd/MM/yyyy')
  const total = fmt(Number(invoice.total))
  const invoiceNum = `${invoice.series}-${invoice.number}`
  const att = companyName || 'FlotaTrack'
  const msg =
    invoice.urgency === 'overdue'
      ? `Estimados ${invoice.client.businessName}, les informamos que la factura ${invoiceNum} por ${total} VENCIÓ el ${dueFormatted}. Agradecemos regularicen el pago a la brevedad. Att: ${att}`
      : `Estimados ${invoice.client.businessName}, les recordamos que la factura ${invoiceNum} por ${total} vence el ${dueFormatted}. Por favor regularicen su pago a tiempo. Att: ${att}`
  return `https://wa.me/${fullPhone}?text=${encodeURIComponent(msg)}`
}

// ─── InvoiceRow ───────────────────────────────────────────────────────────────
function InvoiceRow({ invoice, onPay }: { invoice: Invoice; onPay: (inv: Invoice) => void }) {
  const cfg = urgencyConfig[invoice.urgency] ?? urgencyConfig.ok
  const company = useAuthStore((s) => s.company)
  const absDays = Math.abs(invoice.daysUntilDue)
  const dueLabel =
    invoice.urgency === 'overdue'
      ? `Vencida hace ${absDays} día${absDays !== 1 ? 's' : ''}`
      : invoice.daysUntilDue === 0
      ? 'Vence hoy'
      : `Vence en ${invoice.daysUntilDue} día${invoice.daysUntilDue !== 1 ? 's' : ''}`

  const showWhatsApp =
    (invoice.urgency === 'overdue' || invoice.urgency === 'critical') &&
    invoice.client.whatsapp &&
    invoice.status !== 'PAID'

  const Icon = cfg.icon

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      background: cfg.bgColor, border: `1px solid ${cfg.borderColor}`,
      borderLeft: `3px solid ${cfg.borderColor}`,
      borderRadius: 10, padding: '12px 16px',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 8, flexShrink: 0,
        background: cfg.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={16} style={{ color: cfg.iconColor }} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, color: 'var(--clr-text)', fontSize: 13 }}>{invoice.client.businessName}</span>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: cfg.badgeBg, color: cfg.badgeText, border: `1px solid ${cfg.badgeBorder}` }}>{cfg.text}</span>
          <span style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 700, background: 'var(--clr-bg)', color: 'var(--clr-text-muted)', padding: '2px 6px', borderRadius: 4, border: '1px solid var(--clr-border)' }}>
            {invoice.series}-{invoice.number}
          </span>
        </div>
        {invoice.description && (
          <div style={{ fontSize: 11, color: 'var(--clr-text-subtle)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {invoice.description}
          </div>
        )}
        <div style={{ fontSize: 11, color: 'var(--clr-text-subtle)', marginTop: 2 }}>
          {dueLabel} · Vence: {format(parseISO(invoice.dueDate), 'dd MMM yyyy', { locale: es })}
        </div>
      </div>

      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontWeight: 700, color: 'var(--clr-text)', fontSize: 15 }}>{fmt(Number(invoice.total))}</div>
        {invoice.status === 'PARTIAL' && (
          <div style={{ fontSize: 11, color: '#d97706' }}>Pago parcial</div>
        )}
      </div>

      {showWhatsApp && (
        <a
          href={buildWhatsAppUrl(invoice, company?.businessName ?? '')}
          target="_blank"
          rel="noopener noreferrer"
          style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--clr-wa-btn-bg)', color: 'var(--clr-wa-btn)', border: '1px solid var(--clr-wa-btn-border)', fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 7, textDecoration: 'none' }}
        >
          <WhatsAppIcon size={13} /> WhatsApp
        </a>
      )}
      <button
        onClick={() => company && generateInvoicePdf(invoice, company)}
        style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--clr-surface-hover)', color: 'var(--clr-text-muted)', border: '1px solid var(--clr-border)', fontSize: 11, fontWeight: 600, padding: '5px 10px', borderRadius: 7, cursor: 'pointer' }}
      >
        <Download size={13} /> PDF
      </button>
      {invoice.status !== 'PAID' && (
        <button
          onClick={() => onPay(invoice)}
          style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--clr-primary)', color: 'var(--clr-on-primary)', border: 'none', fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 7, cursor: 'pointer' }}
        >
          <CreditCard size={13} /> Pagar
        </button>
      )}
    </div>
  )
}





// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { data: dash,         isLoading: dashLoading } = useDashboard()
  const { data: invoicesData, isLoading: invLoading  } = useInvoices()
  const { data: equipment,    isLoading: eqLoading   } = useEquipment()
  const { data: quotesSent = [] }                       = useQuotes('SENT')
  const navigate = useNavigate()

  const [payInvoice, setPayInvoice] = useState<Invoice | null>(null)
  const [filter, setFilter]         = useState<string>('all')

  const filteredInvoices = (invoicesData?.items ?? []).filter((inv) => {
    if (filter === 'all')      return inv.status !== 'PAID'
    if (filter === 'overdue')  return inv.urgency === 'overdue'
    if (filter === 'critical') return inv.urgency === 'critical'
    if (filter === 'paid')     return inv.status === 'PAID'
    return true
  })

  const eq            = equipment ?? []
  const totalEq       = eq.length
  const alquilados    = eq.filter((e) => e.status === 'IN_USE').length
  const disponibles   = eq.filter((e) => e.status === 'AVAILABLE').length
  const mantenimiento = eq.filter((e) => e.status === 'MAINTENANCE').length
  const ocupacion     = totalEq > 0 ? Math.round((alquilados / totalEq) * 100) : 0

  const today = useMemo(() => format(new Date(), "EEEE d 'de' MMMM yyyy", { locale: es }), [])

  const ribbonAlerts: AlertItem[] = []
  const maintenanceEq = eq.filter((e) => e.status === 'MAINTENANCE')
  if (maintenanceEq.length > 0)
    ribbonAlerts.push({
      id: 'maintenance', severity: 'critical',
      title: `${maintenanceEq.length} equipo${maintenanceEq.length > 1 ? 's' : ''} en mantenimiento`,
      description: maintenanceEq.map((e) => e.name).slice(0, 2).join(', ') + (maintenanceEq.length > 2 ? ` +${maintenanceEq.length - 2}` : ''),
      actionLabel: 'Ver Equipos', type: 'maintenance',
    })
  if ((dash?.overdue.count ?? 0) > 0)
    ribbonAlerts.push({
      id: 'overdue', severity: 'critical',
      title: `${dash!.overdue.count} factura${dash!.overdue.count > 1 ? 's' : ''} vencida${dash!.overdue.count > 1 ? 's' : ''}`,
      description: `Total: ${fmtCompact(dash!.overdue.amount)} pendiente de cobro`,
      actionLabel: 'Ver Cobranza', type: 'cxc_critical',
    })
  if ((dash?.dueSoon.count ?? 0) > 0)
    ribbonAlerts.push({
      id: 'due-soon', severity: 'warning',
      title: `${dash!.dueSoon.count} factura${dash!.dueSoon.count > 1 ? 's' : ''} por vencer`,
      description: `Vencen en los próximos 7 días · ${fmtCompact(dash!.dueSoon.amount)}`,
      actionLabel: 'Revisar', type: 'due_soon',
    })
  const sinHorometro = eq.filter((e) => e.status === 'IN_USE' && (!e.currentHours || Number(e.currentHours) === 0))
  if (sinHorometro.length > 0)
    ribbonAlerts.push({
      id: 'horometros', severity: 'warning',
      title: `${sinHorometro.length} equipo${sinHorometro.length > 1 ? 's' : ''} sin horómetro registrado`,
      description: sinHorometro.map((e) => e.name).slice(0, 2).join(', ') + (sinHorometro.length > 2 ? ` +${sinHorometro.length - 2} más` : '') + ' · Actualiza las horas desde la ficha del equipo',
      actionLabel: 'Ver Equipos',
    })
  if (quotesSent.length > 0)
    ribbonAlerts.push({
      id: 'cotizaciones', severity: 'info',
      title: `${quotesSent.length} cotización${quotesSent.length > 1 ? 'es' : ''} enviada${quotesSent.length > 1 ? 's' : ''}`,
      description: quotesSent.slice(0, 2).map((q) => q.client?.businessName ?? q.number).join(', ') + (quotesSent.length > 2 ? ` +${quotesSent.length - 2} más` : '') + ' · Esperando respuesta del cliente',
      actionLabel: 'Ver Cotizaciones',
    })

  const INV_FILTERS = [
    { key: 'all',      label: 'Pendientes' },
    { key: 'overdue',  label: 'Vencidas' },
    { key: 'critical', label: 'Urgentes' },
    { key: 'paid',     label: 'Pagadas' },
  ]

  return (
    <AppShell active="dashboard" title="Dashboard">
      <div style={{ maxWidth: 1400, padding: '24px 28px' }}>

        {/* Page header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--clr-text)', margin: 0 }}>Dashboard</h1>
            <p style={{ fontSize: 13, color: 'var(--clr-text-subtle)', marginTop: 4, textTransform: 'capitalize' }}>{today}</p>
          </div>
          <button
            onClick={() => navigate('/quotes')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'var(--clr-primary)', color: 'var(--clr-on-primary)', border: 'none', fontSize: 13, fontWeight: 700, padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }}
          >
            <FileText size={14} /> Nueva Cotización
          </button>
        </div>

        {/* ── Executive Summary Bar ── */}
        <section style={{ marginBottom: 16 }}>
          <ExecutiveSummaryBar />
        </section>

        {/* ── Alert Ribbon ── */}
        {ribbonAlerts.length > 0 && (
          <section style={{ marginBottom: 20 }}>
            <AlertRibbon
              alerts={ribbonAlerts}
              onActionClick={(alert) => {
                if (alert.type === 'cxc_critical') navigate('/cxc?tab=OVERDUE')
                else if (alert.type === 'due_soon') navigate('/cxc?tab=SOON')
                else if (alert.type === 'maintenance') navigate('/equipment?tab=MAINTENANCE')
                else if (alert.id === 'horometros') navigate('/equipment?tab=IN_USE')
                else if (alert.id === 'cotizaciones') navigate('/quotes?tab=SENT')
              }}
            />
          </section>
        )}

        {/* ── Flota ── */}
        <section style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Truck size={13} style={{ color: 'var(--clr-primary)' }} />
              <h2 style={{ fontSize: 11, fontWeight: 600, color: 'var(--clr-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Control Operativo de Flota Pesada</h2>
            </div>
            {!eqLoading && <span style={{ fontSize: 11, color: 'var(--clr-text-subtle)' }}>{totalEq} activos totales · {alquilados} asignados</span>}
          </div>
          {eqLoading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {[1,2,3,4].map((i) => <div key={i} style={{ borderRadius: 8, background: 'var(--clr-sidebar)', border: '1px solid var(--clr-border)', height: 136 }} className="animate-pulse" />)}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              <KPICard data={{ id: 'total-eq',   title: 'Total Equipos',     subtitle: 'Maquinaria registrada',        urgency: 'info',    value: totalEq,       formattedValue: String(totalEq),    changePct: 0, trend: 'flat', colorHex: 'var(--clr-text-muted)', sparkline: [6,7,7,8,8,8] }} />
              <KPICard data={{ id: 'alquilados', title: 'Alquilados',         subtitle: `${ocupacion}% de ocupación`,   urgency: 'info',    value: alquilados,    formattedValue: String(alquilados), changePct: 0, trend: 'flat', colorHex: 'var(--clr-primary)',    sparkline: [2,3,2,4,3,alquilados||3] }} />
              <KPICard data={{ id: 'disponibles',title: 'Disponibles',         subtitle: 'Para nuevos alquileres',       urgency: 'success', value: disponibles,   formattedValue: String(disponibles),changePct: 0, trend: 'flat', colorHex: 'var(--clr-success)',   sparkline: [4,5,5,4,6,disponibles||5] }} />
              <KPICard data={{ id: 'maintenance',title: 'En Mantenimiento',    subtitle: mantenimiento > 0 ? 'Requieren atención' : 'Sin pendientes', urgency: mantenimiento > 0 ? 'warning' : 'normal', value: mantenimiento, formattedValue: String(mantenimiento), changePct: 0, trend: 'flat', colorHex: mantenimiento > 0 ? '#d97706' : 'var(--clr-text-muted)', sparkline: [0,1,0,1,0,mantenimiento||0] }} />
            </div>
          )}
        </section>

        {/* ── CxC KPIs ── */}
        <section style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <DollarSign size={13} style={{ color: 'var(--clr-success)' }} />
              <h2 style={{ fontSize: 11, fontWeight: 600, color: 'var(--clr-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Cuentas por Cobrar &amp; Liquidez (CxC)</h2>
            </div>
            <button
              onClick={() => navigate('/aging')}
              style={{ background: 'transparent', border: 'none', color: 'var(--clr-primary)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
            >
              Ver Análisis de Antigüedad →
            </button>
          </div>
          {dashLoading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {[1,2,3,4].map((i) => <div key={i} style={{ borderRadius: 8, background: 'var(--clr-sidebar)', border: '1px solid var(--clr-border)', height: 136 }} className="animate-pulse" />)}
            </div>
          ) : dash ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              <KPICard
                data={{ id: 'cxc-vencidas',  title: 'Vencidas',         subtitle: `${dash.overdue.count} factura${dash.overdue.count !== 1 ? 's' : ''}`,  urgency: 'critical', value: dash.overdue.amount, formattedValue: fmtCompact(dash.overdue.amount), changePct: 0, trend: 'flat', colorHex: 'var(--clr-danger)' }}
                onClick={() => navigate('/aging')} />
              <KPICard
                data={{ id: 'cxc-por-vencer',title: 'Vencen en 7 días', subtitle: `${dash.dueSoon.count} factura${dash.dueSoon.count !== 1 ? 's' : ''}`,  urgency: 'warning',  value: dash.dueSoon.amount, formattedValue: fmtCompact(dash.dueSoon.amount), changePct: 0, trend: 'flat', colorHex: '#d97706' }} />
              <KPICard
                data={{ id: 'cxc-vigentes',   title: 'Vigentes',          subtitle: `${dash.current.count} factura${dash.current.count !== 1 ? 's' : ''}`,  urgency: 'info',     value: dash.current.amount, formattedValue: fmtCompact(dash.current.amount), changePct: 0, trend: 'flat', colorHex: 'var(--clr-primary)' }} />
              <KPICard
                data={{ id: 'cxc-cobrado',    title: 'Cobrado (período)', subtitle: `${dash.paid.count} factura${dash.paid.count !== 1 ? 's' : ''}`,        urgency: 'success',  value: dash.paid.amount,    formattedValue: fmtCompact(dash.paid.amount),   changePct: 0, trend: 'flat', colorHex: 'var(--clr-success)' }} />
            </div>
          ) : null}
        </section>

        {/* ── Charts ── */}
        <section style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16, marginBottom: 24 }}>
          <RevenueChart />
          <FleetUtilizationVisual />
        </section>

        {/* ── Bitácora + Acciones Rápidas ── */}
        <section style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16, marginBottom: 24 }}>
          <RecentActivities />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <QuickActionsPanel />
            <div style={{ backgroundColor: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 8, padding: 16, fontSize: 12, color: 'var(--clr-text-subtle)', lineHeight: '1.5' }}>
              <div style={{ fontWeight: 700, color: 'var(--clr-text)', marginBottom: 6, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>🇵🇪</span>
                <span>Contexto Operativo Perú 2026</span>
              </div>
              Tarifas registradas en soles con IGV (18%). Detracciones tributarias SPOT calculadas al 12% para alquiler de bienes muebles con operador según R.S. SUNAT. Tipo de cambio SBS referencial.
            </div>
          </div>
        </section>

        {/* ── Resumen Operativo ── */}
        <section style={{ marginBottom: 28 }}>
          <div style={{ background: 'var(--clr-sidebar)', border: '1px solid var(--clr-border)', borderRadius: 8, padding: 20 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--clr-text)', margin: '0 0 4px' }}>Resumen Operativo</h3>
            <p style={{ fontSize: 11, color: 'var(--clr-text-subtle)', margin: '0 0 20px' }}>Período actual</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {[
                { label: 'Ocupación de flota', pct: ocupacion, color: 'var(--clr-primary)' },
                { label: 'Flota disponible',    pct: totalEq > 0 ? Math.round((disponibles / totalEq) * 100) : 0, color: 'var(--clr-success)' },
                { label: 'Mantenimiento',        pct: totalEq > 0 ? Math.round((mantenimiento / totalEq) * 100) : 0, color: mantenimiento > 0 ? '#d97706' : 'var(--clr-text-subtle)' },
              ].map((row) => (
                <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, color: 'var(--clr-text-muted)' }}>{row.label}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 96, height: 4, background: 'var(--clr-surface-hover)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: row.color, borderRadius: 4, width: `${row.pct}%`, transition: 'width 0.3s' }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--clr-text)', width: 36, textAlign: 'right' }}>{row.pct}%</span>
                  </div>
                </div>
              ))}

              {dash && (
                <>
                  <div style={{ borderTop: '1px solid var(--clr-border)', margin: '4px 0' }} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--clr-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>CxC Total</div>
                      <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--clr-text)' }}>
                        {fmtCompact(dash.overdue.amount + dash.dueSoon.amount + dash.current.amount)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--clr-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Cobrado</div>
                      <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--clr-success)' }}>{fmtCompact(dash.paid.amount)}</div>
                    </div>
                  </div>
                </>
              )}

              <div style={{ borderTop: '1px solid var(--clr-border)', paddingTop: 14 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--clr-text-subtle)' }}>
                  <TrendingUp size={12} /> Datos actualizados en tiempo real
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Facturas CxC ── */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Zap size={13} style={{ color: '#d97706' }} />
              <h2 style={{ fontSize: 11, fontWeight: 600, color: 'var(--clr-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Cuentas por Cobrar</h2>
              {invoicesData && invoicesData.items.filter(i => i.status !== 'PAID').length > 0 && (
                <span style={{ background: 'rgba(217,119,6,0.12)', color: '#d97706', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, border: '1px solid rgba(217,119,6,0.28)' }}>
                  {invoicesData.items.filter(i => i.status !== 'PAID').length}
                </span>
              )}
            </div>
            {/* Filter pills */}
            <div style={{ display: 'flex', gap: 4, background: 'var(--clr-sidebar)', border: '1px solid var(--clr-border)', borderRadius: 10, padding: 4 }}>
              {INV_FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  style={{
                    fontSize: 11, padding: '4px 10px', borderRadius: 7, fontWeight: 600, cursor: 'pointer', border: 'none',
                    background: filter === f.key ? 'var(--clr-primary)' : 'transparent',
                    color: filter === f.key ? 'var(--clr-on-primary)' : 'var(--clr-text-subtle)',
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {invLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[1,2,3].map((i) => <div key={i} style={{ height: 80, borderRadius: 10, background: 'var(--clr-surface)', border: '1px solid var(--clr-border)' }} className="animate-pulse" />)}
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '64px 20px', background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 10 }}>
              <CheckCircle size={36} style={{ margin: '0 auto 12px', color: 'var(--clr-success)', opacity: 0.5, display: 'block' }} />
              <p style={{ fontWeight: 600, color: 'var(--clr-text-subtle)', margin: 0 }}>No hay facturas en esta categoría</p>
              <p style={{ fontSize: 12, color: 'var(--clr-text-subtle)', marginTop: 4 }}>Todo al día en este filtro</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredInvoices.map((inv) => (
                <InvoiceRow key={inv.id} invoice={inv} onPay={setPayInvoice} />
              ))}
            </div>
          )}
        </section>

      </div>

      <PaymentModal key={payInvoice?.id ?? ''} invoice={payInvoice} onClose={() => setPayInvoice(null)} />
    </AppShell>
  )
}
