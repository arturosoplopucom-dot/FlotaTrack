import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { useSearchStore } from '../store/search.store'
import { TrendingUp, ChevronLeft, AlertCircle, Clock, Search, X, ChevronUp, ChevronDown, ChevronsUpDown, Filter, CalendarRange, Building2, ChevronRight, FileText } from 'lucide-react'
import { useInvoicesReport } from '../hooks/useReports'
import AppShell from '../components/AppShell'
import ExportMenu from '../components/ExportMenu'
import { buildPastelHtmlHead, buildPastelHeader, buildPastelFooter } from '../utils/exportUtils'

const fmt  = (n: number) => 'S/ ' + n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtK = (n: number) => n >= 1000 ? `S/ ${(n / 1000).toFixed(1)}k` : fmt(n)
const fmtD = (d: string) => format(parseISO(d), 'dd/MM/yyyy')

function daysOverdue(dueDateStr: string) {
  return Math.floor((Date.now() - new Date(dueDateStr).getTime()) / 86_400_000)
}

function agingBucket(days: number): '0-30' | '31-60' | '61-90' | '90+' {
  if (days <= 30) return '0-30'
  if (days <= 60) return '31-60'
  if (days <= 90) return '61-90'
  return '90+'
}

const BUCKET_COLORS: Record<string, string> = {
  '0-30': '#d97706', '31-60': '#ea580c', '61-90': 'var(--clr-danger)', '90+': 'var(--clr-danger)',
}
const BUCKET_BG: Record<string, string> = {
  '0-30': 'rgba(217,119,6,0.10)', '31-60': 'rgba(234,88,12,0.10)',
  '61-90': 'var(--clr-danger-bg)', '90+': 'var(--clr-danger-bg)',
}

// PDF bucket colors (for light background)
const PDF_BUCKET: Record<string, { color: string; bg: string }> = {
  '0-30':  { color: '#b45309', bg: '#fef3c7' },
  '31-60': { color: '#c2410c', bg: '#ffedd5' },
  '61-90': { color: '#b91c1c', bg: '#fee2e2' },
  '90+':   { color: '#7f1d1d', bg: '#fee2e2' },
}

type SortKey = 'dueDate' | 'balance' | 'total' | 'clientName' | 'days'
type SortDir = 'asc' | 'desc'

type EnrichedItem = {
  id: string; series: string; number: string
  clientName: string; clientRuc: string
  issueDate: string; dueDate: string
  total: number; paid: number; balance: number
  status: string; days: number
  bucket: '0-30' | '31-60' | '61-90' | '90+' | null
}

