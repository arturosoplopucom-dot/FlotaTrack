import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSearchStore } from '../store/search.store'
import { useForm } from 'react-hook-form'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Wrench, AlertTriangle, CheckCircle, Clock, Plus, Trash2,
  ChevronDown, ChevronUp, Calendar, Gauge, Search,
  Play, Flag, X, Timer,
} from 'lucide-react'
import {
  useMaintenancePlans, useMaintenanceSummary, useMaintenanceRecords,
  useCreatePlan, useUpdatePlan, useDeletePlan, useCreateRecord, useDeleteRecord,
  useStartSession, useCompleteSession, useCancelSession,
  type MaintenancePlan, type MaintenanceInterval, type MaintenanceSession,
} from '../hooks/useMaintenance'
import { useEquipment } from '../hooks/useFlota'
import AppShell from '../components/AppShell'
import { SearchableDropdown } from '../components/SearchableDropdown'

const fmtDate = (iso?: string | null) =>
  iso ? format(parseISO(iso), 'dd MMM yyyy', { locale: es }) : '—'
const fmtCost = (n: string | number) =>
  'S/ ' + Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2 })

const URGENCY: Record<string, { borderColor: string; dotColor: string; badgeBg: string; badgeText: string; label: string }> = {
  OVERDUE:  { borderColor: 'var(--clr-danger)', dotColor: 'var(--clr-danger)', badgeBg: 'var(--clr-danger-bg)',  badgeText: 'var(--clr-danger)', label: 'Vencido' },
  DUE_SOON: { borderColor: '#d97706', dotColor: '#d97706', badgeBg: 'rgba(217,119,6,0.10)', badgeText: '#d97706', label: 'Próximo' },
  OK:       { borderColor: 'var(--clr-success)', dotColor: 'var(--clr-success)', badgeBg: 'var(--clr-success-bg)',  badgeText: 'var(--clr-success)', label: 'Al día' },
}

const INTERVAL_LABELS: Record<MaintenanceInterval, string> = {
  DATE:  'Por fecha',
  HOURS: 'Por horómetro',
  BOTH:  'Fecha y horómetro',
  KM:    'Por km',
}

const EQUIP_TYPE_LABEL: Record<string, string> = {
  CRANE: 'Grúa', PLATFORM: 'Plataforma', FORKLIFT: 'Montacargas',
  EXCAVATOR: 'Excavadora', OTHER: 'Otro',
}

