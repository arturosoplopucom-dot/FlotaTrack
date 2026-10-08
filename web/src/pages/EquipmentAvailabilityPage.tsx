import { useState, useRef } from 'react'
import { format, parseISO, eachDayOfInterval, differenceInDays, isToday, startOfMonth, endOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { Truck, ChevronLeft, ChevronRight, Download, RefreshCw, Calendar, CheckCircle2, Wrench, AlertCircle, FileText } from 'lucide-react'
import AppShell from '../components/AppShell'
import { useEquipmentAvailability, useCompany, type EquipmentAvailability, type AvailabilityBlock } from '../hooks/useFlota'
import { exportToExcel } from '../utils/exportUtils'

const DAY_W = 36
const ROW_H = 52
const EQ_COL_W = 240

// ─── Traducciones ────────────────────────────────────────────────────────────
const TYPE_ES: Record<string, string> = {
  CRANE: 'Grúa', PLATFORM: 'Plataforma', FORKLIFT: 'Montacargas',
  EXCAVATOR: 'Excavadora', OTHER: 'Otro',
}
const WO_STATUS_ES: Record<string, string> = {
  DRAFT: 'Borrador', ACTIVE: 'Activo', COMPLETED: 'Completado',
  BILLED: 'Facturado', SENT: 'Enviado', ACCEPTED: 'Aceptado',
  PAID: 'Pagado', CANCELLED: 'Cancelado',
}
const MAINT_STATUS_ES: Record<string, string> = {
  IN_PROGRESS: 'En progreso', COMPLETED: 'Completado', CANCELLED: 'Cancelado',
}

// ─── Estado efectivo hoy ─────────────────────────────────────────────────────
type EffectiveStatus = 'DISPONIBLE' | 'EN_OBRA' | 'EN_TALLER' | 'RETIRADO'

function getEffectiveStatus(eq: EquipmentAvailability, today: string): EffectiveStatus {
  if (eq.status === 'RETIRED') return 'RETIRADO'
  const hasActiveOT = eq.blocks.some(
    (b) => b.type === 'OT' && b.dateFrom <= today && b.dateTo >= today &&
      !['COMPLETED', 'BILLED', 'SENT', 'ACCEPTED', 'PAID', 'CANCELLED'].includes(b.status)
  )
  if (hasActiveOT) return 'EN_OBRA'
  const hasActiveMaint = eq.blocks.some(
    (b) => b.type === 'MAINTENANCE' && b.dateFrom <= today && b.dateTo >= today && b.status === 'IN_PROGRESS'
  )
  if (hasActiveMaint) return 'EN_TALLER'
  return 'DISPONIBLE'
}

const EFFECTIVE_CONFIG: Record<EffectiveStatus, { label: string; bg: string; color: string; icon: React.ReactNode; sortOrder: number }> = {
  DISPONIBLE: { label: 'Disponible', bg: '#dcfce7', color: '#16a34a', icon: <CheckCircle2 size={12} />, sortOrder: 0 },
  EN_OBRA:    { label: 'En Obra',    bg: '#dbeafe', color: '#2563eb', icon: <Truck size={12} />,        sortOrder: 1 },
  EN_TALLER:  { label: 'En Taller',  bg: '#fef9c3', color: '#b45309', icon: <Wrench size={12} />,       sortOrder: 2 },
  RETIRADO:   { label: 'Retirado',   bg: '#f1f5f9', color: '#64748b', icon: <AlertCircle size={12} />,  sortOrder: 3 },
}

// ─── Utilidades Gantt ────────────────────────────────────────────────────────
function blockLeft(block: AvailabilityBlock, rangeStart: Date, totalDays: number): number {
  return Math.max(0, differenceInDays(parseISO(block.dateFrom), rangeStart)) * DAY_W
}

function blockWidth(block: AvailabilityBlock, rangeStart: Date, totalDays: number): number {
  const start = Math.max(0, differenceInDays(parseISO(block.dateFrom), rangeStart))
  const end = Math.min(totalDays, differenceInDays(parseISO(block.dateTo), rangeStart) + 1)
  return Math.max(1, end - start) * DAY_W - 3
}

function blockBg(block: AvailabilityBlock): { bg: string; border: string } {
  if (block.type === 'MAINTENANCE') {
    return block.status === 'IN_PROGRESS'
      ? { bg: '#f59e0b', border: '#d97706' }
      : { bg: '#fcd34d', border: '#fbbf24' }
  }
  const active = !['COMPLETED', 'BILLED', 'SENT', 'ACCEPTED', 'PAID', 'CANCELLED'].includes(block.status)
  return active
    ? { bg: '#3b82f6', border: '#2563eb' }
    : { bg: '#93c5fd', border: '#60a5fa' }
}

function blockLabel(block: AvailabilityBlock): string {
  const prefix = block.type === 'OT' ? block.label : `Mant: ${block.label}`
  return block.clientName ? `${prefix} — ${block.clientName}` : prefix
}

function todayStr() {
  return format(new Date(), 'yyyy-MM-dd')
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────
type TooltipState = { block: AvailabilityBlock; eqName: string; x: number; y: number } | null

export default function EquipmentAvailabilityPage() {
  const today = todayStr()
  const [dateFrom, setDateFrom] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [dateTo, setDateTo]     = useState(() => format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  const [tooltip, setTooltip]   = useState<TooltipState>(null)
  const [filterStatus, setFilterStatus] = useState<EffectiveStatus | 'TODOS'>('TODOS')
  const [filterType, setFilterType]     = useState<string>('TODOS')
  const scrollRef = useRef<HTMLDivElement>(null)

  const { data: rawEquipment = [], isLoading, refetch } = useEquipmentAvailability(dateFrom, dateTo)
  const { data: company } = useCompany()

  // Enrich with effective status and sort
  const enriched = rawEquipment
    .map((eq) => ({ ...eq, effectiveStatus: getEffectiveStatus(eq, today) }))
    .sort((a, b) => EFFECTIVE_CONFIG[a.effectiveStatus].sortOrder - EFFECTIVE_CONFIG[b.effectiveStatus].sortOrder)

  const rangeStart = parseISO(dateFrom)
  const rangeEnd   = parseISO(dateTo)
  const days       = eachDayOfInterval({ start: rangeStart, end: rangeEnd })
  const totalDays  = days.length
  const todayOff   = differenceInDays(new Date(), rangeStart)
  const showToday  = todayOff >= 0 && todayOff < totalDays

  function shiftRange(delta: number) {
    const from = parseISO(dateFrom)
    from.setDate(from.getDate() + delta * totalDays)
    const to = new Date(from)
    to.setDate(to.getDate() + totalDays - 1)
    setDateFrom(format(from, 'yyyy-MM-dd'))
    setDateTo(format(to, 'yyyy-MM-dd'))
  }

  // Filtrado
  const filtered = enriched.filter((eq) => {
    if (filterStatus !== 'TODOS' && eq.effectiveStatus !== filterStatus) return false
    if (filterType  !== 'TODOS' && eq.type !== filterType) return false
    return true
  })

  // Stats hoy
  const countBy = (s: EffectiveStatus) => enriched.filter((e) => e.effectiveStatus === s).length
  const stats = [
    { status: 'DISPONIBLE' as EffectiveStatus, count: countBy('DISPONIBLE') },
    { status: 'EN_OBRA'    as EffectiveStatus, count: countBy('EN_OBRA') },
    { status: 'EN_TALLER'  as EffectiveStatus, count: countBy('EN_TALLER') },
    { status: 'RETIRADO'   as EffectiveStatus, count: countBy('RETIRADO') },
  ]

  // Agrupación de meses para cabecera
  const monthGroups: { label: string; count: number }[] = []
  for (const day of days) {
    const lbl = format(day, 'MMMM yyyy', { locale: es })
    const last = monthGroups[monthGroups.length - 1]
    if (last && last.label === lbl) last.count++
    else monthGroups.push({ label: lbl, count: 1 })
  }

  const types = Array.from(new Set(rawEquipment.map((e) => e.type)))

  // Situación simple para tooltip y CSV
  function blockSituacion(b: AvailabilityBlock): string {
    if (b.type === 'OT') return 'Ocupado'
    return b.status === 'IN_PROGRESS' ? 'En Taller' : 'Mantenimiento completado'
  }

  // Bloque activo HOY (para fecha inicio/fin en CSV)
  function activeBlockToday(eq: { blocks: AvailabilityBlock[] }) {
    return eq.blocks.find(
      (b) => b.dateFrom <= today && b.dateTo >= today &&
        (b.type === 'OT'
          ? !['COMPLETED', 'BILLED', 'SENT', 'ACCEPTED', 'PAID', 'CANCELLED'].includes(b.status)
          : b.status === 'IN_PROGRESS')
    ) ?? null
  }

  async function exportExcel() {
    const rows = enriched.map((eq) => {
      const block = activeBlockToday(eq)
      return {
        'Equipo':                  eq.name,
        'Marca':                   eq.brand    ?? '',
        'Modelo':                  eq.model    ?? '',
        'N° Serie':                eq.serialNumber ?? '',
        'Tipo':                    TYPE_ES[eq.type] ?? eq.type,
        'Capacidad':               eq.capacity ?? '',
        'Horómetro (h)':           eq.currentHours != null ? eq.currentHours : '',
        'Odómetro (km)':           eq.odometerKm   != null ? eq.odometerKm   : '',
        'Cliente':                 block?.clientName ?? '',
        'Fecha inicio ocupación':  block?.dateFrom   ?? '',
        'Fecha fin ocupación':     block?.dateTo     ?? '',
        'Estado':                  EFFECTIVE_CONFIG[eq.effectiveStatus].label,
      }
    })
    await exportToExcel(rows, `disponibilidad_equipos_${dateFrom}_${dateTo}`, 'Disponibilidad de Equipos', 'blue')
  }

  function buildAvailabilityPdfHtml(): string {
    const generatedAt = format(new Date(), "dd/MM/yyyy HH:mm")
    const rangeLabel  = `${format(rangeStart, "d 'de' MMMM", { locale: es })} — ${format(rangeEnd, "d 'de' MMMM yyyy", { locale: es })}`

    const statusColors: Record<EffectiveStatus, { bg: string; color: string }> = {
      DISPONIBLE: { bg: '#dcfce7', color: '#16a34a' },
      EN_OBRA:    { bg: '#dbeafe', color: '#2563eb' },
      EN_TALLER:  { bg: '#fef9c3', color: '#b45309' },
      RETIRADO:   { bg: '#f1f5f9', color: '#64748b' },
    }

    const badge = (s: EffectiveStatus) => {
      const { bg, color } = statusColors[s]
      return `<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:10px;font-weight:700;background:${bg};color:${color}">${EFFECTIVE_CONFIG[s].label}</span>`
    }

    const rows = enriched.map((eq) => {
      const block = activeBlockToday(eq)
      const even  = enriched.indexOf(eq) % 2 === 0
      return `<tr style="background:${even ? '#fff' : '#f8fafc'}">
        <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;font-weight:600">${eq.name}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9">${eq.brand ?? ''}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9">${eq.model ?? ''}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9">${TYPE_ES[eq.type] ?? eq.type}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;text-align:center">${eq.capacity ?? ''}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9">${block?.clientName ?? ''}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;text-align:center">${block?.dateFrom ?? ''}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;text-align:center">${block?.dateTo ?? ''}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;text-align:center">${badge(eq.effectiveStatus)}</td>
      </tr>`
    }).join('')

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Disponibilidad de Equipos — ${company?.name ?? ''}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:Arial,sans-serif; font-size:11px; color:#1e293b; background:#fff; padding:20px; }

    /* ── ENCABEZADO PASTEL ── */
    .header {
      background: linear-gradient(135deg, #bfdbfe 0%, #dbeafe 60%, #eff6ff 100%);
      border: 1.5px solid #93c5fd;
      border-radius: 10px;
      padding: 18px 22px;
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: relative;
      overflow: hidden;
    }
    .header::before {
      content: '';
      position: absolute;
      left: 0; top: 0; bottom: 0;
      width: 5px;
      background: #3b82f6;
      border-radius: 10px 0 0 10px;
    }
    .header-brand { font-size: 10px; font-weight: 700; color: #3b82f6; letter-spacing:.08em; text-transform:uppercase; margin-bottom:4px; }
    .header h1  { font-size:20px; font-weight:800; color:#1e3a8a; margin-bottom:3px; }
    .header p   { font-size:11px; color:#1e40af; }
    .header-right { text-align:right; font-size:11px; color:#1e40af; }
    .header-right .total { font-size:22px; font-weight:800; color:#1e3a8a; line-height:1; }
    .header-right .total-label { font-size:9px; color:#3b82f6; font-weight:700; text-transform:uppercase; letter-spacing:.06em; }

    /* ── ESTADÍSTICAS ── */
    .stats { display:flex; gap:10px; margin-bottom:16px; }
    .stat { flex:1; border-radius:8px; padding:12px 16px; border: 1px solid transparent; }
    .stat .n { font-size:28px; font-weight:800; line-height:1; }
    .stat .l { font-size:10px; font-weight:700; margin-top:3px; text-transform:uppercase; letter-spacing:.05em; }

    /* ── TABLA ── */
    table { width:100%; border-collapse:collapse; font-size:10px; }
    th {
      background: #bfdbfe;
      color: #1e3a8a;
      padding: 8px 10px;
      text-align: left;
      font-weight: 700;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: .05em;
      border-bottom: 2px solid #93c5fd;
      white-space: nowrap;
    }
    td { padding:7px 10px; border-bottom:1px solid #f1f5f9; vertical-align:middle; }
    tr:nth-child(even) td { background:#eff6ff; }

    /* ── FOOTER ── */
    .footer {
      margin-top: 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 6px;
      font-size: 9px;
      color: #1e40af;
    }
    .footer-brand { font-weight: 700; color: #1e3a8a; }

    @page { size:A4 landscape; margin:10mm; }
    @media print { body { padding:0; } .header { border-radius:0; } .header::before { border-radius:0; } }
  </style>
</head>
<body>
  <div class="header">
    <div style="padding-left:10px">
      <div class="header-brand">FlotaTrack &bull; Reporte Comercial</div>
      <h1>Disponibilidad de Equipos</h1>
      <p>${company?.name ?? ''}&nbsp;&nbsp;|&nbsp;&nbsp;RUC ${company?.ruc ?? ''}&nbsp;&nbsp;|&nbsp;&nbsp;${rangeLabel}</p>
    </div>
    <div class="header-right">
      <div class="total">${enriched.length}</div>
      <div class="total-label">equipos</div>
      <div style="margin-top:6px">Generado: ${generatedAt}</div>
    </div>
  </div>

  <div class="stats">
    <div class="stat" style="background:#dcfce7;border-color:#86efac;color:#166534"><div class="n">${countBy('DISPONIBLE')}</div><div class="l">Disponible</div></div>
    <div class="stat" style="background:#dbeafe;border-color:#93c5fd;color:#1e3a8a"><div class="n">${countBy('EN_OBRA')}</div><div class="l">En Obra</div></div>
    <div class="stat" style="background:#fef9c3;border-color:#fde047;color:#78350f"><div class="n">${countBy('EN_TALLER')}</div><div class="l">En Taller</div></div>
    <div class="stat" style="background:#f1f5f9;border-color:#cbd5e1;color:#334155"><div class="n">${countBy('RETIRADO')}</div><div class="l">Retirado</div></div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Equipo</th><th>Marca</th><th>Modelo</th><th>Tipo</th><th>Capacidad</th>
        <th>Cliente</th><th>Inicio ocupación</th><th>Fin ocupación</th><th>Estado</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="footer">
    <span><span class="footer-brand">FlotaTrack</span> &bull; Sistema de Gestión de Maquinaria Pesada</span>
    <span>Datos al momento de generación &bull; ${generatedAt}</span>
  </div>

  <script>window.onload = () => { window.focus(); window.print(); }</script>
</body>
</html>`
  }

  function exportPDF() {
    const html = buildAvailabilityPdfHtml()
    const win = window.open('', '_blank')
    if (!win) { alert('Por favor permite las ventanas emergentes para generar el PDF'); return }
    win.document.write(html)
    win.document.close()
  }

  return (
    <AppShell active="reports" title="Disponibilidad de Equipos">
      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: 'fixed', left: tooltip.x + 14, top: tooltip.y - 10, zIndex: 9999,
          background: 'var(--clr-surface)', border: '1px solid var(--clr-border)',
          borderRadius: 8, padding: '10px 14px', minWidth: 220,
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)', pointerEvents: 'none',
        }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--clr-text)', marginBottom: 4 }}>
            {tooltip.eqName}
          </div>
          <div style={{ fontSize: 12, color: 'var(--clr-text-muted)', marginBottom: 3 }}>
            {tooltip.block.type === 'OT'
              ? `OT: ${tooltip.block.label}`
              : `Mantenimiento: ${tooltip.block.label}`}
          </div>
          {tooltip.block.clientName && (
            <div style={{ fontSize: 12, color: 'var(--clr-text-muted)', marginBottom: 3 }}>
              Cliente: {tooltip.block.clientName}
            </div>
          )}
          <div style={{ fontSize: 12, color: 'var(--clr-text-muted)', marginBottom: 3 }}>
            {format(parseISO(tooltip.block.dateFrom), 'dd/MM/yyyy')} → {format(parseISO(tooltip.block.dateTo), 'dd/MM/yyyy')}
          </div>
          <div style={{ fontSize: 11, color: 'var(--clr-text-subtle)', marginTop: 4, paddingTop: 4, borderTop: '1px solid var(--clr-border)' }}>
            Situación: {blockSituacion(tooltip.block)}
          </div>
        </div>
      )}

      <div style={{ padding: '24px 28px', maxWidth: 1400 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--clr-text)', margin: 0 }}>
              Disponibilidad de Equipos
            </h1>
            <p style={{ fontSize: 13, color: 'var(--clr-text-muted)', margin: '4px 0 0' }}>
              Agenda de ocupación para el área comercial — {format(new Date(), "EEEE d 'de' MMMM yyyy", { locale: es })}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              style={{ padding: '7px 10px', border: '1px solid var(--clr-border)', borderRadius: 6, fontSize: 13, background: 'var(--clr-surface)', color: 'var(--clr-text)' }} />
            <span style={{ fontSize: 13, color: 'var(--clr-text-muted)' }}>—</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              style={{ padding: '7px 10px', border: '1px solid var(--clr-border)', borderRadius: 6, fontSize: 13, background: 'var(--clr-surface)', color: 'var(--clr-text)' }} />
            <button onClick={() => { setDateFrom(format(startOfMonth(new Date()), 'yyyy-MM-dd')); setDateTo(format(endOfMonth(new Date()), 'yyyy-MM-dd')) }}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', border: '1px solid var(--clr-border)', borderRadius: 6, background: 'var(--clr-surface)', color: 'var(--clr-text)', cursor: 'pointer', fontSize: 13 }}>
              <Calendar size={13} /> Mes actual
            </button>
            <button onClick={() => refetch()}
              style={{ display: 'flex', alignItems: 'center', padding: '7px 10px', border: '1px solid var(--clr-border)', borderRadius: 6, background: 'var(--clr-surface)', cursor: 'pointer', color: 'var(--clr-text)' }}>
              <RefreshCw size={14} />
            </button>
            <button onClick={exportExcel}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', border: 'none', borderRadius: 6, background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              <Download size={14} /> Exportar Excel
            </button>
            <button onClick={exportPDF}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', border: 'none', borderRadius: 6, background: '#dc2626', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              <FileText size={14} /> Exportar PDF
            </button>
          </div>
        </div>

        {/* Tarjetas de estado — clickeables para filtrar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          {stats.map((s) => {
            const cfg = EFFECTIVE_CONFIG[s.status]
            const active = filterStatus === s.status
            return (
              <div key={s.status}
                onClick={() => setFilterStatus(active ? 'TODOS' : s.status)}
                style={{
                  background: active ? cfg.bg : 'var(--clr-surface)',
                  border: `2px solid ${active ? cfg.color : 'var(--clr-border)'}`,
                  borderRadius: 12, padding: '16px 18px', cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 30, fontWeight: 800, color: cfg.color }}>{s.count}</div>
                  <div style={{ padding: 8, borderRadius: 8, background: cfg.bg, color: cfg.color }}>{cfg.icon}</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--clr-text)', marginTop: 4 }}>{cfg.label}</div>
                <div style={{ fontSize: 11, color: 'var(--clr-text-subtle)', marginTop: 1 }}>
                  {s.status === 'DISPONIBLE' && 'Libre para asignar'}
                  {s.status === 'EN_OBRA'    && 'Con OT activa hoy'}
                  {s.status === 'EN_TALLER'  && 'En mantenimiento hoy'}
                  {s.status === 'RETIRADO'   && 'Fuera de operación'}
                </div>
              </div>
            )
          })}
        </div>

        {/* Filtros por tipo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--clr-text-muted)', fontWeight: 600, marginRight: 4 }}>Tipo:</span>
            {['TODOS', ...types].map((t) => (
              <button key={t}
                onClick={() => setFilterType(t)}
                style={{ padding: '4px 12px', borderRadius: 20, border: `1px solid ${filterType === t ? '#3b82f6' : 'var(--clr-border)'}`, background: filterType === t ? '#3b82f610' : 'var(--clr-surface)', color: filterType === t ? '#3b82f6' : 'var(--clr-text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                {t === 'TODOS' ? 'Todos' : (TYPE_ES[t] ?? t)}
              </button>
            ))}
            {(filterStatus !== 'TODOS' || filterType !== 'TODOS') && (
              <button onClick={() => { setFilterStatus('TODOS'); setFilterType('TODOS') }}
                style={{ padding: '4px 10px', borderRadius: 20, border: '1px solid var(--clr-border)', background: 'var(--clr-surface)', color: 'var(--clr-text-muted)', cursor: 'pointer', fontSize: 11 }}>
                ✕ Limpiar filtros
              </button>
            )}
          </div>
          {/* Leyenda */}
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            {[
              { color: '#3b82f6', label: 'OT activa' },
              { color: '#93c5fd', label: 'OT finalizada' },
              { color: '#f59e0b', label: 'En taller' },
              { color: '#fcd34d', label: 'Mant. completado' },
            ].map((l) => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 12, height: 8, borderRadius: 2, background: l.color }} />
                <span style={{ fontSize: 11, color: 'var(--clr-text-muted)' }}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Navegación de rango */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <button onClick={() => shiftRange(-1)}
            style={{ display: 'flex', alignItems: 'center', padding: '5px 8px', border: '1px solid var(--clr-border)', borderRadius: 6, background: 'var(--clr-surface)', cursor: 'pointer', color: 'var(--clr-text)' }}>
            <ChevronLeft size={15} />
          </button>
          <span style={{ fontSize: 13, color: 'var(--clr-text-muted)', minWidth: 240, textAlign: 'center' }}>
            {format(rangeStart, "d 'de' MMMM", { locale: es })} — {format(rangeEnd, "d 'de' MMMM yyyy", { locale: es })} ({totalDays} días)
          </span>
          <button onClick={() => shiftRange(1)}
            style={{ display: 'flex', alignItems: 'center', padding: '5px 8px', border: '1px solid var(--clr-border)', borderRadius: 6, background: 'var(--clr-surface)', cursor: 'pointer', color: 'var(--clr-text)' }}>
            <ChevronRight size={15} />
          </button>
        </div>

        {/* Gantt */}
        <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 12, overflow: 'hidden' }}>
          {isLoading ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--clr-text-muted)' }}>
              <RefreshCw size={22} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
              <div style={{ fontSize: 14 }}>Cargando disponibilidad...</div>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--clr-text-muted)' }}>
              <Truck size={36} style={{ opacity: 0.25, marginBottom: 10 }} />
              <div style={{ fontSize: 14 }}>No hay equipos para los filtros seleccionados</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }} ref={scrollRef}>
              <div style={{ minWidth: EQ_COL_W + totalDays * DAY_W }}>

                {/* Cabecera: meses */}
                <div style={{ display: 'flex', background: 'var(--clr-bg)', borderBottom: '1px solid var(--clr-border)' }}>
                  <div style={{ width: EQ_COL_W, flexShrink: 0, borderRight: '1px solid var(--clr-border)' }} />
                  {monthGroups.map((mg, i) => (
                    <div key={i} style={{
                      width: mg.count * DAY_W, flexShrink: 0, padding: '5px 0', textAlign: 'center',
                      fontSize: 11, fontWeight: 700, color: 'var(--clr-text-muted)', textTransform: 'capitalize',
                      borderRight: i < monthGroups.length - 1 ? '1px solid var(--clr-border)' : 'none',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {mg.label}
                    </div>
                  ))}
                </div>

                {/* Cabecera: días */}
                <div style={{ display: 'flex', background: 'var(--clr-bg)', borderBottom: '2px solid var(--clr-border)' }}>
                  <div style={{ width: EQ_COL_W, flexShrink: 0, borderRight: '1px solid var(--clr-border)', padding: '5px 14px', fontSize: 11, color: 'var(--clr-text-muted)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Truck size={11} /> Equipo / Estado hoy
                  </div>
                  {days.map((day, i) => {
                    const isTod = isToday(day)
                    const isWk  = [0, 6].includes(day.getDay())
                    return (
                      <div key={i} style={{
                        width: DAY_W, flexShrink: 0, padding: '4px 0', textAlign: 'center',
                        fontSize: 10, fontWeight: isTod ? 800 : 500,
                        color: isTod ? '#3b82f6' : isWk ? 'var(--clr-text-subtle)' : 'var(--clr-text-muted)',
                        background: isTod ? '#eff6ff' : isWk ? 'rgba(0,0,0,0.02)' : 'transparent',
                        borderRight: '1px solid var(--clr-border)',
                        borderBottom: isTod ? '2px solid #3b82f6' : 'none',
                        boxSizing: 'border-box',
                      }}>
                        <div style={{ lineHeight: 1.3 }}>{format(day, 'd')}</div>
                        <div style={{ fontSize: 9, opacity: 0.65, lineHeight: 1.2 }}>{format(day, 'EEE', { locale: es })}</div>
                      </div>
                    )
                  })}
                </div>

                {/* Filas de equipos */}
                {filtered.map((eq, idx) => {
                  const cfg  = EFFECTIVE_CONFIG[eq.effectiveStatus]
                  const isDark = false // TODO: detect theme if needed
                  return (
                    <div key={eq.id} style={{
                      display: 'flex',
                      borderBottom: '1px solid var(--clr-border)',
                      background: idx % 2 === 0 ? 'var(--clr-surface)' : 'var(--clr-bg)',
                      minHeight: ROW_H,
                    }}>
                      {/* Columna equipo */}
                      <div style={{ width: EQ_COL_W, flexShrink: 0, borderRight: '1px solid var(--clr-border)', padding: '8px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--clr-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
                          {eq.name}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 10, color: 'var(--clr-text-subtle)' }}>
                            {TYPE_ES[eq.type] ?? eq.type}
                          </span>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 3,
                            fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
                            background: cfg.bg, color: cfg.color, lineHeight: 1.4,
                          }}>
                            {cfg.icon} {cfg.label}
                          </span>
                        </div>
                      </div>

                      {/* Área Gantt */}
                      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                        {/* Fondo días */}
                        {days.map((day, i) => {
                          const isTod = isToday(day)
                          const isWk  = [0, 6].includes(day.getDay())
                          return (
                            <div key={i} style={{
                              position: 'absolute', left: i * DAY_W, top: 0, bottom: 0, width: DAY_W,
                              background: isTod ? '#eff6ff40' : isWk ? 'rgba(0,0,0,0.012)' : 'transparent',
                              borderRight: '1px solid var(--clr-border)',
                            }} />
                          )
                        })}

                        {/* Línea "hoy" */}
                        {showToday && (
                          <div style={{
                            position: 'absolute', left: todayOff * DAY_W + DAY_W / 2 - 1,
                            top: 0, bottom: 0, width: 2, background: '#3b82f640', zIndex: 1, pointerEvents: 'none',
                          }} />
                        )}

                        {/* Bloques de ocupación */}
                        {eq.blocks.map((block) => {
                          const left  = blockLeft(block, rangeStart, totalDays)
                          const width = blockWidth(block, rangeStart, totalDays)
                          if (width <= 0) return null
                          const { bg, border } = blockBg(block)
                          return (
                            <div key={block.id}
                              onMouseEnter={(e) => setTooltip({ block, eqName: eq.name, x: e.clientX, y: e.clientY })}
                              onMouseMove={(e) => setTooltip((t) => t ? { ...t, x: e.clientX, y: e.clientY } : null)}
                              onMouseLeave={() => setTooltip(null)}
                              style={{
                                position: 'absolute', left, width,
                                top: 8, height: ROW_H - 16,
                                background: bg, borderLeft: `3px solid ${border}`,
                                borderRadius: 4, overflow: 'hidden', cursor: 'default', zIndex: 2,
                                display: 'flex', alignItems: 'center', paddingLeft: 6,
                              }}
                            >
                              <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {blockLabel(block)}
                              </span>
                            </div>
                          )
                        })}

                        {/* Banda verde "Disponible todo el período" */}
                        {eq.blocks.length === 0 && eq.effectiveStatus !== 'RETIRADO' && (
                          <div style={{
                            position: 'absolute', left: 0, right: 0, top: 10, bottom: 10,
                            background: '#f0fdf420', border: '1px dashed #bbf7d0',
                            borderRadius: 4, display: 'flex', alignItems: 'center', paddingLeft: 10,
                          }}>
                            <span style={{ fontSize: 10, color: '#16a34a', fontWeight: 700 }}>
                              ● Disponible todo el período
                            </span>
                          </div>
                        )}
                        {eq.effectiveStatus === 'RETIRADO' && eq.blocks.length === 0 && (
                          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, display: 'flex', alignItems: 'center', paddingLeft: 12 }}>
                            <span style={{ fontSize: 10, color: 'var(--clr-text-subtle)' }}>Equipo retirado de operación</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div style={{ fontSize: 11, color: 'var(--clr-text-subtle)', marginTop: 10, display: 'flex', justifyContent: 'space-between' }}>
          <span>Los bloques con color claro corresponden a OT/mantenimientos ya finalizados.</span>
          <span>Actualizado: {format(new Date(), "dd/MM/yyyy HH:mm")}</span>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </AppShell>
  )
}
