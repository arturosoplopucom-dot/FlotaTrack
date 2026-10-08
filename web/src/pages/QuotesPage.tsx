import { useState, useEffect } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useSearchStore } from '../store/search.store'
import { useForm, useFieldArray } from 'react-hook-form'
import { format, parseISO, addDays } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Plus, FileText, Download, Trash2, CheckCircle, XCircle,
  Send, RotateCcw, ChevronRight, ClipboardList, Mail, X, Search,
  AlertTriangle, Wrench, Timer, Loader2,
} from 'lucide-react'
import { WhatsAppIcon } from '../components/WhatsAppIcon'
import {
  useQuotes, useCreateQuote, useUpdateQuote, useUpdateQuoteStatus, useDeleteQuote,
  type Quote, type QuoteStatus,
} from '../hooks/useQuotes'
import { useClients, useEquipment, useCompany } from '../hooks/useFlota'
import { useActiveSessions } from '../hooks/useMaintenance'
import AppShell from '../components/AppShell'
import { SearchableDropdown } from '../components/SearchableDropdown'
import { downloadQuotePDF, previewQuotePDFUrl } from '../components/QuotePDF'

const fmt = (n: number | string) =>
  'S/ ' + Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtDate = (iso: string) =>
  format(parseISO(iso), 'dd MMM yyyy', { locale: es })

const STATUS_LABEL: Record<QuoteStatus, string> = {
  DRAFT:     'Borrador',
  SENT:      'Enviada',
  APPROVED:  'Aprobada',
  REJECTED:  'Rechazada',
  CONVERTED: 'Convertida',
}

const STATUS_DOT_Q: Record<QuoteStatus, string> = {
  DRAFT:     'var(--clr-text-subtle)',
  SENT:      'var(--clr-primary)',
  APPROVED:  'var(--clr-success)',
  REJECTED:  'var(--clr-danger)',
  CONVERTED: 'var(--clr-violet)',
}

// ─── QuoteForm types ──────────────────────────────────────────────────────────
type ItemForm = { description: string; quantity: string; unitPrice: string }
type QuoteForm = {
  clientId: string
  equipmentId: string
  validUntil: string
  currency: 'PEN' | 'USD'
  notes: string
  items: ItemForm[]
}

