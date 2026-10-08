import { useState, useMemo, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { format, parseISO, differenceInDays } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Plus, User, AlertTriangle, Phone, Pencil,
  Users, ShieldCheck, ShieldOff, IdCard,
  LayoutGrid, List, ArrowUpDown, X, CalendarClock,
  Upload, Download, CheckCircle, AlertCircle as AlertCircleIcon, Loader2,
} from 'lucide-react'
import { useOperators, useCreateOperator, useUpdateOperator, type Operator } from '../hooks/useFlota'
import AppShell from '../components/AppShell'
import { SearchableDropdown } from '../components/SearchableDropdown'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

/* ─── constants ────────────────────────────────────────────────────────── */
const STATUS_ITEMS = [
  { id: 'ACTIVE',   primary: 'Activo',   badge: '🟢', secondary: 'Disponible para asignar a OT' },
  { id: 'INACTIVE', primary: 'Inactivo', badge: '⚫', secondary: 'No disponible temporalmente' },
]

const OP_COLORS = [
  { bg: 'var(--clr-primary-bg)',  border: 'var(--clr-primary-border)',  text: 'var(--clr-primary)'  },
  { bg: 'var(--clr-violet-bg)',   border: 'var(--clr-violet-border)',   text: 'var(--clr-violet)'   },
  { bg: 'var(--clr-success-bg)',  border: 'var(--clr-success-border)',  text: 'var(--clr-success)'  },
  { bg: 'var(--clr-fuchsia-bg)',  border: 'rgba(162,28,175,0.28)',      text: 'var(--clr-fuchsia)'  },
  { bg: 'var(--clr-orange-bg)',   border: 'var(--clr-orange-border)',   text: 'var(--clr-orange)'   },
  { bg: 'var(--clr-teal-bg)',     border: 'rgba(15,118,110,0.28)',      text: 'var(--clr-teal)'     },
]
function opColor(id: string) { return OP_COLORS[id.charCodeAt(0) % OP_COLORS.length] }
function initials(name: string) { return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase() }

type LicStatus = { label: string; sub: string; color: string; bg: string; alert: boolean }
function licenseInfo(expiry?: string): LicStatus {
  if (!expiry) return { label: 'Sin licencia', sub: 'no registrada', color: 'var(--clr-text-subtle)', bg: 'rgba(51,65,85,0.15)', alert: false }
  const days = differenceInDays(parseISO(expiry), new Date())
  if (days < 0)   return { label: 'VENCIDA',          sub: `hace ${Math.abs(days)}d`,        color: 'var(--clr-danger)',  bg: 'var(--clr-danger-bg)',  alert: true  }
  if (days <= 30) return { label: `Vence en ${days}d`, sub: format(parseISO(expiry), 'dd/MM/yyyy'), color: '#d97706', bg: 'rgba(217,119,6,0.12)', alert: true  }
  if (days <= 90) return { label: format(parseISO(expiry), 'dd MMM yyyy', { locale: es }), sub: `${days}d restantes`, color: 'var(--clr-success)', bg: 'var(--clr-success-bg)', alert: false }
  return           { label: format(parseISO(expiry), 'dd MMM yyyy', { locale: es }), sub: `${days}d restantes`, color: 'var(--clr-text-subtle)', bg: 'rgba(100,116,139,0.10)', alert: false }
}

type FilterKey = 'ALL' | 'ACTIVE' | 'INACTIVE' | 'ALERT'
type SortKey   = 'name' | 'status' | 'expiry'
type ViewMode  = 'grid' | 'list'

