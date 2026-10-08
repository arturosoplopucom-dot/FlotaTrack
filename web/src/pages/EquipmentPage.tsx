import { useState, useEffect, useRef } from 'react'
import { format, parseISO } from 'date-fns'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useSearchStore } from '../store/search.store'
import { useForm } from 'react-hook-form'
import { Plus, Wrench, Truck, Search, XCircle, Download, X, MapPin, User, Calendar, CreditCard, Play, Gauge, FileText, ChevronDown, Upload, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { useEquipment, useCreateEquipment, useUpdateEquipment, useWorkOrders, useOdometerData, useRegisterOdometer, type Equipment, type WorkOrder } from '../hooks/useFlota'
import { useStartSession, useCompleteSession, useActiveSessions, useSessionHistory, type MaintenanceSession } from '../hooks/useMaintenance'
import AppShell from '../components/AppShell'
import { SearchableDropdown } from '../components/SearchableDropdown'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

const LS_TECH = 'ft_last_technician'

// ─── Modal Rápido: Enviar a Mantenimiento ─────────────────────────────────────
function QuickMaintenanceModal({ onClose }: { onClose: () => void }) {
  const { data: equipment = [] } = useEquipment()
  const startSession = useStartSession()
  const [equipmentId, setEquipmentId] = useState('')
  const [error, setError] = useState('')

  const today = format(new Date(), 'yyyy-MM-dd')
  const defaultEnd = format(new Date(Date.now() + 3 * 86400000), 'yyyy-MM-dd')

  const { register, handleSubmit } = useForm({
    defaultValues: {
      startedAt:       today,
      estimatedEnd:    defaultEnd,
      technician:      (() => { try { return localStorage.getItem(LS_TECH) ?? '' } catch { return '' } })(),
      workDescription: 'Mantenimiento preventivo',
      estimatedCost:   '',
    },
  })

  const availEquip = equipment.filter((e) => e.status === 'AVAILABLE' || e.status === 'IN_USE')
  const equipItems = availEquip.map((e) => ({
    id: e.id,
    primary: e.name,
    secondary: `${e.brand ?? ''} · ${e.status === 'IN_USE' ? 'En uso' : 'Disponible'}`,
    badge: e.status === 'IN_USE' ? 'En uso' : 'Disponible',
  }))

  const onSubmit = async (data: any) => {
    if (!equipmentId) { setError('Selecciona el equipo'); return }
    setError('')
    try {
      await startSession.mutateAsync({
        equipmentId,
        startedAt:       data.startedAt,
        estimatedEnd:    data.estimatedEnd    || undefined,
        technician:      data.technician      || undefined,
        workDescription: data.workDescription || undefined,
        estimatedCost:   data.estimatedCost ? Number(data.estimatedCost) : undefined,
      })
      try { if (data.technician) localStorage.setItem(LS_TECH, data.technician) } catch {}
      onClose()
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al iniciar mantenimiento')
    }
  }

  const inp = 'w-full bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 text-sm focus:outline-none focus:border-orange-500'
  const lbl = 'text-xs text-gray-400 mb-1 block'

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl w-full max-w-md border border-orange-500/30">
        <div className="flex items-center gap-3 p-5 border-b border-gray-800">
          <div className="w-10 h-10 rounded-xl bg-orange-500/15 flex items-center justify-center flex-shrink-0">
            <Wrench size={18} className="text-orange-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-bold text-white">Enviar a mantenimiento</h2>
            <p className="text-xs text-gray-400 mt-0.5">El equipo pasará a estado EN TALLER</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          <SearchableDropdown
            label="Equipo *"
            placeholder="Seleccionar equipo..."
            items={equipItems}
            value={equipmentId}
            onChange={(id) => { setEquipmentId(id); setError('') }}
            icon={Truck}
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Fecha inicio</label>
              <input {...register('startedAt')} type="date" className={inp} />
            </div>
            <div>
              <label className={lbl}>Fin estimado</label>
              <input {...register('estimatedEnd')} type="date" className={inp} />
            </div>
          </div>

          <div>
            <label className={lbl}>Técnico / Taller</label>
            <input {...register('technician')} placeholder="Nombre del técnico o taller" className={inp} />
          </div>

          <div>
            <label className={lbl}>Trabajo a realizar</label>
            <input {...register('workDescription')} className={inp} />
          </div>

          <div>
            <label className={lbl}>Costo estimado (S/)</label>
            <input {...register('estimatedCost')} type="number" step="0.01" min="0" placeholder="0.00" className={inp} />
          </div>

          {error && <p className="text-xs text-red-400 bg-red-950/50 border border-red-800 rounded-lg px-3 py-2">{error}</p>}
        </div>

        <div className="flex gap-3 p-5 border-t border-gray-800">
          <button type="button" onClick={onClose} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-2.5 rounded-xl text-sm">Cancelar</button>
          <button
            onClick={handleSubmit(onSubmit)}
            disabled={startSession.isPending}
            className="flex-1 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
          >
            <Play size={14} />
            {startSession.isPending ? 'Iniciando…' : 'Enviar a taller'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Reporte de Mantenimientos ────────────────────────────────────────────────

function MaintenanceReportModal({ onClose }: { onClose: () => void }) {
  const [from, setFrom] = useState('')
  const [to, setTo]     = useState('')
  const { data: equipment = [] } = useEquipment()
  const [eqFilter, setEqFilter] = useState('')

  const { data: history = [], isLoading } = useSessionHistory(
    { from: from || undefined, to: to || undefined, equipmentId: eqFilter || undefined }
  )

  const totalCost  = history.reduce((s, h) => s + (h.actualCost ? parseFloat(h.actualCost) : 0), 0)
  const totalSess  = history.length

  const ovl: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex',
    alignItems: 'flex-start', justifyContent: 'center', zIndex: 9999, overflowY: 'auto', padding: '24px 16px',
  }
  const box: React.CSSProperties = {
    background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 12,
    width: '100%', maxWidth: 900, color: 'var(--clr-text)',
  }

  const fmt = (d?: string | null) => d ? format(parseISO(d), 'dd/MM/yyyy') : '—'
  const fmtMoney = (v?: string | null) => v ? `S/ ${parseFloat(v).toLocaleString('es-PE', { minimumFractionDigits: 2 })}` : '—'

  return (
    <div style={ovl} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={box}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--clr-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileText size={18} style={{ color: 'var(--clr-primary-lt)' }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Reporte de Mantenimientos</div>
              <div style={{ fontSize: 12, color: 'var(--clr-text-subtle)' }}>{totalSess} sesiones · Costo total: <span style={{ color: 'var(--clr-success)', fontWeight: 600 }}>S/ {totalCost.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span></div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-text-subtle)' }}><X size={18} /></button>
        </div>

        {/* Filtros */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--clr-border)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--clr-text-subtle)', marginBottom: 4 }}>Desde</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              style={{ background: 'var(--clr-sidebar)', border: '1px solid var(--clr-border)', borderRadius: 6, color: 'var(--clr-text)', padding: '6px 10px', fontSize: 13 }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--clr-text-subtle)', marginBottom: 4 }}>Hasta</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              style={{ background: 'var(--clr-sidebar)', border: '1px solid var(--clr-border)', borderRadius: 6, color: 'var(--clr-text)', padding: '6px 10px', fontSize: 13 }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--clr-text-subtle)', marginBottom: 4 }}>Equipo</label>
            <select value={eqFilter} onChange={(e) => setEqFilter(e.target.value)}
              style={{ background: 'var(--clr-sidebar)', border: '1px solid var(--clr-border)', borderRadius: 6, color: 'var(--clr-text)', padding: '6px 10px', fontSize: 13, minWidth: 200 }}>
              <option value="">Todos los equipos</option>
              {equipment.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
        </div>

        {/* Tabla */}
        <div style={{ overflowX: 'auto' }}>
          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--clr-text-subtle)' }}>Cargando...</div>
          ) : history.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--clr-text-subtle)' }}>No se encontraron mantenimientos con los filtros aplicados.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--clr-bg)' }}>
                  {['Equipo', 'Ingresó', 'Salió', 'Técnico', 'Trabajo', 'Km salida', 'Costo est.', 'Costo real'].map((h) => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--clr-text-subtle)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((s) => (
                  <tr key={s.id} style={{ borderTop: '1px solid var(--clr-border)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--clr-surface-hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--clr-text)', whiteSpace: 'nowrap' }}>{s.equipment.name}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--clr-text-muted)', whiteSpace: 'nowrap' }}>{fmt(s.startedAt)}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--clr-text-muted)', whiteSpace: 'nowrap' }}>{fmt(s.completedAt)}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--clr-text-muted)' }}>{s.technician ?? '—'}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--clr-text-muted)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.workDescription ?? ''}>{s.workDescription ?? '—'}</td>
                    <td style={{ padding: '10px 14px', color: s.odometerKmAtClose ? 'var(--clr-primary)' : 'var(--clr-text-subtle)', whiteSpace: 'nowrap' }}>
                      {s.odometerKmAtClose ? `${Number(s.odometerKmAtClose).toLocaleString('es-PE')} km` : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--clr-text-muted)', whiteSpace: 'nowrap' }}>{fmtMoney(s.estimatedCost)}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: s.actualCost && parseFloat(s.actualCost) > 0 ? 'var(--clr-success)' : 'var(--clr-text-subtle)', whiteSpace: 'nowrap' }}>
                      {s.actualCost && parseFloat(s.actualCost) > 0 ? fmtMoney(s.actualCost) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--clr-border)', background: 'var(--clr-surface)' }}>
                  <td colSpan={7} style={{ padding: '10px 14px', color: 'var(--clr-text-subtle)', fontSize: 12, fontWeight: 600 }}>TOTAL ({totalSess} mantenimientos)</td>
                  <td style={{ padding: '10px 14px', color: 'var(--clr-success)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    S/ {totalCost.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Cerrar Mantenimiento Modal ────────────────────────────────────────────────

function CerrarMantenimientoModal({ session, eq, onClose }: {
  session: MaintenanceSession
  eq: { name: string; odometerKm?: string | null; maintenanceIntervalKm?: string | null }
  onClose: () => void
}) {
  const complete = useCompleteSession()
  const today = format(new Date(), 'yyyy-MM-dd')
  const currentKm = eq.odometerKm ? Number(eq.odometerKm) : null
  const interval  = eq.maintenanceIntervalKm ? Number(eq.maintenanceIntervalKm) : null
  const defaultNextKm = currentKm && interval
    ? Math.ceil((currentKm + 1) / interval) * interval
    : undefined

  const { register, handleSubmit, watch, formState: { isSubmitting } } = useForm({
    defaultValues: {
      completedAt:       today,
      odometerKmAtClose: currentKm ?? '',
      nextMaintenanceKm: defaultNextKm ?? '',
      actualCost:        session.estimatedCost ? Number(session.estimatedCost) : '',
      hoursAtClose:      '',
      completionNotes:   '',
      updateEquipmentHours: false,
    },
  })
  const [error, setError] = useState('')
  const kmValue = watch('odometerKmAtClose')

  const onSubmit = async (data: any) => {
    if (!data.actualCost && data.actualCost !== 0) { setError('Ingresa el costo real'); return }
    setError('')
    try {
      await complete.mutateAsync({
        sessionId:         session.id,
        completedAt:       data.completedAt,
        actualCost:        parseFloat(data.actualCost) || 0,
        hoursAtClose:      data.hoursAtClose ? parseFloat(data.hoursAtClose) : undefined,
        completionNotes:   data.completionNotes || undefined,
        updateEquipmentHours: data.updateEquipmentHours === true || data.updateEquipmentHours === 'true',
        odometerKmAtClose: data.odometerKmAtClose ? parseFloat(data.odometerKmAtClose) : undefined,
        nextMaintenanceKm: data.nextMaintenanceKm ? parseFloat(data.nextMaintenanceKm) : undefined,
      })
      onClose()
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al cerrar mantenimiento')
    }
  }

  const inp = 'w-full bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 text-sm focus:outline-none focus:border-green-500'
  const lbl = 'text-xs text-gray-400 mb-1 block'

  const estimatedCost = session.estimatedCost ? Number(session.estimatedCost) : null

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl w-full max-w-lg border border-green-500/30">

        {/* Header */}
        <div className="flex items-center gap-3 p-5 border-b border-gray-800">
          <div className="w-10 h-10 rounded-xl bg-green-500/15 flex items-center justify-center flex-shrink-0">
            <Wrench size={18} className="text-green-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-bold text-white">Cerrar mantenimiento</h2>
            <p className="text-xs text-gray-400 mt-0.5">{eq.name} — {session.technician ?? 'Sin taller asignado'}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>

        {/* Info de la sesión */}
        <div className="px-5 pt-4 pb-0">
          <div className="rounded-xl p-3 grid grid-cols-3 gap-3" style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)' }}>
            <div className="text-center">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Ingresó</div>
              <div className="text-xs font-semibold text-gray-300">{format(parseISO(session.startedAt), 'dd/MM/yyyy')}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Trabajo</div>
              <div className="text-xs font-semibold text-gray-300 truncate">{session.workDescription ?? '—'}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Costo est.</div>
              <div className="text-xs font-semibold text-gray-300">
                {estimatedCost != null ? `S/ ${estimatedCost.toLocaleString('es-PE', { minimumFractionDigits: 2 })}` : '—'}
              </div>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-4">

          {/* Fecha salida + Costo real */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Fecha de salida</label>
              <input {...register('completedAt')} type="date" className={inp} />
            </div>
            <div>
              <label className={lbl}>Costo real cobrado (S/) *</label>
              <input {...register('actualCost')} type="number" step="0.01" min="0" placeholder="0.00" className={`${inp} focus:border-green-500`} style={{ borderColor: 'var(--clr-success)' }} />
            </div>
          </div>

          {/* Km salida + Próximo mantenimiento */}
          {(currentKm != null || interval != null) && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Km al salir del taller</label>
                <input {...register('odometerKmAtClose')} type="number" step="1" min="0"
                  placeholder={currentKm != null ? String(Math.round(currentKm)) : '0'} className={inp} />
              </div>
              <div>
                <label className={lbl}>Próximo mantenimiento (km)</label>
                <input {...register('nextMaintenanceKm')} type="number" step="1" min="0"
                  placeholder={defaultNextKm ? String(defaultNextKm) : '—'} className={inp} />
              </div>
            </div>
          )}

          {/* Horómetro + checkbox */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Horómetro al cierre (h)</label>
              <input {...register('hoursAtClose')} type="number" step="0.1" min="0" placeholder="Opcional" className={inp} />
            </div>
            <div className="flex items-end pb-1.5">
              <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                <input {...register('updateEquipmentHours')} type="checkbox" className="rounded" />
                Actualizar horómetro del equipo
              </label>
            </div>
          </div>

          <div>
            <label className={lbl}>Notas de cierre</label>
            <input {...register('completionNotes')} placeholder="Trabajos realizados, observaciones..." className={inp} />
          </div>

          {error && <p className="text-xs text-red-400 bg-red-950/50 border border-red-800 rounded-lg px-3 py-2">{error}</p>}
        </div>

        <div className="flex gap-3 p-5 border-t border-gray-800">
          <button type="button" onClick={onClose} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-2.5 rounded-xl text-sm">
            Cancelar
          </button>
          <button
            onClick={handleSubmit(onSubmit)}
            disabled={isSubmitting || complete.isPending}
            className="flex-1 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
            style={{ background: 'var(--clr-success)' }}
          >
            <Wrench size={14} />
            {complete.isPending ? 'Cerrando...' : 'Cerrar y devolver equipo'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Odometer Modal ────────────────────────────────────────────────────────────

function OdometerModal({ eq, onClose }: { eq: Equipment; onClose: () => void }) {
  const { data, isLoading } = useOdometerData(eq.id)
  const registerKm = useRegisterOdometer()
  const { register, handleSubmit, reset } = useForm<{ km: string; notes: string }>()
  const [error, setError] = useState('')

  const inp = 'w-full rounded-lg px-3 py-2 border text-sm focus:outline-none'
  const inpSt = { background: 'var(--clr-surface)', borderColor: 'var(--clr-border)', color: 'var(--clr-text)' } as React.CSSProperties

  const lastKm = data?.equipment.odometerKm ? Number(data.equipment.odometerKm)
    : eq.odometerKm ? Number(eq.odometerKm) : null
  const nextKm = data?.equipment.nextMaintenanceKm ? Number(data.equipment.nextMaintenanceKm) : null
  const kmRemaining = data?.stats.kmRemaining ?? null
  const estimatedDate = data?.stats.estimatedDate ?? null
  const avgKmPerDay = data?.stats.avgKmPerDay ?? null
  const isAlert = kmRemaining != null && kmRemaining < 500

  const onSubmit = async (form: { km: string; notes: string }) => {
    if (!form.km || isNaN(Number(form.km))) { setError('Ingresa el km actual'); return }
    setError('')
    try {
      await registerKm.mutateAsync({ id: eq.id, km: Number(form.km), notes: form.notes || undefined })
      reset()
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al registrar')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="rounded-2xl w-full max-w-lg border" style={{ background: 'var(--clr-sidebar)', borderColor: 'var(--clr-border)' }}>
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--clr-border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--clr-primary-bg)' }}>
              <Gauge size={17} style={{ color: 'var(--clr-primary-lt)' }} />
            </div>
            <div>
              <h2 className="text-base font-bold" style={{ color: 'var(--clr-text)' }}>{eq.name}</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--clr-text-subtle)' }}>Control de odómetro y mantenimiento por km</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-text-subtle)', padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl p-3 text-center" style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)' }}>
              <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--clr-text-subtle)' }}>Km actual</div>
              <div className="text-xl font-bold" style={{ color: 'var(--clr-text)' }}>
                {lastKm != null ? lastKm.toLocaleString('es-PE') : '—'}
              </div>
            </div>
            <div className="rounded-xl p-3 text-center" style={{ background: 'var(--clr-surface)', border: `1px solid ${isAlert ? 'rgba(249,115,22,0.4)' : 'var(--clr-border)'}` }}>
              <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: isAlert ? 'var(--clr-orange)' : 'var(--clr-text-subtle)' }}>Km restantes</div>
              <div className="text-xl font-bold" style={{ color: isAlert ? 'var(--clr-orange)' : kmRemaining != null ? 'var(--clr-success)' : 'var(--clr-text)' }}>
                {kmRemaining != null ? (kmRemaining > 0 ? kmRemaining.toLocaleString('es-PE') : '¡YA!') : '—'}
              </div>
            </div>
            <div className="rounded-xl p-3 text-center" style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)' }}>
              <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--clr-text-subtle)' }}>Fecha est.</div>
              <div className="text-sm font-bold" style={{ color: estimatedDate ? 'var(--clr-success)' : 'var(--clr-text)' }}>
                {estimatedDate
                  ? new Date(estimatedDate + 'T00:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })
                  : nextKm ? `${nextKm.toLocaleString('es-PE')} km` : '—'}
              </div>
            </div>
          </div>

          {avgKmPerDay && (
            <p className="text-xs text-center" style={{ color: 'var(--clr-text-subtle)' }}>
              Promedio: <span style={{ color: 'var(--clr-text-muted)' }}>{avgKmPerDay} km/día</span>
              {nextKm && <span> · Próximo mant. a los <span style={{ color: 'var(--clr-text-muted)' }}>{nextKm.toLocaleString('es-PE')} km</span></span>}
            </p>
          )}

          {/* Register form */}
          <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)' }}>
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--clr-text-subtle)' }}>Registrar nueva lectura</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--clr-text-subtle)' }}>Km actual *</label>
                <input
                  {...register('km', { required: true })}
                  type="number" step="1" min="0"
                  placeholder={lastKm != null ? String(Math.round(lastKm)) : '0'}
                  className={inp} style={inpSt}
                />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--clr-text-subtle)' }}>Observación</label>
                <input {...register('notes')} placeholder="Opcional" className={inp} style={inpSt} />
              </div>
            </div>
            {error && <p className="text-xs" style={{ color: 'var(--clr-danger)' }}>{error}</p>}
            <button
              onClick={handleSubmit(onSubmit)}
              disabled={registerKm.isPending}
              className="w-full py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"
              style={{ background: 'var(--clr-primary)', color: 'var(--clr-on-primary)' }}
            >
              {registerKm.isPending ? 'Guardando...' : 'Registrar lectura'}
            </button>
          </div>

          {/* History */}
          {!isLoading && data && data.logs.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--clr-text-subtle)' }}>Historial reciente</div>
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {data.logs.slice(0, 10).map((log) => (
                  <div key={log.id} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: 'var(--clr-surface)' }}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold" style={{ color: 'var(--clr-text)' }}>{Number(log.km).toLocaleString('es-PE')} km</span>
                      {log.notes && <span className="text-xs" style={{ color: 'var(--clr-text-subtle)' }}>{log.notes}</span>}
                    </div>
                    <span className="text-xs" style={{ color: 'var(--clr-text-subtle)' }}>
                      {new Date(log.recordedAt).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {isLoading && <div className="h-12 rounded-xl animate-pulse" style={{ background: 'var(--clr-surface)' }} />}
        </div>
      </div>
    </div>
  )
}