function SortIcon({ col, sortKey, dir }: { col: SortKey; sortKey: SortKey; dir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown size={11} style={{ opacity: 0.3 }} />
  return dir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />
}

const DATE_INPUT_STYLE: React.CSSProperties = {
  background: 'transparent', border: 'none', outline: 'none',
  color: 'var(--clr-text)', fontSize: 12, width: 110, colorScheme: 'dark',
}

const PAGE_BTN: React.CSSProperties = {
  minWidth: 30, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
  border: '1px solid var(--clr-border)', background: 'var(--clr-surface)', color: 'var(--clr-text-subtle)',
  padding: '0 6px', transition: 'all 0.12s',
}

function pageRange(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const delta = 1
  const left  = Math.max(2, current - delta)
  const right = Math.min(total - 1, current + delta)
  const pages: (number | '…')[] = [1]
  if (left > 2) pages.push('…')
  for (let i = left; i <= right; i++) pages.push(i)
  if (right < total - 1) pages.push('…')
  pages.push(total)
  return pages
}

function buildPdfHtml(
  items: EnrichedItem[],
  meta: {
    total: number; totalOverdue: number; overdueCount: number
    dateFrom: string; dateTo: string; clientFilter: string; statusFilter: string
    hasFilters: boolean
  },
): string {
  const now   = new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })
  const grand = items.reduce((s, i) => s + i.balance, 0)

  const statusLabel: Record<string, string> = { ALL: 'Todos', OVERDUE: 'Vencidas', PARTIAL: 'Parciales', PENDING: 'Pendientes' }

  const activeFilters: string[] = []
  if (meta.statusFilter !== 'ALL') activeFilters.push(`Estado: ${statusLabel[meta.statusFilter] ?? meta.statusFilter}`)
  if (meta.clientFilter)           activeFilters.push(`Cliente RUC: ${meta.clientFilter}`)
  if (meta.dateFrom)               activeFilters.push(`Desde: ${meta.dateFrom}`)
  if (meta.dateTo)                 activeFilters.push(`Hasta: ${meta.dateTo}`)

  const rows = items.map((inv, i) => {
    const isOv  = inv.status === 'OVERDUE'
    const pdf   = inv.bucket ? PDF_BUCKET[inv.bucket] : null
    const estLabel = isOv
      ? (inv.bucket ? `Vencida ${inv.bucket}d` : 'Vencida')
      : inv.status === 'PARTIAL' ? 'Parcial' : 'Pendiente'
    const estColor = isOv ? (pdf?.color ?? '#b91c1c') : inv.status === 'PARTIAL' ? '#92400e' : '#1e40af'
    const estBg    = isOv ? (pdf?.bg ?? '#fee2e2')    : inv.status === 'PARTIAL' ? '#fef3c7' : '#dbeafe'
    const leftBorder = isOv && pdf ? `border-left:3px solid ${pdf.color};` : ''
    const bg = i % 2 === 0 ? '#fff' : '#f8fafc'
    return `
      <tr style="background:${bg};${leftBorder}">
        <td style="padding:6px 8px;font-family:monospace;color:#1d4ed8;font-size:10px;white-space:nowrap">${inv.series}-${inv.number.padStart(8, '0')}</td>
        <td style="padding:6px 8px;font-size:10px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${inv.clientName}</td>
        <td style="padding:6px 8px;font-size:9px;color:#64748b;font-family:monospace">${inv.clientRuc}</td>
        <td style="padding:6px 8px;font-size:10px;white-space:nowrap;color:${isOv ? (pdf?.color ?? '#b91c1c') : '#475569'}">${fmtD(inv.dueDate)}</td>
        <td style="padding:6px 8px;text-align:center">
          ${inv.days > 0 ? `<span style="font-size:9px;font-weight:700;color:${pdf?.color};background:${pdf?.bg};padding:2px 6px;border-radius:20px">+${inv.days}d</span>` : '<span style="color:#cbd5e1">—</span>'}
        </td>
        <td style="padding:6px 8px;text-align:right;font-size:10px;color:#64748b">${fmt(inv.total)}</td>
        <td style="padding:6px 8px;text-align:right;font-size:10px;color:${inv.paid > 0 ? '#16a34a' : '#cbd5e1'}">${inv.paid > 0 ? fmt(inv.paid) : '—'}</td>
        <td style="padding:6px 8px;text-align:right;font-size:10px;font-weight:700;color:${isOv ? (pdf?.color ?? '#b91c1c') : '#92400e'}">${fmt(inv.balance)}</td>
        <td style="padding:6px 8px;text-align:center">
          <span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:4px;background:${estBg};color:${estColor}">${estLabel}</span>
        </td>
      </tr>`
  }).join('')

  const extraCss = `
    tfoot tr { background:#dbeafe; border-top:2px solid #93c5fd; }
    tfoot td { padding:8px; font-weight:700; font-size:11px; color:#1e3a8a; }
  `
  const statsHtml = [
    { l: 'Total facturas',    v: String(items.length),         bg:'#dbeafe', nc:'#1e3a8a', bc:'#93c5fd' },
    { l: 'Saldo pendiente',   v: fmt(grand),                   bg:'#fef3c7', nc:'#92400e', bc:'#fcd34d' },
    { l: 'Saldo vencido',     v: fmt(meta.totalOverdue),       bg:'#fee2e2', nc:'#991b1b', bc:'#fca5a5' },
    { l: 'Facturas vencidas', v: String(meta.overdueCount),    bg:'#fee2e2', nc:'#991b1b', bc:'#fca5a5' },
  ].map(({ l, v, bg, nc, bc }) => `
    <div class="rpt-stat" style="background:${bg};border-color:${bc}">
      <div class="l" style="color:${nc}">${l}</div>
      <div class="n" style="color:${nc}">${v}</div>
    </div>`).join('')

  const filtersHtml = activeFilters.length
    ? `<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">${activeFilters.map(f => `<span style="font-size:9px;background:#e0e7ff;color:#3730a3;padding:2px 8px;border-radius:20px;font-weight:600">${f}</span>`).join('')}</div>`
    : ''

  return `<!DOCTYPE html>
<html lang="es">
${buildPastelHtmlHead('CxC — Cuentas por Cobrar', extraCss)}
<body>
${buildPastelHeader({
  title: 'Cuentas por Cobrar',
  subtitle: `Antigüedad de deuda · Facturas pendientes y vencidas${filtersHtml ? '' : ''}`,
  rightHtml: `<strong>${now}</strong><br>${items.length} factura${items.length !== 1 ? 's' : ''}${meta.hasFilters ? ' (filtradas)' : ''}`,
})}
${filtersHtml ? `<div style="margin-bottom:10px">${filtersHtml}</div>` : ''}

<div class="rpt-stats">${statsHtml}</div>

<table>
  <thead>
    <tr>
      <th>Factura</th><th>Cliente</th><th>RUC</th>
      <th>Vencimiento</th><th class="c">Mora</th>
      <th class="r">Total</th><th class="r">Cobrado</th><th class="r">Saldo</th><th class="c">Estado</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
  <tfoot>
    <tr>
      <td colspan="7" style="color:#1e40af;font-size:10px">
        ${items.length} factura${items.length !== 1 ? 's' : ''}${meta.hasFilters ? ' (filtradas)' : ''} · Total pendiente: ${fmt(meta.total)}
      </td>
      <td style="text-align:right;color:#92400e;font-size:13px">${fmt(grand)}</td>
      <td></td>
    </tr>
  </tfoot>
</table>

${buildPastelFooter(`Reporte generado el ${now}`, 'Documento confidencial — uso interno')}

<script>window.onload = () => { window.print(); window.onafterprint = () => window.close() }</script>
</body>
</html>`
}

