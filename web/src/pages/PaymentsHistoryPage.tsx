import { useState, useMemo } from 'react'
import { format, parseISO, isThisMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Banknote, ArrowLeftRight, BookOpen, CreditCard,
  ChevronLeft, ChevronRight, TrendingUp,
  Hash, Calculator, CalendarCheck, CalendarRange, X, FileText, FileSpreadsheet, Loader2,
} from 'lucide-react'
import AppShell from '../components/AppShell'
import { usePaymentsAll } from '../hooks/useFlota'
import { buildPastelHtmlHead, buildPastelHeader, buildPastelFooter, exportToExcel } from '../utils/exportUtils'

const METHOD_LABEL: Record<string, string> = {
  TRANSFER: 'Transferencia',
  DEPOSIT:  'Depósito',
  CHECK:    'Cheque',
  CASH:     'Efectivo',
}
const METHOD_ICON: Record<string, typeof CreditCard> = {
  TRANSFER: ArrowLeftRight,
  DEPOSIT:  BookOpen,
  CHECK:    BookOpen,
  CASH:     Banknote,
}
const METHOD_COLOR: Record<string, { border: string; bg: string; text: string }> = {
  TRANSFER: { border: '#3b82f6', bg: 'var(--clr-primary-bg)',  text: 'var(--clr-primary)' },
  DEPOSIT:  { border: 'var(--clr-violet-border)', bg: 'var(--clr-violet-bg)', text: 'var(--clr-violet)' },
  CHECK:    { border: '#f59e0b', bg: 'rgba(217,119,6,0.10)',   text: '#d97706' },
  CASH:     { border: '#22c55e', bg: 'var(--clr-success-bg)', text: 'var(--clr-success)' },
}

const fmt = (n: number) =>
  'S/ ' + n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtUsd = (n: number) =>
  '$ ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const PAGE_SIZE = 20

function pageRange(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const left  = Math.max(2, current - 1)
  const right = Math.min(total - 1, current + 1)
  const pages: (number | '…')[] = [1]
  if (left > 2) pages.push('…')
  for (let i = left; i <= right; i++) pages.push(i)
  if (right < total - 1) pages.push('…')
  pages.push(total)
  return pages
}