/* ─── Modal ────────────────────────────────────────────────────────────── */
function OperatorModal({ op, onClose }: { op?: Operator; onClose: () => void }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({ defaultValues: op ?? {} })
  const [status, setStatus] = useState(op?.status ?? 'ACTIVE')
  const create = useCreateOperator()
  const update = useUpdateOperator()

  const onSubmit = async (data: any) => {
    data.status = status
    if (op) await update.mutateAsync({ id: op.id, ...data })
    else     await create.mutateAsync(data)
    onClose()
  }

  const inp = (props: any) => (
    <input {...props} style={{ width: '100%', background: 'var(--clr-bg)', border: '1px solid var(--clr-border)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--clr-text)', outline: 'none', boxSizing: 'border-box', colorScheme: 'light dark', ...props.style }} />
  )
  const lbl = (text: string) => (
    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--clr-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>{text}</label>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
      <div style={{ background: 'var(--clr-sidebar)', border: '1px solid var(--clr-border)', borderRadius: 16, width: '100%', maxWidth: 480, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 48px rgba(0,0,0,0.6)' }}>

        {/* Header */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--clr-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(34,197,94,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <User size={15} style={{ color: 'var(--clr-success)' }} />
            </div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--clr-text)' }}>{op ? 'Editar Operario' : 'Nuevo Operario'}</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-text-subtle)', display: 'flex', padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} style={{ overflowY: 'auto', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            {lbl('Nombre completo *')}
            {inp({ ...register('name', { required: true }), placeholder: 'Ej. Juan Carlos Pérez' })}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              {lbl('DNI *')}
              {inp({ ...register('dni', { required: true }), placeholder: '12345678', maxLength: 8 })}
            </div>
            <div>
              {lbl('Teléfono')}
              {inp({ ...register('phone'), placeholder: '999 888 777' })}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              {lbl('N° Licencia')}
              {inp({ ...register('licenseNumber'), placeholder: 'Q12345678' })}
            </div>
            <div>
              {lbl('Vencimiento licencia')}
              {inp({ ...register('licenseExpiry'), type: 'date' })}
            </div>
          </div>

          <div>
            {lbl('Estado')}
            <SearchableDropdown
              label=""
              placeholder="Seleccionar estado..."
              icon={User}
              items={STATUS_ITEMS}
              value={status}
              onChange={(id) => setStatus(id)}
            />
          </div>

          <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: '9px', borderRadius: 8, background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', color: 'var(--clr-text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Cancelar
            </button>
            <button type="submit" disabled={isSubmitting} style={{ flex: 1, padding: '9px', borderRadius: 8, background: 'var(--clr-primary)', border: 'none', color: 'var(--clr-on-primary)', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: isSubmitting ? 0.6 : 1 }}>
              {isSubmitting ? 'Guardando...' : op ? 'Guardar cambios' : 'Registrar Operario'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ─── License Badge ────────────────────────────────────────────────────── */
function LicBadge({ expiry, licenseNumber }: { expiry?: string; licenseNumber?: string }) {
  const lic = licenseInfo(expiry)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {licenseNumber && (
        <div style={{ fontSize: 10, color: 'var(--clr-text-subtle)', fontFamily: 'monospace' }}>Lic. {licenseNumber}</div>
      )}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: lic.bg, color: lic.color, whiteSpace: 'nowrap' }}>
        {lic.alert && <AlertTriangle size={9} />}
        <CalendarClock size={9} />
        {lic.label}
      </span>
      <div style={{ fontSize: 10, color: 'var(--clr-text-subtle)' }}>{lic.sub}</div>
    </div>
  )
}

/* ─── Grid Card ────────────────────────────────────────────────────────── */
function OperatorCard({ op, onEdit }: { op: Operator; onEdit: () => void }) {
  const col     = opColor(op.id)
  const ini     = initials(op.name)
  const isActive = op.status === 'ACTIVE'
  const lic     = licenseInfo(op.licenseExpiry)

  return (
    <div style={{ background: 'var(--clr-sidebar)', border: `1px solid ${lic.alert ? 'rgba(239,68,68,0.25)' : 'var(--clr-border)'}`, borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, transition: 'border-color 0.15s' }}
      onMouseEnter={(e) => { if (!lic.alert) e.currentTarget.style.borderColor = 'var(--clr-primary)' }}
      onMouseLeave={(e) => { if (!lic.alert) e.currentTarget.style.borderColor = 'var(--clr-border)' }}
    >
      {/* Top */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0, background: col.bg, border: `1px solid ${col.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: col.text }}>
          {ini}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--clr-text)', lineHeight: 1.3, marginBottom: 5 }}>{op.name}</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: isActive ? 'var(--clr-success-bg)' : 'rgba(100,116,139,0.12)', color: isActive ? 'var(--clr-success)' : 'var(--clr-text-subtle)', border: `1px solid ${isActive ? 'var(--clr-success-border)' : 'rgba(100,116,139,0.2)'}`, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: isActive ? 'var(--clr-success)' : 'var(--clr-text-subtle)', display: 'inline-block' }} />
              {isActive ? 'Activo' : 'Inactivo'}
            </span>
            {op.dni && (
              <span style={{ fontSize: 10, color: 'var(--clr-text-subtle)', fontFamily: 'monospace', background: 'var(--clr-surface)', padding: '1px 6px', borderRadius: 4, border: '1px solid var(--clr-border)' }}>
                DNI {op.dni}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Contact */}
      {op.phone && (
        <div style={{ fontSize: 11, color: 'var(--clr-text-subtle)', display: 'flex', alignItems: 'center', gap: 5 }}>
          <Phone size={10} style={{ flexShrink: 0 }} /> {op.phone}
        </div>
      )}

      {/* License */}
      <div style={{ padding: '10px 12px', background: 'var(--clr-bg)', borderRadius: 8, border: `1px solid ${lic.alert ? 'rgba(239,68,68,0.15)' : 'var(--clr-border)'}` }}>
        <LicBadge expiry={op.licenseExpiry} licenseNumber={op.licenseNumber} />
      </div>

      {/* Action */}
      <button onClick={onEdit} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px', borderRadius: 8, background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', color: 'var(--clr-text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer', marginTop: 'auto' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--clr-surface-hover)'; e.currentTarget.style.color = 'var(--clr-text)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--clr-surface)'; e.currentTarget.style.color = 'var(--clr-text-muted)' }}
      >
        <Pencil size={12} /> Editar
      </button>
    </div>
  )
}

/* ─── List Row ─────────────────────────────────────────────────────────── */
function OperatorRow({ op, onEdit }: { op: Operator; onEdit: () => void }) {
  const col     = opColor(op.id)
  const ini     = initials(op.name)
  const isActive = op.status === 'ACTIVE'
  const lic     = licenseInfo(op.licenseExpiry)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '38px 1fr 80px 90px 1fr 100px', gap: 12, alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid var(--clr-border)', transition: 'background 0.1s' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--clr-surface-hover)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      <div style={{ width: 32, height: 32, borderRadius: 8, background: col.bg, border: `1px solid ${col.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: col.text }}>
        {ini}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--clr-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{op.name}</div>
        {op.phone && <div style={{ fontSize: 10, color: 'var(--clr-text-subtle)', marginTop: 1 }}>{op.phone}</div>}
      </div>
      <div style={{ fontSize: 10, color: 'var(--clr-text-subtle)', fontFamily: 'monospace', background: 'var(--clr-surface)', padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>
        {op.dni ?? '—'}
      </div>
      <div>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: isActive ? 'var(--clr-success-bg)' : 'rgba(100,116,139,0.12)', color: isActive ? 'var(--clr-success)' : 'var(--clr-text-subtle)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: isActive ? 'var(--clr-success)' : 'var(--clr-text-subtle)', display: 'inline-block' }} />
          {isActive ? 'Activo' : 'Inactivo'}
        </span>
      </div>
      <div>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: lic.bg, color: lic.color, display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
          {lic.alert && <AlertTriangle size={9} />}
          {lic.label}
        </span>
        {op.licenseNumber && <div style={{ fontSize: 10, color: 'var(--clr-text-subtle)', marginTop: 2, fontFamily: 'monospace' }}>{op.licenseNumber}</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={onEdit} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 6, background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', color: 'var(--clr-text-muted)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--clr-surface-hover)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--clr-surface)' }}
        >
          <Pencil size={10} /> Editar
        </button>
      </div>
    </div>
  )
}

/* ─── Import Operators Modal ───────────────────────────────────────────── */
type OpImportOp = { action: 'update' | 'create'; displayName: string; dni: string; fields: Record<string, unknown> }

function ImportOperatorsModal({ operators, onClose }: { operators: Operator[]; onClose: () => void }) {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep]     = useState<'idle' | 'preview' | 'done'>('idle')
  const [loading, setLoading] = useState(false)
  const [ops, setOps]       = useState<OpImportOp[]>([])
  const [result, setResult] = useState<{ created: number; updated: number } | null>(null)
  const [error, setError]   = useState('')

  function downloadTemplate() {
    const header = 'nombre;dni;licencia;vencimiento;telefono;estado'
    const rows = operators.map((o) =>
      [o.name, o.dni, o.licenseNumber ?? '', o.licenseExpiry ? o.licenseExpiry.slice(0, 10) : '', o.phone ?? '', o.status].join(';')
    )
    const csv = [header, ...rows].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = 'plantilla_operarios.csv'; a.click()
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setError(''); setLoading(true)
    try {
      const text = await file.text()
      const { data } = await api.post('/operators/import', { csv: text, preview: true })
      setOps(data.ops); setStep('preview')
    } catch (err: any) { setError(err?.response?.data?.message ?? 'Error al leer el archivo') }
    finally { setLoading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  async function handleConfirm() {
    setLoading(true)
    try {
      const lines = ['nombre;dni;licencia;vencimiento;telefono;estado']
      for (const op of ops) {
        const f = op.fields as any
        lines.push([f.name ?? '', f.dni ?? '', f.licenseNumber ?? '', f.licenseExpiry ?? '', f.phone ?? '', f.status ?? ''].join(';'))
      }
      const { data } = await api.post('/operators/import', { csv: lines.join('\n') })
      setResult(data); setStep('done')
      qc.invalidateQueries({ queryKey: ['operators'] })
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
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--clr-text)' }}>👷 Importar Operarios en Masa</div>
            <div style={{ fontSize: 12, color: 'var(--clr-text-subtle)', marginTop: 2 }}>Carga o actualiza operarios desde un CSV. Identifica por DNI.</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-text-subtle)', fontSize: 18 }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {step === 'idle' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { n: 1, title: 'Descargar plantilla', body: `Incluye los ${operators.length} operarios actuales. Modifica o agrega nuevas filas.`, action: <button onClick={downloadTemplate} style={btnS}><Download size={13} /> Descargar plantilla CSV</button> },
                { n: 2, title: 'Completar en Excel', body: 'Columnas: nombre*, dni* (clave de actualización), licencia, vencimiento (YYYY-MM-DD), telefono, estado (ACTIVE/INACTIVE/SUSPENDED). * = obligatorio para nuevos.' },
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
              {error && <div style={{ display: 'flex', gap: 8, padding: '10px 14px', background: 'var(--clr-danger-bg)', border: '1px solid var(--clr-danger-border)', borderRadius: 8, color: 'var(--clr-danger)', fontSize: 12 }}><AlertCircleIcon size={14} />{error}</div>}
            </div>
          )}
          {step === 'preview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, background: 'var(--clr-success-bg)', color: 'var(--clr-success)', fontWeight: 700, border: '1px solid var(--clr-success-border)' }}>✓ {ops.filter(o=>o.action==='update').length} a actualizar</span>
                {ops.filter(o=>o.action==='create').length > 0 && <span style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, background: 'var(--clr-primary-bg)', color: 'var(--clr-primary)', fontWeight: 700, border: '1px solid var(--clr-primary-border)' }}>+ {ops.filter(o=>o.action==='create').length} a crear</span>}
              </div>
              <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '7px 14px', background: 'var(--clr-bg)', borderBottom: '1px solid var(--clr-border)', fontSize: 10, fontWeight: 700, color: 'var(--clr-text-subtle)', textTransform: 'uppercase', display: 'grid', gridTemplateColumns: '100px 1fr 80px' }}>
                  <span>DNI</span><span>Nombre</span><span>Acción</span>
                </div>
                <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                  {ops.map((op, i) => (
                    <div key={i} style={{ padding: '8px 14px', borderBottom: '1px solid var(--clr-border)', display: 'grid', gridTemplateColumns: '100px 1fr 80px', alignItems: 'center', fontSize: 12 }}>
                      <span style={{ fontFamily: 'monospace', color: 'var(--clr-text-subtle)' }}>{op.dni}</span>
                      <span style={{ color: 'var(--clr-text)', fontWeight: 600 }}>{op.displayName}</span>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, textAlign: 'center', fontWeight: 700, background: op.action === 'create' ? 'var(--clr-primary-bg)' : 'var(--clr-success-bg)', color: op.action === 'create' ? 'var(--clr-primary)' : 'var(--clr-success)' }}>{op.action === 'create' ? 'CREAR' : 'EDITAR'}</span>
                    </div>
                  ))}
                </div>
              </div>
              {error && <div style={{ display: 'flex', gap: 8, padding: '10px 14px', background: 'var(--clr-danger-bg)', border: '1px solid var(--clr-danger-border)', borderRadius: 8, color: 'var(--clr-danger)', fontSize: 12 }}><AlertCircleIcon size={14} />{error}</div>}
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

/* ─── Main Page ────────────────────────────────────────────────────────── */
export default function OperatorsPage() {
  const { data: operators = [], isLoading } = useOperators()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing,   setEditing]   = useState<Operator | undefined>()
  const [filter,    setFilter]    = useState<FilterKey>('ALL')
  const [sort,      setSort]      = useState<SortKey>('name')
  const [sortDir,   setSortDir]   = useState<'asc' | 'desc'>('asc')
  const [view,      setView]      = useState<ViewMode>('grid')

  const [importOpen, setImportOpen] = useState(false)

  const openEdit   = (op: Operator) => { setEditing(op); setModalOpen(true) }
  const closeModal = () => { setEditing(undefined); setModalOpen(false) }

  /* KPI aggregates */
  const active   = operators.filter((o) => o.status === 'ACTIVE').length
  const inactive = operators.filter((o) => o.status === 'INACTIVE').length
  const alerts   = operators.filter((o) => licenseInfo(o.licenseExpiry).alert).length

  const filtered = useMemo(() => {
    let list = [...operators]
    if (filter === 'ACTIVE')   list = list.filter((o) => o.status === 'ACTIVE')
    if (filter === 'INACTIVE') list = list.filter((o) => o.status === 'INACTIVE')
    if (filter === 'ALERT')    list = list.filter((o) => licenseInfo(o.licenseExpiry).alert)
    list.sort((a, b) => {
      let v = 0
      if (sort === 'name')   v = a.name.localeCompare(b.name, 'es')
      if (sort === 'status') v = a.status.localeCompare(b.status)
      if (sort === 'expiry') {
        const da = a.licenseExpiry ? differenceInDays(parseISO(a.licenseExpiry), new Date()) : 9999
        const db = b.licenseExpiry ? differenceInDays(parseISO(b.licenseExpiry), new Date()) : 9999
        v = da - db
      }
      return sortDir === 'asc' ? v : -v
    })
    return list
  }, [operators, filter, sort, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sort === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSort(key); setSortDir('asc') }
  }

  const FILTERS: { key: FilterKey; label: string; count: number; alert?: boolean }[] = [
    { key: 'ALL',      label: 'Todos',          count: operators.length },
    { key: 'ACTIVE',   label: 'Activos',         count: active },
    { key: 'INACTIVE', label: 'Inactivos',       count: inactive },
    { key: 'ALERT',    label: 'Alerta licencia', count: alerts, alert: true },
  ]

  return (
    <AppShell active="operators" title="Operarios">
      <div style={{ padding: '24px 28px', maxWidth: 1400 }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--clr-text)', margin: 0 }}>Operarios</h1>
            <p style={{ fontSize: 13, color: 'var(--clr-text-subtle)', marginTop: 4 }}>
              {operators.length} operario{operators.length !== 1 ? 's' : ''} registrado{operators.length !== 1 ? 's' : ''}
              {alerts > 0 && <> · <span style={{ color: '#d97706', fontWeight: 600 }}>{alerts} alerta{alerts !== 1 ? 's' : ''} de licencia</span></>}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setImportOpen(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', color: 'var(--clr-text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              <Upload size={13} /> Importar
            </button>
            <button
              onClick={() => setModalOpen(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: 'var(--clr-primary)', border: 'none', color: 'var(--clr-on-primary)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              <Plus size={14} /> Nuevo Operario
            </button>
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
          {[
            { label: 'Total Operarios',   value: operators.length, sub: 'registrados',       icon: Users,        color: 'var(--clr-primary)', bg: 'var(--clr-primary-bg)'  },
            { label: 'Activos',           value: active,           sub: 'disponibles',        icon: ShieldCheck,  color: 'var(--clr-success)', bg: 'var(--clr-success-bg)'  },
            { label: 'Inactivos',         value: inactive,         sub: 'no disponibles',     icon: ShieldOff,    color: 'var(--clr-text-subtle)', bg: 'rgba(100,116,139,0.08)' },
            { label: 'Alerta Licencia',   value: alerts,           sub: 'vencida o por vencer',icon: AlertTriangle,color: '#d97706',             bg: 'rgba(217,119,6,0.08)'   },
          ].map((kpi) => {
            const Icon = kpi.icon
            return (
              <div key={kpi.label} style={{ background: 'var(--clr-sidebar)', border: `1px solid ${kpi.label === 'Alerta Licencia' && alerts > 0 ? 'rgba(245,158,11,0.25)' : 'var(--clr-border)'}`, borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--clr-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{kpi.label}</span>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: kpi.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={14} style={{ color: kpi.color }} />
                  </div>
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, color: kpi.label === 'Alerta Licencia' && alerts > 0 ? '#d97706' : 'var(--clr-text)' }}>
                  {isLoading ? '—' : kpi.value}
                </div>
                <div style={{ fontSize: 11, color: 'var(--clr-text-subtle)', marginTop: 3 }}>{kpi.sub}</div>
              </div>
            )
          })}
        </div>

        {/* ── Toolbar ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          {/* Filters */}
          <div style={{ display: 'flex', gap: 6 }}>
            {FILTERS.map((f) => {
              const active = filter === f.key
              const alertStyle = f.alert && f.count > 0 && active
              return (
                <button key={f.key} onClick={() => setFilter(f.key)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${active ? (f.alert && f.count > 0 ? 'rgba(217,119,6,0.5)' : 'var(--clr-primary)') : 'var(--clr-border)'}`, background: active ? (f.alert && f.count > 0 ? 'rgba(217,119,6,0.12)' : 'var(--clr-primary-bg)') : 'transparent', color: active ? (f.alert && f.count > 0 ? '#d97706' : 'var(--clr-on-primary)') : 'var(--clr-text-subtle)', transition: 'all 0.15s' }}>
                  {f.alert && f.count > 0 && <AlertTriangle size={10} />}
                  {f.label}
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 10, background: active ? 'var(--clr-primary-border)' : 'var(--clr-surface-hover)', color: active ? (f.alert && f.count > 0 ? '#d97706' : 'var(--clr-on-primary)') : 'var(--clr-text-muted)' }}>{f.count}</span>
                </button>
              )
            })}
          </div>

          <div style={{ width: 1, height: 22, background: 'var(--clr-border)' }} />

          {/* Sort */}
          {([['name', 'Nombre'], ['status', 'Estado'], ['expiry', 'Vencimiento']] as [SortKey, string][]).map(([k, label]) => {
            const isSorted = sort === k
            return (
              <button key={k} onClick={() => toggleSort(k)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1px solid ${isSorted ? 'var(--clr-primary-border)' : 'var(--clr-border)'}`, background: isSorted ? 'var(--clr-surface-hover)' : 'transparent', color: isSorted ? 'var(--clr-text-muted)' : 'var(--clr-text-subtle)', transition: 'all 0.15s' }}>
                <ArrowUpDown size={10} />
                {label}
                {isSorted && <span style={{ fontSize: 10 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
              </button>
            )
          })}

          {/* View toggle */}
          <div style={{ marginLeft: 'auto', display: 'flex', background: 'var(--clr-sidebar)', border: '1px solid var(--clr-border)', borderRadius: 8, overflow: 'hidden' }}>
            {([['grid', LayoutGrid], ['list', List]] as [ViewMode, typeof LayoutGrid][]).map(([v, Icon]) => (
              <button key={v} onClick={() => setView(v)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 30, background: view === v ? 'var(--clr-surface-hover)' : 'transparent', border: 'none', cursor: 'pointer', color: view === v ? 'var(--clr-text)' : 'var(--clr-text-subtle)' }}>
                <Icon size={14} />
              </button>
            ))}
          </div>

          <span style={{ fontSize: 12, color: 'var(--clr-text-subtle)' }}>
            {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* ── Content ── */}
        {isLoading ? (
          <div style={{ display: 'grid', gridTemplateColumns: view === 'grid' ? 'repeat(auto-fill, minmax(260px, 1fr))' : '1fr', gap: 12 }}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} style={{ height: view === 'grid' ? 220 : 58, borderRadius: 10, background: 'var(--clr-surface)', border: '1px solid var(--clr-border)' }} className="animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--clr-text-subtle)' }}>
            <Users size={40} style={{ margin: '0 auto 12px', opacity: 0.3, display: 'block' }} />
            <p style={{ fontWeight: 600, margin: 0, color: 'var(--clr-text-subtle)' }}>
              {filter !== 'ALL' ? 'Sin operarios para este filtro' : 'No hay operarios registrados'}
            </p>
            {filter !== 'ALL' && (
              <button onClick={() => setFilter('ALL')} style={{ marginTop: 10, fontSize: 12, color: 'var(--clr-primary)', background: 'none', border: 'none', cursor: 'pointer' }}>
                Ver todos los operarios
              </button>
            )}
          </div>
        ) : view === 'grid' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
            {filtered.map((op) => <OperatorCard key={op.id} op={op} onEdit={() => openEdit(op)} />)}
          </div>
        ) : (
          <div style={{ background: 'var(--clr-sidebar)', border: '1px solid var(--clr-border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '38px 1fr 80px 90px 1fr 100px', gap: 12, padding: '8px 16px', background: 'var(--clr-surface)', borderBottom: '1px solid var(--clr-border)' }}>
              {['', 'OPERARIO', 'DNI', 'ESTADO', 'LICENCIA', 'ACCIONES'].map((h, i) => (
                <div key={h || i} style={{ fontSize: 10, fontWeight: 600, color: 'var(--clr-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: i === 5 ? 'right' : 'left' }}>{h}</div>
              ))}
            </div>
            {filtered.map((op) => <OperatorRow key={op.id} op={op} onEdit={() => openEdit(op)} />)}
          </div>
        )}

      </div>

      {modalOpen   && <OperatorModal key={editing?.id ?? 'new'} op={editing} onClose={closeModal} />}
      {importOpen  && <ImportOperatorsModal operators={operators} onClose={() => setImportOpen(false)} />}
    </AppShell>
  )
}