// ─── Lookup tables ─────────────────────────────────────────────────────────────

const equipmentTypeItems = [
  { id: 'CRANE',     primary: 'Grúa',        secondary: 'Izaje y elevación de cargas' },
  { id: 'PLATFORM',  primary: 'Plataforma',   secondary: 'Transporte de maquinaria' },
  { id: 'FORKLIFT',  primary: 'Montacargas',  secondary: 'Manejo de materiales' },
  { id: 'EXCAVATOR', primary: 'Excavadora',   secondary: 'Movimiento de tierra' },
  { id: 'OTHER',     primary: 'Otro',         secondary: 'Equipos especiales' },
]

const equipmentStatusItems = [
  { id: 'AVAILABLE',   primary: 'Disponible',    badge: '🟢' },
  { id: 'IN_USE',      primary: 'En uso',        badge: '🔵' },
  { id: 'MAINTENANCE', primary: 'Mantenimiento', badge: '🟡' },
  { id: 'RETIRED',     primary: 'Retirado',      badge: '⚫' },
]

const typePrefix: Record<string, string> = {
  CRANE: 'GR', PLATFORM: 'PL', FORKLIFT: 'MO', EXCAVATOR: 'EX', OTHER: 'OT',
}

const statusConfig: Record<string, { dot: string; label: string; context: string }> = {
  AVAILABLE:   { dot: 'var(--clr-success)', label: 'Disponible',            context: 'Ubicación' },
  IN_USE:      { dot: 'var(--clr-primary)', label: 'Alquilado',             context: 'Cliente actual' },
  MAINTENANCE: { dot: 'var(--clr-orange)',  label: 'En mantenimiento',       context: 'Taller' },
  RETIRED:     { dot: 'var(--clr-text-subtle)', label: 'Retirado',          context: 'Observación' },
}

