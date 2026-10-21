import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Plus, FileText, Clock, CheckCircle, MapPin, User, Truck, X, Trash2,
  Loader2, ChevronRight, Layers, Calendar, DollarSign, Search,
} from 'lucide-react'
import {
  useServiceReports, useCreateServiceReport, useUpdateServiceReport,
  useDeleteServiceReport, useLiquidateReports,
  type ServiceReport, type CreateServiceReportDTO, type LiquidateDTO,
} from '../hooks/useServiceReports'
import { useClients, useEquipment, useOperators } from '../hooks/useFlota'
import { useQuotes } from '../hooks/useQuotes'
import AppShell from '../components/AppShell'

// ─── helpers ─────────────────────────────────────────────────────────────────

const fmtMoney = (n: number, cur: string) =>
  (cur === 'USD' ? '$ ' : 'S/ ') +
  n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtDate = (d: string) => {
  try { return format(parseISO(d), 'dd/MM/yyyy', { locale: es }) } catch { return d }
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: 'PENDING' | 'LIQUIDATED' }) {
  const cfg = status === 'PENDING'
    ? { bg: 'var(--clr-primary-bg)', color: 'var(--clr-primary)', label: 'Pendiente' }
    : { bg: 'var(--clr-success-bg)', color: 'var(--clr-success)', label: 'Liquidado' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: cfg.bg, color: cfg.color,
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
    }}>
      {status === 'PENDING' ? <Clock size={10} /> : <CheckCircle size={10} />}
      {cfg.label}
    </span>
  )
}

// ─── Report card ─────────────────────────────────────────────────────────────

function ReportCard({
  report, selected, onSelect, onClick,
}: {
  report: ServiceReport
  selected: boolean
  onSelect: (id: string) => void
  onClick: (r: ServiceReport) => void
}) {
  return (
    <div
      onClick={() => onClick(report)}
      style={{
        background: 'var(--clr-surface)',
        border: `1.5px solid ${selected ? 'var(--clr-primary)' : 'var(--clr-border)'}`,
        borderRadius: 10,
        padding: '12px 14px',
        cursor: 'pointer',
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        gap: 10,
        alignItems: 'start',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        boxShadow: selected ? '0 0 0 2px var(--clr-primary-bg)' : undefined,
      }}
    >
      {/* Checkbox */}
      {report.status === 'PENDING' && (
        <div
          onClick={e => { e.stopPropagation(); onSelect(report.id) }}
          style={{
            width: 16, height: 16, borderRadius: 4, marginTop: 2,
            border: `2px solid ${selected ? 'var(--clr-primary)' : 'var(--clr-border)'}`,
            background: selected ? 'var(--clr-primary)' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {selected && <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        </div>
      )}
      {report.status !== 'PENDING' && <div style={{ width: 16 }} />}

      {/* Content */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--clr-text)' }}>
            N° {report.number}
          </span>
          <StatusBadge status={report.status} />
          {report.workOrder && (
            <span style={{ fontSize: 11, color: 'var(--clr-text-subtle)' }}>
              → Liq. {report.workOrder.number}
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--clr-text-muted)', marginBottom: 2 }}>
          {report.client.businessName}
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--clr-text-subtle)', flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <Calendar size={11} /> {fmtDate(report.reportDate)}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <Clock size={11} /> {report.startTime} – {report.endTime} ({report.totalHours}h)
          </span>
          {report.travelKm != null && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <MapPin size={11} /> {report.travelKm} km
            </span>
          )}
          {report.equipment && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <Truck size={11} /> {report.equipment.name}
            </span>
          )}
          {report.operator && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <User size={11} /> {report.operator.name}
            </span>
          )}
        </div>
        {report.workDescription && (
          <div style={{ fontSize: 11, color: 'var(--clr-text-subtle)', marginTop: 4, fontStyle: 'italic' }}>
            {report.workDescription}
          </div>
        )}
      </div>

      {/* Amount */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--clr-text)' }}>
          {fmtMoney(report.amount, report.currency)}
        </div>
        <div style={{ fontSize: 11, color: 'var(--clr-text-subtle)' }}>
          {fmtMoney(report.unitRate, report.currency)}/h
        </div>
        <ChevronRight size={14} style={{ color: 'var(--clr-text-subtle)', marginTop: 4 }} />
      </div>
    </div>
  )
}

