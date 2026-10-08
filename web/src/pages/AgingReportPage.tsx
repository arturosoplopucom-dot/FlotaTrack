import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useSearchStore } from '../store/search.store'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Bell, CheckCircle, X, AlertTriangle, Phone, Mail, FileText, FileSpreadsheet, Loader2, Calendar, Clock, Search, CheckSquare, Square } from 'lucide-react'
import { WhatsAppIcon } from '../components/WhatsAppIcon'
import { api } from '../lib/api'
import AppShell from '../components/AppShell'
import { PaymentModal } from '../components/PaymentModal'
import { buildPastelHtmlHead, buildPastelHeader, buildPastelFooter, exportToExcel } from '../utils/exportUtils'
import type { Invoice } from '../hooks/useInvoices'
import QuickActionsPanel from '../components/QuickActionsPanel'
import { AlertRibbon } from '../components/AlertRibbon'
import type { AlertItem } from '../components/AlertRibbon'

// ─── Types ─────────────────────────────────────────────────────────────────────

type AgingRow = {
  clientId: string
  clientName: string
  ruc: string
  email?: string | null
  whatsapp?: string | null
  current: number
  d1_30: number
  d31_60: number
  d61_90: number
  d90plus: number
  total: number
  count: number
}

type AgingData = {
  rows: AgingRow[]
  totals: { current: number; d1_30: number; d31_60: number; d61_90: number; d90plus: number; total: number }
  asOf: string
}

type InvoiceDetail = {
  id: string
  series: string
  number: string
  issueDate: string
  dueDate: string
  total: number
  totalPaid: number
  balance: number
  daysOverdue: number
  bucket: string
}

