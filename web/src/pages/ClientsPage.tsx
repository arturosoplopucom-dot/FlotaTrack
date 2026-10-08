import { useState, useMemo, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import {
  Plus, Building2, Phone, Mail, CreditCard,
  Pencil, Trash2, Users, LayoutGrid, List,
  ChevronDown, X, MapPin, User, Percent, ArrowUpDown, Search,
  Upload, Download, CheckCircle, AlertCircle, Loader2,
} from 'lucide-react'
import { WhatsAppIcon } from '../components/WhatsAppIcon'
import { useClients, useCreateClient, useUpdateClient, useDeleteClient, type Client } from '../hooks/useFlota'
import AppShell from '../components/AppShell'
import { useSearchStore } from '../store/search.store'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

/* ─── helpers ─────────────────────────────────────────────────────────── */
const COLORS = [
  { bg: 'var(--clr-primary-bg)',  border: 'var(--clr-primary-border)',  text: 'var(--clr-primary)'  },
  { bg: 'var(--clr-violet-bg)',   border: 'var(--clr-violet-border)',   text: 'var(--clr-violet)'   },
  { bg: 'var(--clr-success-bg)',  border: 'var(--clr-success-border)',  text: 'var(--clr-success)'  },
  { bg: 'var(--clr-fuchsia-bg)',  border: 'rgba(162,28,175,0.28)',      text: 'var(--clr-fuchsia)'  },
  { bg: 'var(--clr-orange-bg)',   border: 'var(--clr-orange-border)',   text: 'var(--clr-orange)'   },
  { bg: 'var(--clr-teal-bg)',     border: 'rgba(15,118,110,0.28)',      text: 'var(--clr-teal)'     },
]
function clientColor(id: string) { return COLORS[id.charCodeAt(0) % COLORS.length] }
function initials(name: string)  { return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase() }

type SortKey = 'name' | 'credit' | 'detraccion'
type FilterKey = 'ALL' | 'DETRACCION' | 'CREDIT30'
type ViewMode  = 'grid' | 'list'

/* ─── Client Modal ─────────────────────────────────────────────────────── */
function ClientModal({ client, onClose }: { client?: Client; onClose: () => void }) {
  const { register, handleSubmit, formState: { isSubmitting, errors } } = useForm({
    defaultValues: client ?? { creditDays: 30, detraccionPct: 0 },
  })
  const create = useCreateClient()
  const update = useUpdateClient()
  const onSubmit = async (data: any) => {
    data.creditDays    = parseInt(data.creditDays) || 30
    data.detraccionPct = parseFloat(data.detraccionPct) || 0
    if (client) await update.mutateAsync({ id: client.id, ...data })
    else        await create.mutateAsync(data)
    onClose()
  }
  const apiError = create.error || update.error

  const field = (label: string, node: React.ReactNode, hint?: string) => (
    <div>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--clr-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>{label}</label>
      {node}
      {hint && <p style={{ fontSize: 11, color: 'var(--clr-text-subtle)', marginTop: 3 }}>{hint}</p>}
    </div>
  )
  const inp = (props: any) => (
    <input {...props} style={{ width: '100%', background: 'var(--clr-bg)', border: '1px solid var(--clr-border)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--clr-text)', outline: 'none', boxSizing: 'border-box', ...props.style }} />
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
      <div style={{ background: 'var(--clr-sidebar)', border: '1px solid var(--clr-border)', borderRadius: 16, width: '100%', maxWidth: 540, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 48px rgba(0,0,0,0.15)' }}>

        {/* Header */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--clr-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--clr-primary-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Building2 size={15} style={{ color: 'var(--clr-primary-lt)' }} />
            </div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--clr-text)' }}>{client ? 'Editar Cliente' : 'Nuevo Cliente'}</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-text-subtle)', display: 'flex', padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit(onSubmit)} style={{ overflowY: 'auto', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {apiError && (
            <div style={{ padding: '10px 14px', background: 'var(--clr-danger-bg)', border: '1px solid var(--clr-danger-border)', borderRadius: 8, fontSize: 13, color: 'var(--clr-danger)' }}>
              {(apiError as any)?.response?.data?.message || 'Error al guardar'}
            </div>
          )}

          {field('Razón Social *',
            inp({ ...register('businessName', { required: true }), placeholder: 'Ej. Luz del Sur S.A.C.' })
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {field('RUC *',
              <>
                {inp({ ...register('ruc', { required: true, minLength: 11, maxLength: 11 }), placeholder: '20123456789', maxLength: 11 })}
                {errors.ruc && <p style={{ fontSize: 11, color: 'var(--clr-danger)', marginTop: 3 }}>El RUC debe tener 11 dígitos</p>}
              </>
            )}
            {field('Contacto',
              inp({ ...register('contactName'), placeholder: 'Nombre del contacto' })
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {field('Días de crédito',
              inp({ ...register('creditDays'), type: 'number', min: 0 })
            )}
            {field('% Detracción',
              <div style={{ position: 'relative' }}>
                {inp({ ...register('detraccionPct'), type: 'number', min: 0, max: 100, step: 0.01, placeholder: '0', style: { paddingRight: 32 } })}
                <span style={{ position: 'absolute', right: 11, top: 9, fontSize: 12, color: 'var(--clr-text-subtle)' }}>%</span>
              </div>,
              'Ej: 10 para Arrendamiento (cod. 019)'
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {field('Teléfono', inp({ ...register('phone'), placeholder: '01 234 5678' }))}
            {field('WhatsApp', inp({ ...register('whatsapp'), placeholder: '999 888 777' }))}
          </div>

          {field('Email', inp({ ...register('email'), type: 'email', placeholder: 'contacto@empresa.pe' }))}
          {field('Dirección', inp({ ...register('address'), placeholder: 'Av. Principal 123, Lima' }))}

          {/* Footer */}
          <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: '9px', borderRadius: 8, background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', color: 'var(--clr-text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Cancelar
            </button>
            <button type="submit" disabled={isSubmitting} style={{ flex: 1, padding: '9px', borderRadius: 8, background: 'var(--clr-primary)', border: 'none', color: 'var(--clr-on-primary)', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: isSubmitting ? 0.6 : 1 }}>
              {isSubmitting ? 'Guardando...' : client ? 'Guardar cambios' : 'Registrar Cliente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ─── Delete Confirm ───────────────────────────────────────────────────── */
function DeleteConfirm({ client, onClose }: { client: Client; onClose: () => void }) {
  const del = useDeleteClient()
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
      <div style={{ background: 'var(--clr-sidebar)', border: '1px solid var(--clr-border)', borderRadius: 16, width: '100%', maxWidth: 380, padding: '22px 24px', boxShadow: '0 24px 48px rgba(0,0,0,0.15)' }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--clr-danger-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
          <Trash2 size={18} style={{ color: 'var(--clr-danger)' }} />
        </div>
        <h2 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: 'var(--clr-text)' }}>¿Desactivar cliente?</h2>
        <p style={{ fontSize: 13, color: 'var(--clr-text-subtle)', margin: '0 0 20px', lineHeight: 1.5 }}>
          <span style={{ color: 'var(--clr-text)', fontWeight: 600 }}>{client.businessName}</span> dejará de aparecer en el sistema. Sus facturas y órdenes de trabajo se conservan.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '9px', borderRadius: 8, background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', color: 'var(--clr-text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Cancelar
          </button>
          <button
            onClick={async () => { await del.mutateAsync(client.id); onClose() }}
            disabled={del.isPending}
            style={{ flex: 1, padding: '9px', borderRadius: 8, background: 'var(--clr-danger-bg)', border: '1px solid var(--clr-danger-border)', color: 'var(--clr-danger)', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: del.isPending ? 0.6 : 1 }}
          >
            {del.isPending ? 'Desactivando...' : 'Desactivar'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── Grid Card ────────────────────────────────────────────────────────── */
function ClientCard({ c, onEdit, onDelete }: { c: Client; onEdit: () => void; onDelete: () => void }) {
  const col  = clientColor(c.id)
  const ini  = initials(c.businessName)
  const hasDet = Number(c.detraccionPct) > 0
  const waUrl  = c.whatsapp ? (() => { const d = c.whatsapp!.replace(/\D/g, ''); return `https://wa.me/${d.startsWith('51') && d.length >= 11 ? d : '51' + d}` })() : null

  return (
    <div style={{ background: 'var(--clr-sidebar)', border: '1px solid var(--clr-border)', borderRadius: 12, padding: '16px', display: 'flex', flexDirection: 'column', gap: 12, transition: 'border-color 0.15s' }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--clr-primary)' }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--clr-border)' }}
    >
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ width: 42, height: 42, borderRadius: 10, flexShrink: 0, background: col.bg, border: `1px solid ${col.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: col.text }}>
          {ini}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--clr-text)', lineHeight: 1.3, marginBottom: 3 }}>{c.businessName}</div>
          <span style={{ fontSize: 10, color: 'var(--clr-text-subtle)', fontFamily: 'monospace', background: 'var(--clr-surface)', padding: '2px 7px', borderRadius: 4, border: '1px solid var(--clr-border)' }}>{c.ruc}</span>
        </div>
      </div>

      {/* Badges */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 20, background: 'rgba(96,165,250,0.1)', color: 'var(--clr-primary-lt)', border: '1px solid rgba(96,165,250,0.2)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <CreditCard size={9} /> {c.creditDays}d crédito
        </span>
        {hasDet && (
          <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 20, background: 'var(--clr-orange-bg)', color: 'var(--clr-orange)', border: '1px solid var(--clr-orange-border)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Percent size={9} /> {Number(c.detraccionPct)}% detrac.
          </span>
        )}
      </div>

      {/* Contact info */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {c.contactName && (
          <div style={{ fontSize: 11, color: 'var(--clr-text-subtle)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <User size={10} style={{ flexShrink: 0 }} /> {c.contactName}
          </div>
        )}
        {c.email && (
          <a href={`mailto:${c.email}`} style={{ fontSize: 11, color: 'var(--clr-text-subtle)', display: 'flex', alignItems: 'center', gap: 5, textDecoration: 'none' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--clr-text-muted)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--clr-text-subtle)' }}>
            <Mail size={10} style={{ flexShrink: 0 }} /> {c.email}
          </a>
        )}
        {c.phone && (
          <div style={{ fontSize: 11, color: 'var(--clr-text-subtle)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Phone size={10} style={{ flexShrink: 0 }} /> {c.phone}
          </div>
        )}
        {c.address && (
          <div style={{ fontSize: 11, color: 'var(--clr-text-subtle)', display: 'flex', alignItems: 'flex-start', gap: 5 }}>
            <MapPin size={10} style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.address}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, marginTop: 'auto', paddingTop: 4, borderTop: '1px solid var(--clr-border)' }}>
        {waUrl ? (
          <a href={waUrl} target="_blank" rel="noreferrer" style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '6px', borderRadius: 7, background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.25)', color: 'var(--clr-wa-text)', fontSize: 11, fontWeight: 600, textDecoration: 'none' }}>
            <WhatsAppIcon size={11} /> WA
          </a>
        ) : (
          <span title="Sin WhatsApp" style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '6px', borderRadius: 7, background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', color: 'var(--clr-text-subtle)', fontSize: 11, cursor: 'default' }}>
            <WhatsAppIcon size={11} /> WA
          </span>
        )}
        <button onClick={onEdit} style={{ flex: 2, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '6px', borderRadius: 7, background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', color: 'var(--clr-text-muted)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
          <Pencil size={11} /> Editar
        </button>
        <button onClick={onDelete} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '6px 10px', borderRadius: 7, background: 'var(--clr-danger-bg)', border: '1px solid var(--clr-danger-border)', color: 'var(--clr-danger)', cursor: 'pointer' }}>
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  )
}

/* ─── List Row ─────────────────────────────────────────────────────────── */
function ClientRow({ c, onEdit, onDelete }: { c: Client; onEdit: () => void; onDelete: () => void }) {
  const col  = clientColor(c.id)
  const ini  = initials(c.businessName)
  const hasDet = Number(c.detraccionPct) > 0
  const waUrl  = c.whatsapp ? (() => { const d = c.whatsapp!.replace(/\D/g, ''); return `https://wa.me/${d.startsWith('51') && d.length >= 11 ? d : '51' + d}` })() : null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 130px 100px 110px 130px', gap: 12, alignItems: 'center', padding: '11px 16px', borderBottom: '1px solid var(--clr-border)', transition: 'background 0.1s' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--clr-surface-hover)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      <div style={{ width: 34, height: 34, borderRadius: 8, background: col.bg, border: `1px solid ${col.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: col.text, flexShrink: 0 }}>
        {ini}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--clr-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.businessName}</div>
        <div style={{ fontSize: 10, color: 'var(--clr-text-subtle)', fontFamily: 'monospace', marginTop: 1 }}>{c.ruc}</div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--clr-text-subtle)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {c.contactName ?? '—'}
      </div>
      <div>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--clr-primary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <CreditCard size={10} /> {c.creditDays}d
        </span>
      </div>
      <div>
        {hasDet ? (
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--clr-orange)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Percent size={10} /> {Number(c.detraccionPct)}%
          </span>
        ) : <span style={{ fontSize: 11, color: 'var(--clr-text-subtle)' }}>—</span>}
      </div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        {waUrl ? (
          <a href={waUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.25)', color: 'var(--clr-wa-text)', fontSize: 11, fontWeight: 600, textDecoration: 'none' }}>
            <WhatsAppIcon size={10} /> WA
          </a>
        ) : (
          <span title="Sin WhatsApp" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', color: 'var(--clr-text-subtle)', fontSize: 11, cursor: 'default' }}>
            <WhatsAppIcon size={10} /> WA
          </span>
        )}
        <button onClick={onEdit} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', color: 'var(--clr-text-muted)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
          <Pencil size={10} /> Editar
        </button>
        <button onClick={onDelete} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '4px 8px', borderRadius: 6, background: 'var(--clr-danger-bg)', border: '1px solid var(--clr-danger-border)', color: 'var(--clr-danger)', cursor: 'pointer' }}>
          <Trash2 size={10} />
        </button>
      </div>
    </div>
  )
}

/* ─── Import Contacts Modal ────────────────────────────────────────────── */
type ImportPreviewRow = { ruc: string; businessName: string; fields: Record<string, string> }
type ImportResult = { updated: number; notFound: string[]; total: number }

function ImportContactsModal({ clients, onClose }: { clients: Client[]; onClose: () => void }) {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep]       = useState<'idle' | 'preview' | 'done'>('idle')
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<ImportPreviewRow[]>([])
  const [notFound, setNotFound] = useState<string[]>([])
  const [result, setResult]   = useState<ImportResult | null>(null)
  const [error, setError]     = useState('')

  const FIELD_LABELS: Record<string, string> = {
    phone: 'Teléfono', whatsapp: 'WhatsApp', email: 'Email',
    address: 'Dirección', contactName: 'Contacto',
  }

  function downloadTemplate() {
    const header = 'ruc;razon_social;telefono;whatsapp;email;direccion;contacto'
    const rows = clients.map((c) =>
      [c.ruc, c.businessName, c.phone ?? '', c.whatsapp ?? '', c.email ?? '', c.address ?? '', c.contactName ?? ''].join(';')
    )
    const csv = [header, ...rows].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'plantilla_contactos_clientes.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(''); setLoading(true)
    try {
      const text = await file.text()
      const { data } = await api.post('/clients/import-contacts', { csv: text, preview: true })
      setPreview(data.updates)
      setNotFound(data.notFound ?? [])
      setStep('preview')
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Error al leer el archivo')
    } finally {
      setLoading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleConfirm() {
    if (!preview.length) return
    setLoading(true)
    try {
      const csvLines = ['ruc;telefono;whatsapp;email;direccion;contacto']
      for (const row of preview) {
        const f = row.fields
        csvLines.push([row.ruc, f.phone ?? '', f.whatsapp ?? '', f.email ?? '', f.address ?? '', f.contactName ?? ''].join(';'))
      }
      const { data } = await api.post('/clients/import-contacts', { csv: csvLines.join('\n') })
      setResult(data)
      setStep('done')
      qc.invalidateQueries({ queryKey: ['clients'] })
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Error al importar')
    } finally {
      setLoading(false)
    }
  }

  const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }
  const box: React.CSSProperties = { background: 'var(--clr-sidebar)', border: '1px solid var(--clr-border)', borderRadius: 16, width: '100%', maxWidth: 620, maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 48px rgba(0,0,0,0.18)' }
  const btnPrimary: React.CSSProperties = { padding: '9px 18px', borderRadius: 8, background: 'var(--clr-primary)', border: 'none', color: 'var(--clr-on-primary)', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }
  const btnSecondary: React.CSSProperties = { padding: '9px 18px', borderRadius: 8, background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', color: 'var(--clr-text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }

  return (
    <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={box}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--clr-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--clr-text)' }}>📥 Importar Contactos en Masa</div>
            <div style={{ fontSize: 12, color: 'var(--clr-text-subtle)', marginTop: 2 }}>
              Actualiza teléfono, WhatsApp, email y dirección de todos los clientes desde un CSV
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-text-subtle)', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

          {step === 'idle' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Step 1 */}
              <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 10, padding: '16px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--clr-text)', marginBottom: 8 }}>
                  <span style={{ display: 'inline-block', width: 22, height: 22, borderRadius: '50%', background: 'var(--clr-primary)', color: 'var(--clr-on-primary)', fontSize: 11, fontWeight: 800, textAlign: 'center', lineHeight: '22px', marginRight: 8 }}>1</span>
                  Descargar plantilla
                </div>
                <p style={{ fontSize: 12, color: 'var(--clr-text-subtle)', margin: '0 0 12px 30px', lineHeight: 1.5 }}>
                  El archivo incluye todos tus clientes actuales con sus datos existentes. Solo completa las columnas vacías.
                </p>
                <div style={{ marginLeft: 30 }}>
                  <button onClick={downloadTemplate} style={btnSecondary}>
                    <Download size={13} /> Descargar plantilla CSV ({clients.length} clientes)
                  </button>
                </div>
              </div>

              {/* Step 2 */}
              <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 10, padding: '16px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--clr-text)', marginBottom: 8 }}>
                  <span style={{ display: 'inline-block', width: 22, height: 22, borderRadius: '50%', background: 'var(--clr-primary)', color: 'var(--clr-on-primary)', fontSize: 11, fontWeight: 800, textAlign: 'center', lineHeight: '22px', marginRight: 8 }}>2</span>
                  Completar el CSV en Excel
                </div>
                <p style={{ fontSize: 12, color: 'var(--clr-text-subtle)', margin: '0 0 0 30px', lineHeight: 1.5 }}>
                  Abre el archivo en Excel, completa las columnas <strong>telefono</strong>, <strong>whatsapp</strong>, <strong>email</strong>, <strong>direccion</strong> y <strong>contacto</strong>. Guarda como CSV separado por punto y coma (;).
                </p>
              </div>

              {/* Step 3 */}
              <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 10, padding: '16px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--clr-text)', marginBottom: 8 }}>
                  <span style={{ display: 'inline-block', width: 22, height: 22, borderRadius: '50%', background: 'var(--clr-primary)', color: 'var(--clr-on-primary)', fontSize: 11, fontWeight: 800, textAlign: 'center', lineHeight: '22px', marginRight: 8 }}>3</span>
                  Subir el CSV completado
                </div>
                <div style={{ marginLeft: 30 }}>
                  <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={handleFile} />
                  <button onClick={() => fileRef.current?.click()} style={btnPrimary} disabled={loading}>
                    {loading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={13} />}
                    {loading ? 'Leyendo archivo…' : 'Seleccionar archivo CSV'}
                  </button>
                </div>
              </div>

              {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--clr-danger-bg)', border: '1px solid var(--clr-danger-border)', borderRadius: 8, color: 'var(--clr-danger)', fontSize: 12 }}>
                  <AlertCircle size={14} /> {error}
                </div>
              )}
            </div>
          )}

          {step === 'preview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, background: 'var(--clr-success-bg)', color: 'var(--clr-success)', fontWeight: 700, border: '1px solid var(--clr-success-border)' }}>
                  ✓ {preview.length} clientes a actualizar
                </span>
                {notFound.length > 0 && (
                  <span style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, background: 'var(--clr-danger-bg)', color: 'var(--clr-danger)', fontWeight: 700, border: '1px solid var(--clr-danger-border)' }}>
                    ⚠ {notFound.length} RUC no encontrado{notFound.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              {preview.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--clr-text-subtle)', fontSize: 13 }}>
                  No se encontraron cambios para aplicar. Verifica que las columnas tengan datos.
                </div>
              ) : (
                <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ padding: '8px 14px', background: 'var(--clr-bg)', borderBottom: '1px solid var(--clr-border)', fontSize: 10, fontWeight: 700, color: 'var(--clr-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'grid', gridTemplateColumns: '120px 1fr auto' }}>
                    <span>RUC</span><span>Razón Social</span><span>Campos</span>
                  </div>
                  <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                    {preview.map((row) => (
                      <div key={row.ruc} style={{ padding: '9px 14px', borderBottom: '1px solid var(--clr-border)', display: 'grid', gridTemplateColumns: '120px 1fr auto', alignItems: 'center', gap: 8, fontSize: 12 }}>
                        <span style={{ fontFamily: 'monospace', color: 'var(--clr-text-subtle)' }}>{row.ruc}</span>
                        <span style={{ color: 'var(--clr-text)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.businessName}</span>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          {Object.keys(row.fields).map((f) => (
                            <span key={f} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: 'var(--clr-primary-bg)', color: 'var(--clr-primary)', fontWeight: 600 }}>
                              {FIELD_LABELS[f] ?? f}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {notFound.length > 0 && (
                <div style={{ fontSize: 11, color: 'var(--clr-text-subtle)', padding: '8px 12px', background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 8 }}>
                  RUC no encontrados: {notFound.join(', ')}
                </div>
              )}
              {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--clr-danger-bg)', border: '1px solid var(--clr-danger-border)', borderRadius: 8, color: 'var(--clr-danger)', fontSize: 12 }}>
                  <AlertCircle size={14} /> {error}
                </div>
              )}
            </div>
          )}

          {step === 'done' && result && (
            <div style={{ textAlign: 'center', padding: '32px 20px' }}>
              <CheckCircle size={52} style={{ color: 'var(--clr-success)', marginBottom: 16 }} />
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--clr-text)', marginBottom: 8 }}>
                ¡Importación completada!
              </div>
              <div style={{ fontSize: 13, color: 'var(--clr-text-subtle)', lineHeight: 1.6 }}>
                <strong style={{ color: 'var(--clr-success)' }}>{result.updated} clientes</strong> actualizados correctamente.
                {result.notFound.length > 0 && <><br /><span style={{ color: 'var(--clr-danger)' }}>{result.notFound.length} RUC no encontrados</span> fueron ignorados.</>}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--clr-border)', display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0 }}>
          {step === 'idle' && <button onClick={onClose} style={btnSecondary}>Cancelar</button>}
          {step === 'preview' && (
            <>
              <button onClick={() => { setStep('idle'); setPreview([]); setNotFound([]) }} style={btnSecondary}>← Volver</button>
              <button onClick={handleConfirm} disabled={loading || preview.length === 0} style={{ ...btnPrimary, opacity: preview.length === 0 ? 0.5 : 1 }}>
                {loading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={13} />}
                {loading ? 'Guardando…' : `Confirmar (${preview.length} clientes)`}
              </button>
            </>
          )}
          {step === 'done' && <button onClick={onClose} style={btnPrimary}>Cerrar</button>}
        </div>
      </div>
    </div>
  )
}

