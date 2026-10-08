import { useState, useEffect } from 'react'
import { useSearchStore } from '../store/search.store'
import { SearchableDropdown, type SearchItem } from '../components/SearchableDropdown'
import { useNavigate, useLocation } from 'react-router-dom'
import type { Quote } from '../hooks/useQuotes'
import { useUpdateQuoteStatus } from '../hooks/useQuotes'
import { useForm } from 'react-hook-form'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Plus, FileText, CheckCircle, Zap, Clock, Receipt, X, Trash2, Loader2,
  Truck, User, MapPin, Calendar, ChevronRight, Link, Send,
  Mail, ThumbsUp, XCircle, Download, Search,
} from 'lucide-react'
import { WhatsAppIcon } from '../components/WhatsAppIcon'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  useWorkOrders, useCreateWorkOrder, useUpdateWorkOrder, useUpdateWorkOrderStatus,
  useLinkInvoice, useMarkSent, useMarkAccepted,
  useAddCost, useDeleteCost, useUpdateActualHours,
  useCompany,
  type WorkOrder, type AvailableInvoice, type WorkOrderStatus,
} from '../hooks/useFlota'
import { useEquipment, useOperators } from '../hooks/useFlota'
import { api } from '../lib/api'
import AppShell from '../components/AppShell'
import { downloadWorkOrderPDF, generatePDFBlob, previewWorkOrderPDFUrl } from '../components/WorkOrderPDF'
import { downloadInvoicePDFLocal } from '../components/InvoicePDF'

const fmt = (n: number) =>
  'S/ ' + n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type StatusCfg = { badgeBg: string; badgeColor: string; label: string; icon: typeof Clock }

const statusConfig: Record<WorkOrderStatus, StatusCfg> = {
  DRAFT:     { badgeBg: 'var(--clr-sidebar)',    badgeColor: 'var(--clr-text-muted)', label: 'Borrador',   icon: FileText    },
  SENT:      { badgeBg: 'rgba(217,119,6,0.12)',  badgeColor: '#d97706',               label: 'Enviada',    icon: Send        },
  ACCEPTED:  { badgeBg: 'rgba(249,115,22,0.15)', badgeColor: '#ea580c',               label: 'Aceptada',   icon: ThumbsUp    },
  ACTIVE:    { badgeBg: 'var(--clr-primary-bg)', badgeColor: 'var(--clr-primary)',    label: 'Activa',     icon: Zap         },
  COMPLETED: { badgeBg: 'var(--clr-success-bg)', badgeColor: 'var(--clr-success)',    label: 'Completada', icon: CheckCircle },
  BILLED:    { badgeBg: 'var(--clr-violet-bg)',  badgeColor: 'var(--clr-violet)',     label: 'Facturada',  icon: Receipt     },
  PAID:      { badgeBg: 'var(--clr-success-bg)', badgeColor: 'var(--clr-success)',    label: 'Pagada',     icon: CheckCircle },
  CANCELLED: { badgeBg: 'var(--clr-danger-bg)',  badgeColor: 'var(--clr-danger)',     label: 'Cancelada',  icon: XCircle     },
}

function resolveStatusCfg(wo: { status: WorkOrderStatus; invoice?: { status: string } | null }): StatusCfg {
  const base = statusConfig[wo.status] ?? statusConfig.DRAFT
  if (wo.status === 'BILLED') {
    const invStatus = wo.invoice?.status
    if (invStatus === 'PARTIAL')
      return { ...base, label: 'Facturado Parcialmente', badgeBg: 'rgba(217,119,6,0.12)', badgeColor: '#d97706' }
    if (invStatus === 'OVERDUE')
      return { ...base, label: 'Vencida', badgeBg: 'var(--clr-danger-bg)', badgeColor: 'var(--clr-danger)' }
  }
  return base
}

const billingLabels: Record<string, string> = { HOURLY: 'hora', DAILY: 'día', FIXED: 'servicio' }
const billingUnit:   Record<string, string> = { HOURLY: 'horas', DAILY: 'días', FIXED: 'unidades' }

const STATUS_DOT: Record<WorkOrderStatus, string> = {
  DRAFT:     'var(--clr-text-subtle)',
  SENT:      '#d97706',
  ACCEPTED:  'var(--clr-orange)',
  ACTIVE:    'var(--clr-primary)',
  COMPLETED: 'var(--clr-success)',
  BILLED:    'var(--clr-violet)',
  PAID:      'var(--clr-success)',
  CANCELLED: 'var(--clr-danger)',
}

const COST_CATEGORIES = [
  { value: 'FUEL',        label: 'Combustible' },
  { value: 'TOLL',        label: 'Peaje' },
  { value: 'ALLOWANCE',   label: 'Viáticos' },
  { value: 'MAINTENANCE', label: 'Mantenimiento' },
  { value: 'OTHER',       label: 'Otro' },
]

// ─── SEND TO CLIENT MODAL ─────────────────────────────────────────────────────