type ClientDetailData = {
  client: { businessName: string; ruc: string; phone?: string | null; whatsapp?: string | null; email?: string | null } | null
  invoices: InvoiceDetail[]
  asOf: string
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const BUCKETS = [
  { key: 'current', label: 'Corriente',  sublabel: 'Sin vencer',       borderColor: 'var(--clr-success-border)', bgColor: 'var(--clr-success-bg)',     textColor: 'var(--clr-success)' },
  { key: 'd1_30',   label: '1–30 días',  sublabel: 'Vencimiento próximo', borderColor: 'rgba(217,119,6,0.35)',  bgColor: 'rgba(217,119,6,0.10)',       textColor: '#d97706' },
  { key: 'd31_60',  label: '31–60 días', sublabel: 'Vencido reciente',    borderColor: 'rgba(234,88,12,0.35)', bgColor: 'rgba(234,88,12,0.10)',        textColor: '#ea580c' },
  { key: 'd61_90',  label: '61–90 días', sublabel: 'Riesgo alto',         borderColor: 'var(--clr-danger-border)', bgColor: 'var(--clr-danger-bg)',    textColor: 'var(--clr-danger)' },
  { key: 'd90plus', label: '+90 días',   sublabel: 'Crítico / Cobro dudoso', borderColor: 'var(--clr-danger-border)', bgColor: 'var(--clr-danger-bg)', textColor: 'var(--clr-danger)' },
] as const

type BucketKey = typeof BUCKETS[number]['key']

const BUCKET_MAP: Record<BucketKey, { label: string; color: string; bg: string }> = {
  current: { label: 'Corriente',  color: 'var(--clr-success)',        bg: 'var(--clr-success-bg)' },
  d1_30:   { label: '1–30 días',  color: '#d97706',                   bg: 'rgba(217,119,6,0.10)' },
  d31_60:  { label: '31–60 días', color: 'var(--clr-orange)',          bg: 'var(--clr-orange-bg)' },
  d61_90:  { label: '61–90 días', color: 'var(--clr-danger)',         bg: 'var(--clr-danger-bg)'  },
  d90plus: { label: '+90 días',   color: 'var(--clr-danger)',         bg: 'var(--clr-danger-bg)'  },
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const fmtAmt  = (n: number) => n === 0 ? '—' : `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`
const fmtFull = (n: number) => `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`
const pct     = (n: number, total: number) => total === 0 ? '0%' : `${Math.round((n / total) * 100)}%`
const fmtDate = (iso: string) => format(parseISO(iso), 'dd/MM/yyyy', { locale: es })

function riskLevel(row: AgingRow): 'low' | 'medium' | 'high' | 'critical' {
  if (!row.total) return 'low'
  const highRisk = row.d61_90 + row.d90plus
  if (highRisk / row.total > 0.5) return 'critical'
  if (row.d31_60 / row.total > 0.3 || highRisk > 0) return 'high'
  if (row.d1_30 / row.total > 0.5) return 'medium'
  return 'low'
}

const RISK_CONFIG = {
  low:      { label: 'Bajo',     color: 'var(--clr-success)', bg: 'var(--clr-success-bg)' },
  medium:   { label: 'Medio',    color: '#d97706',            bg: 'rgba(217,119,6,0.10)' },
  high:     { label: 'Alto',     color: 'var(--clr-orange)',  bg: 'var(--clr-orange-bg)' },
  critical: { label: 'Crítico',  color: 'var(--clr-danger)',  bg: 'var(--clr-danger-bg)'  },
}

function buildWhatsAppUrl(phone: string, clientName: string, total: number, asOf: string): string {
  const num = phone.replace(/[^0-9]/g, '')
  const fullNum = num.startsWith('51') ? num : `51${num}`
  const fecha = fmtDate(asOf)
  const monto = fmtFull(total)
  const msg = encodeURIComponent(
    `Estimado cliente ${clientName},\n\nLe informamos que al ${fecha} registra un saldo pendiente de ${monto} con nuestra empresa.\n\nPor favor, comuníquese con nosotros para coordinar el pago. Gracias.`
  )
  return `https://wa.me/${fullNum}?text=${msg}`
}

// ─── Risk Bar ──────────────────────────────────────────────────────────────────

function RiskBar({ row }: { row: AgingRow }) {
  const buckets: { key: BucketKey; color: string }[] = [
    { key: 'current', color: 'var(--clr-success)' },
    { key: 'd1_30',   color: '#d97706' },
    { key: 'd31_60',  color: 'var(--clr-orange)' },
    { key: 'd61_90',  color: 'var(--clr-danger)' },
    { key: 'd90plus', color: 'var(--clr-danger)' },
  ]
  return (
    <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', width: 100, gap: 1 }}>
      {buckets.map(({ key, color }) => {
        const val = row[key as BucketKey]
        if (!val) return null
        const w = Math.round((val / row.total) * 100)
        return <div key={key} style={{ width: `${w}%`, background: color, minWidth: 2 }} title={`${BUCKET_MAP[key].label}: ${fmtFull(val)}`} />
      })}
    </div>
  )
}

// ─── Client Detail Modal ────────────────────────────────────────────────────────

function toInvoice(inv: InvoiceDetail, clientName: string, client: ClientDetailData['client']): Invoice {
  const daysOverdue = inv.daysOverdue
  const urgency: Invoice['urgency'] = daysOverdue > 60 ? 'overdue' : daysOverdue > 30 ? 'critical' : daysOverdue > 0 ? 'warning' : 'ok'
  const status: Invoice['status'] = inv.balance <= 0 ? 'PAID' : daysOverdue > 0 ? 'OVERDUE' : 'PENDING'
  const baseAmt = inv.total / 1.18
  return {
    id: inv.id,
    series: inv.series,
    number: inv.number,
    total: inv.total.toFixed(2),
    amount: baseAmt.toFixed(2),
    igv: (inv.total - baseAmt).toFixed(2),
    detraccion: '0',
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    status,
    currency: 'PEN',
    daysUntilDue: -daysOverdue,
    urgency,
    client: { businessName: clientName, ruc: client?.ruc ?? '', whatsapp: client?.whatsapp ?? undefined, email: client?.email ?? undefined },
    cuotas: [],
    workOrders: [],
  }
}

function ClientDetailModal({
  clientId, clientName, asOf, onClose, onPay,
}: { clientId: string; clientName: string; asOf: string; onClose: () => void; onPay: (inv: Invoice) => void }) {
  const { data, isLoading } = useQuery<ClientDetailData>({
    queryKey: ['aging-client', clientId, asOf],
    queryFn: () => api.get(`/invoices/aging/client/${clientId}`, { params: { asOf } }).then((r) => r.data),
  })

  const client = data?.client
  const invoices = data?.invoices ?? []
  const totalBalance = invoices.reduce((s, i) => s + i.balance, 0)

  const contactPhone = client?.whatsapp || client?.phone || ''

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'var(--clr-sidebar)', border: '1px solid var(--clr-border)', borderRadius: 16, width: 'min(92vw, 900px)', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}>

        {/* Header */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--clr-border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--clr-text)' }}>{clientName}</h2>
            {client && (
              <div style={{ display: 'flex', gap: 14, marginTop: 5, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: 'var(--clr-text-subtle)', fontFamily: 'monospace' }}>RUC: {client.ruc}</span>
                {client.email && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--clr-text-subtle)' }}>
                    <Mail size={11} /> {client.email}
                  </span>
                )}
                {contactPhone && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--clr-text-subtle)' }}>
                    <Phone size={11} /> {contactPhone}
                  </span>
                )}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            {contactPhone ? (
              <a
                href={buildWhatsAppUrl(contactPhone, clientName, totalBalance, asOf)}
                target="_blank" rel="noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, background: 'rgba(37,211,102,0.15)', color: 'var(--clr-wa-text)', border: '1px solid rgba(37,211,102,0.3)', fontSize: 12, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}
              >
                <WhatsAppIcon size={14} /> WhatsApp
              </a>
            ) : (
              <span
                title="Sin teléfono registrado"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, background: 'rgba(100,116,139,0.08)', color: 'var(--clr-text-subtle)', border: '1px solid var(--clr-border)', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', cursor: 'default' }}
              >
                <WhatsAppIcon size={14} /> WhatsApp
              </span>
            )}
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-text-subtle)', padding: 4 }}>
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Summary strip */}
        {!isLoading && invoices.length > 0 && (
          <div style={{ padding: '12px 22px', borderBottom: '1px solid var(--clr-border)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'stretch' }}>
            {BUCKETS.map((b) => {
              const val   = invoices.filter((i) => i.bucket === b.key).reduce((s, i) => s + i.balance, 0)
              const count = invoices.filter((i) => i.bucket === b.key).length
              if (!val) return null
              const isOk = b.key === 'current'
              const friendlyLabel = isOk ? 'Sin vencer' : `Vencida ${b.label}`
              const sublabel      = isOk ? 'Facturas al día' : `${count} factura${count !== 1 ? 's' : ''}`
              return (
                <div key={b.key} style={{ flex: '0 0 auto', background: b.bgColor, border: `1px solid ${b.borderColor}`, borderRadius: 8, padding: '8px 14px', minWidth: 110 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: b.textColor, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 1 }}>{friendlyLabel}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: b.textColor, margin: '3px 0' }}>{fmtFull(val)}</div>
                  <div style={{ fontSize: 10, color: 'var(--clr-text-muted)' }}>{sublabel}</div>
                </div>
              )
            })}
            <div style={{ flex: '0 0 auto', background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 8, padding: '8px 14px', marginLeft: 'auto', minWidth: 110 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--clr-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 1 }}>Total deuda</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--clr-text)', margin: '3px 0' }}>{fmtFull(totalBalance)}</div>
              <div style={{ fontSize: 10, color: 'var(--clr-text-subtle)' }}>{invoices.length} factura{invoices.length !== 1 ? 's' : ''}</div>
            </div>
          </div>
        )}

        {/* Invoice table */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--clr-text-subtle)' }}>Cargando...</div>
          ) : invoices.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--clr-text-subtle)' }}>Sin facturas pendientes</div>
          ) : (
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--clr-bg)', borderBottom: '1px solid var(--clr-border)' }}>
                  {['Factura', 'Emisión', 'Vencimiento', 'Días', 'Total', 'Pagado', 'Saldo', 'Estado'].map((h) => (
                    <th key={h} style={{ padding: '9px 14px', textAlign: h === 'Factura' ? 'left' : 'right', fontSize: 10, fontWeight: 600, color: 'var(--clr-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                  <th style={{ padding: '9px 14px', textAlign: 'center', fontSize: 10, fontWeight: 600, color: 'var(--clr-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv, i) => {
                  const bk = BUCKET_MAP[inv.bucket as BucketKey]
                  return (
                    <tr key={inv.id} style={{ borderBottom: '1px solid var(--clr-border)', background: i % 2 === 1 ? 'var(--clr-bg)' : 'transparent' }}>
                      <td style={{ padding: '9px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <FileText size={13} color="var(--clr-text-subtle)" />
                          <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--clr-doc-number)', fontSize: 12 }}>
                            {inv.series}-{String(inv.number).padStart(8, '0')}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '9px 14px', textAlign: 'right', color: 'var(--clr-text-subtle)', fontSize: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                          <Calendar size={11} color="var(--clr-text-subtle)" /> {fmtDate(inv.issueDate)}
                        </div>
                      </td>
                      <td style={{ padding: '9px 14px', textAlign: 'right', color: inv.daysOverdue > 0 ? bk.color : 'var(--clr-text-subtle)', fontSize: 12, fontWeight: inv.daysOverdue > 0 ? 600 : 400 }}>
                        {fmtDate(inv.dueDate)}
                      </td>
                      <td style={{ padding: '9px 14px', textAlign: 'right' }}>
                        {inv.daysOverdue > 0 ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 700, color: bk.color, background: bk.bg, padding: '2px 8px', borderRadius: 20 }}>
                            <Clock size={11} /> +{inv.daysOverdue}d
                          </span>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--clr-success)', background: 'var(--clr-success-bg)', padding: '2px 8px', borderRadius: 20 }}>
                            ✓ Al día
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '9px 14px', textAlign: 'right', color: 'var(--clr-text-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>{fmtFull(inv.total)}</td>
                      <td style={{ padding: '9px 14px', textAlign: 'right', color: 'var(--clr-text-subtle)', fontSize: 12, whiteSpace: 'nowrap' }}>{inv.totalPaid > 0 ? fmtFull(inv.totalPaid) : '—'}</td>
                      <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, color: bk.color, fontSize: 13, whiteSpace: 'nowrap' }}>{fmtFull(inv.balance)}</td>
                      <td style={{ padding: '9px 14px', textAlign: 'right' }}>
                        {inv.daysOverdue > 0 ? (
                          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: bk.color }}>Vencida</span>
                            <span style={{ fontSize: 9, color: 'var(--clr-text-subtle)' }}>{bk.label}</span>
                          </div>
                        ) : (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'var(--clr-success-bg)', color: 'var(--clr-success)', whiteSpace: 'nowrap' }}>
                            Sin vencer
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '9px 14px', textAlign: 'center' }}>
                        {inv.balance > 0 && (
                          <button
                            onClick={() => onPay(toInvoice(inv, clientName, client ?? null))}
                            style={{ padding: '4px 10px', borderRadius: 6, background: 'var(--clr-primary-bg)', color: 'var(--clr-primary-lt)', border: '1px solid var(--clr-primary-border)', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--clr-primary-bg)' }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--clr-primary-bg)' }}
                          >
                            Registrar Pago
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 22px', borderTop: '1px solid var(--clr-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--clr-text-subtle)' }}>Al corte del {fmtDate(asOf)} · {invoices.length} factura{invoices.length !== 1 ? 's' : ''} pendiente{invoices.length !== 1 ? 's' : ''}</span>
          <button onClick={onClose} style={{ padding: '6px 16px', borderRadius: 8, background: 'var(--clr-surface-hover)', color: 'var(--clr-text-muted)', border: '1px solid var(--clr-border)', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── PDF Export ─────────────────────────────────────────────────────────────────

type ClientDetails = Record<string, ClientDetailData>

function exportPDF(data: AgingData, asOf: string, details: ClientDetails = {}, companyName = 'FlotaTrack') {
  const fmtN = (n: number) =>
    n === 0 ? '—' : `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`
  const fmtT = (n: number) =>
    `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`
  const dateStr = format(new Date(asOf), "dd 'de' MMMM 'de' yyyy", { locale: es })
  const genStr  = format(new Date(), "dd/MM/yyyy HH:mm", { locale: es })

  const bucketHeaders = ['Corriente', '1–30 días', '31–60 días', '61–90 días', '+90 días']
  const bucketColors  = ['#166534',   '#854d0e',   '#9a3412',    '#7f1d1d',    '#7f1d1d']
  const bucketKeys: (keyof typeof data.totals)[] = ['current', 'd1_30', 'd31_60', 'd61_90', 'd90plus']

  const riskOf = (row: AgingRow): { label: string; color: string } => {
    const highRisk = row.d61_90 + row.d90plus
    if (highRisk / row.total > 0.5) return { label: 'Crítico',  color: '#dc2626' }
    if (row.d31_60 / row.total > 0.3 || highRisk > 0) return { label: 'Alto',  color: '#ea580c' }
    if (row.d1_30 / row.total > 0.5) return { label: 'Medio',   color: '#ca8a04' }
    return { label: 'Bajo', color: '#16a34a' }
  }

  const BUCKET_PDF: Record<string, { label: string; color: string }> = {
    current: { label: 'Corriente',  color: '#16a34a' },
    d1_30:   { label: '1–30 días',  color: '#ca8a04' },
    d31_60:  { label: '31–60 días', color: '#ea580c' },
    d61_90:  { label: '61–90 días', color: '#dc2626' },
    d90plus: { label: '+90 días',   color: '#991b1b' },
  }

  const rowsHTML = data.rows.map((r, i) => {
    const risk = riskOf(r)
    const bg = i % 2 === 0 ? '#ffffff' : '#f8fafc'
    const clientDetail = details[r.clientId]
    const invoices = clientDetail?.invoices ?? []
    const client = clientDetail?.client

    const drillHTML = invoices.length > 0 ? `
    <tr style="background:#f0f9ff;">
      <td colspan="9" style="padding:0 0 8px 28px;">
        <table style="width:100%; border-collapse:collapse; font-size:10px; margin-top:2px;">
          <thead>
            <tr style="border-bottom:1px solid #bfdbfe;">
              <th style="padding:4px 8px; text-align:left; color:#1e40af; font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em;">Factura</th>
              <th style="padding:4px 8px; text-align:left; color:#1e40af; font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em;">Emisión</th>
              <th style="padding:4px 8px; text-align:left; color:#1e40af; font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em;">Vencimiento</th>
              <th style="padding:4px 8px; text-align:right; color:#1e40af; font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em;">Días venc.</th>
              <th style="padding:4px 8px; text-align:right; color:#1e40af; font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em;">Total</th>
              <th style="padding:4px 8px; text-align:right; color:#1e40af; font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em;">Pagado</th>
              <th style="padding:4px 8px; text-align:right; color:#1e40af; font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em;">Saldo</th>
              <th style="padding:4px 8px; text-align:center; color:#1e40af; font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em;">Estado</th>
            </tr>
          </thead>
          <tbody>
            ${invoices.map((inv, j) => {
              const bk = BUCKET_PDF[inv.bucket] ?? BUCKET_PDF.current
              const dDate = new Date(inv.dueDate).toLocaleDateString('es-PE', { day:'2-digit', month:'2-digit', year:'numeric' })
              const iDate = new Date(inv.issueDate).toLocaleDateString('es-PE', { day:'2-digit', month:'2-digit', year:'numeric' })
              return `<tr style="background:${j % 2 === 0 ? '#f0f9ff' : '#e0f2fe'}; border-bottom:1px solid #bfdbfe40;">
                <td style="padding:4px 8px; font-weight:700; color:#1e293b; font-family:monospace; font-size:10px;">${inv.series}-${String(inv.number).padStart(8,'0')}</td>
                <td style="padding:4px 8px; color:#64748b; font-size:10px;">${iDate}</td>
                <td style="padding:4px 8px; color:${inv.daysOverdue > 0 ? bk.color : '#64748b'}; font-weight:${inv.daysOverdue > 0 ? '600' : '400'}; font-size:10px;">${dDate}</td>
                <td style="padding:4px 8px; text-align:right; color:${inv.daysOverdue > 0 ? bk.color : '#16a34a'}; font-weight:700; font-size:10px;">${inv.daysOverdue > 0 ? `+${inv.daysOverdue}d` : 'Al día'}</td>
                <td style="padding:4px 8px; text-align:right; color:#64748b; font-size:10px;">${fmtT(inv.total)}</td>
                <td style="padding:4px 8px; text-align:right; color:#64748b; font-size:10px;">${inv.totalPaid > 0 ? fmtT(inv.totalPaid) : '—'}</td>
                <td style="padding:4px 8px; text-align:right; font-weight:700; color:${bk.color}; font-size:10px;">${fmtT(inv.balance)}</td>
                <td style="padding:4px 8px; text-align:center;">
                  <span style="font-size:9px; font-weight:700; color:${bk.color}; background:${bk.color}18; padding:1px 6px; border-radius:20px; white-space:nowrap;">${bk.label}</span>
                </td>
              </tr>`
            }).join('')}
          </tbody>
        </table>
        ${(client?.whatsapp || client?.phone) ? `
        <div style="margin-top:6px; padding-left:8px; font-size:10px; color:#64748b;">
          📱 ${client.whatsapp || client.phone}${client.email ? ` &nbsp;·&nbsp; ✉ ${client.email}` : ''}
        </div>` : ''}
      </td>
    </tr>` : ''

    return `
    <tr style="background:${bg}; border-bottom:${invoices.length > 0 ? 'none' : '1px solid #e2e8f0'};">
      <td style="padding:8px 10px; font-weight:700; color:#1e293b; font-size:11px;">${r.clientName}</td>
      <td style="padding:8px 10px; font-family:monospace; color:#64748b; font-size:10px;">${r.ruc}</td>
      <td style="padding:8px 10px; text-align:center;">
        <span style="font-size:10px; font-weight:700; color:${risk.color}; background:${risk.color}18; padding:2px 8px; border-radius:20px; white-space:nowrap;">${risk.label}</span>
      </td>
      <td style="padding:8px 10px; text-align:right; color:${r.current > 0 ? '#16a34a' : '#cbd5e1'}; font-size:11px; font-weight:${r.current > 0 ? '600' : '400'};">${fmtN(r.current)}</td>
      <td style="padding:8px 10px; text-align:right; color:${r.d1_30 > 0 ? '#ca8a04' : '#cbd5e1'}; font-size:11px; font-weight:${r.d1_30 > 0 ? '600' : '400'};">${fmtN(r.d1_30)}</td>
      <td style="padding:8px 10px; text-align:right; color:${r.d31_60 > 0 ? '#ea580c' : '#cbd5e1'}; font-size:11px; font-weight:${r.d31_60 > 0 ? '600' : '400'};">${fmtN(r.d31_60)}</td>
      <td style="padding:8px 10px; text-align:right; color:${r.d61_90 > 0 ? '#dc2626' : '#cbd5e1'}; font-size:11px; font-weight:${r.d61_90 > 0 ? '600' : '400'};">${fmtN(r.d61_90)}</td>
      <td style="padding:8px 10px; text-align:right; color:${r.d90plus > 0 ? '#991b1b' : '#cbd5e1'}; font-size:11px; font-weight:${r.d90plus > 0 ? '700' : '400'};">${fmtN(r.d90plus)}</td>
      <td style="padding:8px 10px; text-align:right; font-weight:700; color:#0f172a; font-size:12px;">${fmtT(r.total)}</td>
    </tr>
    ${drillHTML}`
  }).join('')

  const summaryCards = bucketKeys.map((k, i) => {
    const val = data.totals[k]
    const pct = data.totals.total > 0 ? Math.round((val / data.totals.total) * 100) : 0
    return `
    <div style="background:${bucketColors[i]}14; border:1px solid ${bucketColors[i]}40; border-radius:8px; padding:12px 14px; flex:1; min-width:100px;">
      <div style="font-size:10px; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">${bucketHeaders[i]}</div>
      <div style="font-size:15px; font-weight:700; color:${bucketColors[i]};">${fmtT(val)}</div>
      <div style="font-size:10px; color:#94a3b8; margin-top:2px;">${pct}% del total</div>
    </div>`
  }).join('')

  const agingExtraCss = `
    table { width:100%; border-collapse:collapse; font-size:11px; }
    thead th { background:#bfdbfe; color:#1e3a8a; padding:9px 10px; text-align:left; font-weight:600; font-size:10px; text-transform:uppercase; letter-spacing:0.05em; border-bottom:2px solid #93c5fd; white-space:nowrap; }
    tfoot tr { background:#dbeafe; border-top:2px solid #93c5fd; }
    tfoot td { padding:10px; font-weight:700; font-size:11px; color:#1e3a8a; }
    @page { margin:16mm 14mm; size:A4 landscape; }
    @media print { body { padding:0; } .no-print { display:none !important; } table { page-break-inside:auto; } tr { page-break-inside:avoid; } }
  `
  const html = `<!DOCTYPE html>
<html lang="es">
${buildPastelHtmlHead(`Antigüedad de Saldos – ${dateStr}`, agingExtraCss)}
<body>

${buildPastelHeader({
  title: 'Antigüedad de Saldos',
  subtitle: `Cuentas por Cobrar · Al ${dateStr}`,
  brand: companyName,
  rightHtml: `<strong style="font-size:20px;display:block">${fmtT(data.totals.total)}</strong>${data.rows.length} cliente${data.rows.length !== 1 ? 's' : ''} con saldo<br><span style="font-size:9px">Generado el ${genStr}</span>`,
})}

<!-- Tarjetas resumen -->
<div style="display:flex; gap:10px; margin-bottom:24px; flex-wrap:wrap;">
  ${summaryCards}
  <div style="background:#f1f5f9; border:1px solid #e2e8f0; border-radius:8px; padding:12px 14px; flex:1; min-width:100px;">
    <div style="font-size:10px; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">Total General</div>
    <div style="font-size:15px; font-weight:700; color:#0f172a;">${fmtT(data.totals.total)}</div>
    <div style="font-size:10px; color:#94a3b8; margin-top:2px;">100%</div>
  </div>
</div>

<!-- Leyenda de tramos -->
<div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px 16px; margin-bottom:20px; font-size:11px; color:#475569; line-height:1.8;">
  <strong style="color:#0f172a;">Leyenda de tramos: </strong>
  <span style="color:#16a34a;">●</span> <strong>Corriente:</strong> Sin vencer &nbsp;|&nbsp;
  <span style="color:#ca8a04;">●</span> <strong>1–30 días:</strong> Vencimiento reciente &nbsp;|&nbsp;
  <span style="color:#ea580c;">●</span> <strong>31–60 días:</strong> Requiere gestión activa &nbsp;|&nbsp;
  <span style="color:#dc2626;">●</span> <strong>61–90 días:</strong> Riesgo alto &nbsp;|&nbsp;
  <span style="color:#991b1b;">●</span> <strong>+90 días:</strong> Riesgo crítico / posible castigo
</div>

<!-- Tabla principal -->
<table>
  <thead>
    <tr>
      <th>Cliente</th>
      <th>RUC</th>
      <th style="text-align:center">Riesgo</th>
      <th style="text-align:right;color:#16a34a">Corriente</th>
      <th style="text-align:right;color:#ca8a04">1–30 días</th>
      <th style="text-align:right;color:#ea580c">31–60 días</th>
      <th style="text-align:right;color:#dc2626">61–90 días</th>
      <th style="text-align:right;color:#991b1b">+90 días</th>
      <th style="text-align:right">Total</th>
    </tr>
  </thead>
  <tbody>
    ${rowsHTML}
  </tbody>
  <tfoot>
    <tr>
      <td colspan="3" style="padding:10px; font-size:11px; text-transform:uppercase; letter-spacing:0.04em;">Total General</td>
      <td style="padding:10px; text-align:right; color:#16a34a; font-size:12px;">${fmtT(data.totals.current)}</td>
      <td style="padding:10px; text-align:right; color:#ca8a04; font-size:12px;">${fmtT(data.totals.d1_30)}</td>
      <td style="padding:10px; text-align:right; color:#ea580c; font-size:12px;">${fmtT(data.totals.d31_60)}</td>
      <td style="padding:10px; text-align:right; color:#dc2626; font-size:12px;">${fmtT(data.totals.d61_90)}</td>
      <td style="padding:10px; text-align:right; color:#991b1b; font-size:12px;">${fmtT(data.totals.d90plus)}</td>
      <td style="padding:10px; text-align:right; font-size:13px; color:#1e3a8a;">${fmtT(data.totals.total)}</td>
    </tr>
  </tfoot>
</table>

${buildPastelFooter(`${companyName} · Reporte de Antigüedad de Saldos · Confidencial`, `Al ${dateStr} · Generado por FlotaTrack ERP`)}

<!-- Botón imprimir (no aparece en PDF) -->
<div class="no-print" style="position:fixed; bottom:24px; right:24px;">
  <button onclick="window.print()" style="background:#1e40af; color:white; border:none; padding:12px 20px; border-radius:10px; font-size:14px; font-weight:700; cursor:pointer; box-shadow:0 4px 12px rgba(30,58,138,0.3);">
    Imprimir / Guardar PDF
  </button>
</div>

<script>
  // Auto-abrir el diálogo de impresión
  window.addEventListener('load', () => setTimeout(() => window.print(), 400))
</script>
</body>
</html>`

  const win = window.open('', '_blank', 'width=1200,height=850')
  if (!win) { alert('Permite ventanas emergentes para exportar el PDF.'); return }
  win.document.write(html)
  win.document.close()
}

// ─── Page ───────────────────────────────────────────────────────────────────────

export default function AgingReportPage() {
  const navigate = useNavigate()
  const [asOf, setAsOf] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [alertMsg, setAlertMsg] = useState('')
  const [showAlertModal, setShowAlertModal] = useState(false)
  const [selectedAlertClients, setSelectedAlertClients] = useState<Set<string>>(new Set())
  const [alertChannel, setAlertChannel] = useState<'email' | 'whatsapp' | 'both'>('email')
  const [sendingAlerts, setSendingAlerts] = useState(false)
  const [selectedClient, setSelectedClient] = useState<{ id: string; name: string } | null>(null)
  const [payInvoice, setPayInvoice] = useState<Invoice | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'heatmap' | 'table'>('heatmap')
  const [bucketAlert, setBucketAlert] = useState<'31_60' | '61_90' | '90plus' | null>(null)
  const storeQuery = useSearchStore((s) => s.query)
  const clearStore = useSearchStore((s) => s.clear)
  useEffect(() => { if (storeQuery) { setSearch(storeQuery); clearStore() } }, [storeQuery])
  useEffect(() => { setBucketAlert(null) }, [asOf])

  const handleExportPDF = async () => {
    if (!data || data.rows.length === 0) return
    setPdfLoading(true)
    try {
      const entries = await Promise.all(
        data.rows.map((r) =>
          api.get<ClientDetailData>(`/invoices/aging/client/${r.clientId}`, { params: { asOf } })
            .then((res) => [r.clientId, res.data] as [string, ClientDetailData])
            .catch(() => [r.clientId, { client: null, invoices: [], asOf }] as [string, ClientDetailData])
        )
      )
      const details: ClientDetails = Object.fromEntries(entries)
      exportPDF(data, asOf, details)
    } finally {
      setPdfLoading(false)
    }
  }

  const { data, isLoading } = useQuery<AgingData>({
    queryKey: ['invoices', 'aging', asOf],
    queryFn: () => api.get('/invoices/aging', { params: { asOf } }).then((r) => r.data),
  })

  // ── Export Excel ─────────────────────────────────────────────────────────────
  const [xlsLoading, setXlsLoading] = useState(false)
  const exportExcel = async () => {
    if (!data) return
    setXlsLoading(true)
    const rows = data.rows.map((r, i) => ({
      'N°':            i + 1,
      'Cliente':       r.clientName,
      'RUC':           r.ruc,
      'Facturas':      r.count,
      'Riesgo':        RISK_CONFIG[riskLevel(r)].label,
      'Corriente S/':  `S/ ${r.current.toFixed(2)}`,
      '1-30 días S/':  `S/ ${r.d1_30.toFixed(2)}`,
      '31-60 días S/': `S/ ${r.d31_60.toFixed(2)}`,
      '61-90 días S/': `S/ ${r.d61_90.toFixed(2)}`,
      '+90 días S/':   `S/ ${r.d90plus.toFixed(2)}`,
      'TOTAL S/':      `S/ ${r.total.toFixed(2)}`,
    }))
    try {
      await exportToExcel(rows, `CxC-Aging-${asOf}`, `Antigüedad de Saldos — Al ${fmtDate(asOf)}`, 'blue')
    } finally {
      setXlsLoading(false)
    }
  }

  // ── Export CSV gerencial ──────────────────────────────────────────────────────
  const exportCSV = () => {
    if (!data) return
    // Semicolon separator: standard for Spanish-locale Excel (avoids BOM+sep= incompatibility)
    const sep = ';'
    const lines: string[] = []

    lines.push(`"REPORTE DE ANTIGÜEDAD DE SALDOS (CUENTAS POR COBRAR)"`)
    lines.push(`"Fecha de corte:";"${fmtDate(asOf)}"`)
    lines.push(`"Generado el:";"${format(new Date(), "dd/MM/yyyy HH:mm", { locale: es })}"`)
    lines.push(`"Clientes con saldo pendiente:";"${data.rows.length}"`)
    lines.push('')
    lines.push('"LEYENDA DE TRAMOS:"')
    lines.push('"Corriente";"Sin vencer — cobro en plazo normal"')
    lines.push('"1–30 días";"Vencido hace menos de 1 mes — seguimiento preventivo"')
    lines.push('"31–60 días";"Vencido entre 1 y 2 meses — requiere gestión activa"')
    lines.push('"61–90 días";"Vencido entre 2 y 3 meses — riesgo alto de incobrabilidad"')
    lines.push('"+90 días";"Vencido más de 3 meses — riesgo crítico / posible castigo"')
    lines.push('')

    const headers = [
      '"N°"', '"Cliente"', '"RUC"', '"Facturas"', '"Nivel de riesgo"',
      '"Corriente (S/)"', '"1–30 días (S/)"', '"31–60 días (S/)"',
      '"61–90 días (S/)"', '"+90 días (S/)"', '"TOTAL (S/)"',
    ]
    lines.push(headers.join(sep))

    data.rows.forEach((r, i) => {
      const risk = RISK_CONFIG[riskLevel(r)].label
      lines.push([
        i + 1,
        `"${r.clientName}"`,
        r.ruc,
        r.count,
        `"${risk}"`,
        r.current.toFixed(2),
        r.d1_30.toFixed(2),
        r.d31_60.toFixed(2),
        r.d61_90.toFixed(2),
        r.d90plus.toFixed(2),
        r.total.toFixed(2),
      ].join(sep))
    })

    lines.push('')
    lines.push([
      '', '"TOTAL GENERAL"', '', '', '',
      data.totals.current.toFixed(2),
      data.totals.d1_30.toFixed(2),
      data.totals.d31_60.toFixed(2),
      data.totals.d61_90.toFixed(2),
      data.totals.d90plus.toFixed(2),
      data.totals.total.toFixed(2),
    ].join(sep))

    lines.push('')
    lines.push('"ANÁLISIS DE RIESGO:"')
    const byRisk = data.rows.reduce((acc, r) => {
      const k = riskLevel(r); acc[k] = (acc[k] ?? 0) + r.total; return acc
    }, {} as Record<string, number>)
    Object.entries(RISK_CONFIG).forEach(([k, cfg]) => {
      const val = byRisk[k] ?? 0
      if (val > 0) lines.push(`"${cfg.label}"${sep}"${fmtFull(val)}"${sep}"${pct(val, data.totals.total)}"`)
    })

    const csv = lines.join('\n')
    const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `CxC-Aging-${asOf}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const today = format(new Date(), 'yyyy-MM-dd')
  const isProjection = asOf !== today

  return (
    <AppShell active="aging" title="Antigüedad CxC">
      <div style={{ maxWidth: 1400, padding: '24px 28px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--clr-text)', margin: 0 }}>Antigüedad de Saldos</h1>
            <p style={{ fontSize: 13, color: 'var(--clr-text-subtle)', marginTop: 4, margin: '4px 0 0' }}>
              Cuentas por cobrar clasificadas por antigüedad de vencimiento
              {data && data.rows.length > 0 && (
                <> · <strong style={{ color: 'var(--clr-text-muted)' }}>{data.rows.length} cliente{data.rows.length !== 1 ? 's' : ''}</strong> con saldo pendiente</>
              )}
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Fecha de corte */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--clr-surface)', border: `1px solid ${isProjection ? '#854d0e' : 'var(--clr-border)'}`, borderRadius: 8, padding: '6px 12px' }}>
              <Calendar size={13} color={isProjection ? '#d97706' : 'var(--clr-text-subtle)'} />
              <label style={{ fontSize: 11, color: 'var(--clr-text-subtle)', whiteSpace: 'nowrap' }}>Fecha de corte</label>
              <input
                type="date"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
                style={{ background: 'transparent', border: 'none', color: isProjection ? '#d97706' : 'var(--clr-text)', fontSize: 13, fontWeight: 600, outline: 'none', cursor: 'pointer' }}
              />
              {isProjection && (
                <span style={{ fontSize: 10, fontWeight: 700, color: '#d97706', background: 'rgba(217,119,6,0.12)', padding: '1px 6px', borderRadius: 4 }}>
                  PROYECCIÓN
                </span>
              )}
            </div>

            <button
              onClick={() => {
                if (!data || data.rows.length === 0) return
                const overdueClients = data.rows.filter((r) => r.d1_30 + r.d31_60 + r.d61_90 + r.d90plus > 0)
                setSelectedAlertClients(new Set(overdueClients.map((r) => r.clientId)))
                setShowAlertModal(true)
              }}
              disabled={!data || data.rows.length === 0}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(194,65,12,0.85)', color: 'white', border: 'none', fontSize: 12, fontWeight: 700, padding: '7px 14px', borderRadius: 8, cursor: (!data || data.rows.length === 0) ? 'not-allowed' : 'pointer', opacity: (!data || data.rows.length === 0) ? 0.5 : 1 }}
            >
              <Bell size={13} /> Enviar alertas
            </button>
            <button
              onClick={exportExcel}
              disabled={!data || data.rows.length === 0 || xlsLoading}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: xlsLoading ? '#15803d' : '#16a34a', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, padding: '7px 14px', borderRadius: 8, cursor: xlsLoading ? 'wait' : (!data || data.rows.length === 0 ? 'not-allowed' : 'pointer'), opacity: !data || data.rows.length === 0 ? 0.45 : 1, transition: 'opacity 0.15s' }}
            >
              {xlsLoading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <FileSpreadsheet size={13} />}
              Exportar Excel
            </button>
            <button
              onClick={handleExportPDF}
              disabled={!data || data.rows.length === 0 || pdfLoading}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: pdfLoading ? '#b91c1c' : '#dc2626', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, padding: '7px 14px', borderRadius: 8, cursor: pdfLoading ? 'wait' : (!data || data.rows.length === 0 ? 'not-allowed' : 'pointer'), opacity: !data || data.rows.length === 0 ? 0.45 : 1, transition: 'opacity 0.15s' }}
            >
              {pdfLoading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <FileText size={13} />}
              Exportar PDF
            </button>
          </div>
        </div>

        {/* Alert message */}
        {alertMsg && (
          <div style={{ borderRadius: 10, padding: '10px 16px', fontSize: 13, marginBottom: 16, background: alertMsg.startsWith('✅') ? 'var(--clr-success-bg)' : 'var(--clr-danger-bg)', border: `1px solid ${alertMsg.startsWith('✅') ? 'var(--clr-success-border)' : 'var(--clr-danger-border)'}`, color: alertMsg.startsWith('✅') ? 'var(--clr-success)' : 'var(--clr-danger)' }}>
            {alertMsg}
          </div>
        )}

        {/* Summary cards */}
        {data && data.rows.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
            {BUCKETS.map((b) => {
              const val = data.totals[b.key as BucketKey]
              const clientsInBucket = data.rows.filter((r) => r[b.key as BucketKey] > 0).length
              return (
                <div key={b.key} style={{ borderRadius: 12, padding: '14px 16px', background: b.bgColor, border: `1px solid ${b.borderColor}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: b.textColor }}>{b.label}</div>
                    <div style={{ fontSize: 10, color: 'var(--clr-text-subtle)' }}>{pct(val, data.totals.total)}</div>
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: b.textColor }}>
                    S/ {val.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--clr-text-subtle)', marginTop: 5 }}>{b.sublabel}</div>
                  {clientsInBucket > 0 && (
                    <div style={{ fontSize: 10, color: 'var(--clr-text-subtle)', marginTop: 2 }}>{clientsInBucket} cliente{clientsInBucket !== 1 ? 's' : ''}</div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Banda de alertas de riesgo CxC */}
        {data && (() => {
          const alerts: AlertItem[] = []
          const crit = data.rows.filter((r) => r.d90plus > 0)
          const high = data.rows.filter((r) => r.d61_90 > 0)
          const warn = data.rows.filter((r) => r.d31_60 > 0)
          if (crit.length > 0)
            alerts.push({ id: 'crit-90', severity: 'critical', title: `${crit.length} cliente${crit.length > 1 ? 's' : ''} con +90 días vencido`, description: `${fmtFull(data.totals.d90plus)} en cartera crítica — evalúa gestión formal o provisión como incobrable.`, actionLabel: 'Ver Heatmap' })
          if (high.length > 0)
            alerts.push({ id: 'high-61', severity: 'warning', title: `${high.length} cliente${high.length > 1 ? 's' : ''} con 61–90 días vencido`, description: `${fmtFull(data.totals.d61_90)} en riesgo alto — iniciar gestión de cobranza activa.`, actionLabel: 'Ver Detalle' })
          if (warn.length > 0)
            alerts.push({ id: 'warn-31', severity: 'info', title: `${warn.length} cliente${warn.length > 1 ? 's' : ''} con 31–60 días vencido`, description: `${fmtFull(data.totals.d31_60)} en seguimiento preventivo — contactar antes del vencimiento crítico.`, actionLabel: 'Ver Detalle' })
          return (
            <div style={{ marginBottom: 16 }}>
              <AlertRibbon
                key={asOf}
                alerts={alerts}
                onActionClick={(alert) => {
                  if (alert.actionLabel === 'Ver Heatmap') {
                    setViewMode('heatmap')
                    setBucketAlert(null)
                  } else {
                    setViewMode('table')
                    if (alert.id === 'crit-90') setBucketAlert('90plus')
                    else if (alert.id === 'high-61') setBucketAlert('61_90')
                    else if (alert.id === 'warn-31') setBucketAlert('31_60')
                  }
                }}
              />
            </div>
          )
        })()}

        {/* Table */}
        {isLoading ? (
          <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 12, height: 280 }} className="animate-pulse" />
        ) : !data || data.rows.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Hero card */}
            <div style={{
              background: 'linear-gradient(135deg, var(--clr-success-bg, rgba(22,163,74,0.08)) 0%, var(--clr-surface) 60%)',
              border: '1px solid var(--clr-border)', borderRadius: 12,
              padding: '36px 32px', display: 'flex', alignItems: 'center', gap: 28,
            }}>
              <div style={{
                width: 72, height: 72, borderRadius: '50%', flexShrink: 0,
                background: 'rgba(22,163,74,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '2px solid rgba(22,163,74,0.25)',
              }}>
                <CheckCircle size={36} style={{ color: '#16a34a' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--clr-text)', marginBottom: 4 }}>
                  Sin saldos vencidos al {fmtDate(asOf)}
                </div>
                <div style={{ fontSize: 13, color: 'var(--clr-text-subtle)', lineHeight: 1.5 }}>
                  Todas las cuentas por cobrar están al día en esa fecha. No hay importes pendientes de cobro.
                </div>
                <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: 'rgba(22,163,74,0.12)', color: '#15803d', fontWeight: 700 }}>
                    ✓ Cartera saneada
                  </span>
                  <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: 'var(--clr-bg)', color: 'var(--clr-text-subtle)', fontWeight: 600, border: '1px solid var(--clr-border)' }}>
                    Corte: {fmtDate(asOf)}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick links */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              {[
                { label: 'Cobranzas CxC',    icon: '📋', desc: 'Ver estado de facturas',   path: '/cxc' },
                { label: 'Historial Pagos',   icon: '💳', desc: 'Cobros registrados',       path: '/payments' },
                { label: 'Reporte Gerencial', icon: '📊', desc: 'KPIs y rentabilidad',      path: '/reports/gerencial' },
                { label: 'Reporte de Pagos',  icon: '🧾', desc: 'Análisis de cobros',       path: '/reports/pagos' },
              ].map((item) => (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  style={{
                    background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 10,
                    padding: '14px 16px', cursor: 'pointer', textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: 12,
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--clr-primary)'; (e.currentTarget as HTMLElement).style.background = 'var(--clr-primary-bg, rgba(59,130,246,0.05))' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--clr-border)'; (e.currentTarget as HTMLElement).style.background = 'var(--clr-surface)' }}
                >
                  <span style={{ fontSize: 22 }}>{item.icon}</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--clr-text)', marginBottom: 2 }}>{item.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--clr-text-subtle)' }}>{item.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 12, overflow: 'hidden' }}>
            {/* Search bar + view toggle */}
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--clr-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Search size={13} style={{ color: 'var(--clr-text-subtle)', flexShrink: 0 }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar cliente o RUC…"
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 12, color: 'var(--clr-text)' }}
              />
              {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-text-subtle)', display: 'flex', padding: 0 }}><X size={13} /></button>}
              <div style={{ display: 'flex', backgroundColor: 'var(--clr-bg)', borderRadius: 6, padding: 3, border: '1px solid var(--clr-border)', flexShrink: 0 }}>
                {([['heatmap', '▦', 'Matriz Heatmap'], ['table', '☰', 'Tabla Detallada']] as const).map(([mode, icon, label]) => (
                  <button
                    key={mode}
                    onClick={() => { setViewMode(mode); if (mode === 'heatmap') setBucketAlert(null) }}
                    title={label}
                    style={{
                      backgroundColor: viewMode === mode ? 'var(--clr-primary)' : 'transparent',
                      color: viewMode === mode ? 'var(--clr-on-primary)' : 'var(--clr-text-subtle)',
                      border: 'none', borderRadius: 4, padding: '5px 10px', fontSize: 12,
                      fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span>{icon}</span>
                    <span style={{ display: 'none' /* label visible on wider screens via media-style approach */ }}>{label}</span>
                  </button>
                ))}
              </div>
            </div>
            {/* ── VISTA HEATMAP (Matriz de antigüedad) ── */}
            {viewMode === 'heatmap' && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--clr-border)', background: 'var(--clr-bg)' }}>
                      {[
                        { label: 'Cliente', align: 'left' },
                        { label: 'RUC', align: 'left' },
                        { label: 'Riesgo', align: 'center' },
                        { label: 'Distribución', align: 'center' },
                        { label: 'Corriente', align: 'right', color: 'var(--clr-success)' },
                        { label: '1–30 días', align: 'right', color: '#d97706' },
                        { label: '31–60 días', align: 'right', color: 'var(--clr-orange)' },
                        { label: '61–90 días', align: 'right', color: 'var(--clr-danger)' },
                        { label: '+90 días', align: 'right', color: 'var(--clr-danger)' },
                        { label: 'Total', align: 'right', color: 'var(--clr-text)' },
                      ].map((h) => (
                        <th key={h.label} style={{ textAlign: h.align as 'left' | 'right' | 'center', padding: '10px 14px', fontSize: 10, fontWeight: 600, color: h.color ?? 'var(--clr-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                          {h.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.filter((row) => !search.trim() || row.clientName.toLowerCase().includes(search.toLowerCase()) || row.ruc.includes(search)).map((row, i) => {
                      const risk = riskLevel(row)
                      const rc = RISK_CONFIG[risk]
                      return (
                        <tr
                          key={row.clientId}
                          onClick={() => setSelectedClient({ id: row.clientId, name: row.clientName })}
                          style={{ borderBottom: '1px solid var(--clr-border)', background: i % 2 === 1 ? 'var(--clr-bg)' : 'transparent', cursor: 'pointer', transition: 'background 0.15s' }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--clr-primary-bg)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 1 ? 'var(--clr-bg)' : 'transparent')}
                        >
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ fontWeight: 600, color: 'var(--clr-text)' }}>{row.clientName}</div>
                            <div style={{ fontSize: 11, color: 'var(--clr-text-subtle)', marginTop: 1 }}>{row.count} factura{row.count !== 1 ? 's' : ''} · ver detalle →</div>
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--clr-text-subtle)', fontFamily: 'monospace', fontSize: 11 }}>{row.ruc}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: rc.bg, color: rc.color, whiteSpace: 'nowrap' }}>
                              {rc.label}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                            <RiskBar row={row} />
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', borderRight: '1px solid var(--clr-border)', backgroundColor: row.current > 0 ? 'var(--clr-success-bg)'       : 'transparent', color: row.current > 0 ? 'var(--clr-success)'    : 'var(--clr-border)', fontWeight: row.current > 0 ? 600 : 400 }}>{fmtAmt(row.current)}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', borderRight: '1px solid var(--clr-border)', backgroundColor: row.d1_30  > 0 ? 'rgba(217,119,6,0.10)'    : 'transparent', color: row.d1_30  > 0 ? '#d97706'              : 'var(--clr-border)', fontWeight: row.d1_30  > 0 ? 600 : 400 }}>{fmtAmt(row.d1_30)}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', borderRight: '1px solid var(--clr-border)', backgroundColor: row.d31_60 > 0 ? 'rgba(234,88,12,0.10)'    : 'transparent', color: row.d31_60 > 0 ? '#ea580c'              : 'var(--clr-border)', fontWeight: row.d31_60 > 0 ? 600 : 400 }}>{fmtAmt(row.d31_60)}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', borderRight: '1px solid var(--clr-border)', backgroundColor: row.d61_90 > 0 ? 'var(--clr-danger-bg)'       : 'transparent', color: row.d61_90 > 0 ? 'var(--clr-danger)'    : 'var(--clr-border)', fontWeight: row.d61_90 > 0 ? 600 : 400 }}>{fmtAmt(row.d61_90)}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', borderRight: '1px solid var(--clr-border)', backgroundColor: row.d90plus > 0 ? 'var(--clr-danger-bg)'       : 'transparent', color: row.d90plus > 0 ? 'var(--clr-danger)'    : 'var(--clr-border)', fontWeight: row.d90plus > 0 ? 700 : 400 }}>{fmtAmt(row.d90plus)}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--clr-text)' }}>
                            {fmtFull(row.total)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--clr-border)', background: 'var(--clr-sidebar)' }}>
                      <td colSpan={4} style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--clr-text)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        TOTAL GENERAL
                      </td>
                      {(['current', 'd1_30', 'd31_60', 'd61_90', 'd90plus'] as BucketKey[]).map((k) => (
                        <td key={k} style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: BUCKET_MAP[k].color, fontSize: 13 }}>
                          {data.totals[k] > 0 ? fmtFull(data.totals[k]) : '—'}
                        </td>
                      ))}
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--clr-text)', fontSize: 14 }}>
                        {fmtFull(data.totals.total)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* ── VISTA TABLA DETALLADA (Compacta por cliente) ── */}
            {viewMode === 'table' && (
              <div>
                {bucketAlert && (
                  <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--clr-border)', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--clr-surface-hover)' }}>
                    <span style={{ fontSize: 11, color: 'var(--clr-text-subtle)' }}>Filtro activo:</span>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20,
                      background: bucketAlert === '90plus' ? 'rgba(220,38,38,0.12)' : bucketAlert === '61_90' ? 'rgba(234,88,12,0.12)' : 'rgba(217,119,6,0.12)',
                      color: bucketAlert === '90plus' ? 'var(--clr-danger)' : bucketAlert === '61_90' ? '#ea580c' : '#d97706',
                    }}>
                      {bucketAlert === '31_60' ? '31–60 días vencido' : bucketAlert === '61_90' ? '61–90 días vencido' : '+90 días vencido'}
                    </span>
                    <button onClick={() => setBucketAlert(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-text-subtle)', fontSize: 11, padding: '2px 6px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 3 }}>
                      <X size={11} /> Limpiar filtro
                    </button>
                  </div>
                )}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--clr-border)', background: 'var(--clr-bg)' }}>
                      {[
                        { label: 'RUC', align: 'left' },
                        { label: 'Cliente / Razón Social', align: 'left' },
                        { label: 'Riesgo', align: 'center' },
                        { label: 'Facturas', align: 'center' },
                        { label: 'Cartera vencida', align: 'right' },
                        { label: 'Total CxC', align: 'right', color: 'var(--clr-text)' },
                        { label: 'Acción', align: 'center' },
                      ].map((h) => (
                        <th key={h.label} style={{ textAlign: h.align as 'left' | 'right' | 'center', padding: '10px 14px', fontSize: 10, fontWeight: 600, color: h.color ?? 'var(--clr-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                          {h.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  {(() => {
                    const filteredRows = data.rows.filter((row) => {
                      if (search.trim() && !row.clientName.toLowerCase().includes(search.toLowerCase()) && !row.ruc.includes(search)) return false
                      if (bucketAlert === '31_60'  && row.d31_60  <= 0) return false
                      if (bucketAlert === '61_90'  && row.d61_90  <= 0) return false
                      if (bucketAlert === '90plus' && row.d90plus <= 0) return false
                      return true
                    })
                    const filtTotVencido = filteredRows.reduce((s, r) => s + r.d1_30 + r.d31_60 + r.d61_90 + r.d90plus, 0)
                    const filtTotTotal   = filteredRows.reduce((s, r) => s + r.total, 0)
                    return (<>
                  <tbody>
                    {filteredRows.map((row, i) => {
                      const risk = riskLevel(row)
                      const rc = RISK_CONFIG[risk]
                      const vencido = row.d1_30 + row.d31_60 + row.d61_90 + row.d90plus
                      const vencidoPct = row.total > 0 ? Math.round((vencido / row.total) * 100) : 0
                      return (
                        <tr
                          key={row.clientId}
                          style={{ borderBottom: '1px solid var(--clr-border)', background: i % 2 === 1 ? 'var(--clr-bg)' : 'transparent', transition: 'background 0.15s' }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--clr-primary-bg)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 1 ? 'var(--clr-bg)' : 'transparent')}
                        >
                          <td style={{ padding: '12px 14px', color: 'var(--clr-text-subtle)', fontFamily: 'monospace', fontSize: 11 }}>{row.ruc}</td>
                          <td style={{ padding: '12px 14px' }}>
                            <div style={{ fontWeight: 600, color: 'var(--clr-text)' }}>{row.clientName}</div>
                            <div style={{ marginTop: 4, height: 5, borderRadius: 3, overflow: 'hidden', display: 'flex', width: 120, gap: 1 }}>
                              {row.current > 0 && <div style={{ width: `${Math.round((row.current/row.total)*100)}%`, background: 'var(--clr-success)', minWidth: 2 }} />}
                              {row.d1_30 > 0 && <div style={{ width: `${Math.round((row.d1_30/row.total)*100)}%`, background: '#d97706', minWidth: 2 }} />}
                              {row.d31_60 > 0 && <div style={{ width: `${Math.round((row.d31_60/row.total)*100)}%`, background: '#ea580c', minWidth: 2 }} />}
                              {row.d61_90 > 0 && <div style={{ width: `${Math.round((row.d61_90/row.total)*100)}%`, background: 'var(--clr-danger)', minWidth: 2 }} />}
                              {row.d90plus > 0 && <div style={{ width: `${Math.round((row.d90plus/row.total)*100)}%`, background: 'var(--clr-danger)', minWidth: 2 }} />}
                            </div>
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: rc.bg, color: rc.color, whiteSpace: 'nowrap' }}>
                              {rc.label}
                            </span>
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'center', color: 'var(--clr-text-subtle)', fontSize: 12 }}>
                            {row.count} fact.
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                            {vencido > 0 ? (
                              <div>
                                <div style={{ fontWeight: 700, color: vencidoPct > 50 ? 'var(--clr-danger)' : '#ea580c', fontSize: 12 }}>{fmtFull(vencido)}</div>
                                <div style={{ fontSize: 10, color: 'var(--clr-text-subtle)' }}>{vencidoPct}% vencido</div>
                              </div>
                            ) : (
                              <span style={{ color: 'var(--clr-success)', fontSize: 11 }}>✓ Al día</span>
                            )}
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--clr-text)', fontSize: 14, fontFamily: 'monospace' }}>
                            {fmtFull(row.total)}
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                            <button
                              onClick={() => setSelectedClient({ id: row.clientId, name: row.clientName })}
                              style={{ backgroundColor: 'var(--clr-primary)', color: 'var(--clr-on-primary)', border: 'none', borderRadius: 4, padding: '5px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                            >
                              Ver Facturas
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--clr-border)', background: 'var(--clr-sidebar)' }}>
                      <td colSpan={4} style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--clr-text)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {bucketAlert || search.trim() ? `${filteredRows.length} cliente${filteredRows.length !== 1 ? 's' : ''} (filtrado)` : `TOTAL GENERAL · ${data.rows.length} cliente${data.rows.length !== 1 ? 's' : ''}`}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--clr-danger)', fontSize: 13 }}>
                        {fmtFull(filtTotVencido)}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--clr-text)', fontSize: 14, fontFamily: 'monospace' }}>
                        {fmtFull(filtTotTotal)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </>)})()}
              </table>
            </div>
            </div>
          )}

            {/* Footer nota */}
            <div style={{ padding: '10px 16px', borderTop: '1px solid var(--clr-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={12} color="var(--clr-text-subtle)" />
              <span style={{ fontSize: 11, color: 'var(--clr-text-subtle)' }}>
                {viewMode === 'heatmap'
                  ? 'Haz clic en cualquier fila para ver el detalle de facturas del cliente.'
                  : 'Usa "Ver Facturas" para abrir el detalle de cada cliente.'}
                {' '}El CSV incluye leyenda de tramos y análisis de riesgo para gerencia.
              </span>
            </div>
          </div>
        )}

        {/* Quick Actions docked bar */}
        <div style={{ marginTop: 16 }}>
          <QuickActionsPanel layout="dock" />
        </div>
      </div>

      {/* Drill-down modal */}
      {selectedClient && (
        <ClientDetailModal
          clientId={selectedClient.id}
          clientName={selectedClient.name}
          asOf={asOf}
          onClose={() => setSelectedClient(null)}
          onPay={(inv) => setPayInvoice(inv)}
        />
      )}

      {/* Payment registration modal — zIndex 400 renders above ClientDetailModal (300) */}
      <PaymentModal invoice={payInvoice} onClose={() => setPayInvoice(null)} />

      {/* Alert clients selection modal */}
      {showAlertModal && data && (() => {
        const overdueRows = data.rows.filter((r) => r.d1_30 + r.d31_60 + r.d61_90 + r.d90plus > 0)
        const allSelected = overdueRows.every((r) => selectedAlertClients.has(r.clientId))
        const selected = overdueRows.filter((r) => selectedAlertClients.has(r.clientId))
        const totalSelected = selected.length
        const selectedOverdue = selected.reduce((s, r) => s + r.d1_30 + r.d31_60 + r.d61_90 + r.d90plus, 0)
        const mailClients = selected.filter((r) => r.email)
        const waClients   = selected.filter((r) => r.whatsapp)
        const canEmail = alertChannel !== 'whatsapp' && mailClients.length > 0
        const canWA    = alertChannel !== 'email'    && waClients.length > 0
        const canSend  = totalSelected > 0 && (canEmail || canWA)

        const handleSend = async () => {
          if (!canSend) return
          setSendingAlerts(true)
          try {
            if (canEmail) {
              await api.post('/invoices/alerts/run', { clientIds: mailClients.map((r) => r.clientId) })
            }
            if (canWA) {
              for (const row of waClients) {
                const num = (row.whatsapp ?? '').replace(/[^0-9]/g, '')
                const fullNum = num.startsWith('51') ? num : `51${num}`
                const vencido = row.d1_30 + row.d31_60 + row.d61_90 + row.d90plus
                const msg = encodeURIComponent(
                  `Estimados ${row.clientName},\n\nLe informamos que al ${format(new Date(), 'dd/MM/yyyy')} registra un saldo vencido de ${fmtFull(vencido)} con nuestra empresa.\n\nPor favor, comuníquese con nosotros para coordinar el pago. Gracias.`
                )
                window.open(`https://wa.me/${fullNum}?text=${msg}`, '_blank')
                await new Promise((res) => setTimeout(res, 600))
              }
            }
            const parts: string[] = []
            if (canEmail) parts.push(`✉ ${mailClients.length} por email`)
            if (canWA)    parts.push(`📱 ${waClients.length} por WhatsApp`)
            setAlertMsg(`✅ Alertas enviadas — ${parts.join(' · ')}`)
            setShowAlertModal(false)
          } catch {
            setAlertMsg('❌ Error al enviar alertas')
            setShowAlertModal(false)
          } finally {
            setSendingAlerts(false)
          }
        }

        const ChTab = ({ ch, label }: { ch: 'email' | 'whatsapp' | 'both'; label: string }) => (
          <button onClick={() => setAlertChannel(ch)} style={{ flex: 1, padding: '6px 0', fontSize: 11, fontWeight: 700, borderRadius: 6, border: 'none', cursor: 'pointer', background: alertChannel === ch ? 'rgba(194,65,12,0.9)' : 'transparent', color: alertChannel === ch ? '#fff' : 'var(--clr-text-subtle)', transition: 'all 0.15s' }}>
            {label}
          </button>
        )

        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)' }}
            onClick={(e) => { if (e.target === e.currentTarget && !sendingAlerts) setShowAlertModal(false) }}>
            <div style={{ background: 'var(--clr-sidebar)', border: '1px solid var(--clr-border)', borderRadius: 16, width: 'min(92vw, 580px)', maxHeight: '82vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>

              {/* Header */}
              <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--clr-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Bell size={15} color="rgba(194,65,12,0.9)" /> Envío de Alertas de Mora
                  </h2>
                  <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--clr-text-subtle)' }}>
                    {overdueRows.length} clientes · <strong style={{ color: 'var(--clr-danger)' }}>{fmtFull(overdueRows.reduce((s,r)=>s+r.d1_30+r.d31_60+r.d61_90+r.d90plus,0))}</strong> vencido
                  </p>
                </div>
                <button onClick={() => { if (!sendingAlerts) setShowAlertModal(false) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-text-subtle)', padding: 4 }}>
                  <X size={16} />
                </button>
              </div>

              {/* Channel selector */}
              <div style={{ padding: '10px 22px', borderBottom: '1px solid var(--clr-border)', background: 'var(--clr-bg)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--clr-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Canal de envío</div>
                <div style={{ display: 'flex', gap: 4, background: 'var(--clr-surface)', borderRadius: 8, padding: 4, border: '1px solid var(--clr-border)' }}>
                  <ChTab ch="email"    label="✉ Solo Email" />
                  <ChTab ch="whatsapp" label="📱 Solo WhatsApp" />
                  <ChTab ch="both"     label="✉ + 📱 Ambos" />
                </div>
                {alertChannel !== 'email' && (
                  <p style={{ margin: '6px 0 0', fontSize: 11, color: '#d97706' }}>
                    📱 WhatsApp abrirá una pestaña por cada cliente con el mensaje prellenado (gratis, vía wa.me)
                  </p>
                )}
              </div>

              {/* Select all bar */}
              <div style={{ padding: '8px 22px', borderBottom: '1px solid var(--clr-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <button
                  onClick={() => setSelectedAlertClients(allSelected ? new Set() : new Set(overdueRows.map((r) => r.clientId)))}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-text-muted)', fontSize: 12, fontWeight: 600, padding: 0 }}
                >
                  {allSelected ? <CheckSquare size={14} color="var(--clr-primary)" /> : <Square size={14} />}
                  {allSelected ? 'Deseleccionar todos' : 'Seleccionar todos'}
                </button>
                <span style={{ fontSize: 11, color: 'var(--clr-text-subtle)' }}>
                  {totalSelected} seleccionado{totalSelected !== 1 ? 's' : ''} · {fmtFull(selectedOverdue)}
                </span>
              </div>

              {/* Client list */}
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {overdueRows.map((row) => {
                  const checked = selectedAlertClients.has(row.clientId)
                  const vencido = row.d1_30 + row.d31_60 + row.d61_90 + row.d90plus
                  const risk = riskLevel(row)
                  const rc = RISK_CONFIG[risk]
                  const hasEmail = !!row.email
                  const hasWA    = !!row.whatsapp
                  return (
                    <div
                      key={row.clientId}
                      onClick={() => { const next = new Set(selectedAlertClients); if (checked) next.delete(row.clientId); else next.add(row.clientId); setSelectedAlertClients(next) }}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 22px', borderBottom: '1px solid var(--clr-border)', cursor: 'pointer', background: checked ? 'var(--clr-primary-bg)' : 'transparent', transition: 'background 0.1s' }}
                    >
                      {checked ? <CheckSquare size={16} color="var(--clr-primary)" style={{ flexShrink: 0 }} /> : <Square size={16} color="var(--clr-text-subtle)" style={{ flexShrink: 0 }} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: 'var(--clr-text)', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.clientName}</div>
                        <div style={{ fontSize: 11, color: 'var(--clr-text-subtle)', marginTop: 2, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ fontFamily: 'monospace' }}>{row.ruc}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: rc.bg, color: rc.color }}>{rc.label}</span>
                          {hasEmail && <span title={row.email!} style={{ color: 'var(--clr-primary)', fontSize: 12 }}>✉</span>}
                          {hasWA    && <span title={row.whatsapp!} style={{ color: '#16a34a', fontSize: 12 }}>📱</span>}
                          {checked && !hasEmail && alertChannel !== 'whatsapp' && <span style={{ color: '#d97706', fontSize: 10 }}>sin email</span>}
                          {checked && !hasWA    && alertChannel !== 'email'    && <span style={{ color: '#d97706', fontSize: 10 }}>sin WhatsApp</span>}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontWeight: 700, color: 'var(--clr-danger)', fontSize: 13 }}>{fmtFull(vencido)}</div>
                        <div style={{ fontSize: 10, color: 'var(--clr-text-subtle)' }}>{row.count} fact.</div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Footer */}
              <div style={{ padding: '12px 22px', borderTop: '1px solid var(--clr-border)', display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center' }}>
                <div style={{ flex: 1, fontSize: 11, color: 'var(--clr-text-subtle)', lineHeight: 1.5 }}>
                  {canEmail && <div>✉ Email: {mailClients.length} cliente{mailClients.length !== 1 ? 's' : ''}</div>}
                  {canWA    && <div>📱 WhatsApp: {waClients.length} cliente{waClients.length !== 1 ? 's' : ''}</div>}
                  {totalSelected > 0 && !canSend && <div style={{ color: '#d97706' }}>⚠ Sin canal disponible para los seleccionados</div>}
                </div>
                <button onClick={() => setShowAlertModal(false)} disabled={sendingAlerts} style={{ padding: '7px 16px', borderRadius: 8, background: 'var(--clr-surface-hover)', color: 'var(--clr-text-muted)', border: '1px solid var(--clr-border)', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                  Cancelar
                </button>
                <button onClick={handleSend} disabled={!canSend || sendingAlerts}
                  style={{ padding: '7px 18px', borderRadius: 8, background: !canSend ? 'rgba(194,65,12,0.35)' : 'rgba(194,65,12,0.9)', color: 'white', border: 'none', fontSize: 12, fontWeight: 700, cursor: !canSend ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {sendingAlerts ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Bell size={13} />}
                  {sendingAlerts ? 'Enviando...' : `Despachar (${totalSelected})`}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </AppShell>
  )
}