/* ─── Main Page ────────────────────────────────────────────────────────── */
export default function ClientsPage() {
  const { data: clients = [], isLoading } = useClients()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing,   setEditing]   = useState<Client | undefined>()
  const [deleting,  setDeleting]  = useState<Client | undefined>()
  const search    = useSearchStore((s) => s.query)
  const setSearch = useSearchStore((s) => s.setQuery)
  const clearSearch = useSearchStore((s) => s.clear)
  const [filter,    setFilter]    = useState<FilterKey>('ALL')

  // Clear search when leaving this page
  useEffect(() => () => clearSearch(), [])
  const [sort,      setSort]      = useState<SortKey>('name')
  const [sortDir,   setSortDir]   = useState<'asc' | 'desc'>('asc')
  const [view,      setView]      = useState<ViewMode>('grid')

  const [importOpen, setImportOpen] = useState(false)

  const openEdit  = (c: Client) => { setEditing(c); setModalOpen(true) }
  const closeModal = () => { setEditing(undefined); setModalOpen(false) }

  /* KPI aggregates */
  const withWA      = clients.filter((c) => c.whatsapp).length
  const withEmail   = clients.filter((c) => c.email).length
  const withDet     = clients.filter((c) => Number(c.detraccionPct) > 0).length

  const filtered = useMemo(() => {
    let list = [...clients]
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((c) =>
        c.businessName.toLowerCase().includes(q) ||
        c.ruc.includes(q) ||
        (c.contactName ?? '').toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q)
      )
    }
    if (filter === 'DETRACCION') list = list.filter((c) => Number(c.detraccionPct) > 0)
    if (filter === 'CREDIT30')   list = list.filter((c) => c.creditDays > 30)
    list.sort((a, b) => {
      let v = 0
      if (sort === 'name')      v = a.businessName.localeCompare(b.businessName, 'es')
      if (sort === 'credit')    v = a.creditDays - b.creditDays
      if (sort === 'detraccion') v = Number(a.detraccionPct) - Number(b.detraccionPct)
      return sortDir === 'asc' ? v : -v
    })
    return list
  }, [clients, search, filter, sort, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sort === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSort(key); setSortDir('asc') }
  }

  const FILTERS: { key: FilterKey; label: string; count: number }[] = [
    { key: 'ALL',        label: 'Todos',          count: clients.length },
    { key: 'DETRACCION', label: 'Con detracción', count: withDet },
    { key: 'CREDIT30',   label: 'Crédito > 30d',  count: clients.filter((c) => c.creditDays > 30).length },
  ]

  return (
    <AppShell active="clients" title="Clientes">
      <div style={{ padding: '24px 28px', maxWidth: 1400 }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--clr-text)', margin: 0 }}>Clientes</h1>
            <p style={{ fontSize: 13, color: 'var(--clr-text-subtle)', marginTop: 4 }}>
              {clients.length} cliente{clients.length !== 1 ? 's' : ''} activos
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setImportOpen(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', color: 'var(--clr-text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              <Upload size={13} /> Importar contactos
            </button>
            <button
              onClick={() => setModalOpen(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: 'var(--clr-primary)', border: 'none', color: 'var(--clr-on-primary)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              <Plus size={14} /> Nuevo Cliente
            </button>
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
          {[
            { label: 'Total Clientes',  value: clients.length,  sub: 'registrados',   icon: Building2,      color: 'var(--clr-primary)', bg: 'var(--clr-primary-bg)'  },
            { label: 'Con WhatsApp',    value: withWA,          sub: 'contactables',   icon: WhatsAppIcon,   color: '#25D366',             bg: 'rgba(37,211,102,0.08)'  },
            { label: 'Con Email',       value: withEmail,       sub: 'con correo',     icon: Mail,           color: 'var(--clr-violet)',   bg: 'var(--clr-violet-bg)'   },
            { label: 'Con Detracción',  value: withDet,         sub: 'sujetos SUNAT',  icon: Percent,        color: 'var(--clr-orange)',   bg: 'var(--clr-orange-bg)'   },
          ].map((kpi) => {
            const Icon = kpi.icon
            return (
              <div key={kpi.label} style={{ background: 'var(--clr-sidebar)', border: '1px solid var(--clr-border)', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--clr-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{kpi.label}</span>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: kpi.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={14} style={{ color: kpi.color }} />
                  </div>
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--clr-text)' }}>{isLoading ? '—' : kpi.value}</div>
                <div style={{ fontSize: 11, color: 'var(--clr-text-subtle)', marginTop: 3 }}>{kpi.sub}</div>
              </div>
            )
          })}
        </div>

        {/* ── Toolbar ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>

          {/* Search */}
          <div style={{ position: 'relative', width: 240 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--clr-text-subtle)', pointerEvents: 'none' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar cliente, RUC, email…"
              style={{ width: '100%', background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 8, padding: '7px 10px 7px 30px', fontSize: 12, color: 'var(--clr-text)', outline: 'none', boxSizing: 'border-box' }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-text-subtle)', display: 'flex', padding: 0 }}>
                <X size={12} />
              </button>
            )}
          </div>

          <div style={{ width: 1, height: 22, background: 'var(--clr-border)' }} />

          {/* Filter pills */}
          <div style={{ display: 'flex', gap: 6 }}>
            {FILTERS.map((f) => (
              <button key={f.key} onClick={() => setFilter(f.key)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${filter === f.key ? 'var(--clr-primary)' : 'var(--clr-border)'}`, background: filter === f.key ? 'var(--clr-primary-bg)' : 'transparent', color: filter === f.key ? 'var(--clr-primary-lt)' : 'var(--clr-text-subtle)', transition: 'all 0.15s' }}>
                {f.label}
                <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 10, background: filter === f.key ? 'rgba(128,128,128,0.2)' : 'var(--clr-surface-hover)', color: filter === f.key ? 'var(--clr-primary-lt)' : 'var(--clr-text-subtle)' }}>{f.count}</span>
              </button>
            ))}
          </div>

          {/* Sort buttons */}
          {(['name', 'credit', 'detraccion'] as SortKey[]).map((k) => {
            const labels: Record<SortKey, string> = { name: 'Nombre', credit: 'Crédito', detraccion: 'Detracción' }
            const active = sort === k
            return (
              <button key={k} onClick={() => toggleSort(k)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1px solid ${active ? 'var(--clr-primary)' : 'var(--clr-border)'}`, background: active ? 'var(--clr-surface-hover)' : 'transparent', color: active ? 'var(--clr-text-muted)' : 'var(--clr-text-subtle)', transition: 'all 0.15s' }}>
                <ArrowUpDown size={10} />
                {labels[k]}
                {active && <span style={{ fontSize: 10 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
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
          <div style={{ display: 'grid', gridTemplateColumns: view === 'grid' ? 'repeat(3, 1fr)' : '1fr', gap: 12 }}>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} style={{ height: view === 'grid' ? 200 : 60, borderRadius: 10, background: 'var(--clr-surface)', border: '1px solid var(--clr-border)' }} className="animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--clr-text-subtle)' }}>
            <Users size={40} style={{ margin: '0 auto 12px', opacity: 0.3, display: 'block' }} />
            <p style={{ fontWeight: 600, margin: 0, color: 'var(--clr-text-subtle)' }}>
              {search ? `Sin resultados para "${search}"` : filter !== 'ALL' ? 'Sin clientes para este filtro' : 'No hay clientes registrados'}
            </p>
            {(search || filter !== 'ALL') && (
              <button onClick={() => { setSearch(''); setFilter('ALL') }} style={{ marginTop: 10, fontSize: 12, color: 'var(--clr-primary)', background: 'none', border: 'none', cursor: 'pointer' }}>
                Ver todos los clientes
              </button>
            )}
          </div>
        ) : view === 'grid' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {filtered.map((c) => (
              <ClientCard key={c.id} c={c} onEdit={() => openEdit(c)} onDelete={() => setDeleting(c)} />
            ))}
          </div>
        ) : (
          <div style={{ background: 'var(--clr-sidebar)', border: '1px solid var(--clr-border)', borderRadius: 12, overflow: 'hidden' }}>
            {/* Table header */}
            <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 130px 100px 110px 130px', gap: 12, padding: '8px 16px', background: 'var(--clr-surface)', borderBottom: '1px solid var(--clr-border)' }}>
              {['', 'CLIENTE', 'CONTACTO', 'CRÉDITO', 'DETRACCIÓN', 'ACCIONES'].map((h, i) => (
                <div key={h || i} style={{ fontSize: 10, fontWeight: 600, color: 'var(--clr-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: i === 5 ? 'right' : 'left' }}>{h}</div>
              ))}
            </div>
            {filtered.map((c) => (
              <ClientRow key={c.id} c={c} onEdit={() => openEdit(c)} onDelete={() => setDeleting(c)} />
            ))}
          </div>
        )}
      </div>

      {modalOpen   && <ClientModal key={editing?.id ?? 'new'} client={editing} onClose={closeModal} />}
      {deleting    && <DeleteConfirm client={deleting} onClose={() => setDeleting(undefined)} />}
      {importOpen  && <ImportContactsModal clients={clients} onClose={() => setImportOpen(false)} />}
    </AppShell>
  )
}