const typeIconColor: Record<string, string> = {
  CRANE: 'var(--clr-primary)', PLATFORM: 'var(--clr-violet)', FORKLIFT: '#d97706',
  EXCAVATOR: 'var(--clr-danger)', OTHER: 'var(--clr-text-subtle)',
}

const fmt = (n: number) =>
  'S/ ' + n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ─── Modal ─────────────────────────────────────────────────────────────────────

function EquipmentModal({ eq, onClose }: { eq?: Equipment; onClose: () => void }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: eq ?? { currency: 'PEN', hourlyRate: 0, dailyRate: 0 },
  })
  const [equipType, setEquipType]     = useState(eq?.type   ?? 'CRANE')
  const [equipStatus, setEquipStatus] = useState(eq?.status ?? 'AVAILABLE')
  const create = useCreateEquipment()
  const update = useUpdateEquipment()

  const inp = 'w-full rounded-lg px-3 py-2 border text-sm focus:outline-none'
  const inpStyle = { background: 'var(--clr-surface)', borderColor: 'var(--clr-border)', color: 'var(--clr-text)' } as React.CSSProperties

  const onSubmit = async (data: any) => {
    const payload: Record<string, unknown> = {
      name:         data.name,
      brand:        data.brand  || undefined,
      model:        data.model  || undefined,
      serialNumber: data.serialNumber || undefined,
      capacity:     data.capacity || undefined,
      notes:        data.notes  || undefined,
      type:         equipType,
      status:       equipStatus,
      hourlyRate:   parseFloat(data.hourlyRate) || 0,
      dailyRate:    parseFloat(data.dailyRate)  || 0,
    }
    if (data.currentHours !== '' && data.currentHours != null) payload.currentHours = parseFloat(data.currentHours)
    if (data.odometerKm !== '' && data.odometerKm != null) payload.odometerKm = parseFloat(data.odometerKm)
    if (data.maintenanceIntervalKm !== '' && data.maintenanceIntervalKm != null) payload.maintenanceIntervalKm = parseFloat(data.maintenanceIntervalKm)
    if (eq) await update.mutateAsync({ id: eq.id, ...payload })
    else    await create.mutateAsync(payload)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="rounded-2xl p-6 w-full max-w-xl border" style={{ background: 'var(--clr-sidebar)', borderColor: 'var(--clr-border)' }}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--clr-text)' }}>{eq ? 'Editar Equipo' : 'Nuevo Equipo'}</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--clr-text-subtle)' }}>Completa los datos del equipo</p>
          </div>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--clr-text-subtle)' }}>Nombre <span className="text-red-400">*</span></label>
            <input {...register('name', { required: true })} placeholder="Ej. Grúa Telescópica 50T" className={inp} style={inpStyle} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--clr-text-subtle)' }}>Marca</label>
              <input {...register('brand')} placeholder="Liebherr, Manitowoc..." className={inp} style={inpStyle} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--clr-text-subtle)' }}>Modelo</label>
              <input {...register('model')} className={inp} style={inpStyle} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SearchableDropdown
              label="Tipo" required
              placeholder="Seleccionar tipo..."
              icon={Truck}
              items={equipmentTypeItems}
              value={equipType}
              onChange={(id) => setEquipType(id)}
            />
            <SearchableDropdown
              label="Estado" required
              placeholder="Seleccionar estado..."
              items={equipmentStatusItems}
              value={equipStatus}
              onChange={(id) => setEquipStatus(id)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--clr-text-subtle)' }}>N° Serie / Código</label>
              <input {...register('serialNumber')} placeholder="GR-001" className={inp} style={inpStyle} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--clr-text-subtle)' }}>Capacidad</label>
              <input {...register('capacity')} placeholder="50 toneladas" className={inp} style={inpStyle} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--clr-text-subtle)' }}>Horómetro actual (h)</label>
              <input {...register('currentHours')} type="number" step="1" placeholder="0" className={inp} style={inpStyle} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--clr-text-subtle)' }}>Tarifa / día (S/)</label>
              <input {...register('dailyRate')} type="number" step="0.01" className={inp} style={inpStyle} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--clr-text-subtle)' }}>Odómetro actual (km)</label>
              <input {...register('odometerKm')} type="number" step="1" min="0" placeholder="0" className={inp} style={inpStyle} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--clr-text-subtle)' }}>Intervalo mant. (km)</label>
              <input {...register('maintenanceIntervalKm')} type="number" step="1" min="0" placeholder="5000" className={inp} style={inpStyle} />
            </div>
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--clr-text-subtle)' }}>Tarifa / hora (S/)</label>
            <input {...register('hourlyRate')} type="number" step="0.01" className={inp} style={inpStyle} />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--clr-text-subtle)' }}>Notas / Ubicación actual</label>
            <input {...register('notes')} placeholder="Almacén central, obra..." className={inp} style={inpStyle} />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors" style={{ background: 'var(--clr-surface)', color: 'var(--clr-text-muted)', border: '1px solid var(--clr-border)' }}>
              Cancelar
            </button>
            <button type="submit" disabled={isSubmitting} className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-50" style={{ background: 'var(--clr-primary)', color: 'var(--clr-on-primary)' }}>
              {isSubmitting ? 'Guardando...' : eq ? 'Guardar cambios' : 'Registrar Equipo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── OT Preview Modal ──────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT:     { label: 'Borrador',   color: 'var(--clr-text-muted)', bg: 'var(--clr-sidebar)'    },
  SENT:      { label: 'Enviada',    color: 'var(--clr-primary)',     bg: 'var(--clr-primary-bg)' },
  ACCEPTED:  { label: 'Aceptada',   color: 'var(--clr-success)',     bg: 'var(--clr-success-bg)' },
  ACTIVE:    { label: 'En curso',   color: '#d97706',                bg: 'rgba(217,119,6,0.10)'  },
  COMPLETED: { label: 'Completada', color: 'var(--clr-success)',     bg: 'var(--clr-success-bg)' },
  BILLED:    { label: 'Facturada',  color: 'var(--clr-violet)',      bg: 'var(--clr-violet-bg)'  },
  PAID:      { label: 'Pagada',     color: 'var(--clr-success)',     bg: 'var(--clr-success-bg)' },
  CANCELLED: { label: 'Cancelada',  color: 'var(--clr-danger)',      bg: 'var(--clr-danger-bg)'  },
}