export default function CxCReportPage() {
  const navigate = useNavigate()

  // ── Filters ────────────────────────────────────────────────────────────────
  const [search,       setSearch]       = useState('')
  const storeQuery = useSearchStore((s) => s.query)
  const clearStore = useSearchStore((s) => s.clear)
  useEffect(() => { if (storeQuery) { setSearch(storeQuery); clearStore() } }, [storeQuery])
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [bucketFilter, setBucketFilter] = useState<string>('ALL')
  const [dateFrom,     setDateFrom]     = useState('')
  const [dateTo,       setDateTo]       = useState('')
  const [clientFilter, setClientFilter] = useState('')
  const [sortKey,      setSortKey]      = useState<SortKey>('dueDate')
  const [sortDir,      setSortDir]      = useState<SortDir>('asc')

  // ── Pagination ─────────────────────────────────────────────────────────────
  const [page,       setPage]       = useState(1)
  const [pageSize,   setPageSize]   = useState(20)
  const [pdfLoading, setPdfLoading] = useState(false)

  useEffect(() => { setPage(1) }, [search, statusFilter, bucketFilter, clientFilter, dateFrom, dateTo, sortKey, sortDir])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const clearFilters = () => {
    setSearch(''); setStatusFilter('ALL'); setBucketFilter('ALL')
    setDateFrom(''); setDateTo(''); setClientFilter('')
  }
  const hasFilters = !!(search || statusFilter !== 'ALL' || bucketFilter !== 'ALL' || dateFrom || dateTo || clientFilter)

  // ── Data ───────────────────────────────────────────────────────────────────
  const { data: pendingData, isLoading: l1 } = useInvoicesReport({ status: 'PENDING' })
  const { data: partialData, isLoading: l2 } = useInvoicesReport({ status: 'PARTIAL' })
  const { data: overdueData, isLoading: l3 } = useInvoicesReport({ status: 'OVERDUE' })
  const isLoading = l1 || l2 || l3

  const allItems = useMemo(() => [
    ...(pendingData?.items ?? []),
    ...(partialData?.items ?? []),
    ...(overdueData?.items ?? []),
  ], [pendingData, partialData, overdueData])

  const enriched = useMemo(() =>
    allItems.map((inv) => {
      const days = inv.status === 'OVERDUE' ? Math.max(0, daysOverdue(inv.dueDate)) : 0
      return { ...inv, days, bucket: inv.status === 'OVERDUE' ? agingBucket(days) : null }
    }), [allItems])

  // ── Unique clients for dropdown ────────────────────────────────────────────
  const clientOptions = useMemo(() => {
    const map = new Map<string, string>()
    enriched.forEach((inv) => map.set(inv.clientRuc, inv.clientName))
    return Array.from(map.entries())
      .map(([ruc, name]) => ({ ruc, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
  }, [enriched])

  // ── Aging buckets summary ─────────────────────────────────────────────────
  const overdueItems = enriched.filter((i) => i.status === 'OVERDUE')
  const buckets: Record<string, { count: number; amount: number }> = {
    '0-30': { count: 0, amount: 0 }, '31-60': { count: 0, amount: 0 },
    '61-90': { count: 0, amount: 0 }, '90+':   { count: 0, amount: 0 },
  }
  overdueItems.forEach((inv) => {
    const b = inv.bucket!
    buckets[b].count++
    buckets[b].amount += inv.balance
  })
  const maxBucket    = Math.max(...Object.values(buckets).map((b) => b.amount), 1)
  const totalPending = enriched.reduce((s, i) => s + i.balance, 0)
  const totalOverdue = overdueItems.reduce((s, i) => s + i.balance, 0)

  // ── Filtered + sorted ─────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q    = search.toLowerCase()
    const from = dateFrom ? new Date(dateFrom + 'T00:00:00') : null
    const to   = dateTo   ? new Date(dateTo   + 'T23:59:59') : null
    return enriched
      .filter((inv) => {
        if (statusFilter !== 'ALL' && inv.status !== statusFilter) return false
        if (bucketFilter !== 'ALL') {
          if (bucketFilter === 'CURRENT') return inv.status !== 'OVERDUE'
          if (inv.bucket !== bucketFilter) return false
        }
        if (clientFilter && inv.clientRuc !== clientFilter) return false
        if (from || to) {
          const due = new Date(inv.dueDate)
          if (from && due < from) return false
          if (to   && due > to)   return false
        }
        if (q) {
          const num = `${inv.series}-${inv.number.padStart(8, '0')}`.toLowerCase()
          return inv.clientName.toLowerCase().includes(q) ||
                 inv.clientRuc.includes(q) ||
                 num.includes(q)
        }
        return true
      })
      .sort((a, b) => {
        let va: number | string = 0, vb: number | string = 0
        if (sortKey === 'dueDate')    { va = new Date(a.dueDate).getTime(); vb = new Date(b.dueDate).getTime() }
        if (sortKey === 'balance')    { va = a.balance;    vb = b.balance }
        if (sortKey === 'total')      { va = a.total;      vb = b.total }
        if (sortKey === 'clientName') { va = a.clientName; vb = b.clientName }
        if (sortKey === 'days')       { va = a.days;       vb = b.days }
        if (va < vb) return sortDir === 'asc' ? -1 : 1
        if (va > vb) return sortDir === 'asc' ? 1 : -1
        return 0
      })
  }, [enriched, search, statusFilter, bucketFilter, clientFilter, dateFrom, dateTo, sortKey, sortDir])

  const filteredTotal   = filtered.reduce((s, i) => s + i.balance, 0)
  const filteredOverdue = filtered.filter((i) => i.status === 'OVERDUE')

  // ── Pagination derived ─────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage   = Math.min(page, totalPages)
  const pageStart  = (safePage - 1) * pageSize
  const pageItems  = filtered.slice(pageStart, pageStart + pageSize)

  // ── PDF export ────────────────────────────────────────────────────────────
  const handleExportPDF = () => {
    if (pdfLoading || !filtered.length) return
    setPdfLoading(true)
    try {
      const html = buildPdfHtml(filtered as EnrichedItem[], {
        total: totalPending,
        totalOverdue: filteredOverdue.reduce((s, i) => s + i.balance, 0),
        overdueCount: filteredOverdue.length,
        dateFrom, dateTo, clientFilter, statusFilter, hasFilters,
      })
      const win = window.open('', '_blank')
      if (win) { win.document.write(html); win.document.close() }
    } finally {
      setPdfLoading(false)
    }
  }

  // ── Chips config ──────────────────────────────────────────────────────────
  const statusOptions = [
    { key: 'ALL',     label: 'Todos',     count: enriched.length },
    { key: 'OVERDUE', label: 'Vencidas',  count: overdueItems.length, color: 'var(--clr-danger)', bg: 'var(--clr-danger-bg)' },
    { key: 'PARTIAL', label: 'Parciales', count: enriched.filter((i) => i.status === 'PARTIAL').length, color: '#d97706', bg: 'rgba(217,119,6,0.10)' },
    { key: 'PENDING', label: 'Pendientes',count: enriched.filter((i) => i.status === 'PENDING').length, color: 'var(--clr-primary)', bg: 'var(--clr-primary-bg)' },
  ]

  const bucketOptions = [
    { key: 'ALL',     label: 'Todos los tramos' },
    { key: 'CURRENT', label: 'Al día',     color: 'var(--clr-success)' },
    { key: '0-30',    label: '0–30 días',  color: BUCKET_COLORS['0-30'] },
    { key: '31-60',   label: '31–60 días', color: BUCKET_COLORS['31-60'] },
    { key: '61-90',   label: '61–90 días', color: BUCKET_COLORS['61-90'] },
    { key: '90+',     label: '+90 días',   color: BUCKET_COLORS['90+'] },
  ]

  const dateRangeActive = !!(dateFrom || dateTo)

  const TH = ({ label, col, right }: { label: string; col?: SortKey; right?: boolean }) => (
    <th
      onClick={col ? () => handleSort(col) : undefined}
      style={{
        padding: '10px 12px', fontWeight: 600,
        color: col && sortKey === col ? 'var(--clr-text)' : 'var(--clr-text-subtle)',
        fontSize: 11, textAlign: right ? 'right' : 'left', whiteSpace: 'nowrap',
        cursor: col ? 'pointer' : 'default', userSelect: 'none',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {label}
        {col && <SortIcon col={col} sortKey={sortKey} dir={sortDir} />}
      </span>
    </th>
  )

  return (
    <AppShell active="reports" title="CxC — Cuentas por Cobrar">
      <div style={{ maxWidth: 1400, padding: '24px 28px 56px' }}>

        {/* Back */}
        <button onClick={() => navigate('/reports')}
          style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-text-subtle)', fontSize: 12, padding: 0, marginBottom: 10 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--clr-text)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--clr-text-subtle)' }}>
          <ChevronLeft size={14} /> Centro de Reportes
        </button>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--clr-text)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <TrendingUp size={20} style={{ color: '#ef4444' }} /> Cuentas por Cobrar
            </h1>
            <p style={{ fontSize: 13, color: 'var(--clr-text-subtle)', marginTop: 4 }}>Antigüedad de deuda, facturas pendientes y vencidas</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* PDF button */}
            <button
              onClick={handleExportPDF}
              disabled={pdfLoading || !filtered.length}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                cursor: pdfLoading || !filtered.length ? 'not-allowed' : 'pointer',
                background: 'var(--clr-danger-bg)', color: 'var(--clr-danger)',
                border: '1px solid rgba(239,68,68,0.25)',
                opacity: pdfLoading || !filtered.length ? 0.6 : 1,
                transition: 'all 0.15s',
              }}
            >
              <FileText size={13} />
              {pdfLoading ? 'Generando…' : 'PDF'}
            </button>
            <ExportMenu
              title="CxC — Cuentas por Cobrar — FlotaTrack"
              filename="cuentas-por-cobrar"
              csvRows={filtered.map((inv) => ({
                'Factura': `${inv.series}-${inv.number.padStart(8, '0')}`,
                'Cliente': inv.clientName, 'RUC': inv.clientRuc,
                'Vencimiento': fmtD(inv.dueDate),
                'Mora (días)': inv.days || 0,
                'Total (S/)': inv.total.toFixed(2), 'Cobrado (S/)': inv.paid.toFixed(2),
                'Saldo (S/)': inv.balance.toFixed(2),
                'Estado': inv.status === 'OVERDUE' ? 'Vencida' : inv.status === 'PARTIAL' ? 'Parcial' : 'Pendiente',
              }))}
            />
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Total facturas pendientes', value: String(enriched.length),    color: 'var(--clr-text)' },
            { label: 'Saldo total pendiente',     value: fmtK(totalPending),         color: '#d97706' },
            { label: 'Total vencido',             value: fmtK(totalOverdue),         color: 'var(--clr-danger)' },
            { label: 'Facturas vencidas',         value: String(overdueItems.length),color: 'var(--clr-danger)' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 10, color: 'var(--clr-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Aging buckets */}
        {overdueItems.length > 0 && (
          <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 10, padding: '16px 18px', marginBottom: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--clr-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 14px' }}>Antigüedad de deuda vencida</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {Object.entries(buckets).map(([bucket, bdata]) => (
                <div key={bucket}
                  onClick={() => setBucketFilter(bucketFilter === bucket ? 'ALL' : bucket)}
                  style={{
                    background: bucketFilter === bucket ? BUCKET_BG[bucket] : 'var(--clr-surface)',
                    border: `1px solid ${bucketFilter === bucket ? BUCKET_COLORS[bucket] + '60' : 'var(--clr-border)'}`,
                    borderRadius: 8, padding: '12px 14px', cursor: 'pointer', transition: 'all 0.15s',
                  }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: BUCKET_COLORS[bucket] }}>{bucket} días</span>
                    <span style={{ fontSize: 11, color: 'var(--clr-text-subtle)' }}>{bdata.count} fact.</span>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: BUCKET_COLORS[bucket], marginBottom: 8 }}>{fmtK(bdata.amount)}</div>
                  <div style={{ height: 4, background: 'var(--clr-surface-hover)', borderRadius: 2 }}>
                    <div style={{ height: '100%', borderRadius: 2, width: `${(bdata.amount / maxBucket) * 100}%`, background: BUCKET_COLORS[bucket] }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Filter bar ──────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>

          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 8, padding: '7px 12px', flex: '1 1 200px', maxWidth: 280 }}>
            <Search size={13} color="var(--clr-text-subtle)" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar cliente, RUC o factura…"
              style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--clr-text)', fontSize: 12, flex: 1 }}
            />
            {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-text-subtle)', padding: 0, display: 'flex' }}><X size={13} /></button>}
          </div>

          {/* Client dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--clr-surface)', border: `1px solid ${clientFilter ? 'var(--clr-primary)' : 'var(--clr-border)'}`, borderRadius: 8, padding: '7px 12px' }}>
            <Building2 size={13} color={clientFilter ? 'var(--clr-primary)' : 'var(--clr-text-subtle)'} />
            <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}
              style={{ background: 'transparent', border: 'none', outline: 'none', color: clientFilter ? 'var(--clr-text)' : 'var(--clr-text-subtle)', fontSize: 12, cursor: 'pointer', maxWidth: 200, appearance: 'none', paddingRight: 4 }}>
              <option value="">Todos los clientes</option>
              {clientOptions.map((c) => (
                <option key={c.ruc} value={c.ruc} style={{ background: 'var(--clr-surface)', color: 'var(--clr-text)' }}>{c.name}</option>
              ))}
            </select>
            {clientFilter && <button onClick={() => setClientFilter('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-text-subtle)', padding: 0, display: 'flex' }}><X size={13} /></button>}
          </div>

          {/* Date range */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--clr-surface)', border: `1px solid ${dateRangeActive ? 'var(--clr-primary-border)' : 'var(--clr-border)'}`, borderRadius: 8, padding: '7px 12px' }}>
            <CalendarRange size={13} color={dateRangeActive ? 'var(--clr-primary)' : 'var(--clr-text-subtle)'} />
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="Vencimiento desde"
              style={{ ...DATE_INPUT_STYLE, color: dateFrom ? 'var(--clr-text)' : 'var(--clr-text-subtle)' }} />
            <span style={{ color: 'var(--clr-text-subtle)', fontSize: 11 }}>—</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="Vencimiento hasta"
              style={{ ...DATE_INPUT_STYLE, color: dateTo ? 'var(--clr-text)' : 'var(--clr-text-subtle)' }} />
            {dateRangeActive && <button onClick={() => { setDateFrom(''); setDateTo('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-text-subtle)', padding: 0, display: 'flex' }}><X size={13} /></button>}
          </div>

          {/* Clear all */}
          {hasFilters && (
            <button onClick={clearFilters}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: 'var(--clr-danger-bg)', color: 'var(--clr-danger)', border: '1px solid rgba(239,68,68,0.25)' }}>
              <X size={11} /> Limpiar filtros
            </button>
          )}
        </div>

        {/* Status + bucket chips */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
          {statusOptions.map((opt) => {
            const active = statusFilter === opt.key
            return (
              <button key={opt.key} onClick={() => setStatusFilter(opt.key)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1px solid ${active && opt.color ? opt.color + '60' : 'var(--clr-border)'}`, background: active ? (opt.bg ?? '#2563eb1a') : 'var(--clr-surface)', color: active ? (opt.color ?? 'var(--clr-primary)') : 'var(--clr-text-subtle)', transition: 'all 0.12s' }}>
                {opt.label}
                <span style={{ fontSize: 10, padding: '0 5px', borderRadius: 10, background: active ? 'rgba(255,255,255,0.15)' : 'var(--clr-surface-hover)', color: active ? (opt.color ?? 'var(--clr-primary)') : 'var(--clr-text-subtle)' }}>
                  {opt.count}
                </span>
              </button>
            )
          })}
          <span style={{ width: 1, background: 'var(--clr-surface-hover)', margin: '0 4px' }} />
          {bucketOptions.map((opt) => {
            const active = bucketFilter === opt.key
            return (
              <button key={opt.key} onClick={() => setBucketFilter(opt.key)}
                style={{ padding: '5px 11px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1px solid ${active && opt.color ? opt.color + '50' : 'var(--clr-border)'}`, background: active && opt.color ? opt.color + '15' : (active ? '#2563eb1a' : 'var(--clr-surface)'), color: active ? (opt.color ?? 'var(--clr-primary)') : 'var(--clr-text-subtle)', transition: 'all 0.12s' }}>
                {opt.color && <span style={{ color: opt.color }}>● </span>}{opt.label}
              </button>
            )
          })}
        </div>

        {/* Results + page size */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--clr-text-subtle)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Filter size={12} />
            {hasFilters
              ? <><strong style={{ color: 'var(--clr-text-muted)' }}>{filtered.length}</strong> de {enriched.length} facturas · Saldo: <strong style={{ color: '#d97706' }}>{fmtK(filteredTotal)}</strong></>
              : <>{enriched.length} facturas · Total: <strong style={{ color: '#d97706' }}>{fmtK(totalPending)}</strong></>
            }
            {hasFilters && filteredTotal !== totalPending &&
              <span style={{ color: 'var(--clr-text-subtle)' }}>· General: {fmtK(totalPending)}</span>
            }
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--clr-text-subtle)' }}>Filas:</span>
            {[10, 20, 50].map((n) => (
              <button key={n} onClick={() => { setPageSize(n); setPage(1) }}
                style={{ ...PAGE_BTN, background: pageSize === n ? 'var(--clr-surface-hover)' : 'var(--clr-surface)', color: pageSize === n ? 'var(--clr-text)' : 'var(--clr-text-subtle)' }}>
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            {isLoading ? (
              <div style={{ padding: 24 }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="animate-pulse" style={{ height: 44, background: 'var(--clr-surface-hover)', borderRadius: 6, marginBottom: 8 }} />
                ))}
              </div>
            ) : !filtered.length ? (
              <div style={{ padding: '48px 24px', textAlign: 'center' }}>
                <AlertCircle size={32} style={{ color: 'var(--clr-text-subtle)', display: 'block', margin: '0 auto 12px' }} />
                <p style={{ fontWeight: 600, color: 'var(--clr-text-subtle)', margin: 0 }}>
                  {hasFilters ? 'Sin resultados para estos filtros' : 'Sin saldos pendientes'}
                </p>
                {hasFilters && (
                  <button onClick={clearFilters} style={{ marginTop: 10, background: 'none', border: 'none', color: 'var(--clr-primary)', cursor: 'pointer', fontSize: 12 }}>
                    Limpiar filtros
                  </button>
                )}
              </div>
            ) : (
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--clr-border)', background: 'var(--clr-sidebar)' }}>
                    <TH label="Factura" />
                    <TH label="Cliente" col="clientName" />
                    <TH label="RUC" />
                    <TH label="Vencimiento" col="dueDate" />
                    <TH label="Mora" col="days" />
                    <TH label="Total" col="total" right />
                    <TH label="Cobrado" right />
                    <TH label="Saldo" col="balance" right />
                    <TH label="Estado" right />
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((inv, i) => {
                    const isOverdue = inv.status === 'OVERDUE'
                    const bColor    = inv.bucket ? BUCKET_COLORS[inv.bucket] : undefined
                    return (
                      <tr key={inv.id} style={{
                        borderBottom: '1px solid var(--clr-border)',
                        background: i % 2 === 0 ? 'transparent' : 'var(--clr-bg)',
                        ...(isOverdue ? { borderLeft: `2px solid ${bColor ?? '#ef4444'}` } : {}),
                      }}>
                        <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--clr-doc-number)', whiteSpace: 'nowrap' }}>
                          {inv.series}-{inv.number.padStart(8, '0')}
                        </td>
                        <td title={inv.clientName} style={{ padding: '9px 12px', color: 'var(--clr-text)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {inv.clientName}
                        </td>
                        <td style={{ padding: '9px 12px', color: 'var(--clr-text-subtle)', fontFamily: 'monospace', fontSize: 11 }}>
                          {inv.clientRuc}
                        </td>
                        <td style={{ padding: '9px 12px', color: isOverdue ? (bColor ?? 'var(--clr-danger)') : 'var(--clr-text-muted)', whiteSpace: 'nowrap' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <Clock size={11} />
                            {fmtD(inv.dueDate)}
                          </span>
                        </td>
                        <td style={{ padding: '9px 12px' }}>
                          {inv.days > 0
                            ? <span style={{ fontSize: 11, fontWeight: 700, color: bColor, background: bColor ? bColor + '15' : 'transparent', padding: '2px 7px', borderRadius: 20 }}>+{inv.days}d</span>
                            : <span style={{ color: 'var(--clr-text-subtle)' }}>—</span>
                          }
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--clr-text-muted)' }}>{fmt(inv.total)}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: inv.paid > 0 ? 'var(--clr-success)' : 'var(--clr-border)' }}>
                          {inv.paid > 0 ? fmt(inv.paid) : '—'}
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: isOverdue ? (bColor ?? 'var(--clr-danger)') : '#d97706' }}>
                          {fmt(inv.balance)}
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, whiteSpace: 'nowrap',
                            background: isOverdue ? (bColor ? bColor + '20' : 'var(--clr-danger-bg)') : inv.status === 'PARTIAL' ? 'rgba(217,119,6,0.10)' : 'var(--clr-primary-bg)',
                            color: isOverdue ? (bColor ?? 'var(--clr-danger)') : inv.status === 'PARTIAL' ? '#d97706' : 'var(--clr-primary)',
                          }}>
                            {isOverdue ? (inv.bucket ? `Vencida ${inv.bucket}d` : 'Vencida') : inv.status === 'PARTIAL' ? 'Parcial' : 'Pendiente'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '1px solid var(--clr-border)', background: 'var(--clr-sidebar)' }}>
                    <td colSpan={7} style={{ padding: '10px 12px', fontSize: 11, color: 'var(--clr-text-subtle)', fontWeight: 600 }}>
                      Mostrando {pageStart + 1}–{Math.min(pageStart + pageSize, filtered.length)} de {filtered.length} {hasFilters ? '(filtradas)' : 'facturas'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#d97706', fontWeight: 700, fontSize: 13 }}>
                      {fmt(filteredTotal)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4, marginTop: 14 }}>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}
              style={{ ...PAGE_BTN, opacity: safePage === 1 ? 0.35 : 1 }}>
              <ChevronLeft size={13} />
            </button>
            {pageRange(safePage, totalPages).map((p, i) =>
              p === '…'
                ? <span key={`e${i}`} style={{ color: 'var(--clr-text-subtle)', fontSize: 12, padding: '0 4px' }}>…</span>
                : (
                  <button key={p} onClick={() => setPage(p as number)}
                    style={{ ...PAGE_BTN, background: safePage === p ? 'var(--clr-primary)' : 'var(--clr-surface)', borderColor: safePage === p ? 'var(--clr-primary)' : 'var(--clr-border)', color: safePage === p ? '#fff' : 'var(--clr-text-subtle)' }}>
                    {p}
                  </button>
                )
            )}
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
              style={{ ...PAGE_BTN, opacity: safePage === totalPages ? 0.35 : 1 }}>
              <ChevronRight size={13} />
            </button>
          </div>
        )}

      </div>
    </AppShell>
  )
}