function SendClientModal({ wo, onClose }: { wo: WorkOrder; onClose: () => void }) {
  const markSent = useMarkSent()
  const { data: company } = useCompany()
  const [sending, setSending] = useState<'whatsapp' | 'email' | null>(null)

  const extraCosts = wo.costs.reduce((s, c) => s + Number(c.amount), 0)
  const total = (Number(wo.subtotal) + extraCosts) * 1.18

  const plainText =
    `Hola, adjunto la Orden de Trabajo ${wo.number}.\n\n` +
    `Servicio: ${wo.description ?? wo.equipment.name}\n` +
    `Ubicación: ${wo.location ?? '-'}\n` +
    `Fecha: ${format(parseISO(wo.startDate), 'dd/MM/yyyy', { locale: es })}` +
    (wo.endDate ? ` al ${format(parseISO(wo.endDate), 'dd/MM/yyyy', { locale: es })}` : '') + `\n` +
    `Total: S/ ${total.toFixed(2)}\n\n` +
    `Por favor confirmar aceptación.`

  const waMsg  = plainText.replace(/Servicio:/g, '📋 *Servicio:*').replace(/Ubicación:/g, '📍 *Ubicación:*').replace(/Fecha:/g, '📅 *Fecha:*').replace(/Total:/g, '💰 *Total:*').replace(`${wo.number}.`, `*${wo.number}*.`)
  const phone  = (wo.client.whatsapp ?? wo.client.phone ?? '').replace(/\D/g, '')
  const waLink = `https://wa.me/${phone ? `51${phone}` : ''}?text=${encodeURIComponent(waMsg)}`
  const mailLink = `mailto:${wo.client.email ?? ''}?subject=${encodeURIComponent(`OT ${wo.number} - ${wo.client.businessName}`)}&body=${encodeURIComponent(plainText)}`

  const fetchInvoicePdfBlob = async (): Promise<File | null> => {
    if (!wo.invoice) return null
    try {
      const res = await fetch(`/api/workorders/${wo.id}/invoice-pdf`)
      if (!res.ok) return null
      const blob = await res.blob()
      return new File([blob], `${wo.invoice.series}-${wo.invoice.number}.pdf`, { type: 'application/pdf' })
    } catch {
      return null
    }
  }

  const handleSend = async (channel: 'whatsapp' | 'email') => {
    setSending(channel)
    try {
      if (wo.status !== 'SENT') await markSent.mutateAsync(wo.id)

      if (channel === 'whatsapp' && company) {
        const otBlob = generatePDFBlob(wo, company)
        const otFile = new File([otBlob], `${wo.number}.pdf`, { type: 'application/pdf' })

        // Si hay factura SUNAT vinculada, buscar su PDF
        const invoiceFile = await fetchInvoicePdfBlob()

        const shareFiles = invoiceFile ? [otFile, invoiceFile] : [otFile]

        // Móvil: Web Share API con PDFs adjuntos
        if (typeof navigator.share === 'function' && navigator.canShare?.({ files: shareFiles })) {
          try {
            await navigator.share({ files: shareFiles, title: `OT ${wo.number}`, text: plainText })
            onClose()
            return
          } catch { /* usuario canceló el share — descarga y abre WhatsApp */ }
        }

        // Desktop: descarga los PDFs automáticamente y luego abre WhatsApp
        downloadWorkOrderPDF(wo, company)
        if (invoiceFile) {
          const url = URL.createObjectURL(invoiceFile)
          const a = document.createElement('a')
          a.href = url; a.download = invoiceFile.name; a.click()
          setTimeout(() => URL.revokeObjectURL(url), 1000)
        }
        await new Promise(r => setTimeout(r, 700))
      }

      if (channel === 'whatsapp') window.open(waLink, '_blank')
      else window.open(mailLink, '_blank')
      onClose()
    } finally {
      setSending(null)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }}>
      <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 16, width: '100%', maxWidth: 448, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--clr-text)' }}>Enviar OT al cliente</h3>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-text-subtle)', display: 'flex', padding: 4 }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--clr-text)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--clr-text-subtle)' }}
          ><X size={18} /></button>
        </div>

        {/* Vista previa del mensaje */}
        <div style={{ background: 'var(--clr-sidebar)', border: '1px solid var(--clr-border)', borderRadius: 12, padding: 16, fontSize: 12, color: 'var(--clr-text-muted)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
          {plainText}
        </div>

        {wo.status !== 'SENT' && (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--clr-text-subtle)' }}>El estado cambiará a <strong style={{ color: '#d97706' }}>Enviada</strong> al enviar.</p>
        )}

        {/* Nota de PDF en desktop */}
        <div style={{ background: 'var(--clr-primary-bg)', border: '1px solid var(--clr-primary-border)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--clr-primary)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <Download size={12} style={{ marginTop: 1, flexShrink: 0 }} />
          <span>
            Al hacer clic en <strong>WhatsApp</strong> se descargarán
            {wo.invoice ? <> el PDF de la OT y la <strong>factura SUNAT {wo.invoice.series}-{wo.invoice.number}</strong></> : ' el PDF de la OT'} automáticamente. Adjúntalos en la conversación antes de enviar.
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <button
            onClick={() => handleSend('whatsapp')}
            disabled={!!sending || !company}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#15803d', color: 'white', border: 'none', borderRadius: 12, padding: '10px 0', fontSize: 13, fontWeight: 600, cursor: (!!sending || !company) ? 'not-allowed' : 'pointer', opacity: (!!sending || !company) ? 0.5 : 1 }}
          >
            <WhatsAppIcon size={16} />
            {sending === 'whatsapp' ? 'Preparando…' : 'WhatsApp + PDF'}
          </button>
          <button
            onClick={() => handleSend('email')}
            disabled={!!sending}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'var(--clr-primary-dk)', color: 'var(--clr-on-primary)', border: 'none', borderRadius: 12, padding: '10px 0', fontSize: 13, fontWeight: 600, cursor: !!sending ? 'not-allowed' : 'pointer', opacity: !!sending ? 0.5 : 1 }}
          >
            <Mail size={16} />
            {sending === 'email' ? 'Abriendo…' : 'Email'}
          </button>
        </div>

        <button onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--clr-text-subtle)', width: '100%', padding: '4px 0' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--clr-text-muted)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--clr-text-subtle)' }}
        >Cancelar</button>
      </div>
    </div>
  )
}

// ─── LINK INVOICE MODAL ───────────────────────────────────────────────────────