// ─── Report Form Modal ────────────────────────────────────────────────────────

interface ReportFormData {
  clientId: string
  equipmentId: string
  operatorId: string
  quoteId: string
  reportDate: string
  startTime: string
  endTime: string
  totalHours: number
  travelKm: string
  workDescription: string
  location: string
  unitRate: number
  currency: 'PEN' | 'USD'
}

function ReportFormModal({
  report,
  onClose,
}: {
  report?: ServiceReport
  onClose: () => void
}) {
  const { data: clients = [] } = useClients()
  const { data: equipment = [] } = useEquipment()
  const { data: operators = [] } = useOperators()
  const { data: quotes = [] } = useQuotes()

  const createMut = useCreateServiceReport()
  const updateMut = useUpdateServiceReport()
  const isEdit = !!report

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<ReportFormData>({
    defaultValues: {
      clientId: report?.client.id ?? '',
      equipmentId: report?.equipment?.id ?? '',
      operatorId: report?.operator?.id ?? '',
      quoteId: report?.quote?.id ?? '',
      reportDate: report ? report.reportDate.split('T')[0] : new Date().toISOString().split('T')[0],
      startTime: report?.startTime ?? '08:00',
      endTime: report?.endTime ?? '17:00',
      totalHours: report ? Number(report.totalHours) : 8,
      travelKm: report?.travelKm != null ? String(report.travelKm) : '',
      workDescription: report?.workDescription ?? '',
      location: report?.location ?? '',
      unitRate: report ? Number(report.unitRate) : 0,
      currency: report?.currency ?? 'PEN',
    },
  })

  const currency = watch('currency')
  const totalHours = watch('totalHours')
  const unitRate = watch('unitRate')
  const amount = (Number(totalHours) || 0) * (Number(unitRate) || 0)

  const onSubmit = async (data: ReportFormData) => {
    const payload: CreateServiceReportDTO = {
      clientId: data.clientId,
      equipmentId: data.equipmentId || undefined,
      operatorId: data.operatorId || undefined,
      quoteId: data.quoteId || undefined,
      reportDate: data.reportDate,
      startTime: data.startTime,
      endTime: data.endTime,
      totalHours: Number(data.totalHours),
      travelKm: data.travelKm ? Number(data.travelKm) : undefined,
      workDescription: data.workDescription || undefined,
      location: data.location || undefined,
      unitRate: Number(data.unitRate),
      currency: data.currency,
    }
    if (isEdit && report) {
      await updateMut.mutateAsync({ id: report.id, ...payload })
    } else {
      await createMut.mutateAsync(payload)
    }
    onClose()
  }

  const isPending = createMut.isPending || updateMut.isPending

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: 'var(--clr-surface)', borderRadius: 14, width: 600,
        maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 48px rgba(0,0,0,0.3)',
        padding: 24,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--clr-text)' }}>
            {isEdit ? `Editar Reporte N° ${report?.number}` : 'Nuevo Reporte de Servicio'}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-text-muted)' }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          {/* Row 1: Client + Quote */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--clr-text-muted)', display: 'block', marginBottom: 4 }}>
                Cliente *
              </label>
              <select {...register('clientId', { required: true })}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--clr-border)', background: 'var(--clr-bg)', color: 'var(--clr-text)', fontSize: 13 }}>
                <option value="">Seleccionar cliente</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.businessName}</option>)}
              </select>
              {errors.clientId && <span style={{ fontSize: 11, color: 'var(--clr-danger)' }}>Requerido</span>}
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--clr-text-muted)', display: 'block', marginBottom: 4 }}>
                Cotización (opcional)
              </label>
              <select {...register('quoteId')}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--clr-border)', background: 'var(--clr-bg)', color: 'var(--clr-text)', fontSize: 13 }}>
                <option value="">Sin cotización</option>
                {quotes.filter(q => ['APPROVED', 'CONVERTED'].includes(q.status)).map(q => (
                  <option key={q.id} value={q.id}>Cot. {q.number}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: Equipment + Operator */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--clr-text-muted)', display: 'block', marginBottom: 4 }}>Equipo</label>
              <select {...register('equipmentId')}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--clr-border)', background: 'var(--clr-bg)', color: 'var(--clr-text)', fontSize: 13 }}>
                <option value="">Sin equipo</option>
                {equipment.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--clr-text-muted)', display: 'block', marginBottom: 4 }}>Operador</label>
              <select {...register('operatorId')}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--clr-border)', background: 'var(--clr-bg)', color: 'var(--clr-text)', fontSize: 13 }}>
                <option value="">Sin operador</option>
                {operators.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          </div>

          {/* Row 3: Date + Currency */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--clr-text-muted)', display: 'block', marginBottom: 4 }}>Fecha del servicio *</label>
              <input type="date" {...register('reportDate', { required: true })}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--clr-border)', background: 'var(--clr-bg)', color: 'var(--clr-text)', fontSize: 13 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--clr-text-muted)', display: 'block', marginBottom: 4 }}>Moneda</label>
              <select {...register('currency')}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--clr-border)', background: 'var(--clr-bg)', color: 'var(--clr-text)', fontSize: 13 }}>
                <option value="PEN">Soles (PEN)</option>
                <option value="USD">Dólares (USD)</option>
              </select>
            </div>
          </div>

          {/* Row 4: Times + Hours */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--clr-text-muted)', display: 'block', marginBottom: 4 }}>Hora inicio *</label>
              <input type="time" {...register('startTime', { required: true })}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--clr-border)', background: 'var(--clr-bg)', color: 'var(--clr-text)', fontSize: 13 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--clr-text-muted)', display: 'block', marginBottom: 4 }}>Hora fin *</label>
              <input type="time" {...register('endTime', { required: true })}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--clr-border)', background: 'var(--clr-bg)', color: 'var(--clr-text)', fontSize: 13 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--clr-text-muted)', display: 'block', marginBottom: 4 }}>Horas efectivas *</label>
              <input type="number" step="0.5" min="0" {...register('totalHours', { required: true, min: 0 })}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--clr-border)', background: 'var(--clr-bg)', color: 'var(--clr-text)', fontSize: 13 }} />
            </div>
          </div>

          {/* Row 5: Unit Rate + Travel Km */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--clr-text-muted)', display: 'block', marginBottom: 4 }}>
                Precio por hora *
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--clr-text-muted)' }}>
                  {currency === 'USD' ? '$' : 'S/'}
                </span>
                <input type="number" step="0.01" min="0" {...register('unitRate', { required: true, min: 0 })}
                  style={{ width: '100%', padding: '8px 10px 8px 28px', borderRadius: 8, border: '1.5px solid var(--clr-border)', background: 'var(--clr-bg)', color: 'var(--clr-text)', fontSize: 13 }} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--clr-text-muted)', display: 'block', marginBottom: 4 }}>Recorrido (km)</label>
              <input type="number" step="0.1" min="0" {...register('travelKm')}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--clr-border)', background: 'var(--clr-bg)', color: 'var(--clr-text)', fontSize: 13 }} />
            </div>
          </div>

          {/* Location */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--clr-text-muted)', display: 'block', marginBottom: 4 }}>Lugar</label>
            <input type="text" {...register('location')} placeholder="Dirección o lugar del servicio"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--clr-border)', background: 'var(--clr-bg)', color: 'var(--clr-text)', fontSize: 13 }} />
          </div>

          {/* Work description */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--clr-text-muted)', display: 'block', marginBottom: 4 }}>Trabajo realizado</label>
            <textarea {...register('workDescription')} rows={2} placeholder="Descripción del trabajo realizado…"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--clr-border)', background: 'var(--clr-bg)', color: 'var(--clr-text)', fontSize: 13, resize: 'vertical' }} />
          </div>

          {/* Summary */}
          <div style={{
            background: 'var(--clr-sidebar)', borderRadius: 8, padding: '10px 14px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
          }}>
            <span style={{ fontSize: 13, color: 'var(--clr-text-muted)' }}>
              {totalHours}h × {fmtMoney(Number(unitRate) || 0, currency)} =
            </span>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--clr-text)' }}>
              {fmtMoney(amount, currency)}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose}
              style={{ padding: '8px 16px', borderRadius: 8, border: '1.5px solid var(--clr-border)', background: 'transparent', color: 'var(--clr-text)', cursor: 'pointer', fontSize: 13 }}>
              Cancelar
            </button>
            <button type="submit" disabled={isPending}
              style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'var(--clr-primary)', color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              {isPending ? <Loader2 size={14} className="animate-spin" /> : null}
              {isEdit ? 'Guardar cambios' : 'Crear reporte'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Liquidate Modal ──────────────────────────────────────────────────────────

function LiquidateModal({
  selected,
  reports,
  onClose,
}: {
  selected: string[]
  reports: ServiceReport[]
  onClose: () => void
}) {
  const selectedReports = reports.filter(r => selected.includes(r.id))
  const liquidateMut = useLiquidateReports()

  const currencies = [...new Set(selectedReports.map(r => r.currency))]
  const mixedCurrencies = currencies.length > 1
  const currency = selectedReports[0]?.currency ?? 'PEN'
  const subtotal = mixedCurrencies ? 0 : selectedReports.reduce((s, r) => s + Number(r.amount), 0)
  const totalHours = selectedReports.reduce((s, r) => s + Number(r.totalHours), 0)

  const { register, handleSubmit } = useForm<{ location: string; notes: string }>({
    defaultValues: {
      location: selectedReports[0]?.location ?? '',
      notes: '',
    },
  })

  const onSubmit = async (data: { location: string; notes: string }) => {
    try {
      await liquidateMut.mutateAsync({
        reportIds: selected,
        location: data.location || undefined,
        notes: data.notes || undefined,
      })
      onClose()
    } catch {
      // error shown via liquidateMut.error
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'var(--clr-surface)', borderRadius: 14, width: 620, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 48px rgba(0,0,0,0.3)', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--clr-text)' }}>Crear Liquidación</div>
            <div style={{ fontSize: 12, color: 'var(--clr-text-subtle)' }}>{selected.length} reportes seleccionados</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-text-muted)' }}><X size={18} /></button>
        </div>

        {/* Reportes incluidos */}
        <div style={{ background: 'var(--clr-sidebar)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--clr-text-muted)', marginBottom: 8 }}>REPORTES INCLUIDOS</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ color: 'var(--clr-text-subtle)' }}>
                <th style={{ textAlign: 'left', padding: '3px 4px' }}>N°</th>
                <th style={{ textAlign: 'left', padding: '3px 4px' }}>Fecha</th>
                <th style={{ textAlign: 'left', padding: '3px 4px' }}>Equipo</th>
                <th style={{ textAlign: 'left', padding: '3px 4px' }}>Operador</th>
                <th style={{ textAlign: 'left', padding: '3px 4px' }}>Horas</th>
                <th style={{ textAlign: 'right', padding: '3px 4px' }}>Monto</th>
              </tr>
            </thead>
            <tbody>
              {selectedReports.map(r => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--clr-border)' }}>
                  <td style={{ padding: '4px', fontWeight: 600, color: 'var(--clr-text)' }}>{r.number}</td>
                  <td style={{ padding: '4px', color: 'var(--clr-text-muted)' }}>{fmtDate(r.reportDate)}</td>
                  <td style={{ padding: '4px', color: 'var(--clr-text-muted)' }}>{r.equipment?.name ?? '—'}</td>
                  <td style={{ padding: '4px', color: 'var(--clr-text-muted)' }}>{r.operator?.name ?? '—'}</td>
                  <td style={{ padding: '4px', color: 'var(--clr-text-muted)' }}>{r.startTime}–{r.endTime} ({r.totalHours}h)</td>
                  <td style={{ padding: '4px', textAlign: 'right', color: 'var(--clr-text)' }}>{fmtMoney(r.amount, r.currency)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--clr-border)' }}>
                <td colSpan={4} style={{ padding: '6px 4px', fontSize: 12, color: 'var(--clr-text-muted)' }}>
                  Total: {totalHours}h
                </td>
                <td colSpan={2} style={{ padding: '6px 4px', textAlign: 'right', fontWeight: 700, fontSize: 14, color: mixedCurrencies ? 'var(--clr-danger)' : 'var(--clr-text)' }}>
                  {mixedCurrencies ? 'Monedas mixtas' : `${fmtMoney(subtotal, currency)} + IGV`}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {mixedCurrencies && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span style={{ color: 'var(--clr-danger)', fontSize: 18, lineHeight: 1 }}>⚠</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--clr-danger)' }}>No se puede liquidar — monedas diferentes</div>
              <div style={{ fontSize: 12, color: 'var(--clr-text-muted)', marginTop: 2 }}>
                Seleccionaste reportes en <strong>{currencies.join(' y ')}</strong>. Todos deben ser de la misma moneda.
              </div>
            </div>
          </div>
        )}

        {liquidateMut.isError && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: 'var(--clr-danger)' }}>
            {(liquidateMut.error as Error)?.message ?? 'Error al generar la liquidación'}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--clr-text-muted)', display: 'block', marginBottom: 4 }}>Lugar</label>
            <input type="text" {...register('location')} placeholder="Lugar del trabajo"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--clr-border)', background: 'var(--clr-bg)', color: 'var(--clr-text)', fontSize: 13 }} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--clr-text-muted)', display: 'block', marginBottom: 4 }}>Notas</label>
            <textarea {...register('notes')} rows={2}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--clr-border)', background: 'var(--clr-bg)', color: 'var(--clr-text)', fontSize: 13, resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose}
              style={{ padding: '8px 16px', borderRadius: 8, border: '1.5px solid var(--clr-border)', background: 'transparent', color: 'var(--clr-text)', cursor: 'pointer', fontSize: 13 }}>
              Cancelar
            </button>
            <button type="submit" disabled={liquidateMut.isPending || mixedCurrencies}
              style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: mixedCurrencies ? 'var(--clr-border)' : 'var(--clr-success)', color: 'white', cursor: mixedCurrencies ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              {liquidateMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Layers size={14} />}
              Generar Liquidación
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ServiceReportsPage() {
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editReport, setEditReport] = useState<ServiceReport | undefined>()
  const [showLiquidate, setShowLiquidate] = useState(false)

  const { data: reports = [], isLoading } = useServiceReports(
    statusFilter !== 'all' ? { status: statusFilter } : undefined
  )
  const deleteMut = useDeleteServiceReport()

  const filtered = reports.filter(r => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      r.number.includes(q) ||
      r.client.businessName.toLowerCase().includes(q) ||
      r.equipment?.name.toLowerCase().includes(q) ||
      r.operator?.name.toLowerCase().includes(q) ||
      r.workDescription?.toLowerCase().includes(q)
    )
  })

  const pendingFiltered = filtered.filter(r => r.status === 'PENDING')

  const toggleSelect = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const handleCardClick = (r: ServiceReport) => {
    if (r.status === 'PENDING') {
      setEditReport(r)
      setShowForm(true)
    }
  }

  const handleDelete = async (r: ServiceReport, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`¿Eliminar Reporte N° ${r.number}?`)) return
    await deleteMut.mutateAsync(r.id)
    setSelected(prev => prev.filter(x => x !== r.id))
  }

  // KPI counts
  const totalPending = reports.filter(r => r.status === 'PENDING').length
  const totalLiquidated = reports.filter(r => r.status === 'LIQUIDATED').length
  const pendingAmount = reports.filter(r => r.status === 'PENDING')
    .reduce((s, r) => s + Number(r.amount), 0)

  return (
    <AppShell active="service-reports" title="Reportes de Servicio">
      <div style={{ maxWidth: 1400, padding: '24px 28px 56px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--clr-text)', margin: 0 }}>
              Reportes de Servicio
            </h1>
            <p style={{ fontSize: 13, color: 'var(--clr-text-subtle)', marginTop: 2 }}>
              Registro diario de servicios prestados — luego se agrupan en una Liquidación
            </p>
          </div>
          <button
            onClick={() => { setEditReport(undefined); setShowForm(true) }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9, border: 'none', background: 'var(--clr-primary)', color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            <Plus size={15} /> Nuevo reporte
          </button>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Pendientes', value: totalPending, color: 'var(--clr-primary)', bg: 'var(--clr-primary-bg)', icon: <Clock size={16} /> },
            { label: 'Liquidados', value: totalLiquidated, color: 'var(--clr-success)', bg: 'var(--clr-success-bg)', icon: <CheckCircle size={16} /> },
            { label: 'Monto pendiente', value: `S/ ${pendingAmount.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`, color: 'var(--clr-text)', bg: 'var(--clr-sidebar)', icon: <DollarSign size={16} /> },
          ].map(kpi => (
            <div key={kpi.label} style={{ background: kpi.bg, borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: kpi.color }}>{kpi.icon}</span>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
                <div style={{ fontSize: 11, color: 'var(--clr-text-muted)' }}>{kpi.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--clr-text-subtle)' }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar reporte, cliente, equipo…"
              style={{ width: '100%', padding: '8px 10px 8px 30px', borderRadius: 8, border: '1.5px solid var(--clr-border)', background: 'var(--clr-bg)', color: 'var(--clr-text)', fontSize: 13 }}
            />
          </div>

          {/* Status filter */}
          {['all', 'PENDING', 'LIQUIDATED'].map(s => (
            <button key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
                background: statusFilter === s ? 'var(--clr-primary)' : 'var(--clr-sidebar)',
                color: statusFilter === s ? 'white' : 'var(--clr-text-muted)',
              }}>
              {s === 'all' ? 'Todos' : s === 'PENDING' ? 'Pendientes' : 'Liquidados'}
            </button>
          ))}

          {/* Liquidate button */}
          {selected.length > 0 && (
            <button
              onClick={() => setShowLiquidate(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: 'none', background: 'var(--clr-success)', color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              <Layers size={14} /> Liquidar ({selected.length})
            </button>
          )}
        </div>

        {/* List */}
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: 'var(--clr-primary)' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--clr-text-subtle)' }}>
            <FileText size={36} style={{ marginBottom: 8, opacity: 0.4 }} />
            <div style={{ fontSize: 14 }}>No hay reportes</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Crea el primer reporte de servicio</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(r => (
              <div key={r.id} style={{ position: 'relative' }}>
                <ReportCard
                  report={r}
                  selected={selected.includes(r.id)}
                  onSelect={toggleSelect}
                  onClick={handleCardClick}
                />
                {r.status === 'PENDING' && (
                  <button
                    onClick={(e) => handleDelete(r, e)}
                    style={{
                      position: 'absolute', top: 10, right: 42,
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--clr-text-subtle)', padding: 4,
                    }}
                    title="Eliminar reporte"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showForm && (
        <ReportFormModal
          report={editReport}
          onClose={() => { setShowForm(false); setEditReport(undefined) }}
        />
      )}
      {showLiquidate && (
        <LiquidateModal
          selected={selected}
          reports={reports}
          onClose={() => { setShowLiquidate(false); setSelected([]) }}
        />
      )}
    </AppShell>
  )
}