// ─── Modal: Crear / Editar ────────────────────────────────────────────────────
function QuoteModal({ quote, preselectedEquipmentId, onClose }: { quote?: Quote; preselectedEquipmentId?: string; onClose: () => void }) {
  const { data: clients = [] } = useClients()
  const { data: equipment = [] } = useEquipment()
  const { data: activeSessions = [] } = useActiveSessions()
  const create = useCreateQuote()
  const update = useUpdateQuote()

  const [clientId, setClientId]       = useState(quote?.clientId ?? '')
  const [equipmentId, setEquipmentId] = useState(quote?.equipmentId ?? preselectedEquipmentId ?? '')
  const [error, setError]           = useState('')

  // Sesión de mantenimiento activa del equipo seleccionado
  const activeSession = equipmentId
    ? activeSessions.find((s) => s.equipmentId === equipmentId) ?? null
    : null
  // Fallback: equipo con status MAINTENANCE pero sin sesión registrada
  const selectedEquip = equipment.find((e) => e.id === equipmentId)
  const isInMaintenance = activeSession !== null || selectedEquip?.status === 'MAINTENANCE'

  const defaultValidUntil = quote?.validUntil
    ? quote.validUntil.slice(0, 10)
    : format(addDays(new Date(), 30), 'yyyy-MM-dd')

  const { register, control, handleSubmit, watch, setValue } = useForm<QuoteForm>({
    defaultValues: {
      clientId:    quote?.clientId ?? '',
      equipmentId: quote?.equipmentId ?? preselectedEquipmentId ?? '',
      validUntil:  defaultValidUntil,
      currency:    quote?.currency ?? 'PEN',
      notes:       quote?.notes ?? '',
      items: quote?.items.map((i) => ({
        description: i.description,
        quantity:    String(i.quantity),
        unitPrice:   String(i.unitPrice),
      })) ?? [{ description: '', quantity: '1', unitPrice: '0' }],
    },
  })

  // Auto-populate primera línea con el nombre del equipo preseleccionado
  useEffect(() => {
    if (!preselectedEquipmentId || quote) return
    const eq = equipment.find((e) => e.id === preselectedEquipmentId)
    if (eq) setValue('items.0.description' as any, eq.name)
  }, [preselectedEquipmentId, equipment])

  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const items = watch('items')
  const currency = watch('currency')

  const subtotal = items.reduce((s, it) => s + (parseFloat(it.quantity) || 0) * (parseFloat(it.unitPrice) || 0), 0)
  const igv = subtotal * 0.18
  const total = subtotal + igv
  const sym = currency === 'PEN' ? 'S/' : '$'

  const clientItems = clients.map((c) => ({ id: c.id, primary: c.businessName, secondary: c.ruc }))
  const equipItems  = [
    { id: '', primary: 'Sin equipo', secondary: 'Cotización general' },
    ...equipment.map((e) => ({ id: e.id, primary: e.name, secondary: e.type })),
  ]

  const onSubmit = async (data: QuoteForm) => {
    if (!clientId) { setError('Selecciona un cliente'); return }
    const parsedItems = data.items.map((it, idx) => ({
      description: it.description,
      quantity:    parseFloat(it.quantity) || 1,
      unitPrice:   parseFloat(it.unitPrice) || 0,
      order:       idx,
    }))
    if (parsedItems.some((it) => !it.description)) { setError('Todas las líneas requieren descripción'); return }
    setError('')

    const payload = {
      clientId,
      equipmentId: equipmentId || undefined,
      validUntil:  data.validUntil,
      currency:    data.currency,
      notes:       data.notes || undefined,
      items:       parsedItems,
    }

    if (quote) await update.mutateAsync({ id: quote.id, ...payload })
    else        await create.mutateAsync(payload)
    onClose()
  }

  const inpStyle: React.CSSProperties = {
    width: '100%', background: 'var(--clr-surface)', color: 'var(--clr-text)',
    borderRadius: 8, padding: '9px 12px', border: '1px solid var(--clr-border)',
    fontSize: 13, outline: 'none', boxSizing: 'border-box',
  }
  const labelSt: React.CSSProperties = { fontSize: 11, color: 'var(--clr-text-subtle)', marginBottom: 4, display: 'block' }
  const inpSm: React.CSSProperties = {
    background: 'var(--clr-surface)', color: 'var(--clr-text)', borderRadius: 6,
    padding: '6px 8px', border: '1px solid var(--clr-border)', fontSize: 12, outline: 'none',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
      <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 16, width: '100%', maxWidth: 780, display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottom: '1px solid var(--clr-border)', flexShrink: 0 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--clr-text)' }}>{quote ? `Editar ${quote.number}` : 'Nueva Cotización'}</h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--clr-text-subtle)' }}>Completa los datos de la cotización</p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} style={{ overflowY: 'auto', flex: 1, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Cliente — ancho completo */}
          <SearchableDropdown
            label="Cliente *"
            placeholder="Buscar cliente..."
            items={clientItems}
            value={clientId}
            onChange={setClientId}
          />

          {/* Equipo + Fecha + Moneda */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr) minmax(0,1fr)', gap: 12 }}>
            <SearchableDropdown
              label="Equipo (opcional)"
              placeholder="Buscar equipo..."
              items={equipItems}
              value={equipmentId}
              onChange={setEquipmentId}
            />
            <div>
              <label style={labelSt}>Válida hasta *</label>
              <input type="date" {...register('validUntil', { required: true })} style={inpStyle} />
            </div>
            <div>
              <label style={labelSt}>Moneda</label>
              <select {...register('currency')} style={inpStyle}>
                <option value="PEN">Soles (PEN)</option>
                <option value="USD">Dólares (USD)</option>
              </select>
            </div>
          </div>

          {/* Alerta: equipo en mantenimiento */}
          {isInMaintenance && (
            <div style={{
              display: 'flex', gap: 12, alignItems: 'flex-start',
              background: 'rgba(234,88,12,0.1)', border: '1px solid rgba(234,88,12,0.35)',
              borderRadius: 10, padding: '12px 14px',
            }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(234,88,12,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Wrench size={16} color="var(--clr-orange)" />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'var(--clr-orange)' }}>
                  Equipo en mantenimiento
                </p>
                {activeSession ? (
                  <>
                    <p style={{ margin: '4px 0 0', fontSize: 11, color: '#d97706' }}>
                      {activeSession.workDescription ?? 'Mantenimiento en curso'}
                      {activeSession.technician && ` · ${activeSession.technician}`}
                    </p>
                    <p style={{ margin: '6px 0 0', fontSize: 11, color: '#d97706', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Timer size={10} />
                      {activeSession.estimatedEnd
                        ? <>Disponible estimado: <strong style={{ color: '#d97706', marginLeft: 3 }}>{format(new Date(activeSession.estimatedEnd), 'dd MMM yyyy', { locale: es })}</strong></>
                        : 'Sin fecha estimada de disponibilidad'}
                    </p>
                    <p style={{ margin: '4px 0 0', fontSize: 10, color: '#d97706' }}>
                      Puedes cotizar con este equipo, pero considera que podría no estar disponible en la fecha acordada.
                    </p>
                  </>
                ) : (
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: '#d97706' }}>
                    El equipo está marcado como en mantenimiento. Verifica disponibilidad antes de confirmar la cotización.
                  </p>
                )}
              </div>
              <AlertTriangle size={14} color="var(--clr-orange)" style={{ flexShrink: 0, marginTop: 2 }} />
            </div>
          )}

          {/* Ítems */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--clr-text-muted)' }}>Líneas de servicio *</label>
              <button
                type="button"
                onClick={() => append({ description: '', quantity: '1', unitPrice: '0' })}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--clr-primary)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <Plus size={12} /> Agregar línea
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Cabecera */}
              <div style={{ display: 'grid', gridTemplateColumns: '6fr 2fr 3fr 1fr', gap: 4, fontSize: 11, color: 'var(--clr-text-subtle)', padding: '0 4px' }}>
                <span>Descripción</span>
                <span style={{ textAlign: 'right' }}>Cant.</span>
                <span style={{ textAlign: 'right' }}>P. Unit.</span>
                <span />
              </div>

              {fields.map((field, idx) => {
                const rowTotal = (parseFloat(items[idx]?.quantity) || 0) * (parseFloat(items[idx]?.unitPrice) || 0)
                return (
                  <div key={field.id} style={{ display: 'grid', gridTemplateColumns: '6fr 2fr 3fr 1fr', gap: 4, alignItems: 'center', background: 'var(--clr-bg)', borderRadius: 8, padding: 8 }}>
                    <input
                      {...register(`items.${idx}.description`)}
                      placeholder="Descripción del servicio"
                      style={{ ...inpSm, gridColumn: '1' }}
                    />
                    <input
                      {...register(`items.${idx}.quantity`)}
                      type="number" step="1" min="1"
                      placeholder="1"
                      style={{ ...inpSm, textAlign: 'right' }}
                    />
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--clr-text-subtle)', pointerEvents: 'none' }}>{sym}</span>
                      <input
                        {...register(`items.${idx}.unitPrice`)}
                        type="number" step="0.01" min="0"
                        placeholder="0.00"
                        style={{ ...inpSm, width: '100%', boxSizing: 'border-box', paddingLeft: 20, textAlign: 'right' }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => fields.length > 1 && remove(idx)}
                      disabled={fields.length === 1}
                      style={{ display: 'flex', justifyContent: 'center', background: 'none', border: 'none', cursor: fields.length === 1 ? 'default' : 'pointer', color: 'var(--clr-text-subtle)', opacity: fields.length === 1 ? 0.3 : 1 }}
                      onMouseEnter={(e) => { if (fields.length > 1) e.currentTarget.style.color = 'var(--clr-danger)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--clr-text-subtle)' }}
                    >
                      <Trash2 size={14} />
                    </button>
                    {rowTotal > 0 && (
                      <div style={{ gridColumn: '1 / -1', textAlign: 'right', fontSize: 11, color: 'var(--clr-text-subtle)', paddingRight: 24 }}>
                        = {sym} {rowTotal.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Totales en tiempo real */}
          <div style={{ background: 'var(--clr-bg)', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, border: '1px solid var(--clr-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--clr-text-subtle)' }}>
              <span>Subtotal</span>
              <span>{sym} {subtotal.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--clr-text-subtle)' }}>
              <span>IGV 18%</span>
              <span>{sym} {igv.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: 'var(--clr-text)', borderTop: '1px solid var(--clr-border)', paddingTop: 6, marginTop: 2 }}>
              <span>Total</span>
              <span>{sym} {total.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          {/* Notas */}
          <div>
            <label style={labelSt}>Observaciones / Condiciones</label>
            <textarea
              {...register('notes')}
              rows={2}
              placeholder="Condiciones de pago, garantías, alcance del servicio..."
              style={{ ...inpStyle, resize: 'none' }}
            />
          </div>

          {error && (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--clr-danger)', background: 'var(--clr-danger-bg)', border: '1px solid var(--clr-danger-border)', borderRadius: 8, padding: '8px 12px' }}>{error}</p>
          )}
        </form>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 12, padding: 20, borderTop: '1px solid var(--clr-border)', flexShrink: 0 }}>
          <button type="button" onClick={onClose}
            style={{ flex: 1, background: 'var(--clr-sidebar)', color: 'var(--clr-text-muted)', border: '1px solid var(--clr-border)', borderRadius: 12, padding: '10px 0', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--clr-surface-hover)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--clr-sidebar)' }}
          >Cancelar</button>
          <button
            onClick={handleSubmit(onSubmit)}
            disabled={create.isPending || update.isPending}
            style={{ flex: 1, background: 'var(--clr-primary)', color: 'var(--clr-on-primary)', border: 'none', borderRadius: 12, padding: '10px 0', fontSize: 13, fontWeight: 700, cursor: (create.isPending || update.isPending) ? 'not-allowed' : 'pointer', opacity: (create.isPending || update.isPending) ? 0.5 : 1 }}
          >
            {(create.isPending || update.isPending) ? 'Guardando…' : quote ? 'Guardar cambios' : 'Crear Cotización'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── QuotesPage ───────────────────────────────────────────────────────────────
export default function QuotesPage() {
  const { data: quotes = [], isLoading } = useQuotes()
  const { data: company } = useCompany()
  const updateStatus = useUpdateQuoteStatus()
  const deleteQuote  = useDeleteQuote()
  const navigate     = useNavigate()
  const location     = useLocation()

  const [searchParams] = useSearchParams()
  const [modalOpen, setModalOpen]             = useState(false)
  const [editing, setEditing]                 = useState<Quote | undefined>()
  const [preselectedEquipmentId, setPreselectedEquipmentId] = useState<string | undefined>()
  const [filter, setFilter]                   = useState<QuoteStatus | 'ALL'>((searchParams.get('tab') as QuoteStatus | null) ?? 'ALL')

  // Auto-open modal when arriving from Equipment page via "Cotizar"
  useEffect(() => {
    const state = location.state as { preselect?: { equipmentId: string } } | null
    if (state?.preselect?.equipmentId) {
      setPreselectedEquipmentId(state.preselect.equipmentId)
      setEditing(undefined)
      setModalOpen(true)
      window.history.replaceState({}, '')
    }
  }, [])
  const [confirmDelete, setConfirmDelete] = useState<Quote | null>(null)
  const [sendQuote, setSendQuote]  = useState<Quote | null>(null)
  const [rejectQuote, setRejectQuote] = useState<Quote | null>(null)
  const [rejectNote, setRejectNote]   = useState('')
  const [detailQuote, setDetailQuote] = useState<Quote | null>(null)

  // Vista previa PDF de Cotización
  const [previewQuote,   setPreviewQuote]   = useState<Quote | null>(null)
  const [previewQUrl,    setPreviewQUrl]    = useState<string>('')
  const [previewQLoading, setPreviewQLoading] = useState(false)

  async function openPreviewQuote(q: Quote) {
    setPreviewQuote(q)
    setPreviewQUrl('')
    setPreviewQLoading(true)
    try {
      const co = company ?? { id: '', name: 'Empresa', ruc: '', plan: '' }
      const url = await previewQuotePDFUrl(q, co)
      setPreviewQUrl(url)
    } catch { setPreviewQUrl('') }
    finally { setPreviewQLoading(false) }
  }

  const [search, setSearch] = useState('')
  const storeQuery = useSearchStore((s) => s.query)
  const clearStore = useSearchStore((s) => s.clear)
  useEffect(() => { if (storeQuery) { setSearch(storeQuery); clearStore() } }, [storeQuery])

  const filtered = filter === 'ALL' ? quotes : quotes.filter((q) => q.status === filter)
  const filteredAndSearched = search.trim()
    ? filtered.filter((q) =>
        q.number.toLowerCase().includes(search.toLowerCase()) ||
        q.client.businessName.toLowerCase().includes(search.toLowerCase()) ||
        (q.equipment?.name ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : filtered

  const kpiDraft     = quotes.filter((q) => q.status === 'DRAFT').length
  const kpiSent      = quotes.filter((q) => q.status === 'SENT').length
  const kpiApproved  = quotes.filter((q) => q.status === 'APPROVED').length
  const totalApproved = quotes
    .filter((q) => q.status === 'APPROVED')
    .reduce((s, q) => s + Number(q.total), 0)

  const openEdit = (q: Quote) => { setEditing(q); setModalOpen(true) }
  const closeModal = () => { setEditing(undefined); setModalOpen(false) }

  const handleStatus = (q: Quote, status: QuoteStatus) =>
    updateStatus.mutate({ id: q.id, status })

  const handleRejectConfirm = () => {
    if (!rejectQuote) return
    updateStatus.mutate({ id: rejectQuote.id, status: 'REJECTED', rejectionNotes: rejectNote.trim() || undefined })
    setRejectQuote(null)
    setRejectNote('')
  }

  const buildShareText = (q: Quote) => {
    const lines = q.items.map((it, i) =>
      `  ${i + 1}. ${it.description} — ${it.quantity} x S/ ${Number(it.unitPrice).toFixed(2)}`
    ).join('\n')
    return (
      `Estimado(a) *${q.client.businessName}*,\n\n` +
      `Adjuntamos la cotización *${q.number}* de Gruas Omega S.A.C.\n\n` +
      `📋 *Detalle:*\n${lines}\n\n` +
      `💰 *Total (inc. IGV):* S/ ${Number(q.total).toFixed(2)}\n` +
      `📅 *Válida hasta:* ${fmtDate(q.validUntil)}\n\n` +
      `Quedamos atentos a su confirmación.`
    )
  }

  const handleWhatsApp = (q: Quote, phone?: string) => {
    const text = encodeURIComponent(buildShareText(q))
    const url = phone
      ? `https://wa.me/51${phone.replace(/\D/g, '')}?text=${text}`
      : `https://wa.me/?text=${text}`
    window.open(url, '_blank')
    handleStatus(q, 'SENT')
    setSendQuote(null)
  }

  const handleEmail = (q: Quote) => {
    const subject = encodeURIComponent(`Cotización ${q.number} — Gruas Omega S.A.C.`)
    const body = encodeURIComponent(buildShareText(q).replace(/\*/g, ''))
    const to = q.client.email ?? ''
    window.open(`mailto:${to}?subject=${subject}&body=${body}`, '_blank')
    handleStatus(q, 'SENT')
    setSendQuote(null)
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    await deleteQuote.mutateAsync(confirmDelete.id)
    setConfirmDelete(null)
  }

  const handlePDF = (q: Quote) => {
    if (!company) return
    downloadQuotePDF(q, company)
  }

  const FILTERS: { key: QuoteStatus | 'ALL'; label: string }[] = [
    { key: 'ALL',       label: 'Todas' },
    { key: 'DRAFT',     label: 'Borrador' },
    { key: 'SENT',      label: 'Enviadas' },
    { key: 'APPROVED',  label: 'Aprobadas' },
    { key: 'REJECTED',  label: 'Rechazadas' },
    { key: 'CONVERTED', label: 'Convertidas' },
  ]

  return (
    <AppShell active="quotes" title="Cotizaciones">
      <div style={{ maxWidth: 1400, padding: '24px 28px' }}>
        {/* Page Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--clr-text)', margin: 0 }}>Cotizaciones</h1>
            <p style={{ fontSize: 13, color: 'var(--clr-text-subtle)', marginTop: 4 }}>
              {quotes.length} cotizaciones · {kpiSent} enviadas · {kpiApproved} aprobadas
              {totalApproved > 0 && <> · {fmt(totalApproved)} aprobado</>}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setModalOpen(true)}
              style={{ fontSize: 13, padding: '8px 16px', borderRadius: 8, background: 'var(--clr-primary)', color: 'var(--clr-on-primary)', border: 'none', cursor: 'pointer', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Plus size={14} /> Nueva Cotización
            </button>
          </div>
        </div>

        {/* Filters + search */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {FILTERS.map((f) => {
              const count = f.key === 'ALL' ? quotes.length : quotes.filter((q) => q.status === f.key).length
              const isActive = filter === f.key
              return (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  style={{
                    padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                    background: isActive ? 'var(--clr-primary)' : 'transparent',
                    color: isActive ? 'var(--clr-on-primary)' : 'var(--clr-text-subtle)',
                    border: isActive ? '1px solid transparent' : '1px solid var(--clr-border)',
                    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
                  }}
                >
                  {f.label}
                  {count > 0 && (
                    <span style={{
                      background: isActive ? 'rgba(128,128,128,0.25)' : 'var(--clr-surface-hover)',
                      color: isActive ? 'var(--clr-on-primary)' : 'var(--clr-text-muted)',
                      borderRadius: 10, padding: '0 5px', fontSize: 10, fontWeight: 700, lineHeight: '16px',
                    }}>
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 8, padding: '5px 10px' }}>
            <Search size={12} style={{ color: 'var(--clr-text-subtle)' }} />
            <input
              placeholder="Buscar cotización, cliente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 12, color: 'var(--clr-text)', width: 170 }}
            />
          </div>
        </div>

        {/* Lista */}
        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ height: 100, borderRadius: 10, background: 'var(--clr-surface)', border: '1px solid var(--clr-border)' }} className="animate-pulse" />
            ))}
          </div>
        ) : filteredAndSearched.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--clr-text-subtle)' }}>
            <FileText size={40} style={{ margin: '0 auto 12px', opacity: 0.4, display: 'block' }} />
            <p style={{ fontWeight: 600, margin: 0 }}>
              No hay cotizaciones {filter !== 'ALL' ? `con estado "${STATUS_LABEL[filter as QuoteStatus]}"` : ''}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredAndSearched.map((q) => {
              const dotColor = STATUS_DOT_Q[q.status] ?? 'var(--clr-text-subtle)'
              return (
                <div
                  key={q.id}
                  style={{
                    background: 'var(--clr-surface)',
                    border: '1px solid var(--clr-border)',
                    borderLeft: `3px solid ${dotColor}`,
                    borderRadius: 10,
                    padding: '14px 16px',
                  }}
                >
                  {/* Top row */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--clr-doc-number)', background: 'var(--clr-doc-number-bg)', fontSize: 12, padding: '1px 7px', borderRadius: 4 }}>{q.number}</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, display: 'inline-block', flexShrink: 0 }} />
                          <span style={{ color: 'var(--clr-text-muted)' }}>{STATUS_LABEL[q.status]}</span>
                        </span>
                        {q.workOrder && (
                          <span style={{ fontSize: 10, background: 'var(--clr-violet-bg)', color: 'var(--clr-violet)', padding: '2px 7px', borderRadius: 4, border: '1px solid var(--clr-violet-border)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <ClipboardList size={9} /> {q.workOrder.number}
                          </span>
                        )}
                      </div>
                      <div style={{ color: 'var(--clr-text)', fontSize: 13, fontWeight: 600, marginBottom: 3 }}>{q.client.businessName}</div>
                      <div style={{ color: 'var(--clr-text-subtle)', fontSize: 12 }}>
                        RUC: {q.client.ruc}
                        {q.equipment && <> · {q.equipment.name}</>}
                        {' · '}Válida hasta: <span style={{ color: 'var(--clr-text-muted)' }}>{fmtDate(q.validUntil)}</span>
                      </div>
                      {q.items.length > 0 && (
                        <div style={{ color: 'var(--clr-text-subtle)', fontSize: 11, marginTop: 4 }}>
                          {q.items.length} línea{q.items.length !== 1 ? 's' : ''}: {q.items[0].description}{q.items.length > 1 ? ` +${q.items.length - 1} más` : ''}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontWeight: 700, color: 'var(--clr-text)', fontSize: 15 }}>{fmt(q.total)}</div>
                      <div style={{ fontSize: 11, color: 'var(--clr-text-subtle)', marginTop: 2 }}>Total con IGV</div>
                    </div>
                  </div>

                  {/* Action row */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--clr-border)', flexWrap: 'wrap', alignItems: 'center' }}>
                    {/* Ver Detalle */}
                    <button
                      onClick={() => setDetailQuote(q)}
                      style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, background: 'var(--clr-surface-hover)', color: 'var(--clr-primary-lt)', border: '1px solid var(--clr-border)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600 }}
                    >
                      <FileText size={11} /> Ver Detalle
                    </button>
                    {/* PDF */}
                    <button
                      onClick={() => openPreviewQuote(q)}
                      style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, background: 'var(--clr-surface-hover)', color: 'var(--clr-text-muted)', border: '1px solid var(--clr-border)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      <Download size={11} /> PDF
                    </button>
                    {/* Editar */}
                    {(q.status === 'DRAFT' || q.status === 'SENT') && (
                      <button
                        onClick={() => openEdit(q)}
                        style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, background: 'var(--clr-surface-hover)', color: 'var(--clr-primary-lt)', border: '1px solid var(--clr-border)', cursor: 'pointer', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        <FileText size={11} /> Editar
                      </button>
                    )}
                    {/* Workflow */}
                    {q.status === 'DRAFT' && (
                      <button
                        onClick={() => setSendQuote(q)}
                        style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, background: 'rgba(37,99,235,0.2)', color: 'var(--clr-primary-lt)', border: '1px solid rgba(37,99,235,0.4)', cursor: 'pointer', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        <Send size={11} /> Enviar
                      </button>
                    )}
                    {q.status === 'SENT' && (
                      <>
                        <button
                          onClick={() => handleStatus(q, 'APPROVED')}
                          style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, background: 'var(--clr-success-bg)', color: 'var(--clr-success)', border: '1px solid var(--clr-success-border)', cursor: 'pointer', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          <CheckCircle size={11} /> Aprobar
                        </button>
                        <button
                          onClick={() => { setRejectNote(''); setRejectQuote(q) }}
                          style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, background: 'var(--clr-danger-bg)', color: 'var(--clr-danger)', border: '1px solid var(--clr-danger-border)', cursor: 'pointer', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          <XCircle size={11} /> Rechazar
                        </button>
                        <button
                          onClick={() => handleStatus(q, 'DRAFT')}
                          style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, background: 'var(--clr-surface-hover)', color: 'var(--clr-text-subtle)', border: '1px solid var(--clr-border)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          <RotateCcw size={11} /> Borrador
                        </button>
                      </>
                    )}
                    {q.status === 'APPROVED' && (
                      <button
                        onClick={() => {
                          navigate('/workorders', { state: { fromQuote: q } })
                        }}
                        style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, background: 'var(--clr-violet-bg)', color: 'var(--clr-violet)', border: '1px solid var(--clr-violet-border)', cursor: 'pointer', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        <ClipboardList size={11} /> Crear Orden de Trabajo
                      </button>
                    )}
                    {q.status === 'CONVERTED' && (
                      <span style={{ fontSize: 11, color: 'var(--clr-violet)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <CheckCircle size={11} /> Convertida en OT {q.workOrder && `— ${q.workOrder.number}`}
                      </span>
                    )}
                    {q.status === 'REJECTED' && (
                      <>
                        <button
                          onClick={() => setSendQuote(q)}
                          style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, background: 'rgba(37,99,235,0.2)', color: 'var(--clr-primary-lt)', border: '1px solid rgba(37,99,235,0.4)', cursor: 'pointer', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          <Send size={11} /> Reenviar
                        </button>
                        <button
                          onClick={() => handleStatus(q, 'DRAFT')}
                          style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, background: 'var(--clr-surface-hover)', color: 'var(--clr-text-subtle)', border: '1px solid var(--clr-border)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          <RotateCcw size={11} /> Reactivar
                        </button>
                      </>
                    )}
                    {/* Eliminar (solo borrador, alineado a la derecha) */}
                    {q.status === 'DRAFT' && (
                      <button
                        onClick={() => setConfirmDelete(q)}
                        style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, background: 'var(--clr-danger-bg)', color: 'var(--clr-danger)', border: '1px solid var(--clr-danger-border)', cursor: 'pointer', marginLeft: 'auto' }}
                      >
                        Eliminar
                      </button>
                    )}
                    {/* Notas de rechazo inline */}
                    {q.status === 'REJECTED' && q.rejectionNotes && (
                      <div style={{ width: '100%', background: 'var(--clr-danger-bg)', border: '1px solid var(--clr-danger-border)', borderRadius: 6, padding: '6px 10px', marginTop: 4, fontSize: 11, color: 'var(--clr-danger)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                        <XCircle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
                        {q.rejectionNotes}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal crear/editar */}
      {modalOpen && (
        <QuoteModal
          key={editing?.id ?? 'new'}
          quote={editing}
          preselectedEquipmentId={editing ? undefined : preselectedEquipmentId}
          onClose={() => { setPreselectedEquipmentId(undefined); closeModal() }}
        />
      )}

      {/* Modal envío WhatsApp / Email */}
      {sendQuote && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 360 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--clr-text)' }}>Enviar {sendQuote.number}</h3>
              <button onClick={() => setSendQuote(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-text-subtle)', display: 'flex', padding: 4 }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--clr-text)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--clr-text-subtle)' }}
              ><X size={18} /></button>
            </div>

            <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--clr-text-muted)' }}>
              Elige cómo enviar la cotización a{' '}
              <strong style={{ color: 'var(--clr-text)' }}>{sendQuote.client.businessName}</strong>.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* WhatsApp */}
              <button
                onClick={() => handleWhatsApp(sendQuote, sendQuote.client.phone ?? undefined)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--clr-wa-btn-bg)', border: '1px solid var(--clr-wa-btn-border)', color: 'var(--clr-wa-btn)', padding: '12px 16px', borderRadius: 12, cursor: 'pointer', textAlign: 'left' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--clr-wa-btn-hover)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--clr-wa-btn-bg)' }}
              >
                <WhatsAppIcon size={20} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>WhatsApp</div>
                  <div style={{ fontSize: 11, color: 'var(--clr-wa-btn-sub)' }}>
                    {sendQuote.client.phone ? `+51 ${sendQuote.client.phone}` : 'Abrir WhatsApp Web'}
                  </div>
                </div>
              </button>

              {/* Correo */}
              <button
                onClick={() => handleEmail(sendQuote)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--clr-email-btn-bg)', border: '1px solid var(--clr-email-btn-border)', color: 'var(--clr-email-btn)', padding: '12px 16px', borderRadius: 12, cursor: 'pointer', textAlign: 'left' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--clr-email-btn-hover)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--clr-email-btn-bg)' }}
              >
                <Mail size={20} style={{ flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>Correo electrónico</div>
                  <div style={{ fontSize: 11, color: 'var(--clr-email-btn-sub)' }}>
                    {sendQuote.client.email ?? 'Abrir cliente de correo'}
                  </div>
                </div>
              </button>

              {/* Solo marcar */}
              <button
                onClick={() => { handleStatus(sendQuote, 'SENT'); setSendQuote(null) }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--clr-sidebar)', border: '1px solid var(--clr-border)', color: 'var(--clr-text-subtle)', padding: '12px 16px', borderRadius: 12, cursor: 'pointer', textAlign: 'left' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--clr-surface-hover)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--clr-sidebar)' }}
              >
                <ChevronRight size={20} style={{ flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>Solo marcar como enviada</div>
                  <div style={{ fontSize: 11, color: 'var(--clr-text-subtle)' }}>Sin enviar por ahora</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal rechazo con observación */}
      {rejectQuote && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 360 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--clr-text)' }}>Rechazar cotización</h3>
              <button onClick={() => setRejectQuote(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-text-subtle)', display: 'flex', padding: 4 }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--clr-text)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--clr-text-subtle)' }}
              ><X size={18} /></button>
            </div>
            <p style={{ margin: '0 0 16px', fontSize: 11, color: 'var(--clr-text-subtle)' }}>{rejectQuote.number} — {rejectQuote.client.businessName}</p>

            <label style={{ fontSize: 11, color: 'var(--clr-text-subtle)', marginBottom: 6, display: 'block' }}>
              Motivo u observación <span style={{ color: 'var(--clr-text-subtle)' }}>(opcional)</span>
            </label>
            <textarea
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              rows={3}
              placeholder="Ej: El cliente realizará los trabajos después del 15 de octubre, confirmar nueva fecha..."
              style={{ width: '100%', background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: 'var(--clr-text)', outline: 'none', resize: 'none', marginBottom: 16, boxSizing: 'border-box' }}
            />

            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setRejectQuote(null)}
                style={{ flex: 1, background: 'var(--clr-sidebar)', color: 'var(--clr-text-muted)', border: '1px solid var(--clr-border)', borderRadius: 12, padding: '10px 0', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--clr-surface-hover)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--clr-sidebar)' }}
              >Cancelar</button>
              <button
                onClick={handleRejectConfirm}
                disabled={updateStatus.isPending}
                style={{ flex: 1, background: 'var(--clr-danger)', color: 'white', border: 'none', borderRadius: 12, padding: '10px 0', fontSize: 13, fontWeight: 700, cursor: updateStatus.isPending ? 'not-allowed' : 'pointer', opacity: updateStatus.isPending ? 0.5 : 1 }}
              >
                {updateStatus.isPending ? 'Guardando…' : 'Confirmar rechazo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Detalle Cotización */}
      {detailQuote && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}
          onClick={() => setDetailQuote(null)}
        >
          <div
            style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 580, maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--clr-text)' }}>{detailQuote.number}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
                    background: detailQuote.status === 'APPROVED' ? 'var(--clr-success-bg)' : detailQuote.status === 'CONVERTED' ? 'var(--clr-violet-bg)' : detailQuote.status === 'REJECTED' ? 'var(--clr-danger-bg)' : detailQuote.status === 'SENT' ? 'var(--clr-primary-bg)' : 'rgba(100,116,139,0.12)',
                    color: detailQuote.status === 'APPROVED' ? 'var(--clr-success)' : detailQuote.status === 'CONVERTED' ? 'var(--clr-violet)' : detailQuote.status === 'REJECTED' ? 'var(--clr-danger)' : detailQuote.status === 'SENT' ? 'var(--clr-primary)' : 'var(--clr-text-muted)',
                  }}>
                    {detailQuote.status === 'DRAFT' ? 'Borrador' : detailQuote.status === 'SENT' ? 'Enviada' : detailQuote.status === 'APPROVED' ? 'Aprobada' : detailQuote.status === 'REJECTED' ? 'Rechazada' : 'Convertida'}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--clr-text-subtle)' }}>
                  Emitida: {format(parseISO(detailQuote.issueDate), 'dd MMM yyyy', { locale: es })} · Válida hasta: {format(parseISO(detailQuote.validUntil), 'dd MMM yyyy', { locale: es })}
                </div>
              </div>
              <button onClick={() => setDetailQuote(null)} style={{ background: 'transparent', border: 'none', color: 'var(--clr-text-subtle)', cursor: 'pointer', padding: 4, lineHeight: 1 }}>
                <X size={18} />
              </button>
            </div>

            {/* Cliente / Equipo */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--clr-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Cliente</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--clr-text)', marginBottom: 2 }}>{detailQuote.client.businessName}</div>
                <div style={{ fontSize: 11, color: 'var(--clr-text-subtle)' }}>RUC: {detailQuote.client.ruc}</div>
                {detailQuote.client.contactName && <div style={{ fontSize: 11, color: 'var(--clr-text-subtle)', marginTop: 2 }}>{detailQuote.client.contactName}</div>}
                {detailQuote.client.phone && <div style={{ fontSize: 11, color: 'var(--clr-text-subtle)' }}>Tel: {detailQuote.client.phone}</div>}
              </div>
              <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--clr-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Equipo</div>
                {detailQuote.equipment ? (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--clr-text)', marginBottom: 2 }}>{detailQuote.equipment.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--clr-text-subtle)' }}>{detailQuote.equipment.type}</div>
                  </>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--clr-text-subtle)' }}>Cotización general</div>
                )}
              </div>
            </div>

            {/* Banner conversión a OT */}
            {detailQuote.status === 'CONVERTED' && detailQuote.workOrder && (
              <div style={{ background: 'var(--clr-violet-bg)', border: '1px solid var(--clr-violet-border)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircle size={15} style={{ color: 'var(--clr-violet)', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--clr-violet)' }}>Convertida en Orden de Trabajo</div>
                    <div style={{ fontSize: 11, color: 'var(--clr-text-subtle)', marginTop: 1 }}>Esta cotización originó la OT <strong style={{ color: 'var(--clr-violet)' }}>{detailQuote.workOrder.number}</strong></div>
                  </div>
                </div>
                <button
                  onClick={() => { setDetailQuote(null); navigate('/workorders', { state: { highlightId: detailQuote.workOrder!.id } }) }}
                  style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, background: 'var(--clr-violet)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', flexShrink: 0 }}
                >
                  <ClipboardList size={11} /> Ver OT
                </button>
              </div>
            )}

            {/* Líneas */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--clr-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Líneas de servicio</div>
              <div style={{ border: '1px solid var(--clr-border)', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '4fr 1fr 1fr 1fr', gap: 0, background: 'var(--clr-bg)', padding: '8px 12px', fontSize: 10, fontWeight: 700, color: 'var(--clr-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <span>Descripción</span><span style={{ textAlign: 'right' }}>Cant.</span><span style={{ textAlign: 'right' }}>P.Unit.</span><span style={{ textAlign: 'right' }}>Total</span>
                </div>
                {detailQuote.items.map((item, idx) => (
                  <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '4fr 1fr 1fr 1fr', gap: 0, padding: '10px 12px', fontSize: 12, color: 'var(--clr-text)', borderTop: idx > 0 ? '1px solid var(--clr-border)' : 'none', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                    <span>{item.description}</span>
                    <span style={{ textAlign: 'right', color: 'var(--clr-text-muted)' }}>{Number(item.quantity).toFixed(2)}</span>
                    <span style={{ textAlign: 'right', color: 'var(--clr-text-muted)' }}>S/ {Number(item.unitPrice).toFixed(2)}</span>
                    <span style={{ textAlign: 'right', fontWeight: 600, color: 'var(--clr-text)' }}>S/ {Number(item.total).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Totales */}
            <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 10, padding: '14px 16px', marginBottom: detailQuote.notes ? 16 : 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--clr-text-muted)', marginBottom: 6 }}>
                <span>Subtotal</span><span>S/ {Number(detailQuote.subtotal).toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--clr-text-muted)', marginBottom: 10 }}>
                <span>IGV 18%</span><span>S/ {Number(detailQuote.igv).toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700, color: 'var(--clr-text)', paddingTop: 10, borderTop: '1px solid var(--clr-border)' }}>
                <span>Total</span><span>S/ {Number(detailQuote.total).toFixed(2)}</span>
              </div>
            </div>

            {/* Observaciones */}
            {detailQuote.notes && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--clr-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Observaciones</div>
                <div style={{ fontSize: 12, color: 'var(--clr-text-muted)', background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 8, padding: '10px 12px', whiteSpace: 'pre-wrap' }}>{detailQuote.notes}</div>
              </div>
            )}

            {/* Footer */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setDetailQuote(null); openPreviewQuote(detailQuote) }}
                style={{ fontSize: 12, padding: '8px 16px', borderRadius: 8, background: 'var(--clr-surface-hover)', color: 'var(--clr-text-muted)', border: '1px solid var(--clr-border)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Download size={13} /> Ver / Descargar PDF
              </button>
              <button
                onClick={() => setDetailQuote(null)}
                style={{ fontSize: 12, padding: '8px 16px', borderRadius: 8, background: 'var(--clr-surface-hover)', color: 'var(--clr-text)', border: '1px solid var(--clr-border)', cursor: 'pointer' }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 360 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: 'var(--clr-text)' }}>Eliminar cotización</h3>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--clr-text-muted)' }}>
              ¿Seguro que quieres eliminar <strong style={{ color: 'var(--clr-text)' }}>{confirmDelete.number}</strong>? Esta acción no se puede deshacer.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setConfirmDelete(null)}
                style={{ flex: 1, background: 'var(--clr-sidebar)', color: 'var(--clr-text-muted)', border: '1px solid var(--clr-border)', borderRadius: 12, padding: '10px 0', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--clr-surface-hover)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--clr-sidebar)' }}
              >Cancelar</button>
              <button
                onClick={handleDelete}
                disabled={deleteQuote.isPending}
                style={{ flex: 1, background: 'var(--clr-danger)', color: 'white', border: 'none', borderRadius: 12, padding: '10px 0', fontSize: 13, fontWeight: 700, cursor: deleteQuote.isPending ? 'not-allowed' : 'pointer', opacity: deleteQuote.isPending ? 0.5 : 1 }}
              >
                {deleteQuote.isPending ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Vista Previa Cotización PDF ───────────────────────────── */}
      {previewQuote && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={(e) => { if (e.target === e.currentTarget) setPreviewQuote(null) }}
        >
          <div style={{ background: 'var(--clr-surface)', borderRadius: 16, width: '100%', maxWidth: 860, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 64px rgba(0,0,0,0.4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--clr-border)' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--clr-text)' }}>{previewQuote.number}</div>
                <div style={{ fontSize: 12, color: 'var(--clr-text-subtle)', marginTop: 2 }}>{previewQuote.client.businessName}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => handlePDF(previewQuote)}
                  disabled={!company}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: 'var(--clr-primary)', color: 'var(--clr-on-primary)', border: 'none', cursor: 'pointer', opacity: company ? 1 : 0.4 }}
                >
                  <Download size={14} /> Descargar PDF
                </button>
                <button
                  onClick={() => setPreviewQuote(null)}
                  style={{ display: 'flex', alignItems: 'center', padding: 8, borderRadius: 8, background: 'var(--clr-surface-hover)', border: '1px solid var(--clr-border)', cursor: 'pointer', color: 'var(--clr-text-muted)' }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'hidden', borderRadius: '0 0 16px 16px', minHeight: 0 }}>
              {previewQLoading ? (
                <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--clr-text-subtle)', fontSize: 14 }}>
                  <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> Generando vista previa…
                </div>
              ) : previewQUrl ? (
                <iframe src={previewQUrl} style={{ width: '100%', height: '100%', border: 'none', minHeight: 500 }} title="Vista previa Cotización" />
              ) : (
                <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--clr-text-subtle)', fontSize: 13 }}>
                  No se pudo generar la vista previa.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </AppShell>
  )
}