function LinkInvoiceModal({ wo, onClose }: { wo: WorkOrder; onClose: () => void }) {
  const linkInvoice = useLinkInvoice()
  const [selected, setSelected]   = useState<string>('')
  const [showAll, setShowAll]     = useState(false)

  const extraCosts = wo.costs.reduce((s, c) => s + Number(c.amount), 0)
  const subtotalBase = Number(wo.subtotal) + extraCosts
  // IGV calculado igual que SUNAT: separado y redondeado a 2 decimales
  const igvSunat     = Math.round(subtotalBase * 0.18 * 100) / 100
  const expectedTotal = Math.round((subtotalBase + igvSunat) * 100) / 100

  const { data: invoices = [], isLoading } = useQuery<AvailableInvoice[]>({
    queryKey: ['wo-available-invoices', wo.id],
    queryFn: () => api.get(`/workorders/${wo.id}/available-invoices`).then((r) => r.data),
  })

  // Tolerancia S/ 1.00 — cubre cualquier redondeo SUNAT sin ser permisivo en exceso
  const TOLERANCE = 1.00
  const matches   = invoices.filter((inv) => Math.abs(Number(inv.total) - expectedTotal) <= TOLERANCE)
  const visible   = showAll ? invoices : matches
  const hasHidden = invoices.length > matches.length

  const handleLink = async () => {
    if (!selected) return
    await linkInvoice.mutateAsync({ id: wo.id, invoiceId: selected })
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }}>
      <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 16, width: '100%', maxWidth: 512, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--clr-text)' }}>Vincular Factura SUNAT</h3>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-text-subtle)', display: 'flex', padding: 4 }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--clr-text)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--clr-text-subtle)' }}
          ><X size={18} /></button>
        </div>

        <div style={{ background: 'var(--clr-sidebar)', border: '1px solid var(--clr-border)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: 'var(--clr-text-subtle)' }}>{wo.number} — Subtotal OT</span>
            <span style={{ color: 'var(--clr-text-muted)' }}>{fmt(subtotalBase)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ color: 'var(--clr-text-subtle)' }}>IGV 18% (cálculo SUNAT)</span>
            <span style={{ color: 'var(--clr-text-muted)' }}>{fmt(igvSunat)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--clr-border)', paddingTop: 6 }}>
            <span style={{ color: 'var(--clr-text-muted)', fontWeight: 600 }}>Total esperado (incl. IGV)</span>
            <span style={{ fontWeight: 700, color: 'var(--clr-text)', fontSize: 14 }}>{fmt(expectedTotal)}</span>
          </div>
        </div>

        {isLoading ? (
          <div style={{ height: 128, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--clr-text-subtle)', fontSize: 13 }}>Cargando...</div>
        ) : invoices.length === 0 ? (
          <div style={{ height: 128, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--clr-text-subtle)', fontSize: 13, gap: 8 }}>
            <Receipt size={28} style={{ color: 'var(--clr-text-subtle)' }} />
            <p style={{ margin: 0 }}>No hay facturas disponibles para este cliente.</p>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--clr-text-subtle)' }}>Emite la factura en SUNAT y sincroniza con SIRE.</p>
          </div>
        ) : (
          <>
            {matches.length === 0 && !showAll ? (
              <div style={{ background: 'rgba(217,119,6,0.10)', border: '1px solid rgba(217,119,6,0.30)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ margin: 0, fontSize: 13, color: '#d97706', fontWeight: 500 }}>
                  Ninguna factura coincide con S/ {expectedTotal.toFixed(2)} (±S/ {TOLERANCE.toFixed(2)}).
                </p>
                <p style={{ margin: 0, fontSize: 12, color: '#d97706' }}>
                  La tolerancia cubre diferencias de redondeo SUNAT. Si ya emitiste la factura, sincroniza con SIRE e inténtalo nuevamente.
                </p>
                {invoices.length > 0 && (
                  <button
                    onClick={() => setShowAll(true)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#d97706', textDecoration: 'underline', padding: 0, textAlign: 'left' }}
                  >
                    Ver todas las facturas del cliente igualmente ({invoices.length})
                  </button>
                )}
              </div>
            ) : (
              <>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--clr-text-subtle)' }}>
                  {!showAll
                    ? matches.length === 1
                      ? 'Factura que coincide con el monto de la OT:'
                      : `${matches.length} facturas que coinciden con el monto de la OT:`
                    : `Todas las facturas disponibles del cliente (${invoices.length}):`}
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 256, overflowY: 'auto' }}>
                  {visible.map((inv) => {
                    const net      = Number(inv.total) - Number(inv.detraccion)
                    const diff     = Math.abs(Number(inv.total) - expectedTotal)
                    const isExact  = diff < 0.005
                    const isCents  = !isExact && diff <= TOLERANCE
                    const isMatch  = isExact || isCents
                    const isSel    = selected === inv.id
                    return (
                      <button
                        key={inv.id}
                        onClick={() => setSelected(inv.id)}
                        style={{
                          width: '100%', textAlign: 'left', padding: 12, borderRadius: 12, fontSize: 13, cursor: 'pointer',
                          border: `1px solid ${isSel ? '#7c3aed' : isMatch ? '#166534' : 'var(--clr-border)'}`,
                          background: isSel ? 'rgba(124,58,237,0.3)' : isMatch ? 'rgba(20,83,45,0.1)' : 'var(--clr-surface)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, color: 'var(--clr-text)' }}>{inv.series}-{inv.number}</span>
                            {isExact && (
                              <span style={{ fontSize: 10, background: 'var(--clr-success-bg)', color: 'var(--clr-success)', border: '1px solid var(--clr-success-border)', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>✓ exacto</span>
                            )}
                            {isCents && (
                              <span style={{ fontSize: 10, background: 'rgba(217,119,6,0.10)', color: '#d97706', border: '1px solid rgba(217,119,6,0.30)', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }} title="Diferencia por redondeo SUNAT — normal">
                                ±S/ {diff.toFixed(2)} redondeo
                              </span>
                            )}
                          </div>
                          <span style={{ fontWeight: 700, color: isMatch ? 'var(--clr-success)' : 'var(--clr-text-subtle)' }}>
                            {fmt(Number(inv.total))}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, fontSize: 11, color: 'var(--clr-text-subtle)' }}>
                          <span>{format(parseISO(inv.issueDate), 'dd/MM/yyyy')}</span>
                          {Number(inv.detraccion) > 0 && (
                            <span style={{ color: 'var(--clr-orange)' }}>Neto cobrar: {fmt(net)}</span>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>

                {showAll && hasHidden && (
                  <button onClick={() => setShowAll(false)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--clr-text-subtle)', textDecoration: 'underline', padding: 0 }}
                  >
                    Mostrar solo coincidencias
                  </button>
                )}
              </>
            )}
          </>
        )}

        <div style={{ display: 'flex', gap: 12, paddingTop: 4 }}>
          <button onClick={onClose}
            style={{ flex: 1, background: 'var(--clr-sidebar)', color: 'var(--clr-text-muted)', border: '1px solid var(--clr-border)', fontSize: 13, padding: '10px 0', borderRadius: 12, cursor: 'pointer', fontWeight: 500 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--clr-surface-hover)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--clr-sidebar)' }}
          >
            Cancelar
          </button>
          <button
            onClick={handleLink}
            disabled={!selected || linkInvoice.isPending}
            style={{ flex: 1, background: '#7c3aed', color: 'white', border: 'none', fontSize: 13, fontWeight: 700, padding: '10px 0', borderRadius: 12, cursor: (!selected || linkInvoice.isPending) ? 'not-allowed' : 'pointer', opacity: (!selected || linkInvoice.isPending) ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            <Link size={15} /> {linkInvoice.isPending ? 'Vinculando...' : 'Vincular'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── NEW OT MODAL ─────────────────────────────────────────────────────────────

function NewWorkOrderModal({ onClose, fromQuote, editingWO }: { onClose: () => void; fromQuote?: Quote; editingWO?: WorkOrder }) {
  const isEditing = !!editingWO
  const { register, handleSubmit, watch, setValue, formState: { isSubmitting } } = useForm({
    defaultValues: {
      billingType: editingWO?.billingType ?? 'HOURLY',
      startDate: editingWO?.startDate?.slice(0, 10) ?? format(new Date(), 'yyyy-MM-dd'),
      endDate: editingWO?.endDate?.slice(0, 10) ?? '',
      quantity: editingWO ? Number(editingWO.quantity) : 1,
      unitRate: editingWO ? Number(editingWO.unitRate) : 0,
      description: editingWO?.description ?? '',
      location: editingWO?.location ?? '',
      notes: editingWO?.notes ?? '',
    },
  })
  const create = useCreateWorkOrder()
  const update = useUpdateWorkOrder()
  const updateQuoteStatus = useUpdateQuoteStatus()
  const { data: clients = [] } = useQuery({ queryKey: ['clients'], queryFn: () => api.get('/clients').then((r) => r.data) })
  const { data: equipment = [] } = useEquipment()
  const { data: operators = [] } = useOperators()

  const [clientId, setClientId]       = useState(editingWO?.clientId ?? fromQuote?.clientId ?? '')
  const [equipmentId, setEquipmentId] = useState(editingWO?.equipmentId ?? fromQuote?.equipmentId ?? '')
  const [operatorId, setOperatorId]   = useState(editingWO?.operatorId ?? '')
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    if (!fromQuote) return
    const item = fromQuote.items?.[0]
    if (item?.description) setValue('description' as any, item.description)
    if (item && Number(item.quantity) > 0) setValue('quantity', Number(item.quantity) as any)
    if (item && Number(item.unitPrice) > 0) {
      setValue('unitRate', Number(item.unitPrice) as any)
    } else if (fromQuote.equipmentId) {
      const eq = (equipment as any[]).find((e: any) => e.id === fromQuote.equipmentId)
      if (eq && Number(eq.hourlyRate) > 0) setValue('unitRate', Number(eq.hourlyRate) as any)
    }
    if (fromQuote.validUntil) setValue('endDate' as any, fromQuote.validUntil.slice(0, 10))
  }, [equipment, fromQuote])

  const billingType = watch('billingType')
  const currentDesc = watch('description' as any) as string | undefined
  const qty  = parseFloat(watch('quantity') as any) || 0
  const rate = parseFloat(watch('unitRate') as any) || 0
  const subtotal = qty * rate

  const clientItems: SearchItem[] = (clients as any[]).map(c => ({
    id: c.id, primary: c.businessName, secondary: `RUC ${c.ruc}`,
  }))

  const equipItems: SearchItem[] = (equipment as any[])
    .filter(e => e.status === 'AVAILABLE' || e.status === 'IN_USE')
    .map(e => ({
      id: e.id, primary: e.name,
      secondary: e.plateNumber ?? e.type ?? '',
      badge: e.status === 'IN_USE' ? 'En uso' : 'Disponible',
    }))

  const operItems: SearchItem[] = (operators as any[])
    .filter(o => o.status === 'ACTIVE')
    .map(o => ({ id: o.id, primary: o.name, secondary: o.dni ? `DNI ${o.dni}` : '' }))

  const handleEquipmentSelect = (id: string) => {
    setEquipmentId(id)
    setValue('equipmentId' as any, id)
    const eq = (equipment as any[]).find(e => e.id === id)
    if (eq) {
      setValue('unitRate', (billingType === 'HOURLY' ? Number(eq.hourlyRate) : Number(eq.dailyRate)) as any)
      if (!currentDesc) setValue('description' as any, eq.name)
    }
  }

  const onSubmit = async (data: any) => {
    if (!clientId)    { setSubmitError('Selecciona un cliente');  return }
    if (!equipmentId) { setSubmitError('Selecciona un equipo');   return }
    if (!operatorId)  { setSubmitError('Selecciona un operario'); return }
    setSubmitError('')
    data.clientId    = clientId
    data.equipmentId = equipmentId
    data.operatorId  = operatorId
    data.quantity    = parseFloat(data.quantity)
    data.unitRate    = parseFloat(data.unitRate)
    if (isEditing) {
      await update.mutateAsync({ id: editingWO!.id, ...data })
    } else {
      const newWO = await create.mutateAsync(data)
      if (fromQuote) {
        updateQuoteStatus.mutate({ id: fromQuote.id, status: 'CONVERTED', workOrderId: newWO.id })
      }
    }
    onClose()
  }

  const inpStyle: React.CSSProperties = {
    width: '100%', background: 'var(--clr-surface)', color: 'var(--clr-text)',
    borderRadius: 8, padding: '9px 12px', border: '1px solid var(--clr-border)',
    fontSize: 13, outline: 'none', boxSizing: 'border-box',
  }
  const labelSt: React.CSSProperties = { fontSize: 11, color: 'var(--clr-text-subtle)', marginBottom: 4, display: 'block' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
      <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 16, width: '100%', maxWidth: 780, maxHeight: '90vh', overflowY: 'auto', padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: fromQuote ? 12 : 20 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--clr-text)' }}>
              {isEditing ? `Editar ${editingWO!.number}` : 'Nueva Orden de Trabajo'}
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--clr-text-subtle)' }}>
              {isEditing ? 'Modifica los campos de la orden de trabajo' : 'Completa los campos para registrar la OT'}
            </p>
          </div>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-text-subtle)', display: 'flex', padding: 4, borderRadius: 6 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--clr-sidebar)'; e.currentTarget.style.color = 'var(--clr-text)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--clr-text-subtle)' }}
          ><X size={20} /></button>
        </div>

        {fromQuote && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--clr-violet-bg)', border: '1px solid var(--clr-violet-border)', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
            <Link size={14} style={{ color: 'var(--clr-violet)', flexShrink: 0 }} />
            <div>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--clr-violet)' }}>Desde cotización {fromQuote.number}</span>
              <span style={{ fontSize: 12, color: 'var(--clr-text-subtle)', marginLeft: 8 }}>{fromQuote.client.businessName}</span>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Cliente */}
          <SearchableDropdown
            label="Cliente" required
            placeholder="Buscar por nombre o RUC..."
            items={clientItems}
            value={clientId}
            onChange={(id) => { setClientId(id); setSubmitError('') }}
            icon={User}
          />

          {/* Equipo + Operario */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 12 }}>
            <SearchableDropdown
              label="Equipo" required
              placeholder="Seleccionar..."
              items={equipItems}
              value={equipmentId}
              onChange={(id) => { handleEquipmentSelect(id); setSubmitError('') }}
              icon={Truck}
            />
            <SearchableDropdown
              label="Operario" required
              placeholder="Seleccionar..."
              items={operItems}
              value={operatorId}
              onChange={(id) => { setOperatorId(id); setValue('operatorId' as any, id); setSubmitError('') }}
              icon={User}
            />
          </div>

          {/* Descripción + Ubicación */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 12 }}>
            <div>
              <label style={labelSt}>Descripción / obra</label>
              <input {...register('description')} placeholder="Montaje subestación…" style={inpStyle} />
            </div>
            <div>
              <label style={labelSt}>Ubicación</label>
              <input {...register('location')} placeholder="Miraflores, Lima" style={inpStyle} />
            </div>
          </div>

          {/* Fechas */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 12 }}>
            <div>
              <label style={labelSt}>Fecha inicio <span style={{ color: 'var(--clr-danger)' }}>*</span></label>
              <input {...register('startDate', { required: true })} type="date" style={inpStyle} />
            </div>
            <div>
              <label style={labelSt}>Fecha fin</label>
              <input {...register('endDate')} type="date" style={inpStyle} />
            </div>
          </div>

          {/* Facturación */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12 }}>
            <SearchableDropdown
              label="Tipo facturación"
              placeholder="Seleccionar..."
              items={[
                { id: 'HOURLY', primary: 'Por hora',  secondary: 'Tarifa horaria' },
                { id: 'DAILY',  primary: 'Por día',   secondary: 'Tarifa diaria'  },
                { id: 'FIXED',  primary: 'Fijo',      secondary: 'Precio cerrado' },
              ]}
              value={billingType ?? 'HOURLY'}
              onChange={(id) => { setValue('billingType', id as any); handleEquipmentSelect(equipmentId) }}
            />
            <div>
              <label style={labelSt}>{billingUnit[billingType] ?? 'Cant.'} (plan)</label>
              <input {...register('quantity')} type="number" step="0.5" min="0"
                onChange={(e) => setValue('quantity', e.target.value as any)} style={inpStyle} />
            </div>
            <div>
              <label style={labelSt}>Tarifa (S/)</label>
              <input {...register('unitRate')} type="number" step="0.01"
                onChange={(e) => setValue('unitRate', e.target.value as any)} style={inpStyle} />
            </div>
          </div>

          {/* Preview subtotal */}
          {subtotal > 0 && (
            <div style={{ background: 'var(--clr-sidebar)', borderRadius: 12, padding: '12px 16px', border: '1px solid var(--clr-border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: 'var(--clr-text-subtle)' }}>Subtotal (sin IGV)</span>
                <span style={{ color: 'var(--clr-text)', fontWeight: 500 }}>{fmt(subtotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: 'var(--clr-text-subtle)' }}>IGV 18%</span>
                <span style={{ color: 'var(--clr-text-muted)' }}>{fmt(Math.round(subtotal * 0.18 * 100) / 100)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--clr-border)', paddingTop: 6, marginTop: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--clr-text)' }}>Total con IGV</span>
                <span style={{ fontWeight: 700, color: 'var(--clr-text)', fontSize: 15 }}>{fmt(Math.round(subtotal * 1.18 * 100) / 100)}</span>
              </div>
            </div>
          )}

          {/* Error de validación */}
          {submitError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--clr-danger-bg)', border: '1px solid var(--clr-danger-border)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--clr-danger)' }}>
              <X size={13} style={{ color: 'var(--clr-danger)', flexShrink: 0 }} />
              {submitError}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, paddingTop: 4 }}>
            <button type="button" onClick={onClose}
              style={{ flex: 1, background: 'var(--clr-sidebar)', color: 'var(--clr-text-muted)', border: '1px solid var(--clr-border)', borderRadius: 12, padding: '10px 0', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--clr-surface-hover)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--clr-sidebar)' }}
            >
              Cancelar
            </button>
            <button type="submit" disabled={isSubmitting}
              style={{ flex: 1, background: 'var(--clr-primary)', color: 'var(--clr-on-primary)', border: 'none', borderRadius: 12, padding: '10px 0', fontSize: 13, fontWeight: 700, cursor: isSubmitting ? 'not-allowed' : 'pointer', opacity: isSubmitting ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              {isSubmitting ? (
                <><span className="animate-spin" style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%' }} /> {isEditing ? 'Guardando...' : 'Creando...'}</>
              ) : isEditing ? (
                <><FileText size={16} /> Guardar cambios</>
              ) : (
                <><Plus size={16} /> Crear OT</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── OT DETAIL MODAL ──────────────────────────────────────────────────────────

function OTDetailModal({ wo, onClose }: { wo: WorkOrder; onClose: () => void }) {
  const qc           = useQueryClient()
  const updateStatus = useUpdateWorkOrderStatus()
  const markAccepted = useMarkAccepted()
  const addCost      = useAddCost()
  const deleteCost   = useDeleteCost()
  const updateHours  = useUpdateActualHours()
  const { data: company } = useCompany()

  const [actualQty, setActualQty]     = useState(String(Number(wo.quantity)))
  const [editingHours, setEditingHours] = useState(false)
  const [costForm, setCostForm]       = useState({ category: 'FUEL', description: '', amount: '' })
  const [addingCost, setAddingCost]   = useState(false)
  const [showSend, setShowSend]         = useState(false)
  const [showLink, setShowLink]         = useState(false)
  const [dlInvoice, setDlInvoice]       = useState(false)
  const [dlInvoiceMsg, setDlInvoiceMsg] = useState('')

  const handleDownloadPDF = () => {
    if (!company) return
    downloadWorkOrderPDF(wo, company)
  }

  async function handleDownloadInvoicePdf() {
    if (!wo.invoice || !company) return
    setDlInvoice(true)
    setDlInvoiceMsg('')
    try {
      const res = await fetch(`/api/invoices/${wo.invoice.id}/pdf`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('ft_token') ?? ''}` },
      })
      if (res.ok) {
        const blob = await res.blob()
        const url  = URL.createObjectURL(blob)
        const a    = document.createElement('a')
        a.href     = url
        a.download = `${wo.invoice.series}-${wo.invoice.number.padStart(8, '0')}.pdf`
        a.click()
        URL.revokeObjectURL(url)
      } else {
        setDlInvoiceMsg('PDF SUNAT no disponible — descargando representación impresa')
        await downloadInvoicePDFLocal(wo.invoice as any, company)
        setTimeout(() => setDlInvoiceMsg(''), 5000)
      }
    } catch {
      setDlInvoiceMsg('PDF SUNAT no disponible — descargando representación impresa')
      try {
        await downloadInvoicePDFLocal(wo.invoice as any, company)
        setTimeout(() => setDlInvoiceMsg(''), 5000)
      } catch {
        setDlInvoiceMsg('No se pudo generar el PDF')
        setTimeout(() => setDlInvoiceMsg(''), 4000)
      }
    } finally {
      setDlInvoice(false)
    }
  }

  const cfg    = resolveStatusCfg(wo)
  const Icon   = cfg.icon
  const locked = ['BILLED', 'PAID', 'CANCELLED'].includes(wo.status)

  const extraCosts  = wo.costs.reduce((s, c) => s + Number(c.amount), 0)
  const baseSubtotal = Number(actualQty) * Number(wo.unitRate)
  const totalSinIgv  = baseSubtotal + extraCosts
  const igv          = Math.round(totalSinIgv * 0.18 * 100) / 100
  const totalConIgv  = totalSinIgv + igv

  const handleSaveHours = async () => {
    const qty = parseFloat(actualQty)
    if (isNaN(qty) || qty < 0) return
    await updateHours.mutateAsync({ id: wo.id, quantity: qty })
    setEditingHours(false)
  }

  const handleAddCost = async () => {
    const amt = parseFloat(costForm.amount)
    if (isNaN(amt) || amt <= 0) return
    await addCost.mutateAsync({ id: wo.id, category: costForm.category, description: costForm.description, amount: amt })
    setCostForm({ category: 'FUEL', description: '', amount: '' })
    setAddingCost(false)
  }

  const inpSm: React.CSSProperties = {
    background: 'var(--clr-surface)', color: 'var(--clr-text)', borderRadius: 8,
    padding: '8px 12px', border: '1px solid var(--clr-border)', fontSize: 13, outline: 'none',
  }
  const cardSec: React.CSSProperties = { background: 'var(--clr-sidebar)', borderRadius: 12, padding: 16 }
  const secTitle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--clr-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
        <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 16, width: '100%', maxWidth: 640, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottom: '1px solid var(--clr-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color: 'var(--clr-doc-number)', background: 'var(--clr-doc-number-bg)', padding: '2px 10px', borderRadius: 6 }}>{wo.number}</span>
              <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4, background: cfg.badgeBg, color: cfg.badgeColor }}>
                <Icon size={11} /> {cfg.label}
              </span>
            </div>
            <button onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-text-subtle)', display: 'flex', padding: 4 }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--clr-text)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--clr-text-subtle)' }}
            ><X size={20} /></button>
          </div>

          <div style={{ overflowY: 'auto', flex: 1, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Cotización de origen */}
            {wo.quote && (
              <div style={{ background: 'var(--clr-primary-bg)', border: '1px solid var(--clr-primary-border)', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <Link size={14} style={{ color: 'var(--clr-primary)', flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'var(--clr-primary)' }}>Generada desde cotización</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--clr-primary)' }}>{wo.quote.number}</span>
              </div>
            )}

            {/* Factura vinculada */}
            {wo.invoice && (
              <div style={{ background: 'var(--clr-violet-bg)', border: '1px solid var(--clr-violet-border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Receipt size={20} style={{ color: 'var(--clr-violet)', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--clr-violet)' }}>Factura SUNAT vinculada</p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--clr-violet)' }}>
                      {wo.invoice.series}-{wo.invoice.number} · {fmt(Number(wo.invoice.total))}
                      {Number(wo.invoice.detraccion) > 0 && (
                        <> · Neto: {fmt(Number(wo.invoice.total) - Number(wo.invoice.detraccion))}</>
                      )}
                    </p>
                  </div>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 700, background: wo.invoice.status === 'PAID' ? 'var(--clr-success-bg)' : 'var(--clr-surface-hover)', border: `1px solid ${wo.invoice.status === 'PAID' ? 'var(--clr-success-border)' : 'var(--clr-border)'}`, color: wo.invoice.status === 'PAID' ? 'var(--clr-success)' : 'var(--clr-text-muted)' }}>
                    {wo.invoice.status === 'PAID' ? 'Pagada' : 'Pendiente'}
                  </span>
                  <button
                    onClick={handleDownloadInvoicePdf}
                    disabled={dlInvoice || !company}
                    title="Descargar factura PDF"
                    style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, background: 'var(--clr-violet-bg)', color: 'var(--clr-violet)', border: '1px solid var(--clr-violet-border)', padding: '6px 10px', borderRadius: 8, cursor: (dlInvoice || !company) ? 'not-allowed' : 'pointer', opacity: (dlInvoice || !company) ? 0.4 : 1, flexShrink: 0 }}
                  >
                    {dlInvoice ? <><span className="animate-spin">⟳</span> Descargando…</> : <><Download size={13} /> PDF</>}
                  </button>
                </div>
                {dlInvoiceMsg && (
                  <p style={{ margin: 0, fontSize: 11, color: '#d97706', paddingLeft: 32 }}>⚠ {dlInvoiceMsg}</p>
                )}
              </div>
            )}

            {/* Info */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ ...cardSec, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <InfoRow icon={User} label="Cliente" value={wo.client.businessName} />
                <InfoRow icon={Truck} label="Equipo" value={wo.equipment.name} />
                <InfoRow icon={User} label="Operario" value={wo.operator.name} />
                {wo.location && <InfoRow icon={MapPin} label="Ubicación" value={wo.location} />}
              </div>
              <div style={{ ...cardSec, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <InfoRow icon={Calendar} label="Inicio" value={format(parseISO(wo.startDate), 'dd MMM yyyy', { locale: es })} />
                {wo.endDate && <InfoRow icon={Calendar} label="Fin" value={format(parseISO(wo.endDate), 'dd MMM yyyy', { locale: es })} />}
                {wo.description && <InfoRow icon={FileText} label="Obra" value={wo.description} />}
              </div>
            </div>

            {/* Unidades plan vs real */}
            <div style={cardSec}>
              <h3 style={secTitle}>{billingUnit[wo.billingType]} — Plan vs Real</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <p style={{ fontSize: 11, color: 'var(--clr-text-subtle)', margin: '0 0 4px' }}>Planificado</p>
                  <p style={{ fontSize: 24, fontWeight: 700, color: 'var(--clr-text-muted)', margin: 0 }}>{Number(wo.quantity)}</p>
                  <p style={{ fontSize: 11, color: 'var(--clr-text-subtle)', margin: '2px 0 0' }}>{billingLabels[wo.billingType]}{Number(wo.quantity) !== 1 ? 's' : ''}</p>
                </div>
                <ChevronRight size={20} style={{ color: 'var(--clr-text-subtle)', flexShrink: 0 }} />
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <p style={{ fontSize: 11, color: 'var(--clr-text-subtle)', margin: '0 0 4px' }}>Real</p>
                  {editingHours && !locked ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                      <input
                        type="number" step="0.5" min="0"
                        value={actualQty}
                        onChange={(e) => setActualQty(e.target.value)}
                        style={{ width: 72, textAlign: 'center', background: 'var(--clr-surface)', border: '1px solid var(--clr-primary)', borderRadius: 8, padding: '4px 8px', color: 'var(--clr-text)', fontWeight: 700, fontSize: 17, outline: 'none' }}
                        autoFocus
                      />
                      <button onClick={handleSaveHours} style={{ fontSize: 11, background: 'var(--clr-primary)', color: 'var(--clr-on-primary)', border: 'none', padding: '4px 8px', borderRadius: 6, cursor: 'pointer' }}>OK</button>
                      <button onClick={() => setEditingHours(false)} style={{ fontSize: 11, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-text-subtle)' }}>✕</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => !locked && setEditingHours(true)}
                      style={{ fontSize: 24, fontWeight: 700, color: locked ? 'var(--clr-text-subtle)' : 'var(--clr-text)', background: 'none', border: 'none', cursor: locked ? 'default' : 'pointer' }}
                    >
                      {actualQty}
                    </button>
                  )}
                  <p style={{ fontSize: 11, color: 'var(--clr-text-subtle)', margin: '2px 0 0' }}>{billingLabels[wo.billingType]}{Number(actualQty) !== 1 ? 's' : ''}</p>
                </div>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <p style={{ fontSize: 11, color: 'var(--clr-text-subtle)', margin: '0 0 4px' }}>Tarifa</p>
                  <p style={{ fontSize: 17, fontWeight: 700, color: 'var(--clr-text-muted)', margin: 0 }}>{fmt(Number(wo.unitRate))}</p>
                  <p style={{ fontSize: 11, color: 'var(--clr-text-subtle)', margin: '2px 0 0' }}>por {billingLabels[wo.billingType]}</p>
                </div>
              </div>
              {!locked && (
                <p style={{ fontSize: 11, color: 'var(--clr-text-subtle)', marginTop: 8, textAlign: 'center' }}>Haz clic en el número real para editarlo</p>
              )}
            </div>

            {/* Costos adicionales */}
            <div style={cardSec}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h3 style={{ ...secTitle, margin: 0 }}>Costos adicionales</h3>
                {!locked && (
                  <button onClick={() => setAddingCost(true)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--clr-primary)', background: 'none', border: 'none', cursor: 'pointer' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--clr-primary-lt)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--clr-primary)' }}
                  ><Plus size={13} /> Agregar</button>
                )}
              </div>
              {wo.costs.length === 0 && !addingCost && (
                <p style={{ fontSize: 11, color: 'var(--clr-text-subtle)', textAlign: 'center', margin: '8px 0' }}>Sin costos adicionales</p>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {wo.costs.map((c) => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, background: 'var(--clr-surface-hover)', border: '1px solid var(--clr-border)', color: 'var(--clr-text-muted)', padding: '2px 8px', borderRadius: 4 }}>
                        {COST_CATEGORIES.find((x) => x.value === c.category)?.label ?? c.category}
                      </span>
                      {c.description && <span style={{ fontSize: 11, color: 'var(--clr-text-subtle)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{c.description}</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: 'var(--clr-text)', fontWeight: 500 }}>{fmt(Number(c.amount))}</span>
                      {!locked && (
                        <button onClick={() => deleteCost.mutate({ woId: wo.id, costId: c.id })}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-text-subtle)', display: 'flex' }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--clr-danger)' }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--clr-text-subtle)' }}
                        ><Trash2 size={13} /></button>
                      )}
                    </div>
                  </div>
                ))}
                {addingCost && (
                  <div style={{ background: 'var(--clr-sidebar)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <SearchableDropdown
                        label=""
                        placeholder="Categoría..."
                        items={COST_CATEGORIES.map(c => ({ id: c.value, primary: c.label }))}
                        value={costForm.category}
                        onChange={(id) => setCostForm((p) => ({ ...p, category: id }))}
                      />
                      <input type="number" step="0.01" placeholder="Monto S/" value={costForm.amount}
                        onChange={(e) => setCostForm((p) => ({ ...p, amount: e.target.value }))}
                        style={{ ...inpSm, fontSize: 12 }} />
                    </div>
                    <input placeholder="Descripción (opcional)" value={costForm.description}
                      onChange={(e) => setCostForm((p) => ({ ...p, description: e.target.value }))}
                      style={{ ...inpSm, width: '100%', boxSizing: 'border-box', fontSize: 12 }} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={handleAddCost} disabled={addCost.isPending}
                        style={{ flex: 1, background: 'var(--clr-primary)', color: 'var(--clr-on-primary)', border: 'none', fontSize: 12, fontWeight: 600, padding: '6px 0', borderRadius: 8, cursor: addCost.isPending ? 'not-allowed' : 'pointer', opacity: addCost.isPending ? 0.5 : 1 }}
                      >{addCost.isPending ? '...' : 'Agregar'}</button>
                      <button onClick={() => setAddingCost(false)}
                        style={{ flex: 1, background: 'var(--clr-surface-hover)', color: 'var(--clr-text-muted)', border: '1px solid var(--clr-border)', fontSize: 12, padding: '6px 0', borderRadius: 8, cursor: 'pointer' }}
                      >Cancelar</button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Resumen de facturación */}
            <div style={cardSec}>
              <h3 style={secTitle}>Resumen de facturación</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--clr-text-subtle)' }}>
                    Servicio ({actualQty} {billingLabels[wo.billingType]}{Number(actualQty) !== 1 ? 's' : ''} × {fmt(Number(wo.unitRate))})
                  </span>
                  <span style={{ color: 'var(--clr-text)' }}>{fmt(baseSubtotal)}</span>
                </div>
                {wo.costs.map((c) => (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--clr-text-subtle)', paddingLeft: 16 }}>+ {COST_CATEGORIES.find((x) => x.value === c.category)?.label} {c.description ? `(${c.description})` : ''}</span>
                    <span style={{ color: 'var(--clr-text-muted)' }}>{fmt(Number(c.amount))}</span>
                  </div>
                ))}
                <div style={{ borderTop: '1px solid var(--clr-border)', paddingTop: 8, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--clr-text-subtle)' }}>Subtotal (sin IGV)</span>
                    <span style={{ color: 'var(--clr-text)' }}>{fmt(totalSinIgv)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--clr-text-subtle)' }}>IGV 18%</span>
                    <span style={{ color: 'var(--clr-text-muted)' }}>{fmt(igv)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                    <span style={{ color: 'var(--clr-text)' }}>Total</span>
                    <span style={{ color: 'var(--clr-text)', fontSize: 17 }}>{fmt(totalConIgv)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer actions */}
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--clr-border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {/* Enviar al cliente */}
              {['DRAFT', 'ACTIVE', 'ACCEPTED'].includes(wo.status) && (
                <button onClick={() => setShowSend(true)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', fontSize: 11, fontWeight: 600, background: 'rgba(217,119,6,0.10)', color: '#d97706', border: '1px solid rgba(217,119,6,0.30)', borderRadius: 10, cursor: 'pointer' }}
                >
                  <Send size={13} /> Enviar al cliente
                </button>
              )}
              {/* Aceptar + Reenviar */}
              {wo.status === 'SENT' && (
                <>
                  <button onClick={() => setShowSend(true)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', fontSize: 11, fontWeight: 600, background: 'var(--clr-surface-hover)', color: 'var(--clr-text-muted)', border: '1px solid var(--clr-border)', borderRadius: 10, cursor: 'pointer' }}
                  ><Send size={13} /> Volver a enviar</button>
                  <button
                    onClick={() => markAccepted.mutateAsync(wo.id)}
                    disabled={markAccepted.isPending}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', fontSize: 11, fontWeight: 600, background: 'rgba(234,88,12,0.10)', color: '#ea580c', border: '1px solid rgba(234,88,12,0.30)', borderRadius: 10, cursor: markAccepted.isPending ? 'not-allowed' : 'pointer', opacity: markAccepted.isPending ? 0.5 : 1 }}
                  ><ThumbsUp size={13} /> Marcar aceptada</button>
                </>
              )}
              {/* Avanzar estado */}
              {wo.status === 'DRAFT' && (
                <button
                  onClick={() => updateStatus.mutate({ id: wo.id, status: 'ACTIVE' })}
                  disabled={updateStatus.isPending}
                  style={{ flex: 1, background: 'var(--clr-primary-dk)', color: 'var(--clr-on-primary)', border: 'none', fontSize: 13, fontWeight: 600, padding: '10px 0', borderRadius: 10, cursor: updateStatus.isPending ? 'not-allowed' : 'pointer', opacity: updateStatus.isPending ? 0.5 : 1 }}
                >Activar</button>
              )}
              {(['ACCEPTED', 'ACTIVE'] as WorkOrderStatus[]).includes(wo.status) && (
                <button
                  onClick={() => updateStatus.mutate({ id: wo.id, status: 'COMPLETED' })}
                  disabled={updateStatus.isPending}
                  style={{ flex: 1, background: '#15803d', color: 'white', border: 'none', fontSize: 13, fontWeight: 600, padding: '10px 0', borderRadius: 10, cursor: updateStatus.isPending ? 'not-allowed' : 'pointer', opacity: updateStatus.isPending ? 0.5 : 1 }}
                >Marcar completada</button>
              )}
              {/* Vincular factura SUNAT */}
              {wo.status === 'COMPLETED' && !wo.invoiceId && (
                <button onClick={() => setShowLink(true)}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#7c3aed', color: 'white', border: 'none', fontSize: 13, fontWeight: 700, padding: '10px 0', borderRadius: 10, cursor: 'pointer' }}
                ><Link size={15} /> Vincular Factura SUNAT</button>
              )}
              {/* Estado BILLED / PAID */}
              {(['BILLED', 'PAID'] as WorkOrderStatus[]).includes(wo.status) && wo.invoice && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'var(--clr-violet-bg)', border: '1px solid var(--clr-violet-border)', borderRadius: 10, padding: '10px 12px' }}>
                  <Receipt size={15} style={{ color: 'var(--clr-violet)' }} />
                  <span style={{ fontSize: 13, color: 'var(--clr-violet)', fontWeight: 500 }}>
                    {wo.invoice.series}-{wo.invoice.number}
                  </span>
                </div>
              )}
              {/* Descargar PDF */}
              <button
                onClick={handleDownloadPDF}
                disabled={!company}
                title="Descargar PDF de la OT"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', fontSize: 11, fontWeight: 600, background: 'var(--clr-surface-hover)', color: 'var(--clr-text-muted)', border: '1px solid var(--clr-border)', borderRadius: 10, cursor: !company ? 'not-allowed' : 'pointer', opacity: !company ? 0.4 : 1 }}
              ><Download size={13} /> PDF</button>
              <button onClick={onClose}
                style={{ padding: '7px 20px', background: 'var(--clr-sidebar)', color: 'var(--clr-text-muted)', border: '1px solid var(--clr-border)', fontSize: 13, borderRadius: 10, cursor: 'pointer' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--clr-surface-hover)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--clr-sidebar)' }}
              >Cerrar</button>
            </div>
          </div>
        </div>
      </div>

      {showSend && <SendClientModal wo={wo} onClose={() => setShowSend(false)} />}
      {showLink && <LinkInvoiceModal wo={wo} onClose={() => { setShowLink(false); qc.invalidateQueries({ queryKey: ['workorders'] }) }} />}
    </>
  )
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof User; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <Icon size={13} style={{ color: 'var(--clr-text-subtle)', marginTop: 2, flexShrink: 0 }} />
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 11, color: 'var(--clr-text-subtle)' }}>{label}</p>
        <p style={{ margin: 0, fontSize: 11, color: 'var(--clr-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</p>
      </div>
    </div>
  )
}

// ─── WORK ORDER ROW ───────────────────────────────────────────────────────────

type WorkOrderRowProps = {
  wo: WorkOrder
  company: ReturnType<typeof useCompany>['data']
  onOpen: () => void
  onEdit: () => void
  onStatusChange: (status: WorkOrderStatus) => void
  onMarkAccepted: () => void
  onPreviewPDF: () => void
}

function WorkOrderRow({ wo, company, onOpen, onEdit, onStatusChange, onMarkAccepted, onPreviewPDF }: WorkOrderRowProps) {
  const dotColor = STATUS_DOT[wo.status] ?? 'var(--clr-text-subtle)'
  const cfg = resolveStatusCfg(wo)
  const extraCosts = wo.costs.reduce((a, c) => a + Number(c.amount), 0)
  const grandTotal = Number(wo.subtotal) + extraCosts

  return (
    <div style={{
      background: 'var(--clr-surface)',
      border: '1px solid var(--clr-border)',
      borderLeft: `3px solid ${dotColor}`,
      borderRadius: 10,
      padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--clr-doc-number)', background: 'var(--clr-doc-number-bg)', fontSize: 12, padding: '1px 7px', borderRadius: 4 }}>{wo.number}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, display: 'inline-block', flexShrink: 0 }} />
              <span style={{ color: 'var(--clr-text-muted)' }}>{cfg.label}</span>
            </span>
            {wo.invoice && (
              <span style={{ fontSize: 10, background: 'var(--clr-violet-bg)', color: 'var(--clr-violet)', padding: '2px 7px', borderRadius: 4, border: '1px solid var(--clr-violet-border)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <Receipt size={9} /> {wo.invoice.series}-{wo.invoice.number}
              </span>
            )}
          </div>
          <div style={{ color: 'var(--clr-text)', fontSize: 13, fontWeight: 600, marginBottom: 3 }}>{wo.client.businessName}</div>
          <div style={{ color: 'var(--clr-text-subtle)', fontSize: 12, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Truck size={11} /> {wo.equipment.name}</span>
            <span style={{ color: 'var(--clr-border)' }}>·</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><User size={11} /> {wo.operator.name}</span>
            {wo.location && (
              <>
                <span style={{ color: 'var(--clr-border)' }}>·</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><MapPin size={11} /> {wo.location}</span>
              </>
            )}
          </div>
          <div style={{ color: 'var(--clr-text-subtle)', fontSize: 11, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            <Calendar size={10} />
            {format(parseISO(wo.startDate), 'dd MMM yyyy', { locale: es })}
            {wo.endDate && <>{' → '}{format(parseISO(wo.endDate), 'dd MMM yyyy', { locale: es })}</>}
            <span style={{ color: 'var(--clr-border)' }}>·</span>
            {Number(wo.quantity)} {billingLabels[wo.billingType]} × {fmt(Number(wo.unitRate))}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontWeight: 700, color: 'var(--clr-text)', fontSize: 15 }}>{fmt(grandTotal)}</div>
          {extraCosts > 0 && <div style={{ fontSize: 11, color: 'var(--clr-text-subtle)', marginTop: 1 }}>+{fmt(extraCosts)} extras</div>}
          <div style={{ fontSize: 10, color: 'var(--clr-text-subtle)', marginTop: 2 }}>sin IGV</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--clr-border)', flexWrap: 'wrap' }}>
        <button onClick={onOpen} style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, background: 'var(--clr-surface-hover)', color: 'var(--clr-text-muted)', border: '1px solid var(--clr-border)', cursor: 'pointer', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <FileText size={11} /> Ver Detalle
        </button>
        {(wo.status === 'DRAFT' || wo.status === 'SENT') && (
          <button onClick={(e) => { e.stopPropagation(); onEdit() }} style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, background: 'var(--clr-surface-hover)', color: 'var(--clr-text-muted)', border: '1px solid var(--clr-border)', cursor: 'pointer', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <FileText size={11} /> Editar
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onPreviewPDF() }}
          style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, background: 'var(--clr-surface-hover)', color: 'var(--clr-text-muted)', border: '1px solid var(--clr-border)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          <Download size={11} /> PDF
        </button>
        {wo.status === 'DRAFT' && (
          <button
            onClick={(e) => { e.stopPropagation(); onStatusChange('ACTIVE') }}
            style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, background: 'rgba(37,99,235,0.2)', color: 'var(--clr-primary-lt)', border: '1px solid rgba(37,99,235,0.4)', cursor: 'pointer', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <Zap size={11} /> Activar
          </button>
        )}
        {wo.status === 'SENT' && (
          <button
            onClick={(e) => { e.stopPropagation(); onMarkAccepted() }}
            style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, background: 'var(--clr-orange-bg)', color: 'var(--clr-orange)', border: '1px solid var(--clr-orange-border)', cursor: 'pointer', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <ThumbsUp size={11} /> Aceptada
          </button>
        )}
        {(['ACCEPTED', 'ACTIVE'] as WorkOrderStatus[]).includes(wo.status) && (
          <button
            onClick={(e) => { e.stopPropagation(); onStatusChange('COMPLETED') }}
            style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, background: 'var(--clr-success-bg)', color: 'var(--clr-success)', border: '1px solid var(--clr-success-border)', cursor: 'pointer', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <CheckCircle size={11} /> Completar
          </button>
        )}
      </div>
    </div>
  )
}

// ─── PAGE ─────────────────────────────────────────────────────────────────────

const FILTERS = [
  { key: 'all',       label: 'Todas' },
  { key: 'DRAFT',     label: 'Borrador' },
  { key: 'SENT',      label: 'Enviada' },
  { key: 'ACCEPTED',  label: 'Aceptada' },
  { key: 'ACTIVE',    label: 'Activa' },
  { key: 'COMPLETED', label: 'Completada' },
  { key: 'BILLED',    label: 'Facturada' },
  { key: 'PAID',      label: 'Pagada' },
]

export default function WorkOrdersPage() {
  const [filter, setFilter]     = useState<string>('all')
  const [search, setSearch]     = useState('')
  const storeQuery = useSearchStore((s) => s.query)
  const clearStore = useSearchStore((s) => s.clear)
  useEffect(() => { if (storeQuery) { setSearch(storeQuery); clearStore() } }, [storeQuery])
  const [newOpen, setNewOpen]     = useState(false)
  const [fromQuote, setFromQuote] = useState<Quote | null>(null)
  const [selected, setSelected]   = useState<WorkOrder | null>(null)
  const [editingWO, setEditingWO] = useState<WorkOrder | null>(null)

  // Vista previa PDF de OT
  const [previewWO,      setPreviewWO]      = useState<WorkOrder | null>(null)
  const [previewWOUrl,   setPreviewWOUrl]   = useState<string>('')
  const [previewWOLoading, setPreviewWOLoading] = useState(false)

  const { data: workOrders = [], isLoading } = useWorkOrders()
  const { data: company } = useCompany()

  function openPreviewWO(wo: WorkOrder, e?: MouseEvent) {
    e?.stopPropagation()
    setPreviewWO(wo)
    setPreviewWOUrl('')
    setPreviewWOLoading(true)
    try {
      const co = company ?? { id: '', name: 'Empresa', ruc: '', plan: '' }
      const url = previewWorkOrderPDFUrl(wo, co as any)
      setPreviewWOUrl(url)
    } catch { setPreviewWOUrl('') }
    finally { setPreviewWOLoading(false) }
  }

  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const state = location.state as { fromQuote?: Quote } | null
    if (state?.fromQuote) {
      setFromQuote(state.fromQuote)
      setNewOpen(true)
      window.history.replaceState({}, '')
    }
  }, [])
  const updateStatusPage = useUpdateWorkOrderStatus()
  const markAcceptedPage = useMarkAccepted()

  const counts = Object.fromEntries(
    Object.keys(statusConfig).map((k) => [k, workOrders.filter((w) => w.status === k).length])
  )

  const filtered = filter === 'all' ? workOrders : workOrders.filter((wo) => wo.status === filter)
  const filteredAndSearched = search.trim()
    ? filtered.filter((wo) =>
        wo.number.toLowerCase().includes(search.toLowerCase()) ||
        wo.client.businessName.toLowerCase().includes(search.toLowerCase()) ||
        wo.equipment.name.toLowerCase().includes(search.toLowerCase()) ||
        (wo.location ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : filtered

  const currentSelected = selected
    ? (workOrders.find((w) => w.id === selected.id) ?? selected)
    : null

  return (
    <AppShell active="workorders" title="Órdenes de Trabajo">
      <div style={{ maxWidth: 1400, padding: '24px 28px' }}>
        {/* Page Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--clr-text)', margin: 0 }}>Órdenes de Trabajo</h1>
            <p style={{ fontSize: 13, color: 'var(--clr-text-subtle)', marginTop: 4 }}>
              {workOrders.length} órdenes · {counts.ACTIVE ?? 0} activas · {counts.COMPLETED ?? 0} completadas
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setNewOpen(true)}
              style={{ fontSize: 13, padding: '8px 16px', borderRadius: 8, background: 'var(--clr-primary)', color: 'var(--clr-on-primary)', border: 'none', cursor: 'pointer', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Plus size={14} /> Nueva OT
            </button>
          </div>
        </div>

        {/* Filters + search */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {FILTERS.map((f) => {
              const count = f.key === 'all' ? workOrders.length : (counts[f.key] ?? 0)
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
              placeholder="Buscar OT, cliente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 12, color: 'var(--clr-text)', width: 160 }}
            />
          </div>
        </div>

        {/* List */}
        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ height: 110, borderRadius: 10, background: 'var(--clr-surface)', border: '1px solid var(--clr-border)' }} className="animate-pulse" />
            ))}
          </div>
        ) : filteredAndSearched.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--clr-text-subtle)' }}>
            <FileText size={40} style={{ margin: '0 auto 12px', opacity: 0.4, display: 'block' }} />
            <p style={{ fontWeight: 600, margin: 0 }}>No hay órdenes de trabajo</p>
            <p style={{ fontSize: 13, marginTop: 4 }}>Crea la primera OT para empezar</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredAndSearched.map((wo) => (
              <WorkOrderRow
                key={wo.id}
                wo={wo}
                company={company}
                onOpen={() => setSelected(wo)}
                onEdit={() => setEditingWO(wo)}
                onStatusChange={(status) => updateStatusPage.mutate({ id: wo.id, status })}
                onMarkAccepted={() => markAcceptedPage.mutateAsync(wo.id)}
                onPreviewPDF={() => openPreviewWO(wo)}
              />
            ))}
          </div>
        )}
      </div>

      {newOpen && <NewWorkOrderModal fromQuote={fromQuote ?? undefined} onClose={() => { setNewOpen(false); setFromQuote(null) }} />}
      {editingWO && <NewWorkOrderModal key={editingWO.id} editingWO={editingWO} onClose={() => setEditingWO(null)} />}
      {currentSelected && <OTDetailModal wo={currentSelected} onClose={() => setSelected(null)} />}

      {/* ── Modal Vista Previa OT PDF ────────────────────────────────────── */}
      {previewWO && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={(e) => { if (e.target === e.currentTarget) setPreviewWO(null) }}
        >
          <div style={{ background: 'var(--clr-surface)', borderRadius: 16, width: '100%', maxWidth: 860, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 64px rgba(0,0,0,0.4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--clr-border)' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--clr-text)' }}>{previewWO.number}</div>
                <div style={{ fontSize: 12, color: 'var(--clr-text-subtle)', marginTop: 2 }}>{previewWO.client.businessName}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => company && downloadWorkOrderPDF(previewWO, company)}
                  disabled={!company}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: 'var(--clr-primary)', color: 'var(--clr-on-primary)', border: 'none', cursor: 'pointer' }}
                >
                  <Download size={14} /> Descargar PDF
                </button>
                <button
                  onClick={() => setPreviewWO(null)}
                  style={{ display: 'flex', alignItems: 'center', padding: 8, borderRadius: 8, background: 'var(--clr-surface-hover)', border: '1px solid var(--clr-border)', cursor: 'pointer', color: 'var(--clr-text-muted)' }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'hidden', borderRadius: '0 0 16px 16px', minHeight: 0 }}>
              {previewWOLoading ? (
                <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--clr-text-subtle)', fontSize: 14 }}>
                  <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> Generando vista previa…
                </div>
              ) : previewWOUrl ? (
                <iframe src={previewWOUrl} style={{ width: '100%', height: '100%', border: 'none', minHeight: 500 }} title="Vista previa OT" />
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