export default function PaymentsHistoryPage() {
  const [methodFilter, setMethodFilter] = useState<string>('ALL')
  const [dateFrom, setDateFrom]         = useState('')
  const [dateTo, setDateTo]             = useState('')
  const [page, setPage]                 = useState(1)
  const { data, isLoading } = usePaymentsAll()

  const hasDateFilter = !!(dateFrom || dateTo)
  function clearDates() { setDateFrom(''); setDateTo(''); setPage(1) }

  const all = data?.items ?? []

  const filtered = useMemo(() => {
    const from = dateFrom ? new Date(dateFrom + 'T00:00:00') : null
    const to   = dateTo   ? new Date(dateTo   + 'T23:59:59') : null
    return all.filter((p) => {
      if (methodFilter !== 'ALL' && p.method !== methodFilter) return false
      if (from || to) {
        const paid = parseISO(p.paidAt)
        if (from && paid < from) return false
        if (to   && paid > to)   return false
      }
      return true
    })
  }, [all, methodFilter, dateFrom, dateTo])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const pageItems  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const stats = useMemo(() => {
    let penTotal = 0, usdTotal = 0, penCount = 0, usdCount = 0, penMes = 0, usdMes = 0
    for (const p of all) {
      const isUsd = p.invoice.currency === 'USD'
      const amt = Number(p.amount)
      if (isUsd) { usdTotal += amt; usdCount++ } else { penTotal += amt; penCount++ }
      if (isThisMonth(parseISO(p.paidAt))) { if (isUsd) usdMes += amt; else penMes += amt }
    }
    return {
      penTotal, usdTotal, penCount, usdCount, penMes, usdMes,
      penAvg: penCount > 0 ? penTotal / penCount : 0,
      usdAvg: usdCount > 0 ? usdTotal / usdCount : 0,
    }
  }, [all])

  const filteredStats = useMemo(() => {
    let penFiltrado = 0, usdFiltrado = 0
    const penByMethod: Record<string, number> = {}
    const usdByMethod: Record<string, number> = {}
    for (const p of filtered) {
      const isUsd = p.invoice.currency === 'USD'
      const amt = Number(p.amount)
      if (isUsd) {
        usdFiltrado += amt
        usdByMethod[p.method] = (usdByMethod[p.method] ?? 0) + amt
      } else {
        penFiltrado += amt
        penByMethod[p.method] = (penByMethod[p.method] ?? 0) + amt
      }
    }
    return { penFiltrado, usdFiltrado, penByMethod, usdByMethod }
  }, [filtered])

  const countByMethod = useMemo(() => all.reduce<Record<string, number>>((acc, p) => {
    acc[p.method] = (acc[p.method] ?? 0) + 1; return acc
  }, {}), [all])

  const grouped = useMemo(() => {
    const map = new Map<string, typeof pageItems>()
    pageItems.forEach((p) => {
      const key = format(parseISO(p.paidAt), 'yyyy-MM-dd')
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(p)
    })
    return Array.from(map.entries())
  }, [pageItems])

  const [xlsLoading, setXlsLoading] = useState(false)
  async function exportExcel() {
    if (!filtered.length) return
    setXlsLoading(true)
    const rows = filtered.map((p) => {
      const isUsd = p.invoice.currency === 'USD'
      return {
        'Fecha':      format(parseISO(p.paidAt), 'dd/MM/yyyy'),
        'Hora':       format(parseISO(p.paidAt), 'HH:mm'),
        'Cliente':    p.invoice.client.businessName,
        'Factura':    `${p.invoice.series}-${p.invoice.number}`,
        'Moneda':     isUsd ? 'USD' : 'PEN',
        'Método':     METHOD_LABEL[p.method] ?? p.method,
        'Referencia': p.reference ?? '',
        'Monto S/':   !isUsd ? Number(p.amount).toFixed(2) : '',
        'Monto $':    isUsd  ? Number(p.amount).toFixed(2) : '',
      }
    })
    try {
      await exportToExcel(rows, 'historial-pagos', 'Historial de Pagos', 'blue')
    } finally {
      setXlsLoading(false)
    }
  }

  function exportPdf() {
    if (!filtered.length) return

    const fmtPdf    = (n: number) => 'S/ ' + n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const fmtPdfUsd = (n: number) => '$ '  + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

    const METHOD_COLOR_PDF: Record<string, { color: string; bg: string }> = {
      TRANSFER: { color: '#1d4ed8', bg: '#dbeafe' },
      DEPOSIT:  { color: '#6d28d9', bg: '#ede9fe' },
      CHECK:    { color: '#b45309', bg: '#fef3c7' },
      CASH:     { color: '#15803d', bg: '#dcfce7' },
    }

    const groups = new Map<string, typeof filtered>()
    filtered.forEach((p) => {
      const key = format(parseISO(p.paidAt), 'yyyy-MM-dd')
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(p)
    })

    const penSubtotales = filtered.reduce<Record<string, number>>((acc, p) => {
      if (p.invoice.currency !== 'USD') acc[p.method] = (acc[p.method] ?? 0) + Number(p.amount)
      return acc
    }, {})
    const usdSubtotales = filtered.reduce<Record<string, number>>((acc, p) => {
      if (p.invoice.currency === 'USD') acc[p.method] = (acc[p.method] ?? 0) + Number(p.amount)
      return acc
    }, {})

    const filterDesc = [
      methodFilter !== 'ALL' ? `Método: ${METHOD_LABEL[methodFilter]}` : '',
      dateFrom ? `Desde: ${format(parseISO(dateFrom), 'dd/MM/yyyy')}` : '',
      dateTo   ? `Hasta: ${format(parseISO(dateTo),   'dd/MM/yyyy')}` : '',
    ].filter(Boolean).join('  ·  ')

    const rowsHtml = Array.from(groups.entries()).map(([dateKey, items]) => {
      const penDayTotal = items.reduce((s, p) => p.invoice.currency !== 'USD' ? s + Number(p.amount) : s, 0)
      const usdDayTotal = items.reduce((s, p) => p.invoice.currency === 'USD' ? s + Number(p.amount) : s, 0)
      const dayTotalStr = [
        penDayTotal > 0 ? fmtPdf(penDayTotal) : '',
        usdDayTotal > 0 ? fmtPdfUsd(usdDayTotal) : '',
      ].filter(Boolean).join(' · ')
      const dateLabel = format(parseISO(dateKey), "EEEE d 'de' MMMM yyyy", { locale: es })
      const dayRows = items.map((p, idx) => {
        const mc  = METHOD_COLOR_PDF[p.method] ?? { color: '#1d4ed8', bg: '#dbeafe' }
        const bg  = idx % 2 === 0 ? '#ffffff' : '#f8fafc'
        const isUsd = p.invoice.currency === 'USD'
        const amtStr   = isUsd ? fmtPdfUsd(Number(p.amount)) : fmtPdf(Number(p.amount))
        const amtColor = isUsd ? '#1d4ed8' : '#15803d'
        return `
          <tr style="background:${bg}">
            <td style="padding:7px 10px;font-size:11px;color:#374151">${format(parseISO(p.paidAt), 'dd/MM/yyyy')}</td>
            <td style="padding:7px 10px;font-size:11px;color:#374151">${format(parseISO(p.paidAt), 'HH:mm')}</td>
            <td style="padding:7px 10px;font-size:11px;color:#111827;font-weight:600;max-width:200px">${p.invoice.client.businessName}</td>
            <td style="padding:7px 10px;font-size:11px;color:#1d4ed8;font-family:monospace">${p.invoice.series}-${p.invoice.number}</td>
            <td style="padding:7px 10px">
              <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:12px;background:${mc.bg};color:${mc.color};white-space:nowrap">${METHOD_LABEL[p.method] ?? p.method}</span>
            </td>
            <td style="padding:7px 10px;font-size:11px;color:#6b7280;font-family:monospace">${p.reference ?? '—'}</td>
            <td style="padding:7px 10px;font-size:12px;font-weight:700;color:${amtColor};text-align:right;white-space:nowrap">${amtStr}</td>
          </tr>`
      }).join('')
      return `
        <tr style="background:#f1f5f9">
          <td colspan="6" style="padding:6px 10px;font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.06em">${dateLabel}</td>
          <td style="padding:6px 10px;font-size:11px;font-weight:700;color:#374151;text-align:right;white-space:nowrap">${dayTotalStr}</td>
        </tr>
        ${dayRows}`
    }).join('')

    const subtotalRows = [
      ...Object.entries(penSubtotales).map(([m, sum]) => {
        const mc = METHOD_COLOR_PDF[m] ?? { color: '#1d4ed8', bg: '#dbeafe' }
        return `<span style="font-size:11px;font-weight:700;color:${mc.color};margin-right:16px">${METHOD_LABEL[m] ?? m}: ${fmtPdf(sum)}</span>`
      }),
      ...Object.entries(usdSubtotales).map(([m, sum]) => {
        return `<span style="font-size:11px;font-weight:700;color:#1d4ed8;margin-right:16px">${METHOD_LABEL[m] ?? m} $: ${fmtPdfUsd(sum)}</span>`
      }),
    ].join('')

    const payExtraCss = `
      .kpis { display:flex; gap:10px; margin-bottom:14px; }
      .kpi  { flex:1; border-radius:8px; padding:10px 14px; border:1px solid #93c5fd; background:#dbeafe; }
      .kpi-label { font-size:9px; font-weight:700; color:#1e3a8a; text-transform:uppercase; letter-spacing:.05em; margin-bottom:4px; }
      .kpi-pen   { font-size:14px; font-weight:800; color:#15803d; }
      .kpi-usd   { font-size:13px; font-weight:700; color:#1d4ed8; margin-top:2px; }
      .kpi-sub   { font-size:9px; color:#1e40af; margin-top:3px; }
      .footer    { margin-top:14px; display:flex; justify-content:space-between; align-items:center; padding:7px 12px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:6px; }
      .totals    { display:flex; gap:16px; }
      .total-pen { font-size:14px; font-weight:700; color:#15803d; }
      .total-usd { font-size:14px; font-weight:700; color:#1d4ed8; }
      @page { margin:14mm 12mm; size:A4 landscape; }
      @media print { body { padding:8px 12px; } }
    `
    const genTs = format(new Date(), "dd/MM/yyyy 'a las' HH:mm", { locale: es })
    const html = `<!DOCTYPE html><html lang="es">
${buildPastelHtmlHead('Historial de Pagos', payExtraCss)}
<body>
${buildPastelHeader({
  title: 'Historial de Pagos',
  subtitle: `${filtered.length} registro${filtered.length !== 1 ? 's' : ''} · ${genTs}${filterDesc ? ` · ${filterDesc}` : ''}`,
  rightHtml: `<div style="text-align:right"><div style="font-size:9px;color:#1e40af;margin-bottom:2px">TOTAL COBRADO</div><strong style="font-size:18px;color:#15803d">${fmtPdf(filteredStats.penFiltrado)}</strong><br><strong style="font-size:16px;color:#1d4ed8">${fmtPdfUsd(filteredStats.usdFiltrado)}</strong></div>`,
})}
<div class="kpis">
  <div class="kpi"><div class="kpi-label">Total Cobrado</div><div class="kpi-pen">${fmtPdf(stats.penTotal)}</div><div class="kpi-usd">${fmtPdfUsd(stats.usdTotal)}</div><div class="kpi-sub">${all.length} pagos</div></div>
  <div class="kpi"><div class="kpi-label">Este Mes</div><div class="kpi-pen">${fmtPdf(stats.penMes)}</div><div class="kpi-usd">${fmtPdfUsd(stats.usdMes)}</div><div class="kpi-sub">mes en curso</div></div>
  <div class="kpi"><div class="kpi-label">Pago Promedio</div><div class="kpi-pen">${fmtPdf(stats.penAvg)}</div><div class="kpi-usd">${fmtPdfUsd(stats.usdAvg)}</div><div class="kpi-sub">por transacción</div></div>
  <div class="kpi"><div class="kpi-label">Filtrado</div><div class="kpi-pen">${fmtPdf(filteredStats.penFiltrado)}</div><div class="kpi-usd">${fmtPdfUsd(filteredStats.usdFiltrado)}</div><div class="kpi-sub">${filtered.length} registros</div></div>
</div>
<table>
  <thead><tr>
    <th>Fecha</th><th>Hora</th><th>Cliente</th><th>Factura</th><th>Método</th><th>Referencia</th><th class="r">Monto</th>
  </tr></thead>
  <tbody>${rowsHtml}</tbody>
</table>
<div class="footer">
  <div>${subtotalRows}</div>
  <div class="totals">
    <span class="total-pen">S/: ${fmtPdf(filteredStats.penFiltrado)}</span>
    <span class="total-usd">$: ${fmtPdfUsd(filteredStats.usdFiltrado)}</span>
  </div>
</div>
${buildPastelFooter(`Historial de Pagos`, format(new Date(), 'dd/MM/yyyy HH:mm'))}
</body></html>`

    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.onload = () => { win.print(); win.onafterprint = () => win.close() }
  }

  function exportCsv() {
    const rows = [
      ['Fecha', 'Hora', 'Cliente', 'Factura', 'Moneda', 'Método', 'Referencia', 'Monto S/', 'Monto $'],
      ...filtered.map((p) => {
        const isUsd = p.invoice.currency === 'USD'
        return [
          format(parseISO(p.paidAt), 'dd/MM/yyyy'),
          format(parseISO(p.paidAt), 'HH:mm'),
          p.invoice.client.businessName,
          `${p.invoice.series}-${p.invoice.number}`,
          isUsd ? 'USD' : 'PEN',
          METHOD_LABEL[p.method] ?? p.method,
          p.reference ?? '',
          !isUsd ? Number(p.amount).toFixed(2) : '',
          isUsd  ? Number(p.amount).toFixed(2) : '',
        ]
      }),
    ]
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n')
    const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = Object.assign(document.createElement('a'), { href: url, download: 'pagos.csv' })
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <AppShell active="payments" title="Pagos">
      <div style={{ padding: '24px 28px', maxWidth: 1400 }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--clr-text)', margin: 0 }}>Historial de Pagos</h1>
            <p style={{ fontSize: 13, color: 'var(--clr-text-subtle)', marginTop: 4 }}>
              {isLoading ? '—' : `${all.length} pago${all.length !== 1 ? 's' : ''} registrado${all.length !== 1 ? 's' : ''}`}
              {!isLoading && all.length > 0 && (
                <> · <span style={{ color: 'var(--clr-success)', fontWeight: 600 }}>{fmt(stats.penTotal)}</span>
                  {' · '}<span style={{ color: '#2563eb', fontWeight: 600 }}>{fmtUsd(stats.usdTotal)}</span>
                  {' cobrado'}
                </>
              )}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => exportExcel()}
              disabled={filtered.length === 0 || xlsLoading}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: xlsLoading ? '#15803d' : '#16a34a', color: '#fff', border: 'none', cursor: xlsLoading ? 'wait' : filtered.length === 0 ? 'not-allowed' : 'pointer', opacity: filtered.length === 0 ? 0.45 : 1, transition: 'opacity 0.15s' }}
            >
              {xlsLoading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <FileSpreadsheet size={13} />}
              Exportar Excel
            </button>
            <button
              onClick={exportPdf}
              disabled={filtered.length === 0}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: '#dc2626', color: '#fff', border: 'none', cursor: filtered.length === 0 ? 'not-allowed' : 'pointer', opacity: filtered.length === 0 ? 0.45 : 1, transition: 'opacity 0.15s' }}
            >
              <FileText size={13} /> Exportar PDF
            </button>
          </div>
          <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
        </div>

        {/* ── KPI Cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
          {([
            { label: 'Total Cobrado', pen: stats.penTotal,             usd: stats.usdTotal,             sub: `${all.length} pagos`,           icon: TrendingUp,    color: 'var(--clr-success)',  bg: 'var(--clr-success-bg)'       },
            { label: 'Este Mes',      pen: stats.penMes,               usd: stats.usdMes,               sub: 'mes en curso',                   icon: CalendarCheck, color: 'var(--clr-primary)',  bg: 'var(--clr-primary-bg)'       },
            { label: 'Pago Promedio', pen: stats.penAvg,               usd: stats.usdAvg,               sub: 'por transacción',                icon: Calculator,    color: 'var(--clr-violet)',   bg: 'var(--clr-violet-bg)'        },
            { label: 'Filtrado',      pen: filteredStats.penFiltrado,  usd: filteredStats.usdFiltrado,  sub: `${filtered.length} registros`,   icon: Hash,          color: '#d97706',             bg: 'rgba(217,119,6,0.10)'        },
          ]).map((kpi) => {
            const Icon = kpi.icon
            return (
              <div key={kpi.label} style={{ background: 'var(--clr-sidebar)', border: '1px solid var(--clr-border)', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--clr-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{kpi.label}</span>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: kpi.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={14} style={{ color: kpi.color }} />
                  </div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--clr-text)', whiteSpace: 'nowrap' }}>{isLoading ? '—' : fmt(kpi.pen)}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#2563eb', whiteSpace: 'nowrap', marginTop: 2 }}>{isLoading ? '—' : fmtUsd(kpi.usd)}</div>
                <div style={{ fontSize: 11, color: 'var(--clr-text-subtle)', marginTop: 4 }}>{kpi.sub}</div>
              </div>
            )
          })}
        </div>

        {/* ── Filters Row ── */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>

        {/* Date range */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--clr-sidebar)', border: `1px solid ${hasDateFilter ? 'var(--clr-primary)' : 'var(--clr-border)'}`, borderRadius: 8, padding: '5px 10px' }}>
          <CalendarRange size={13} style={{ color: hasDateFilter ? 'var(--clr-primary)' : 'var(--clr-text-subtle)', flexShrink: 0 }} />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
            style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 12, color: dateFrom ? 'var(--clr-text)' : 'var(--clr-text-subtle)', width: 120, colorScheme: 'light dark' }}
          />
          <span style={{ fontSize: 11, color: 'var(--clr-text-subtle)' }}>—</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
            style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 12, color: dateTo ? 'var(--clr-text)' : 'var(--clr-text-subtle)', width: 120, colorScheme: 'light dark' }}
          />
          {hasDateFilter && (
            <button onClick={clearDates} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-text-subtle)', display: 'flex', padding: 0 }}>
              <X size={13} />
            </button>
          )}
        </div>

        <div style={{ width: 1, height: 24, background: 'var(--clr-surface-hover)' }} />

        {/* ── Method Filter Tabs ── */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(['ALL', 'TRANSFER', 'DEPOSIT', 'CASH', 'CHECK'] as const).map((m) => {
            const isActive = methodFilter === m
            const mc = m !== 'ALL' ? METHOD_COLOR[m] : null
            const count = m === 'ALL' ? all.length : (countByMethod[m] ?? 0)
            return (
              <button
                key={m}
                onClick={() => { setMethodFilter(m); setPage(1) }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${isActive ? (mc?.border ?? '#2563eb') : 'var(--clr-border)'}`,
                  background: isActive ? (mc?.bg ?? 'rgba(37,99,235,0.12)') : 'transparent',
                  color: isActive ? (mc?.text ?? 'var(--clr-primary)') : 'var(--clr-text-subtle)',
                  transition: 'all 0.15s',
                }}
              >
                {m === 'ALL' ? 'Todos' : METHOD_LABEL[m]}
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 10,
                  background: isActive ? 'rgba(255,255,255,0.15)' : 'var(--clr-surface-hover)',
                  color: isActive ? (mc?.text ?? 'var(--clr-primary)') : 'var(--clr-text-subtle)',
                }}>{count}</span>
              </button>
            )
          })}
        </div>

        </div>{/* end Filters Row */}

        {/* ── Tabla ── */}
        <div style={{ background: 'var(--clr-sidebar)', border: '1px solid var(--clr-border)', borderRadius: 12, overflow: 'hidden' }}>

          {/* Cabecera tabla */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '110px 1fr 120px 130px 130px 110px 110px',
            padding: '9px 18px',
            background: 'var(--clr-surface)',
            borderBottom: '1px solid var(--clr-border)',
          }}>
            {['FECHA', 'CLIENTE', 'FACTURA', 'MÉTODO', 'REFERENCIA', 'MONTO S/', 'MONTO $'].map((h, i) => (
              <div key={h} style={{ fontSize: 10, fontWeight: 600, color: 'var(--clr-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: i >= 5 ? 'right' : 'left' }}>
                {h}
              </div>
            ))}
          </div>

          {isLoading ? (
            <div style={{ padding: 24 }}>
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} style={{ height: 44, borderRadius: 6, background: 'var(--clr-surface)', marginBottom: 8 }} className="animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--clr-text-subtle)' }}>
              <Banknote size={36} style={{ margin: '0 auto 12px', opacity: 0.3, display: 'block' }} />
              <p style={{ fontWeight: 600, margin: 0, color: 'var(--clr-text-subtle)' }}>Sin pagos para este filtro</p>
            </div>
          ) : (
            grouped.map(([dateKey, items]) => (
              <div key={dateKey}>
                {/* Divisor de fecha */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 18px',
                  background: 'var(--clr-bg)',
                  borderBottom: '1px solid var(--clr-border)',
                }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--clr-text-subtle)', letterSpacing: '0.04em' }}>
                    {format(parseISO(dateKey), "EEEE d 'de' MMMM yyyy", { locale: es }).toUpperCase()}
                  </span>
                  <div style={{ flex: 1, height: 1, background: 'var(--clr-border)' }} />
                  <span style={{ fontSize: 11, color: 'var(--clr-text-subtle)', fontWeight: 600 }}>
                    {(() => {
                      const penDay = items.reduce((s, p) => p.invoice.currency !== 'USD' ? s + Number(p.amount) : s, 0)
                      const usdDay = items.reduce((s, p) => p.invoice.currency === 'USD' ? s + Number(p.amount) : s, 0)
                      return [penDay > 0 ? fmt(penDay) : '', usdDay > 0 ? fmtUsd(usdDay) : ''].filter(Boolean).join(' · ')
                    })()}
                  </span>
                </div>

                {/* Filas */}
                {items.map((payment, idx) => {
                  const mc   = METHOD_COLOR[payment.method] ?? METHOD_COLOR.TRANSFER
                  const Icon = METHOD_ICON[payment.method] ?? CreditCard
                  const isLast = idx === items.length - 1
                  const isUsd  = payment.invoice.currency === 'USD'
                  return (
                    <div
                      key={payment.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '110px 1fr 120px 130px 130px 110px 110px',
                        padding: '11px 18px',
                        alignItems: 'center',
                        borderBottom: isLast ? 'none' : '1px solid var(--clr-border)',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--clr-surface-hover)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                    >
                      {/* Fecha/hora */}
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--clr-text-muted)' }}>
                          {format(parseISO(payment.paidAt), 'dd MMM', { locale: es })}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--clr-text-subtle)' }}>
                          {format(parseISO(payment.paidAt), 'HH:mm')}
                        </div>
                      </div>

                      {/* Cliente */}
                      <div style={{ overflow: 'hidden' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--clr-text)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                          {payment.invoice.client.businessName}
                        </div>
                      </div>

                      {/* Factura */}
                      <div>
                        <span style={{ fontSize: 11, color: 'var(--clr-primary)', fontFamily: 'monospace', background: 'var(--clr-primary-bg)', padding: '2px 6px', borderRadius: 4 }}>
                          {payment.invoice.series}-{payment.invoice.number}
                        </span>
                      </div>

                      {/* Método */}
                      <div>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                          background: mc.bg, color: mc.text, border: `1px solid ${mc.border}44`,
                          whiteSpace: 'nowrap',
                        }}>
                          <Icon size={10} /> {METHOD_LABEL[payment.method]}
                        </span>
                      </div>

                      {/* Referencia */}
                      <div style={{ fontSize: 11, color: 'var(--clr-text-subtle)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {payment.reference ?? '—'}
                      </div>

                      {/* Monto S/ */}
                      <div style={{ textAlign: 'right', fontSize: 14, fontWeight: 700, color: !isUsd ? 'var(--clr-success)' : 'var(--clr-text-subtle)', whiteSpace: 'nowrap' }}>
                        {!isUsd ? fmt(Number(payment.amount)) : '—'}
                      </div>

                      {/* Monto $ */}
                      <div style={{ textAlign: 'right', fontSize: 14, fontWeight: 700, color: isUsd ? '#2563eb' : 'var(--clr-text-subtle)', whiteSpace: 'nowrap' }}>
                        {isUsd ? fmtUsd(Number(payment.amount)) : '—'}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))
          )}

          {/* ── Footer tabla: subtotales por método ── */}
          {!isLoading && filtered.length > 0 && (
            <div style={{
              display: 'flex', gap: 16, padding: '12px 18px',
              borderTop: '1px solid var(--clr-border)', background: 'var(--clr-surface)',
              flexWrap: 'wrap', alignItems: 'center',
            }}>
              <span style={{ fontSize: 11, color: 'var(--clr-text-subtle)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Subtotales:</span>
              {Object.entries(filteredStats.penByMethod).map(([m, sum]) => {
                const mc = METHOD_COLOR[m] ?? METHOD_COLOR.TRANSFER
                return (
                  <span key={`pen-${m}`} style={{ fontSize: 11, color: mc.text, fontWeight: 700 }}>
                    {METHOD_LABEL[m]}: {fmt(sum)}
                  </span>
                )
              })}
              {Object.entries(filteredStats.usdByMethod).map(([m, sum]) => (
                <span key={`usd-${m}`} style={{ fontSize: 11, color: '#2563eb', fontWeight: 700 }}>
                  {METHOD_LABEL[m]} $: {fmtUsd(sum)}
                </span>
              ))}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 14, alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--clr-success)', whiteSpace: 'nowrap' }}>
                  S/: {fmt(filteredStats.penFiltrado)}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#2563eb', whiteSpace: 'nowrap' }}>
                  $: {fmtUsd(filteredStats.usdFiltrado)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ── Paginación ── */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
            <span style={{ fontSize: 12, color: 'var(--clr-text-subtle)' }}>
              {filtered.length} registro{filtered.length !== 1 ? 's' : ''} · página {safePage} de {totalPages}
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                style={{ width: 30, height: 30, borderRadius: 6, background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', color: 'var(--clr-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: safePage === 1 ? 0.4 : 1 }}
              >
                <ChevronLeft size={14} />
              </button>
              {pageRange(safePage, totalPages).map((p, i) =>
                p === '…' ? (
                  <span key={`ellipsis-${i}`} style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--clr-text-subtle)' }}>…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p as number)}
                    style={{
                      width: 30, height: 30, borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      border: `1px solid ${p === safePage ? 'var(--clr-primary)' : 'var(--clr-border)'}`,
                      background: p === safePage ? 'rgba(37,99,235,0.2)' : 'var(--clr-surface)',
                      color: p === safePage ? 'var(--clr-primary-lt)' : 'var(--clr-text-subtle)',
                    }}
                  >
                    {p}
                  </button>
                )
              )}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                style={{ width: 30, height: 30, borderRadius: 6, background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', color: 'var(--clr-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: safePage === totalPages ? 0.4 : 1 }}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}

      </div>
    </AppShell>
  )
}