const BILLING_LABEL: Record<string, string> = { HOURLY: 'Por hora', DAILY: 'Por día', FIXED: 'Precio fijo' }

function OTPreviewModal({ wo, onClose }: { wo: WorkOrder; onClose: () => void }) {
  const fmt = (n: number) => 'S/ ' + n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const sc = STATUS_LABEL[wo.status] ?? STATUS_LABEL.DRAFT
  const totalCosts = wo.costs.reduce((s, c) => s + parseFloat(c.amount), 0)

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 16, width: 480, maxHeight: '85vh', overflow: 'auto', boxShadow: '0 24px 48px rgba(0,0,0,0.5)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--clr-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 700, color: 'var(--clr-primary)' }}>{wo.number}</span>
            <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: sc.bg, color: sc.color }}>{sc.label}</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-text-subtle)', padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Cliente + Operario */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ background: 'var(--clr-sidebar)', borderRadius: 10, padding: '10px 14px' }}>
              <div style={{ fontSize: 10, color: 'var(--clr-text-subtle)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cliente</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--clr-text)' }}>{wo.client.businessName}</div>
              <div style={{ fontSize: 11, color: 'var(--clr-text-subtle)', marginTop: 2 }}>RUC: {wo.client.ruc}</div>
            </div>
            <div style={{ background: 'var(--clr-sidebar)', borderRadius: 10, padding: '10px 14px' }}>
              <div style={{ fontSize: 10, color: 'var(--clr-text-subtle)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 4 }}><User size={10} /> Operario</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--clr-text)' }}>{wo.operator.name}</div>
            </div>
          </div>

          {/* Ubicación + Fechas */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ background: 'var(--clr-sidebar)', borderRadius: 10, padding: '10px 14px' }}>
              <div style={{ fontSize: 10, color: 'var(--clr-text-subtle)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={10} /> Ubicación</div>
              <div style={{ fontSize: 13, color: 'var(--clr-text)' }}>{wo.location || '—'}</div>
            </div>
            <div style={{ background: 'var(--clr-sidebar)', borderRadius: 10, padding: '10px 14px' }}>
              <div style={{ fontSize: 10, color: 'var(--clr-text-subtle)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 4 }}><Calendar size={10} /> Período</div>
              <div style={{ fontSize: 12, color: 'var(--clr-text)' }}>{wo.startDate.slice(0, 10)}</div>
              {wo.endDate && <div style={{ fontSize: 11, color: 'var(--clr-text-subtle)' }}>→ {wo.endDate.slice(0, 10)}</div>}
            </div>
          </div>

          {/* Facturación */}
          <div style={{ background: 'var(--clr-sidebar)', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 10, color: 'var(--clr-text-subtle)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 4 }}><CreditCard size={10} /> Facturación</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 12, color: 'var(--clr-text-muted)' }}>{BILLING_LABEL[wo.billingType]} · {parseFloat(wo.quantity).toLocaleString('es-PE')} unid.</span>
                <div style={{ fontSize: 11, color: 'var(--clr-text-subtle)', marginTop: 2 }}>Tarifa: {fmt(parseFloat(wo.unitRate))}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--clr-success)' }}>{fmt(parseFloat(wo.subtotal))}</div>
                <div style={{ fontSize: 10, color: 'var(--clr-text-subtle)' }}>Subtotal</div>
              </div>
            </div>
          </div>

          {/* Costos */}
          {wo.costs.length > 0 && (
            <div style={{ background: 'var(--clr-sidebar)', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 10, color: 'var(--clr-text-subtle)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Costos operativos</div>
              {wo.costs.map((c) => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: 'var(--clr-text-muted)' }}>{c.description || c.category}</span>
                  <span style={{ color: 'var(--clr-danger)', fontWeight: 600 }}>{fmt(parseFloat(c.amount))}</span>
                </div>
              ))}
              <div style={{ borderTop: '1px solid var(--clr-border)', marginTop: 6, paddingTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: 'var(--clr-text-subtle)' }}>Total costos</span>
                <span style={{ color: 'var(--clr-danger)', fontWeight: 700 }}>{fmt(totalCosts)}</span>
              </div>
            </div>
          )}

          {/* Margen */}
          <div style={{ background: 'var(--clr-sidebar)', borderRadius: 10, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--clr-text-subtle)' }}>Margen bruto estimado</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--clr-success)' }}>{fmt(parseFloat(wo.subtotal) - totalCosts)}</span>
          </div>

          {/* Factura vinculada */}
          {wo.invoice && (
            <div style={{ background: 'var(--clr-violet-bg)', border: '1px solid var(--clr-violet-border)', borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--clr-violet)', fontWeight: 600 }}>Factura vinculada</div>
                <div style={{ fontSize: 13, color: 'var(--clr-text)', marginTop: 2 }}>{wo.invoice.series}-{wo.invoice.number} · {fmt(parseFloat(wo.invoice.total))}</div>
              </div>
              <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'var(--clr-violet-bg)', color: 'var(--clr-violet)' }}>{wo.invoice.status}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Import Equipment Modal ─────────────────────────────────────────────────────
type EqImportOp = { action: 'update' | 'create'; displayName: string; fields: Record<string, unknown> }

function ImportEquipmentModal({ equipment, onClose }: { equipment: Equipment[]; onClose: () => void }) {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep]     = useState<'idle' | 'preview' | 'done'>('idle')
  const [loading, setLoading] = useState(false)
  const [ops, setOps]       = useState<EqImportOp[]>([])
  const [result, setResult] = useState<{ created: number; updated: number } | null>(null)
  const [error, setError]   = useState('')

  function downloadTemplate() {
    const header = 'nombre;marca;modelo;serie;tipo;capacidad;tarifa_hora;tarifa_dia;notas'
    const rows = equipment.map((e) =>
      [e.name, e.brand ?? '', e.model ?? '', e.serialNumber ?? '', e.type ?? '', e.capacity ?? '', e.hourlyRate ?? '', e.dailyRate ?? '', e.notes ?? ''].join(';')
    )
    const csv = [header, ...rows].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = 'plantilla_equipos.csv'; a.click()
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setError(''); setLoading(true)
    try {
      const text = await file.text()
      const { data } = await api.post('/equipment/import', { csv: text, preview: true })
      setOps(data.ops); setStep('preview')
    } catch (err: any) { setError(err?.response?.data?.message ?? 'Error al leer el archivo') }
    finally { setLoading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  async function handleConfirm() {
    setLoading(true)
    try {
      const lines = ['nombre;marca;modelo;serie;tipo;capacidad;tarifa_hora;tarifa_dia;notas']
      for (const op of ops) {
        const f = op.fields as any
        lines.push([f.name ?? '', f.brand ?? '', f.model ?? '', f.serialNumber ?? '', f.type ?? '', f.capacity ?? '', f.hourlyRate ?? '', f.dailyRate ?? '', f.notes ?? ''].join(';'))
      }
      const { data } = await api.post('/equipment/import', { csv: lines.join('\n') })
      setResult(data); setStep('done')
      qc.invalidateQueries({ queryKey: ['equipment'] })
    } catch (err: any) { setError(err?.response?.data?.message ?? 'Error al importar') }
    finally { setLoading(false) }
  }

  const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }
  const box: React.CSSProperties = { background: 'var(--clr-sidebar)', border: '1px solid var(--clr-border)', borderRadius: 16, width: '100%', maxWidth: 600, maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 48px rgba(0,0,0,0.18)' }
  const btnP: React.CSSProperties = { padding: '9px 18px', borderRadius: 8, background: 'var(--clr-primary)', border: 'none', color: 'var(--clr-on-primary)', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }
  const btnS: React.CSSProperties = { padding: '9px 18px', borderRadius: 8, background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', color: 'var(--clr-text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }

  return (
    <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={box}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--clr-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--clr-text)' }}>🚜 Importar Equipos en Masa</div>
            <div style={{ fontSize: 12, color: 'var(--clr-text-subtle)', marginTop: 2 }}>Carga o actualiza equipos desde un CSV. Identifica por nombre o número de serie.</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-text-subtle)', fontSize: 18 }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {step === 'idle' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { n: 1, title: 'Descargar plantilla', body: `Incluye los ${equipment.length} equipos actuales. Modifica o agrega nuevas filas.`, action: <button onClick={downloadTemplate} style={btnS}><Download size={13} /> Descargar plantilla CSV</button> },
                { n: 2, title: 'Completar en Excel', body: 'Rellena o modifica columnas: nombre, marca, modelo, serie, tipo (CRANE/FORKLIFT/TRUCK/VEHICLE/OTHER), capacidad, tarifa_hora, tarifa_dia.' },
                { n: 3, title: 'Subir el CSV', body: undefined, action: <><input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFile} /><button onClick={() => fileRef.current?.click()} style={btnP} disabled={loading}>{loading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={13} />}{loading ? 'Leyendo…' : 'Seleccionar archivo CSV'}</button></> },
              ].map(({ n, title, body, action }) => (
                <div key={n} style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--clr-text)', marginBottom: 8 }}>
                    <span style={{ display: 'inline-block', width: 22, height: 22, borderRadius: '50%', background: 'var(--clr-primary)', color: 'var(--clr-on-primary)', fontSize: 11, fontWeight: 800, textAlign: 'center', lineHeight: '22px', marginRight: 8 }}>{n}</span>{title}
                  </div>
                  {body && <p style={{ fontSize: 12, color: 'var(--clr-text-subtle)', margin: '0 0 10px 30px', lineHeight: 1.5 }}>{body}</p>}
                  {action && <div style={{ marginLeft: 30 }}>{action}</div>}
                </div>
              ))}
              {error && <div style={{ display: 'flex', gap: 8, padding: '10px 14px', background: 'var(--clr-danger-bg)', border: '1px solid var(--clr-danger-border)', borderRadius: 8, color: 'var(--clr-danger)', fontSize: 12 }}><AlertCircle size={14} />{error}</div>}
            </div>
          )}
          {step === 'preview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, background: 'var(--clr-success-bg)', color: 'var(--clr-success)', fontWeight: 700, border: '1px solid var(--clr-success-border)' }}>✓ {ops.filter(o=>o.action==='update').length} a actualizar</span>
                {ops.filter(o=>o.action==='create').length > 0 && <span style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, background: 'var(--clr-primary-bg)', color: 'var(--clr-primary)', fontWeight: 700, border: '1px solid var(--clr-primary-border)' }}>+ {ops.filter(o=>o.action==='create').length} a crear</span>}
              </div>
              <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '7px 14px', background: 'var(--clr-bg)', borderBottom: '1px solid var(--clr-border)', fontSize: 10, fontWeight: 700, color: 'var(--clr-text-subtle)', textTransform: 'uppercase', display: 'grid', gridTemplateColumns: '1fr 80px' }}>
                  <span>Equipo</span><span>Acción</span>
                </div>
                <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                  {ops.map((op, i) => (
                    <div key={i} style={{ padding: '8px 14px', borderBottom: '1px solid var(--clr-border)', display: 'grid', gridTemplateColumns: '1fr 80px', alignItems: 'center', fontSize: 12 }}>
                      <span style={{ color: 'var(--clr-text)', fontWeight: 600 }}>{op.displayName}</span>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, textAlign: 'center', fontWeight: 700, background: op.action === 'create' ? 'var(--clr-primary-bg)' : 'var(--clr-success-bg)', color: op.action === 'create' ? 'var(--clr-primary)' : 'var(--clr-success)' }}>{op.action === 'create' ? 'CREAR' : 'EDITAR'}</span>
                    </div>
                  ))}
                </div>
              </div>
              {error && <div style={{ display: 'flex', gap: 8, padding: '10px 14px', background: 'var(--clr-danger-bg)', border: '1px solid var(--clr-danger-border)', borderRadius: 8, color: 'var(--clr-danger)', fontSize: 12 }}><AlertCircle size={14} />{error}</div>}
            </div>
          )}
          {step === 'done' && result && (
            <div style={{ textAlign: 'center', padding: '32px 20px' }}>
              <CheckCircle size={52} style={{ color: 'var(--clr-success)', marginBottom: 16 }} />
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--clr-text)', marginBottom: 8 }}>¡Importación completada!</div>
              <div style={{ fontSize: 13, color: 'var(--clr-text-subtle)' }}><strong style={{ color: 'var(--clr-success)' }}>{result.updated}</strong> actualizados · <strong style={{ color: 'var(--clr-primary)' }}>{result.created}</strong> creados</div>
            </div>
          )}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--clr-border)', display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0 }}>
          {step === 'idle'    && <button onClick={onClose} style={btnS}>Cancelar</button>}
          {step === 'preview' && <><button onClick={() => { setStep('idle'); setOps([]) }} style={btnS}>← Volver</button><button onClick={handleConfirm} disabled={loading || !ops.length} style={{ ...btnP, opacity: !ops.length ? 0.5 : 1 }}>{loading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={13} />}{loading ? 'Guardando…' : `Confirmar (${ops.length})`}</button></>}
          {step === 'done'    && <button onClick={onClose} style={btnP}>Cerrar</button>}
        </div>
      </div>
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function EquipmentPage() {
  const { data: equipment = [], isLoading } = useEquipment()
  const { data: workOrders = [] } = useWorkOrders()
  const { data: activeSessions = [] } = useActiveSessions()
  const [modalOpen, setModalOpen]       = useState(false)
  const [editing, setEditing]           = useState<Equipment | undefined>()
  const [otPreview, setOtPreview]       = useState<WorkOrder | null>(null)
  const [searchParams] = useSearchParams()
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get('tab') ?? 'ALL')
  const [search, setSearch]             = useState('')
  const [quickMaintOpen, setQuickMaintOpen] = useState(false)
  const [odometerEq, setOdometerEq]         = useState<Equipment | null>(null)
  const [cerrarEq, setCerrarEq]             = useState<Equipment | null>(null)
  const [reportOpen, setReportOpen]         = useState(false)
  const storeQuery = useSearchStore((s) => s.query)
  const clearStore = useSearchStore((s) => s.clear)
  useEffect(() => { if (storeQuery) { setSearch(storeQuery); clearStore() } }, [storeQuery])
  const navigate = useNavigate()

  const getActiveOT = (equipmentId: string) =>
    workOrders.find((w) => w.equipmentId === equipmentId && !['COMPLETED', 'CANCELLED'].includes(w.status))

  const [importOpen, setImportOpen] = useState(false)

  const openEdit  = (eq: Equipment) => { setEditing(eq); setModalOpen(true) }
  const closeModal = () => { setEditing(undefined); setModalOpen(false) }

  const byStatus = (s: string) => equipment.filter((e) => e.status === s)
  const inUse    = byStatus('IN_USE').length
  const total    = equipment.length
  const pctOp    = total > 0 ? Math.round((inUse / total) * 100) : 0

  // Assign codes per type
  const typeCount: Record<string, number> = {}
  const withCode = equipment.map((eq) => {
    const p = typePrefix[eq.type] ?? 'EQ'
    typeCount[p] = (typeCount[p] ?? 0) + 1
    return { ...eq, code: eq.serialNumber || `${p}-${String(typeCount[p]).padStart(3, '0')}` }
  })

  const filtered = withCode.filter((e) => {
    const matchStatus = statusFilter === 'ALL' || e.status === statusFilter
    const q = search.toLowerCase()
    const matchSearch = !q ||
      e.name.toLowerCase().includes(q) ||
      (e.brand ?? '').toLowerCase().includes(q) ||
      (e.model ?? '').toLowerCase().includes(q) ||
      e.code.toLowerCase().includes(q)
    return matchStatus && matchSearch
  })

  const tabs = [
    { key: 'ALL',         label: 'Todos',         count: equipment.length },
    { key: 'AVAILABLE',   label: 'Disponibles',   count: byStatus('AVAILABLE').length },
    { key: 'IN_USE',      label: 'Alquilados',    count: byStatus('IN_USE').length },
    { key: 'MAINTENANCE', label: 'Mantenimiento', count: byStatus('MAINTENANCE').length },
    { key: 'RETIRED',     label: 'Retirados',     count: byStatus('RETIRED').length },
  ]

  return (
    <AppShell active="equipment" title="Equipos">
      <div className="p-8 space-y-6 max-w-[1400px]">

        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--clr-text)' }}>Equipos</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--clr-text-subtle)' }}>
              {total} unidades registradas · {pctOp}% en operación
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setImportOpen(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold"
              style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', color: 'var(--clr-text-muted)' }}
            >
              <Upload size={13} /> Importar
            </button>
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold"
              style={{ background: 'var(--clr-primary)', color: 'var(--clr-on-primary)' }}
            >
              <Plus size={15} /> Nuevo Equipo
            </button>
          </div>
        </div>

        {/* Filter tabs + Search */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--clr-sidebar)', border: '1px solid var(--clr-border)' }}>
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setStatusFilter(t.key)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{
                  background: statusFilter === t.key ? 'var(--clr-primary)' : 'transparent',
                  color: statusFilter === t.key ? 'var(--clr-on-primary)' : 'var(--clr-text-subtle)',
                  border: 'none',
                }}
              >
                {t.label}{' '}
                <span style={{
                  fontSize: 10, padding: '1px 5px', borderRadius: 10, marginLeft: 2,
                  background: statusFilter === t.key ? 'rgba(128,128,128,0.25)' : 'var(--clr-surface-hover)',
                  color: statusFilter === t.key ? 'var(--clr-on-primary)' : 'var(--clr-text-subtle)',
                }}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 px-3 py-2 rounded-xl ml-auto" style={{ background: 'var(--clr-sidebar)', border: '1px solid var(--clr-border)' }}>
            <Search size={13} style={{ color: 'var(--clr-text-subtle)' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por código, marca, tipo…"
              className="bg-transparent text-sm outline-none w-52"
              style={{ color: 'var(--clr-text)' }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ color: 'var(--clr-text-subtle)' }}>
                <XCircle size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Cards grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {[1,2,3,4,5,6].map((i) => (
              <div key={i} className="h-72 rounded-xl animate-pulse" style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)' }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 rounded-xl" style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)' }}>
            <Wrench size={36} className="mb-3" style={{ color: 'var(--clr-text-subtle)' }} />
            <p className="font-medium" style={{ color: 'var(--clr-text-subtle)' }}>No hay equipos en esta categoría</p>
            <p className="text-xs mt-1" style={{ color: 'var(--clr-text-subtle)' }}>Prueba con otro filtro o cambia la búsqueda</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filtered.map((eq) => {
              const cfg = statusConfig[eq.status] ?? statusConfig.RETIRED
              const hours = eq.currentHours ? parseFloat(eq.currentHours) : 0
              const iconColor = typeIconColor[eq.type] ?? 'var(--clr-text-subtle)'

              return (
                <div
                  key={eq.id}
                  className="flex flex-col gap-4 rounded-xl p-5"
                  style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)' }}
                >
                  {/* Header: icon + code */}
                  <div className="flex items-start justify-between">
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center"
                      style={{ background: 'var(--clr-primary-bg)', border: '1px solid var(--clr-primary-border)' }}
                    >
                      <Truck size={22} style={{ color: iconColor }} />
                    </div>
                    <span className="text-xs font-mono font-semibold" style={{ color: 'var(--clr-text-subtle)' }}>{eq.code}</span>
                  </div>

                  {/* Name + subtitle */}
                  <div>
                    <div className="font-bold text-lg leading-tight" style={{ color: 'var(--clr-text)' }}>{eq.name}</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--clr-text-subtle)' }}>
                      {[eq.brand, eq.model, eq.capacity].filter(Boolean).join(' · ')}
                    </div>
                  </div>

                  {/* Status dot */}
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: cfg.dot }} />
                    <span className="text-xs font-semibold" style={{ color: cfg.dot }}>{cfg.label}</span>
                  </div>

                  {/* Metrics 2×2 */}
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--clr-text-subtle)' }}>Horómetro</div>
                      <div className="text-sm font-bold" style={{ color: 'var(--clr-text)' }}>
                        {hours.toLocaleString('es-PE')} h
                      </div>
                    </div>
                    <div>
                      <div
                        className="text-[10px] font-semibold uppercase tracking-wider mb-1"
                        style={{ color: eq.status === 'MAINTENANCE' ? 'var(--clr-orange)' : 'var(--clr-text-subtle)' }}
                      >
                        {eq.status === 'MAINTENANCE' ? 'En taller' : 'Próx. Mant.'}
                      </div>
                      <div
                        className="text-sm font-bold"
                        style={{ color: eq.status === 'MAINTENANCE' ? 'var(--clr-orange)' : 'var(--clr-text)' }}
                      >
                        {eq.status === 'MAINTENANCE' ? 'Activo' : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--clr-text-subtle)' }}>Tarifa/día</div>
                      <div className="text-sm font-bold" style={{ color: 'var(--clr-text)' }}>
                        {fmt(Number(eq.dailyRate))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--clr-text-subtle)' }}>
                        {cfg.context}
                      </div>
                      <div className="text-sm font-bold" style={{ color: 'var(--clr-text)' }}>
                        {eq.notes ? eq.notes.split(',')[0].trim() : '—'}
                      </div>
                    </div>
                  </div>

                  {/* Odometer indicator */}
                  {eq.odometerKm && (
                    <div className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: 'var(--clr-sidebar)', border: `1px solid ${(() => { const rem = eq.nextMaintenanceKm ? Number(eq.nextMaintenanceKm) - Number(eq.odometerKm) : null; return rem != null && rem < 500 ? 'rgba(249,115,22,0.4)' : 'var(--clr-border)' })()}` }}>
                      <div className="flex items-center gap-2">
                        <Gauge size={12} style={{ color: 'var(--clr-primary-lt)' }} />
                        <span className="text-xs font-semibold" style={{ color: 'var(--clr-text-muted)' }}>
                          {Number(eq.odometerKm).toLocaleString('es-PE')} km
                        </span>
                      </div>
                      {eq.nextMaintenanceKm && (() => {
                        const rem = Number(eq.nextMaintenanceKm) - Number(eq.odometerKm)
                        const alert = rem < 500
                        return (
                          <span className="text-xs font-semibold" style={{ color: alert ? 'var(--clr-orange)' : rem > 0 ? 'var(--clr-success)' : 'var(--clr-danger)' }}>
                            {rem > 0 ? `${rem.toLocaleString('es-PE')} km para mant.` : '¡Mantenimiento ya!'}
                          </span>
                        )
                      })()}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-2 border-t" style={{ borderColor: 'var(--clr-border)' }}>
                    <button
                      onClick={() => openEdit(eq)}
                      className="px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
                      style={{ background: 'var(--clr-surface-hover)', border: '1px solid var(--clr-border)', color: 'var(--clr-text-muted)' }}
                    >
                      Ver ficha
                    </button>
                    <button
                      className="px-3 py-2 rounded-lg text-xs font-semibold"
                      style={{ background: 'var(--clr-surface-hover)', border: '1px solid var(--clr-border)', color: 'var(--clr-text-muted)' }}
                    >
                      Historial
                    </button>
                    {eq.maintenanceIntervalKm && (
                      <button
                        onClick={() => setOdometerEq(eq)}
                        className="px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1"
                        style={{ background: 'var(--clr-primary-bg)', color: 'var(--clr-primary-lt)', border: '1px solid var(--clr-primary-border)' }}
                      >
                        <Gauge size={11} /> km
                      </button>
                    )}

                    {eq.status === 'AVAILABLE' && (
                      <button
                        onClick={() => navigate('/quotes', { state: { preselect: { equipmentId: eq.id, equipmentName: eq.name } } })}
                        className="px-3 py-2 rounded-lg text-xs font-bold ml-auto"
                        style={{ background: 'var(--clr-primary-dk)', color: 'var(--clr-on-primary)' }}
                      >
                        Cotizar
                      </button>
                    )}
                    {eq.status === 'IN_USE' && (() => {
                      const ot = getActiveOT(eq.id)
                      return ot ? (
                        <button
                          onClick={() => setOtPreview(ot)}
                          className="px-3 py-2 rounded-lg text-xs font-semibold ml-auto"
                          style={{ background: 'var(--clr-primary-bg)', color: 'var(--clr-primary-lt)', border: '1px solid var(--clr-primary-border)', cursor: 'pointer' }}
                        >
                          Ver OT {ot.number}
                        </button>
                      ) : (
                        <span
                          className="ml-auto px-3 py-2 rounded-lg text-xs font-semibold"
                          style={{ background: 'rgba(217,119,6,0.10)', color: '#d97706', border: '1px solid rgba(217,119,6,0.25)' }}
                          title="Estado marcado manualmente sin OT vinculada"
                        >
                          Sin OT
                        </span>
                      )
                    })()}
                    {eq.status === 'MAINTENANCE' && (() => {
                      const ot = getActiveOT(eq.id)
                      const activeSession = activeSessions.find((s) => s.equipmentId === eq.id)
                      return (
                        <div className="ml-auto flex gap-1.5">
                          {ot && (
                            <button
                              onClick={() => setOtPreview(ot)}
                              className="px-3 py-2 rounded-lg text-xs font-semibold"
                              style={{ background: 'var(--clr-orange-bg)', color: 'var(--clr-orange)', border: '1px solid var(--clr-orange-border)' }}
                            >
                              OT {ot.number}
                            </button>
                          )}
                          {activeSession ? (
                            <button
                              onClick={() => setCerrarEq(eq)}
                              className="px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1"
                              style={{ background: 'var(--clr-success-bg)', color: 'var(--clr-success)', border: '1px solid var(--clr-success-border)' }}
                            >
                              <Wrench size={11} /> Cerrar taller
                            </button>
                          ) : (
                            <button
                              onClick={() => navigate('/maintenance')}
                              className="px-3 py-2 rounded-lg text-xs font-semibold"
                              style={{ background: 'var(--clr-orange-bg)', color: 'var(--clr-orange)', border: '1px solid var(--clr-orange-border)' }}
                            >
                              Ver mant.
                            </button>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                </div>
              )
            })}

            {/* Add card — solo visible fuera del filtro MAINTENANCE */}
            {statusFilter !== 'MAINTENANCE' && (
              <button
                onClick={() => setModalOpen(true)}
                className="flex flex-col items-center justify-center gap-3 rounded-xl p-5 min-h-[280px] transition-all"
                style={{ border: '2px dashed var(--clr-border)', color: 'var(--clr-text-subtle)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--clr-primary)'
                  e.currentTarget.style.background = 'var(--clr-surface-hover)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--clr-border)'
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{
                  background: 'var(--clr-sidebar)', border: '1px solid var(--clr-border)',
                }}>
                  <Plus size={20} style={{ color: 'var(--clr-text-subtle)' }} />
                </div>
                <span className="text-sm font-medium" style={{ color: 'var(--clr-text-subtle)' }}>Agregar equipo</span>
              </button>
            )}
          </div>
        )}
      </div>

      {modalOpen      && <EquipmentModal key={editing?.id ?? 'new'} eq={editing} onClose={closeModal} />}
      {otPreview      && <OTPreviewModal wo={otPreview} onClose={() => setOtPreview(null)} />}
      {quickMaintOpen && <QuickMaintenanceModal onClose={() => setQuickMaintOpen(false)} />}
      {odometerEq     && <OdometerModal key={odometerEq.id} eq={odometerEq} onClose={() => setOdometerEq(null)} />}
      {importOpen     && <ImportEquipmentModal equipment={equipment} onClose={() => setImportOpen(false)} />}
      {cerrarEq       && (() => {
        const session = activeSessions.find((s) => s.equipmentId === cerrarEq.id)
        return session
          ? <CerrarMantenimientoModal session={session} eq={cerrarEq} onClose={() => setCerrarEq(null)} />
          : null
      })()}
      {reportOpen     && <MaintenanceReportModal onClose={() => setReportOpen(false)} />}
    </AppShell>
  )
}