// ─── Modal Plan ───────────────────────────────────────────────────────────────
function PlanModal({ plan, onClose }: { plan?: MaintenancePlan; onClose: () => void }) {
  const { data: equipment = [] } = useEquipment()
  const create = useCreatePlan()
  const update = useUpdatePlan()

  const [equipmentId, setEquipmentId] = useState(plan?.equipmentId ?? '')
  const [intervalType, setIntervalType] = useState<MaintenanceInterval>(plan?.intervalType ?? 'DATE')
  const [error, setError] = useState('')

  const { register, handleSubmit, setValue } = useForm({
    defaultValues: {
      name:             plan?.name ?? '',
      description:      plan?.description ?? '',
      intervalDays:     plan?.intervalDays ?? '',
      intervalHours:    plan?.intervalHours ?? '',
      intervalKm:       plan?.intervalKm ?? '',
      lastServiceAt:    plan?.lastServiceAt?.slice(0, 10) ?? '',
      lastServiceHours: plan?.lastServiceHours ?? '',
      lastServiceKm:    plan?.lastServiceKm ?? '',
    },
  })

  // Auto-fill km fields from equipment data when creating a new plan
  useEffect(() => {
    if (plan || intervalType !== 'KM' || !equipmentId) return
    const eq = equipment.find((e) => e.id === equipmentId)
    if (!eq) return
    if (eq.maintenanceIntervalKm) setValue('intervalKm', eq.maintenanceIntervalKm)
    setValue('lastServiceKm', eq.odometerKm ?? '0')
  }, [equipmentId, intervalType])

  const equipItems = equipment.map((e) => ({
    id: e.id, primary: e.name,
    secondary: `${EQUIP_TYPE_LABEL[e.type] ?? e.type} · ${Number(e.currentHours ?? 0).toFixed(0)}h`,
  }))

  const inp = 'w-full rounded-lg px-3 py-2 text-sm focus:outline-none'
  const inpSt: React.CSSProperties = { background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', color: 'var(--clr-text)' }

  const onSubmit = async (data: any) => {
    if (!equipmentId) { setError('Selecciona un equipo'); return }
    if (intervalType === 'DATE'  && !data.intervalDays)  { setError('Indica el intervalo en días'); return }
    if (intervalType === 'HOURS' && !data.intervalHours) { setError('Indica el intervalo en horas'); return }
    if (intervalType === 'BOTH'  && (!data.intervalDays || !data.intervalHours)) { setError('Indica el intervalo en días y horas'); return }
    if (intervalType === 'KM'    && !data.intervalKm)    { setError('Indica el intervalo en km'); return }
    setError('')

    const payload = {
      equipmentId,
      name: data.name,
      description: data.description || undefined,
      intervalType,
      intervalDays:     intervalType !== 'HOURS' && intervalType !== 'KM' ? Number(data.intervalDays) : undefined,
      intervalHours:    intervalType !== 'DATE'  && intervalType !== 'KM' ? Number(data.intervalHours) : undefined,
      intervalKm:       intervalType === 'KM' ? Number(data.intervalKm) : undefined,
      lastServiceAt:    intervalType !== 'HOURS' && intervalType !== 'KM' ? data.lastServiceAt || undefined : undefined,
      lastServiceHours: intervalType !== 'DATE'  && intervalType !== 'KM' ? (data.lastServiceHours ? Number(data.lastServiceHours) : undefined) : undefined,
      lastServiceKm:    intervalType === 'KM' ? (data.lastServiceKm ? Number(data.lastServiceKm) : undefined) : undefined,
    }

    if (plan) await update.mutateAsync({ id: plan.id, ...payload })
    else       await create.mutateAsync(payload)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="rounded-2xl w-full max-w-lg" style={{ background: 'var(--clr-sidebar)', border: '1px solid var(--clr-border)' }}>
        <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--clr-border)' }}>
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--clr-text)' }}>{plan ? 'Editar plan' : 'Nuevo plan de mantenimiento'}</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--clr-text-subtle)' }}>Define el intervalo y equipo</p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <SearchableDropdown
            label="Equipo *"
            placeholder="Buscar equipo..."
            items={equipItems}
            value={equipmentId}
            onChange={setEquipmentId}
          />

          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--clr-text-subtle)" }}>Nombre del mantenimiento *</label>
            <input {...register('name', { required: true })} placeholder="Ej: Cambio de aceite, Revisión de frenos..." className={inp} style={inpSt} />
          </div>

          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--clr-text-subtle)" }}>Descripción</label>
            <input {...register('description')} placeholder="Detalles adicionales..." className={inp} style={inpSt} />
          </div>

          <div>
            <label className="text-xs mb-2 block" style={{ color: "var(--clr-text-subtle)" }}>Tipo de intervalo</label>
            <div className="grid grid-cols-2 gap-2">
              {(['DATE', 'HOURS', 'BOTH', 'KM'] as MaintenanceInterval[]).map((t) => (
                <button
                  key={t} type="button"
                  onClick={() => setIntervalType(t)}
                  style={{ padding: "8px", fontSize: 12, borderRadius: 8, fontWeight: 500, background: intervalType === t ? "var(--clr-primary)" : "var(--clr-surface-hover)", color: intervalType === t ? "var(--clr-on-primary)" : "var(--clr-text-subtle)", border: `1px solid ${intervalType === t ? "var(--clr-primary)" : "var(--clr-border)"}` }}
                >
                  {INTERVAL_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {(intervalType === 'DATE' || intervalType === 'BOTH') && (
              <div>
                <label className="text-xs mb-1 block flex items-center gap-1" style={{ color: "var(--clr-text-subtle)" }}>
                  <Calendar size={11} /> Cada (días) *
                </label>
                <input {...register('intervalDays')} type="number" min="1" placeholder="30" className={inp} style={inpSt} />
              </div>
            )}
            {(intervalType === 'HOURS' || intervalType === 'BOTH') && (
              <div>
                <label className="text-xs mb-1 block flex items-center gap-1" style={{ color: "var(--clr-text-subtle)" }}>
                  <Gauge size={11} /> Cada (horas) *
                </label>
                <input {...register('intervalHours')} type="number" min="1" placeholder="250" className={inp} style={inpSt} />
              </div>
            )}
            {intervalType === 'KM' && (
              <div>
                <label className="text-xs mb-1 block flex items-center gap-1" style={{ color: "var(--clr-text-subtle)" }}>
                  <Gauge size={11} /> Cada (km) *
                </label>
                <input {...register('intervalKm')} type="number" min="1" placeholder="5000" className={inp} style={inpSt} />
              </div>
            )}
          </div>

          <div className="rounded-xl p-3 space-y-3" style={{ background: "var(--clr-surface)" }}>
            <p className="text-xs font-semibold" style={{ color: "var(--clr-text-subtle)" }}>Último mantenimiento realizado (opcional)</p>
            <div className="grid grid-cols-2 gap-3">
              {(intervalType === 'DATE' || intervalType === 'BOTH') && (
                <div>
                  <label className="text-xs mb-1 block" style={{ color: "var(--clr-text-subtle)" }}>Fecha</label>
                  <input {...register('lastServiceAt')} type="date" className={inp} style={inpSt} />
                </div>
              )}
              {(intervalType === 'HOURS' || intervalType === 'BOTH') && (
                <div>
                  <label className="text-xs mb-1 block" style={{ color: "var(--clr-text-subtle)" }}>Horómetro (horas)</label>
                  <input {...register('lastServiceHours')} type="number" step="0.1" min="0" placeholder="0" className={inp} style={inpSt} />
                </div>
              )}
              {intervalType === 'KM' && (
                <div>
                  <label className="text-xs mb-1 block" style={{ color: "var(--clr-text-subtle)" }}>Odómetro último mant. (km)</label>
                  <input {...register('lastServiceKm')} type="number" step="1" min="0" placeholder="0" className={inp} style={inpSt} />
                </div>
              )}
            </div>
          </div>

          {error && <p className="text-xs text-red-400 bg-red-950/50 border border-red-800 rounded-lg px-3 py-2">{error}</p>}
        </form>

        <div className="flex gap-3 p-5" style={{ borderTop: "1px solid var(--clr-border)" }}>
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm" style={{ background: "var(--clr-surface-hover)", color: "var(--clr-text)", border: "1px solid var(--clr-border)" }}>Cancelar</button>
          <button onClick={handleSubmit(onSubmit)} disabled={create.isPending || update.isPending} className="flex-1 disabled:opacity-50 py-2.5 rounded-xl text-sm font-bold" style={{ background: "var(--clr-primary)", color: "var(--clr-on-primary)" }}>
            {(create.isPending || update.isPending) ? 'Guardando…' : plan ? 'Guardar' : 'Crear plan'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal Registro ───────────────────────────────────────────────────────────
function RecordModal({ plan, onClose }: { plan: MaintenancePlan; onClose: () => void }) {
  const create = useCreateRecord()
  const [error, setError] = useState('')

  const { register, handleSubmit } = useForm({
    defaultValues: {
      performedAt: format(new Date(), 'yyyy-MM-dd'),
      hoursAtService: plan.equipment.currentHours ? Number(plan.equipment.currentHours).toFixed(1) : '',
      technician: '',
      description: plan.name,
      cost: '',
      notes: '',
      updateEquipmentHours: true,
    },
  })

  const onSubmit = async (data: any) => {
    if (!data.performedAt) { setError('La fecha es obligatoria'); return }
    setError('')
    await create.mutateAsync({
      equipmentId: plan.equipmentId,
      planId: plan.id,
      performedAt: data.performedAt,
      hoursAtService: data.hoursAtService ? Number(data.hoursAtService) : undefined,
      technician: data.technician || undefined,
      description: data.description || undefined,
      cost: data.cost ? Number(data.cost) : 0,
      notes: data.notes || undefined,
      updateEquipmentHours: data.updateEquipmentHours,
    })
    onClose()
  }

  const inp = 'w-full rounded-lg px-3 py-2 text-sm focus:outline-none'
  const inpSt: React.CSSProperties = { background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', color: 'var(--clr-text)' }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="rounded-2xl w-full max-w-md" style={{ background: 'var(--clr-sidebar)', border: '1px solid var(--clr-border)' }}>
        <div className="p-5" style={{ borderBottom: '1px solid var(--clr-border)' }}>
          <h2 className="text-lg font-bold" style={{ color: 'var(--clr-text)' }}>Registrar mantenimiento</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--clr-text-subtle)' }}>{plan.name} · {plan.equipment.name}</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: "var(--clr-text-subtle)" }}>Fecha realizado *</label>
              <input {...register('performedAt', { required: true })} type="date" className={inp} style={inpSt} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: "var(--clr-text-subtle)" }}>Horómetro actual</label>
              <input {...register('hoursAtService')} type="number" step="0.1" min="0" className={inp} style={inpSt} />
            </div>
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--clr-text-subtle)" }}>Técnico / Taller</label>
            <input {...register('technician')} placeholder="Nombre del técnico o taller" className={inp} style={inpSt} />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--clr-text-subtle)" }}>Descripción del trabajo</label>
            <input {...register('description')} className={inp} style={inpSt} />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--clr-text-subtle)" }}>Costo (S/)</label>
            <input {...register('cost')} type="number" step="0.01" min="0" placeholder="0.00" className={inp} style={inpSt} />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--clr-text-subtle)" }}>Observaciones</label>
            <textarea {...register('notes')} rows={2} className={`${inp} resize-none`} />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--clr-text-muted)" }}>
            <input {...register('updateEquipmentHours')} type="checkbox" className="rounded" />
            Actualizar horómetro del equipo
          </label>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </form>

        <div className="flex gap-3 p-5" style={{ borderTop: "1px solid var(--clr-border)" }}>
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm" style={{ background: "var(--clr-surface-hover)", color: "var(--clr-text)", border: "1px solid var(--clr-border)" }}>Cancelar</button>
          <button onClick={handleSubmit(onSubmit)} disabled={create.isPending} className="flex-1 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-bold">
            {create.isPending ? 'Guardando…' : 'Registrar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal Inicio de Mantenimiento ───────────────────────────────────────────
const LS_TECH = 'ft_last_technician'

function StartSessionModal({ plan, onClose }: { plan: MaintenancePlan; onClose: () => void }) {
  const startSession = useStartSession()
  const [error, setError] = useState('')

  const lastTech = (() => { try { return localStorage.getItem(LS_TECH) ?? '' } catch { return '' } })()
  const defaultEnd = plan.intervalDays
    ? format(new Date(Date.now() + Math.max(1, Math.round(plan.intervalDays * 0.05)) * 86400000), 'yyyy-MM-dd')
    : ''

  const { register, handleSubmit } = useForm({
    defaultValues: {
      startedAt:       format(new Date(), 'yyyy-MM-dd'),
      estimatedEnd:    defaultEnd,
      technician:      lastTech,
      workDescription: plan.name,
      estimatedCost:   '',
    },
  })

  const inp = 'w-full rounded-lg px-3 py-2 text-sm focus:outline-none'
  const inpSt: React.CSSProperties = { background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', color: 'var(--clr-text)' }

  const onSubmit = async (data: any) => {
    setError('')
    try {
      await startSession.mutateAsync({
        equipmentId:     plan.equipmentId,
        planId:          plan.id,
        startedAt:       data.startedAt,
        estimatedEnd:    data.estimatedEnd    || undefined,
        technician:      data.technician      || undefined,
        workDescription: data.workDescription || undefined,
        estimatedCost:   data.estimatedCost ? Number(data.estimatedCost) : undefined,
      })
      try { if (data.technician) localStorage.setItem(LS_TECH, data.technician) } catch {}
      onClose()
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Error al iniciar')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
      <div className="rounded-2xl w-full max-w-md" style={{ background: "var(--clr-sidebar)", border: "1px solid rgba(249,115,22,0.3)" }}>
        {/* Header */}
        <div className="flex items-center gap-3 p-5" style={{ borderBottom: "1px solid var(--clr-border)" }}>
          <div className="w-10 h-10 rounded-xl bg-orange-500/15 flex items-center justify-center flex-shrink-0">
            <Play size={18} className="text-orange-400" />
          </div>
          <div className="flex-1">
            <h2 style={{ color: "var(--clr-text)", fontSize: 15, fontWeight: 700 }}>Enviar a mantenimiento</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--clr-text-subtle)" }}>{plan.name} · {plan.equipment.name}</p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clr-text-subtle)", padding: 4 }}><X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: "var(--clr-text-subtle)" }}>Fecha inicio *</label>
              <input {...register('startedAt', { required: true })} type="date" className={inp} style={inpSt} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: "var(--clr-text-subtle)" }}>Fin estimado</label>
              <input {...register('estimatedEnd')} type="date" className={inp} style={inpSt} />
            </div>
          </div>

          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--clr-text-subtle)" }}>Técnico / Taller *</label>
            <input {...register('technician')} placeholder="Ej: Taller Komatsu Lima" className={inp} style={inpSt} />
          </div>

          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--clr-text-subtle)" }}>Trabajo a realizar</label>
            <input {...register('workDescription')} className={inp} style={inpSt} />
          </div>

          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--clr-text-subtle)" }}>Costo estimado (S/)</label>
            <input {...register('estimatedCost')} type="number" step="0.01" min="0" placeholder="0.00" className={inp} style={inpSt} />
          </div>

          {/* Aviso: equipo pasará a MANTENIMIENTO */}
          <div className="flex items-start gap-2 bg-orange-950/40 border border-orange-800/40 rounded-lg p-3">
            <AlertTriangle size={14} className="text-orange-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-orange-300">
              El equipo <strong>{plan.equipment.name}</strong> cambiará su estado a{' '}
              <strong>EN MANTENIMIENTO</strong> y no estará disponible hasta que se registre el cierre.
            </p>
          </div>

          {error && <p className="text-xs text-red-400 bg-red-950/50 border border-red-800 rounded-lg px-3 py-2">{error}</p>}
        </form>

        <div className="flex gap-3 p-5" style={{ borderTop: "1px solid var(--clr-border)" }}>
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm" style={{ background: "var(--clr-surface-hover)", color: "var(--clr-text)", border: "1px solid var(--clr-border)" }}>Cancelar</button>
          <button
            onClick={handleSubmit(onSubmit)}
            disabled={startSession.isPending}
            className="flex-1 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
          >
            <Play size={14} />
            {startSession.isPending ? 'Iniciando…' : 'Iniciar mantenimiento'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal Cierre de Mantenimiento ────────────────────────────────────────────
function CompleteSessionModal({ plan, session, onClose }: { plan: MaintenancePlan; session: MaintenanceSession; onClose: () => void }) {
  const completeSession = useCompleteSession()
  const cancelSession   = useCancelSession()
  const [error, setError] = useState('')
  const currentHours = Number(plan.equipment.currentHours ?? 0)

  const { register, handleSubmit } = useForm({
    defaultValues: {
      completedAt:    format(new Date(), 'yyyy-MM-dd'),
      hoursAtClose:   currentHours > 0 ? String(currentHours) : '',
      actualCost:     session.estimatedCost ? String(session.estimatedCost) : '',
      completionNotes: '',
      updateEquipmentHours: true,
    },
  })

  const inp = 'w-full rounded-lg px-3 py-2 text-sm focus:outline-none'
  const inpSt: React.CSSProperties = { background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', color: 'var(--clr-text)' }

  const daysSince = Math.round((Date.now() - new Date(session.startedAt).getTime()) / 86400000)

  const onSubmit = async (data: any) => {
    setError('')
    try {
      await completeSession.mutateAsync({
        sessionId:           session.id,
        completedAt:         data.completedAt,
        hoursAtClose:        data.hoursAtClose ? Number(data.hoursAtClose) : undefined,
        actualCost:          data.actualCost   ? Number(data.actualCost)   : 0,
        completionNotes:     data.completionNotes || undefined,
        technician:          session.technician || undefined,
        updateEquipmentHours: data.updateEquipmentHours,
      })
      onClose()
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Error al cerrar')
    }
  }

  const handleCancel = async () => {
    if (!confirm('¿Cancelar el mantenimiento? El equipo volverá a DISPONIBLE sin registrar trabajo.')) return
    try {
      await cancelSession.mutateAsync(session.id)
      onClose()
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Error al cancelar')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
      <div className="rounded-2xl w-full max-w-md" style={{ background: "var(--clr-sidebar)", border: "1px solid rgba(34,197,94,0.3)" }}>
        {/* Header */}
        <div className="flex items-center gap-3 p-5" style={{ borderBottom: "1px solid var(--clr-border)" }}>
          <div className="w-10 h-10 rounded-xl bg-green-500/15 flex items-center justify-center flex-shrink-0">
            <Flag size={18} className="text-green-400" />
          </div>
          <div className="flex-1">
            <h2 style={{ color: "var(--clr-text)", fontSize: 15, fontWeight: 700 }}>Cerrar mantenimiento</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--clr-text-subtle)" }}>{plan.name} · {plan.equipment.name}</p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clr-text-subtle)", padding: 4 }}><X size={18} />
          </button>
        </div>

        {/* Resumen de la sesión activa */}
        <div className="mx-5 mt-4 bg-orange-950/30 border border-orange-800/40 rounded-xl p-3 flex items-center gap-3">
          <Timer size={16} className="text-orange-400 flex-shrink-0" />
          <div>
            <p className="text-xs font-semibold text-orange-300">
              En mantenimiento desde {fmtDate(session.startedAt)}
              {daysSince > 0 && ` · ${daysSince} día${daysSince !== 1 ? 's' : ''}`}
            </p>
            {session.technician && (
              <p className="text-xs text-orange-400/70 mt-0.5">Técnico: {session.technician}</p>
            )}
            {session.workDescription && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--clr-text-subtle)' }}>{session.workDescription}</p>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: "var(--clr-text-subtle)" }}>Fecha de cierre *</label>
              <input {...register('completedAt', { required: true })} type="date" className={inp} style={inpSt} />
            </div>
            <div>
              <label className="text-xs mb-1 block flex items-center gap-1" style={{ color: "var(--clr-text-subtle)" }}>
                <Gauge size={10} /> Horómetro al cierre
              </label>
              <input {...register('hoursAtClose')} type="number" step="0.1" min="0" placeholder={String(currentHours)} className={inp} style={inpSt} />
            </div>
          </div>

          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--clr-text-subtle)" }}>Costo real (S/)</label>
            <input {...register('actualCost')} type="number" step="0.01" min="0" placeholder="0.00" className={inp} style={inpSt} />
            {session.estimatedCost && (
              <p className="text-xs mt-1" style={{ color: "var(--clr-text-subtle)" }}>Estimado: S/ {Number(session.estimatedCost).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</p>
            )}
          </div>

          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--clr-text-subtle)" }}>Trabajos realizados / Observaciones</label>
            <textarea {...register('completionNotes')} rows={3} placeholder="Detalla los trabajos ejecutados, piezas reemplazadas, observaciones..." className={`${inp} resize-none`} />
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--clr-text-muted)" }}>
            <input {...register('updateEquipmentHours')} type="checkbox" className="rounded" />
            Actualizar horómetro del equipo con el valor ingresado
          </label>

          {error && <p className="text-xs text-red-400 bg-red-950/50 border border-red-800 rounded-lg px-3 py-2">{error}</p>}
        </form>

        <div className="flex gap-3 p-5" style={{ borderTop: "1px solid var(--clr-border)" }}>
          <button
            type="button"
            onClick={handleCancel}
            disabled={cancelSession.isPending}
            className="py-2.5 px-4 rounded-xl text-sm transition-colors" style={{ background: "var(--clr-surface-hover)", color: "var(--clr-text-subtle)", border: "1px solid var(--clr-border)" }} onMouseEnter={(e) => { e.currentTarget.style.background="rgba(239,68,68,0.1)"; e.currentTarget.style.color="#f87171"; e.currentTarget.style.borderColor="rgba(239,68,68,0.4)" }} onMouseLeave={(e) => { e.currentTarget.style.background="var(--clr-surface-hover)"; e.currentTarget.style.color="var(--clr-text-subtle)"; e.currentTarget.style.borderColor="var(--clr-border)" }}
            title="Cancelar mantenimiento sin registrar trabajo"
          >
            Cancelar mant.
          </button>
          <button
            onClick={handleSubmit(onSubmit)}
            disabled={completeSession.isPending}
            className="flex-1 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
          >
            <Flag size={14} />
            {completeSession.isPending ? 'Cerrando…' : 'Cerrar y liberar equipo'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── PlanCard ─────────────────────────────────────────────────────────────────
function PlanCard({ plan }: { plan: MaintenancePlan }) {
  const [expanded, setExpanded] = useState(false)
  const [showRecord, setShowRecord] = useState(false)
  const [showEditPlan, setShowEditPlan] = useState(false)
  const [showStartSession, setShowStartSession] = useState(false)
  const [showCompleteSession, setShowCompleteSession] = useState(false)
  const deletePlan   = useDeletePlan()
  const deleteRecord = useDeleteRecord()
  const activeSession = plan.activeSession
  const equipInMaintenance = plan.equipment.status === 'MAINTENANCE'
  const inMaintenance = !!activeSession || equipInMaintenance
  const { data: records = [] } = useMaintenanceRecords(plan.equipmentId)
  const planRecords = records.filter((r) => r.planId === plan.id)

  const urg = URGENCY[plan.urgency] ?? URGENCY.OK
  const currentHours = Number(plan.equipment.currentHours ?? 0)

  // ── Hours progress ──────────────────────────────────────────────────────────
  const intervalHours = plan.intervalHours ? Number(plan.intervalHours) : null
  const nextDueHours  = plan.nextDueHours  ? Number(plan.nextDueHours)  : null
  let hoursBarPct = 0
  let hoursRemaining: number | null = null
  if (nextDueHours !== null && intervalHours !== null && intervalHours > 0) {
    const lastSvcHours = nextDueHours - intervalHours
    const elapsed = currentHours - lastSvcHours
    hoursBarPct = Math.min(100, Math.max(0, Math.round((elapsed / intervalHours) * 100)))
    hoursRemaining = Math.round(nextDueHours - currentHours)
  }

  // ── Date progress ───────────────────────────────────────────────────────────
  const today = new Date(); today.setHours(0,0,0,0)
  const intervalDays = plan.intervalDays ?? null
  let dateBarPct = 0
  let daysRemaining: number | null = null
  if (plan.nextDueAt) {
    const due = parseISO(plan.nextDueAt); due.setHours(0,0,0,0)
    const diff = Math.round((due.getTime() - today.getTime()) / 86400000)
    daysRemaining = diff
    if (intervalDays && plan.lastServiceAt) {
      const last = parseISO(plan.lastServiceAt); last.setHours(0,0,0,0)
      const elapsed = Math.round((today.getTime() - last.getTime()) / 86400000)
      dateBarPct = Math.min(100, Math.max(0, Math.round((elapsed / intervalDays) * 100)))
    }
  }

  // ── Km progress ─────────────────────────────────────────────────────────────
  const currentKm    = plan.equipment.odometerKm ? Number(plan.equipment.odometerKm) : null
  const nextDueKm    = plan.nextDueKm ? Number(plan.nextDueKm) : null
  const intervalKm   = plan.intervalKm ? Number(plan.intervalKm) : null
  let kmBarPct = 0
  let kmRemaining: number | null = null
  if (plan.intervalType === 'KM' && nextDueKm !== null && intervalKm !== null && currentKm !== null) {
    const lastSvcKm = nextDueKm - intervalKm
    const elapsed = currentKm - lastSvcKm
    kmBarPct = Math.min(100, Math.max(0, Math.round((elapsed / intervalKm) * 100)))
    kmRemaining = Math.round(nextDueKm - currentKm)
  }

  // ── Countdown chip ──────────────────────────────────────────────────────────
  let countdown = ''
  if (plan.intervalType === 'KM' && kmRemaining !== null) {
    countdown = kmRemaining <= 0
      ? `Excedido ${Math.abs(kmRemaining).toLocaleString('es-PE')} km`
      : `${kmRemaining.toLocaleString('es-PE')} km restantes`
  } else if (plan.intervalType !== 'DATE' && hoursRemaining !== null) {
    countdown = hoursRemaining <= 0
      ? `Excedido ${Math.abs(hoursRemaining).toFixed(0)}h`
      : `${hoursRemaining.toFixed(0)}h restantes`
  } else if (plan.intervalType !== 'HOURS' && daysRemaining !== null) {
    if (daysRemaining < 0)  countdown = `Vencido hace ${Math.abs(daysRemaining)}d`
    else if (daysRemaining === 0) countdown = 'Vence hoy'
    else countdown = `${daysRemaining}d restantes`
  }

  // For BOTH type, show both
  const countdownHours = (plan.intervalType === 'BOTH' && hoursRemaining !== null)
    ? (hoursRemaining <= 0 ? `Excedido ${Math.abs(hoursRemaining).toFixed(0)}h` : `${hoursRemaining.toFixed(0)}h restantes`)
    : null
  const countdownDays = (plan.intervalType === 'BOTH' && daysRemaining !== null)
    ? (daysRemaining < 0 ? `Vencido hace ${Math.abs(daysRemaining)}d` : daysRemaining === 0 ? 'Vence hoy' : `${daysRemaining}d restantes`)
    : null

  const barColor = plan.urgency === 'OVERDUE' ? 'var(--clr-danger)' : plan.urgency === 'DUE_SOON' ? '#d97706' : 'var(--clr-success)'
  const showHoursBar = (plan.intervalType === 'HOURS' || plan.intervalType === 'BOTH') && nextDueHours !== null && intervalHours !== null
  const showDateBar  = (plan.intervalType === 'DATE'  || plan.intervalType === 'BOTH') && plan.nextDueAt !== null && intervalDays !== null && plan.lastServiceAt !== null
  const showKmBar    = plan.intervalType === 'KM' && nextDueKm !== null && intervalKm !== null && currentKm !== null

  return (
    <div style={{
      background: 'var(--clr-surface)',
      border: `1px solid ${plan.urgency === 'OVERDUE' ? 'rgba(239,68,68,0.3)' : plan.urgency === 'DUE_SOON' ? 'rgba(245,158,11,0.25)' : 'var(--clr-border)'}`,
      borderLeft: `4px solid ${urg.borderColor}`,
      borderRadius: 12,
      overflow: 'hidden',
      transition: 'box-shadow 0.15s',
    }}>
      {/* Top area — clickable to expand */}
      <div
        style={{ padding: '14px 16px 0', cursor: 'pointer' }}
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Row 1: Icon + Name + Badges */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
          {/* Urgency icon block */}
          <div style={{
            width: 38, height: 38, borderRadius: 10, flexShrink: 0, marginTop: 1,
            background: urg.badgeBg, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {plan.urgency === 'OVERDUE'  && <AlertTriangle size={18} color={urg.dotColor} />}
            {plan.urgency === 'DUE_SOON' && <Clock size={18} color={urg.dotColor} />}
            {plan.urgency === 'OK'       && <CheckCircle size={18} color={urg.dotColor} />}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
              <span style={{ fontWeight: 700, color: 'var(--clr-text)', fontSize: 14 }}>{plan.name}</span>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                background: urg.badgeBg, color: urg.badgeText, border: `1px solid ${urg.borderColor}44`,
                letterSpacing: '0.3px',
              }}>
                {urg.label.toUpperCase()}
              </span>
              <span style={{ fontSize: 11, color: 'var(--clr-text-subtle)', background: 'var(--clr-sidebar)', padding: '2px 7px', borderRadius: 10 }}>
                {INTERVAL_LABELS[plan.intervalType]}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Wrench size={11} color="var(--clr-text-subtle)" />
              <span style={{ fontSize: 12, color: 'var(--clr-text-subtle)' }}>{plan.equipment.name}</span>
              {plan.intervalType !== 'DATE' && (
                <span style={{ fontSize: 11, color: 'var(--clr-text-subtle)', marginLeft: 4 }}>
                  · {currentHours.toFixed(0)}h actuales
                </span>
              )}
              {inMaintenance && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                  background: 'rgba(234,88,12,0.10)', color: '#ea580c',
                  border: '1px solid rgba(234,88,12,0.30)', marginLeft: 4,
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}>
                  <Timer size={9} /> EN MANTENIMIENTO
                </span>
              )}
            </div>
          </div>

          {/* Countdown chip(s) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end', flexShrink: 0 }}>
            {plan.intervalType === 'BOTH' ? (
              <>
                {countdownHours && (
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                    background: urg.badgeBg, color: urg.badgeText, whiteSpace: 'nowrap',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}>
                    <Gauge size={10} /> {countdownHours}
                  </span>
                )}
                {countdownDays && (
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                    background: urg.badgeBg, color: urg.badgeText, whiteSpace: 'nowrap',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}>
                    <Calendar size={10} /> {countdownDays}
                  </span>
                )}
              </>
            ) : countdown ? (
              <span style={{
                fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20,
                background: urg.badgeBg, color: urg.badgeText, whiteSpace: 'nowrap',
              }}>
                {countdown}
              </span>
            ) : null}
          </div>
        </div>

        {/* Progress bars */}
        {showHoursBar && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--clr-text-subtle)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Gauge size={10} />
                Horómetro: {(nextDueHours! - intervalHours!).toFixed(0)}h → {nextDueHours!.toFixed(0)}h
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: barColor }}>{hoursBarPct}%</span>
            </div>
            <div style={{ height: 6, background: 'var(--clr-surface-hover)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${hoursBarPct}%`,
                background: `linear-gradient(90deg, ${barColor}99, ${barColor})`,
                borderRadius: 99, transition: 'width 0.4s ease',
              }} />
            </div>
            {plan.intervalHours && (
              <p style={{ fontSize: 10, color: 'var(--clr-text-subtle)', marginTop: 3 }}>
                Cada {Number(plan.intervalHours).toFixed(0)} horas
                {plan.lastServiceAt && ` · Último: ${fmtDate(plan.lastServiceAt)}`}
              </p>
            )}
          </div>
        )}

        {showDateBar && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--clr-text-subtle)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Calendar size={10} />
                {fmtDate(plan.lastServiceAt)} → {fmtDate(plan.nextDueAt)}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: barColor }}>{dateBarPct}%</span>
            </div>
            <div style={{ height: 6, background: 'var(--clr-surface-hover)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${dateBarPct}%`,
                background: `linear-gradient(90deg, ${barColor}99, ${barColor})`,
                borderRadius: 99, transition: 'width 0.4s ease',
              }} />
            </div>
            {intervalDays && (
              <p style={{ fontSize: 10, color: 'var(--clr-text-subtle)', marginTop: 3 }}>
                Cada {intervalDays} días
              </p>
            )}
          </div>
        )}

        {/* Barra km */}
        {showKmBar && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--clr-text-subtle)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Gauge size={10} />
                {(nextDueKm! - intervalKm!).toLocaleString('es-PE')} km → {nextDueKm!.toLocaleString('es-PE')} km
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: barColor }}>{kmBarPct}%</span>
            </div>
            <div style={{ height: 6, background: 'var(--clr-surface-hover)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${kmBarPct}%`,
                background: `linear-gradient(90deg, ${barColor}99, ${barColor})`,
                borderRadius: 99, transition: 'width 0.4s ease',
              }} />
            </div>
            <p style={{ fontSize: 10, color: 'var(--clr-text-subtle)', marginTop: 3 }}>
              Cada {intervalKm!.toLocaleString('es-PE')} km · Actual: {currentKm!.toLocaleString('es-PE')} km
            </p>
          </div>
        )}

        {/* Fallback km sin barra (equipo sin odómetro registrado) */}
        {plan.intervalType === 'KM' && !showKmBar && nextDueKm !== null && (
          <div style={{ marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: 'var(--clr-text-subtle)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Gauge size={10} /> Próximo mant.: {nextDueKm.toLocaleString('es-PE')} km
              {intervalKm && ` · Cada ${intervalKm.toLocaleString('es-PE')} km`}
            </span>
          </div>
        )}

        {/* Fallback: next due date without bar (no lastServiceAt) */}
        {plan.nextDueAt && !showDateBar && (plan.intervalType === 'DATE' || plan.intervalType === 'BOTH') && (
          <div style={{ marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: 'var(--clr-text-subtle)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Calendar size={10} /> Próximo: {fmtDate(plan.nextDueAt)}
              {intervalDays && ` · Cada ${intervalDays} días`}
            </span>
          </div>
        )}
      </div>

      {/* Action row — cambia según si hay sesión activa */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px 14px',
      }}>
        {inMaintenance ? (
          // ── Equipo EN MANTENIMIENTO ────────────────────────────────────────────
          activeSession ? (
            // Este plan tiene la sesión activa → mostrar info + botón de cierre
            <>
              <div style={{
                flex: 1, background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.25)',
                borderRadius: 8, padding: '7px 12px',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <Timer size={13} color="var(--clr-orange)" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--clr-orange)' }}>
                    En mantenimiento
                  </span>
                  {activeSession.technician && (
                    <span style={{ fontSize: 11, color: '#d97706', marginLeft: 6 }}>
                      · {activeSession.technician}
                    </span>
                  )}
                  <span style={{ fontSize: 10, color: '#d97706', marginLeft: 6 }}>
                    desde {fmtDate(activeSession.startedAt)}
                  </span>
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setShowCompleteSession(true) }}
                style={{
                  fontSize: 11, padding: '8px 14px', borderRadius: 8, whiteSpace: 'nowrap',
                  background: 'var(--clr-success-bg)', color: 'var(--clr-success)',
                  border: '1px solid rgba(34,197,94,0.3)',
                  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 700,
                }}
              >
                <Flag size={12} /> Cerrar mantenimiento
              </button>
            </>
          ) : (
            // Otro plan tiene al equipo en mantenimiento → solo informar, no permitir nueva sesión
            <div style={{
              flex: 1, background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.2)',
              borderRadius: 8, padding: '7px 12px',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <Timer size={13} color="var(--clr-orange)" />
              <span style={{ fontSize: 11, color: 'var(--clr-orange)', fontWeight: 600 }}>
                Equipo en mantenimiento por otro plan
              </span>
            </div>
          )
        ) : (
          // ── Equipo DISPONIBLE: botón de inicio de mantenimiento ──────────────
          <button
            onClick={(e) => { e.stopPropagation(); setShowStartSession(true) }}
            style={{
              flex: 1, fontSize: 12, padding: '8px 14px', borderRadius: 8,
              background: plan.urgency === 'OVERDUE'  ? 'var(--clr-danger-bg)'
                        : plan.urgency === 'DUE_SOON' ? 'rgba(217,119,6,0.10)'
                        : 'rgba(234,88,12,0.10)',
              color: plan.urgency === 'OVERDUE'  ? 'var(--clr-danger)'
                   : plan.urgency === 'DUE_SOON' ? '#d97706'
                   : '#ea580c',
              border: `1px solid ${
                plan.urgency === 'OVERDUE'  ? 'var(--clr-danger-border)'
                : plan.urgency === 'DUE_SOON' ? 'rgba(217,119,6,0.30)'
                : 'rgba(234,88,12,0.25)'
              }`,
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
              justifyContent: 'center', gap: 6, fontWeight: 700,
            }}
          >
            <Play size={13} /> Iniciar mantenimiento
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); setShowEditPlan(true) }}
          style={{ fontSize: 11, padding: '8px 12px', borderRadius: 8, background: 'var(--clr-sidebar)', color: 'var(--clr-text-muted)', border: '1px solid var(--clr-border)', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}
        >
          Editar
        </button>
        {(() => {
          const inMaintenance = !!plan.activeSession || plan.equipment.status === 'MAINTENANCE'
          return (
            <button
              disabled={inMaintenance}
              onClick={(e) => { e.stopPropagation(); if (!inMaintenance) deletePlan.mutate(plan.id) }}
              style={{
                padding: '8px 10px', borderRadius: 8,
                background: inMaintenance ? 'var(--clr-sidebar)' : 'var(--clr-danger-bg)',
                color: 'var(--clr-text-subtle)',
                border: `1px solid ${inMaintenance ? 'var(--clr-border)' : 'var(--clr-danger-border)'}`,
                cursor: inMaintenance ? 'not-allowed' : 'pointer',
              }}
              title={inMaintenance ? 'No se puede eliminar: el equipo está en taller actualmente' : 'Eliminar plan'}
            >
              <Trash2 size={13} />
            </button>
          )
        })()}
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v) }}
          style={{
            padding: '8px 10px', borderRadius: 8, background: 'var(--clr-sidebar)', border: '1px solid var(--clr-border)', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--clr-text-subtle)', fontSize: 11,
          }}
          title={expanded ? 'Ocultar historial' : `Ver historial (${planRecords.length})`}
        >
          {planRecords.length > 0 && <span style={{ fontSize: 10, color: 'var(--clr-text-subtle)' }}>{planRecords.length}</span>}
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* Historial expandido */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--clr-border)', padding: '12px 16px 14px', background: 'var(--clr-bg)' }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--clr-text-subtle)', marginBottom: 8, letterSpacing: '0.5px' }}>
            HISTORIAL DE MANTENIMIENTOS
            {planRecords.length > 0 && <span style={{ color: 'var(--clr-text-subtle)', fontWeight: 400 }}> · {planRecords.length} registro{planRecords.length !== 1 ? 's' : ''}</span>}
          </p>
          {planRecords.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <Wrench size={24} color="var(--clr-border)" style={{ margin: '0 auto 8px', display: 'block' }} />
              <p style={{ fontSize: 12, color: 'var(--clr-text-subtle)', margin: 0 }}>Sin registros aún.</p>
              <p style={{ fontSize: 11, color: 'var(--clr-text-subtle)', margin: '4px 0 0' }}>Registra el primer mantenimiento usando el botón de arriba.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {planRecords.slice().sort((a, b) => new Date(b.performedAt).getTime() - new Date(a.performedAt).getTime()).map((r) => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: 'var(--clr-bg)', border: '1px solid var(--clr-border)', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--clr-text)' }}>{fmtDate(r.performedAt)}</span>
                      {r.hoursAtService && (
                        <span style={{ fontSize: 11, color: 'var(--clr-text-subtle)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <Gauge size={10} /> {Number(r.hoursAtService).toFixed(0)}h
                        </span>
                      )}
                      {Number(r.cost) > 0 && (
                        <span style={{ fontSize: 11, color: '#d97706', fontWeight: 600, background: 'rgba(217,119,6,0.10)', padding: '1px 6px', borderRadius: 10 }}>
                          {fmtCost(r.cost)}
                        </span>
                      )}
                    </div>
                    {r.description && <p style={{ fontSize: 11, color: 'var(--clr-text-muted)', margin: 0 }}>{r.description}</p>}
                    {r.technician && (
                      <p style={{ fontSize: 11, color: 'var(--clr-text-subtle)', margin: '2px 0 0', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <Wrench size={9} /> {r.technician}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => deleteRecord.mutate(r.id)}
                    style={{ color: 'var(--clr-text-subtle)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', flexShrink: 0 }}
                    title="Eliminar registro"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showRecord          && <RecordModal plan={plan} onClose={() => setShowRecord(false)} />}
      {showEditPlan        && <PlanModal plan={plan} onClose={() => setShowEditPlan(false)} />}
      {showStartSession    && <StartSessionModal plan={plan} onClose={() => setShowStartSession(false)} />}
      {showCompleteSession && activeSession && (
        <CompleteSessionModal plan={plan} session={activeSession} onClose={() => setShowCompleteSession(false)} />
      )}
    </div>
  )
}

// ─── MaintenancePage ──────────────────────────────────────────────────────────
export default function MaintenancePage() {
  const { data: plans = [], isLoading } = useMaintenancePlans()
  const { data: summary } = useMaintenanceSummary()

  const [modalOpen, setModalOpen] = useState(false)
  const [filterUrg, setFilterUrg] = useState<'ALL' | 'OVERDUE' | 'DUE_SOON' | 'OK'>('ALL')
  const [filterEq, setFilterEq]   = useState('')
  const [search, setSearch]       = useState('')
  const storeQuery = useSearchStore((s) => s.query)
  const clearStore = useSearchStore((s) => s.clear)
  useEffect(() => { if (storeQuery) { setSearch(storeQuery); clearStore() } }, [storeQuery])

  const { data: equipment = [] } = useEquipment()

  const totalPlans = summary?.total ?? plans.length
  const overdue    = summary?.overdue ?? 0
  const dueSoon    = summary?.dueSoon ?? 0

  const filtered = plans.filter((p) => {
    if (filterUrg !== 'ALL' && p.urgency !== filterUrg) return false
    if (filterEq && p.equipmentId !== filterEq) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      if (!p.name.toLowerCase().includes(q) && !p.equipment.name.toLowerCase().includes(q)) return false
    }
    return true
  })

  const sortedFiltered = [...filtered].sort((a, b) => {
    const order = { OVERDUE: 0, DUE_SOON: 1, OK: 2 }
    return order[a.urgency] - order[b.urgency]
  })

  const URG_FILTERS = [
    { key: 'ALL',      label: 'Todos',    count: plans.length },
    { key: 'OVERDUE',  label: 'Vencidos', count: overdue },
    { key: 'DUE_SOON', label: 'Próximos', count: dueSoon },
    { key: 'OK',       label: 'Al día',   count: summary?.ok ?? 0 },
  ] as const

  const equipItems = [
    { id: '', primary: 'Todos los equipos' },
    ...equipment.map((e) => ({ id: e.id, primary: e.name, secondary: EQUIP_TYPE_LABEL[e.type] ?? e.type })),
  ]

  return (
    <AppShell active="maintenance" title="Mantenimiento">
      <div style={{ maxWidth: 1400, padding: '24px 28px' }}>
        {/* Page Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--clr-text)', margin: 0 }}>Mantenimiento</h1>
            <p style={{ fontSize: 13, color: 'var(--clr-text-subtle)', marginTop: 4 }}>
              {totalPlans} plan{totalPlans !== 1 ? 'es' : ''}
              {overdue > 0 && <> · <span style={{ color: 'var(--clr-danger)' }}>{overdue} vencido{overdue !== 1 ? 's' : ''}</span></>}
              {dueSoon > 0 && <> · <span style={{ color: '#d97706' }}>{dueSoon} próximo{dueSoon !== 1 ? 's' : ''}</span></>}
              {overdue === 0 && dueSoon === 0 && <> · <span style={{ color: 'var(--clr-success)' }}>todo al día</span></>}
            </p>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            style={{ fontSize: 13, padding: '8px 16px', borderRadius: 8, background: 'var(--clr-primary)', color: 'var(--clr-on-primary)', border: 'none', cursor: 'pointer', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={14} /> Nuevo plan
          </button>
        </div>

        {/* Filters row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {/* Urgency pills */}
          <div style={{ display: 'flex', gap: 4, background: 'var(--clr-sidebar)', border: '1px solid var(--clr-border)', borderRadius: 10, padding: 4 }}>
            {URG_FILTERS.map((f) => {
              const active = filterUrg === f.key
              const dotColor = f.key === 'OVERDUE' ? 'var(--clr-danger)' : f.key === 'DUE_SOON' ? '#d97706' : f.key === 'OK' ? 'var(--clr-success)' : undefined
              return (
                <button
                  key={f.key}
                  onClick={() => setFilterUrg(f.key)}
                  style={{
                    fontSize: 11, padding: '4px 10px', borderRadius: 7, fontWeight: 600, cursor: 'pointer', border: 'none',
                    background: active ? 'var(--clr-primary)' : 'transparent',
                    color: active ? 'var(--clr-on-primary)' : 'var(--clr-text-subtle)',
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                  }}
                >
                  {dotColor && (
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, display: 'inline-block' }} />
                  )}
                  {f.label}
                  <span style={{
                    fontSize: 10, padding: '1px 5px', borderRadius: 10,
                    background: active ? 'rgba(255,255,255,0.2)' : 'var(--clr-surface-hover)',
                    color: active ? 'var(--clr-on-primary)' : 'var(--clr-text-subtle)',
                  }}>
                    {f.count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Equipment dropdown */}
          <div style={{ width: 200 }}>
            <SearchableDropdown
              placeholder="Filtrar por equipo..."
              items={equipItems}
              value={filterEq}
              onChange={setFilterEq}
            />
          </div>

          {/* Search */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 8, padding: '5px 10px' }}>
            <Search size={12} style={{ color: 'var(--clr-text-subtle)' }} />
            <input
              placeholder="Buscar plan o equipo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 12, color: 'var(--clr-text)', width: 150 }}
            />
          </div>
        </div>

        {/* Lista */}
        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ height: 80, borderRadius: 10, background: 'var(--clr-surface)', border: '1px solid var(--clr-border)' }} className="animate-pulse" />
            ))}
          </div>
        ) : sortedFiltered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--clr-text-subtle)' }}>
            <Wrench size={40} style={{ margin: '0 auto 12px', opacity: 0.4, display: 'block' }} />
            <p style={{ fontWeight: 600, margin: 0 }}>No hay planes de mantenimiento</p>
            {!search && !filterEq && filterUrg === 'ALL' && (
              <button
                onClick={() => setModalOpen(true)}
                style={{ marginTop: 12, fontSize: 13, color: 'var(--clr-primary)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                + Crear primer plan
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sortedFiltered.map((p) => <PlanCard key={p.id} plan={p} />)}
          </div>
        )}
      </div>

      {modalOpen && <PlanModal onClose={() => setModalOpen(false)} />}
    </AppShell>
  )
}





