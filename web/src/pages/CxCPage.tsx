import { useState, useRef, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useSearchStore } from '../store/search.store'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Download, Search, FileText as FilePdf,
  TrendingDown, Clock, CheckCircle2, ChevronDown,
  Wrench, MapPin, User, Truck, Mail, CheckCircle, AlertCircle,
  CheckSquare, Square, ListChecks, X as XIcon, Loader2,
} from 'lucide-react'
import { WhatsAppIcon } from '../components/WhatsAppIcon'
import { api } from '../lib/api'
import AppShell from '../components/AppShell'
import { useQueryClient } from '@tanstack/react-query'
import { useInvoices, useUpdateInvoice, useDashboard, type Invoice } from '../hooks/useInvoices'
import { PaymentModal } from '../components/PaymentModal'
import { useCompany } from '../hooks/useFlota'
import { useAuthStore } from '../store/auth.store'
import { downloadInvoicePDFLocal, previewInvoicePDFUrl } from '../components/InvoicePDF'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number | string) =>
  'S/ ' + Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const borderColor: Record<string, string> = {
  OVERDUE: 'var(--clr-danger)', PARTIAL: '#d97706', PENDING: 'var(--clr-primary)', PAID: 'var(--clr-success)',
}
const STATUS_BADGE: Record<string, { bg: string; color: string; border: string }> = {
  OVERDUE: { bg: 'var(--clr-danger-bg)',  color: 'var(--clr-danger)',   border: 'var(--clr-danger-border)'  },
  PARTIAL: { bg: 'rgba(245,158,11,0.12)', color: '#d97706',             border: 'rgba(245,158,11,0.30)'     },
  PENDING: { bg: 'var(--clr-primary-bg)', color: 'var(--clr-primary)',  border: 'var(--clr-primary-border)' },
  PAID:    { bg: 'var(--clr-success-bg)', color: 'var(--clr-success)',  border: 'var(--clr-success-border)' },
}
const statusLabel: Record<string, string> = {
  OVERDUE: 'Vencida', PARTIAL: 'Pago parcial', PENDING: 'Pendiente', PAID: 'Pagada',
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CxCPage() {
  const [searchParams] = useSearchParams()
  const [page, setPage]               = useState(1)
  const [activeTab, setActiveTab]     = useState<string>(searchParams.get('tab') ?? 'ALL')
  const [search, setSearch]           = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)

  const storeQuery = useSearchStore((s) => s.query)
  const clearStore = useSearchStore((s) => s.clear)
  useEffect(() => { if (storeQuery) { setSearch(storeQuery); setDebouncedSearch(storeQuery); clearStore() } }, [storeQuery])
  const [showTools, setShowTools]     = useState(false)

  // Detracción inline
  const [editingDetraccion, setEditingDetraccion] = useState<string | null>(null)
  const [detraccionInput, setDetraccionInput]     = useState('')

  // Email por factura
  const [emailStatus, setEmailStatus] = useState<Record<string, 'idle' | 'sending' | 'ok' | 'error'>>({})
  const [emailMsg,    setEmailMsg]    = useState<Record<string, string>>({})

  async function sendInvoiceEmail(inv: Invoice) {
    if (!inv.client.email) return
    setEmailStatus((s) => ({ ...s, [inv.id]: 'sending' }))
    setEmailMsg((m) => ({ ...m, [inv.id]: '' }))
    try {
      await api.post(`/invoices/${inv.id}/send-email`)
      setEmailStatus((s) => ({ ...s, [inv.id]: 'ok' }))
      setEmailMsg((m) => ({ ...m, [inv.id]: `Enviado a ${inv.client.email}` }))
    } catch (err: any) {
      setEmailStatus((s) => ({ ...s, [inv.id]: 'error' }))
      setEmailMsg((m) => ({ ...m, [inv.id]: err?.response?.data?.message ?? 'Error al enviar' }))
    } finally {
      setTimeout(() => {
        setEmailStatus((s) => ({ ...s, [inv.id]: 'idle' }))
        setEmailMsg((m) => ({ ...m, [inv.id]: '' }))
      }, 5000)
    }
  }

  // PDF
  const [downloadingPdf, setDownloadingPdf] = useState<string | null>(null)
  const [pdfFallbackMsg, setPdfFallbackMsg] = useState('')
  const [pdfError, setPdfError]             = useState('')

  // Vista previa PDF
  const [previewInv,  setPreviewInv]  = useState<Invoice | null>(null)
  const [previewUrl,  setPreviewUrl]  = useState<string>('')
  const [previewLoading, setPreviewLoading] = useState(false)

  async function openPreview(inv: Invoice) {
    setPreviewInv(inv)
    setPreviewUrl('')
    setPreviewLoading(true)
    try {
      // Intentar obtener el PDF del backend (mismo que el botón Descargar)
      let resolved = false
      try {
        const res = await fetch(`/api/invoices/${inv.id}/pdf`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('ft_token') ?? ''}` },
        })
        if (res.ok) {
          const blob = await res.blob()
          const url  = URL.createObjectURL(blob)
          setPreviewUrl(url)
          resolved = true
        }
      } catch { /* fallback */ }
      // Fallback al PDF local si el backend no lo tiene
      if (!resolved) {
        const co = company ?? { id: '', name: 'Empresa', ruc: '', plan: '' }
        const url = await previewInvoicePDFUrl(inv, co)
        setPreviewUrl(url)
      }
    } catch { setPreviewUrl('') }
    finally { setPreviewLoading(false) }
  }

  // Bulk selection
  const [selectionMode, setSelectionMode]   = useState(false)
  const [selectedIds,   setSelectedIds]     = useState<Set<string>>(new Set())
  const [bulkPaying,    setBulkPaying]      = useState(false)
  const [bulkResult,    setBulkResult]      = useState('')

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  function selectAll() { setSelectedIds(new Set(filteredItems.filter(i => i.status !== 'PAID').map(i => i.id))) }
  function deselectAll() { setSelectedIds(new Set()) }
  function exitSelection() { setSelectionMode(false); setSelectedIds(new Set()); setBulkResult('') }

  async function handleBulkPay() {
    if (selectedIds.size === 0 || bulkPaying) return
    setBulkPaying(true)
    setBulkResult('')
    try {
      const res = await api.post('/invoices/bulk-pay', {
        ids: Array.from(selectedIds),
        reference: 'Cobro histórico',
      })
      const { updated } = res.data as { updated: number; total: number }
      setBulkResult(`✅ ${updated} factura${updated !== 1 ? 's' : ''} marcada${updated !== 1 ? 's' : ''} como cobrada${updated !== 1 ? 's' : ''}`)
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setSelectedIds(new Set())
      setTimeout(exitSelection, 2500)
    } catch (e: any) {
      setBulkResult(`❌ ${e?.response?.data?.message ?? 'Error al procesar'}`)
    } finally {
      setBulkPaying(false)
    }
  }

  // XML
  const [xmlUploading, setXmlUploading] = useState(false)
  const [xmlStatus, setXmlStatus]       = useState('')
  const xmlInputRef = useRef<HTMLInputElement>(null)

  // Enriquecimiento / detracción masiva
  const [enrichStatus, setEnrichStatus] = useState('')
  const [enriching, setEnriching]       = useState(false)
  const [showPctForm, setShowPctForm]   = useState(false)
  const [pctInput, setPctInput]         = useState('10')
  const qc = useQueryClient()

  const token    = useAuthStore((s) => s.token)
  const { data: company }   = useCompany()
  const { data: dashboard } = useDashboard()

  // Debounce: esperar 350ms antes de enviar la búsqueda al servidor
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 350)
    return () => clearTimeout(t)
  }, [search])

  const serverStatus = activeTab === 'ALL' || activeTab === 'SOON' ? '' : activeTab
  const { data, isLoading } = useInvoices({
    ...(serverStatus ? { status: serverStatus } : {}),
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    page: String(page),
    limit: '50',
  })
  const updateInvoice = useUpdateInvoice()

  // "Por vencer" es filtro client-side sobre los resultados del servidor (no usa status en DB)
  const filteredItems = (data?.items ?? []).filter((inv) => {
    if (activeTab === 'SOON') {
      if (inv.daysUntilDue <= 0 || inv.status === 'PAID') return false
    }
    return true
  })

  // Counts for tabs — dashboard usa buckets mutuamente excluyentes que suman al total real
  const { data: countAll } = useInvoices({ limit: '1' })

  const totalN   = countAll?.total            ?? 0
  const overdueN = dashboard?.overdue.count   ?? 0
  const soonN    = dashboard?.dueSoon.count   ?? 0
  const currentN = dashboard?.current.count   ?? 0
  const paidN    = dashboard?.paid.count      ?? 0
  // Pendientes = current (no vencidas, no por vencer, no pagadas)
  const pendingN = currentN

  const tabs = [
    { key: 'ALL',     label: 'Todas',      badge: totalN },
    { key: 'PENDING', label: 'Pendientes', badge: pendingN },
    { key: 'OVERDUE', label: 'Vencidas',   badge: overdueN },
    { key: 'SOON',    label: 'Por vencer', badge: soonN },
    { key: 'PAID',    label: 'Pagadas',    badge: paidN },
  ]

  function saveDetraccion(inv: Invoice) {
    const val = parseFloat(detraccionInput)
    if (isNaN(val) || val < 0) return
    updateInvoice.mutate({ id: inv.id, detraccion: val })
    setEditingDetraccion(null)
  }

  async function downloadInvoicePdf(inv: Invoice) {
    if (!company) return
    setDownloadingPdf(inv.id)
    setPdfError('')
    setPdfFallbackMsg('')
    try {
      let sunatOk = false
      try {
        const res = await fetch(`/api/invoices/${inv.id}/pdf`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('ft_token') ?? ''}` },
        })
        if (res.ok) {
          const blob = await res.blob()
          const url  = URL.createObjectURL(blob)
          const a    = document.createElement('a')
          a.href     = url
          a.download = `${inv.series}-${inv.number.padStart(8, '0')}.pdf`
          a.click()
          URL.revokeObjectURL(url)
          sunatOk = true
        } else {
          try {
            const err = await res.json() as { message?: string }
            if (err.message) setPdfFallbackMsg(`SUNAT: ${err.message.substring(0, 80)} — descargando representación impresa`)
          } catch { /* ignore */ }
        }
      } catch { /* fallback */ }
      if (!sunatOk) {
        if (!pdfFallbackMsg) setPdfFallbackMsg('PDF SUNAT no disponible — descargando representación impresa')
        await downloadInvoicePDFLocal(inv, company)
        setTimeout(() => setPdfFallbackMsg(''), 5000)
      }
    } catch {
      setPdfError('No se pudo generar el PDF')
      setTimeout(() => setPdfError(''), 4000)
    } finally {
      setDownloadingPdf(null)
    }
  }

  async function applyDetraccionToAll() {
    const n = parseFloat(pctInput)
    if (isNaN(n) || n < 0 || n > 100) { setEnrichStatus('❌ Porcentaje inválido'); return }
    setShowPctForm(false)
    setEnriching(true)
    setEnrichStatus(`Aplicando ${n}% ...`)
    try {
      await api.patch('/clients/bulk-detraccion', { detraccionPct: n })
      setEnrichStatus(`✅ ${n}% aplicado. Calculando...`)
      const resp2 = await fetch('/api/sunat/enrich-cpe', { method: 'POST', headers: { Authorization: `Bearer ${token ?? ''}` } })
      if (!resp2.ok) {
        const errJson = await resp2.json().catch(() => ({ message: `Error ${resp2.status}` }))
        setEnrichStatus(`❌ ${errJson.message ?? 'Error al conectar con el servidor'}`)
        return
      }
      const reader = resp2.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        for (const line of buf.split('\n')) {
          if (!line.startsWith('data:')) continue
          try {
            const ev = JSON.parse(line.slice(5))
            if (ev.type === 'progress') setEnrichStatus(ev.step)
            if (ev.type === 'done') {
              setEnrichStatus(`✅ ${ev.updated} facturas actualizadas`)
              qc.invalidateQueries({ queryKey: ['invoices'] })
            }
            if (ev.type === 'error') setEnrichStatus(`❌ ${ev.message}`)
          } catch { /* */ }
        }
        buf = buf.split('\n').pop() ?? ''
      }
    } catch (e) {
      setEnrichStatus(`❌ ${e instanceof Error ? e.message : 'Error'}`)
    } finally {
      setEnriching(false)
    }
  }

  async function runEnrichCpe() {
    setEnriching(true)
    setEnrichStatus('Conectando con SUNAT CPE...')
    try {
      const resp = await fetch('/api/sunat/enrich-cpe', { method: 'POST', headers: { Authorization: `Bearer ${token ?? ''}` } })
      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({ message: `Error ${resp.status}` }))
        setEnrichStatus(`❌ ${errJson.message ?? 'Error al conectar con el servidor'}`)
        return
      }
      const reader = resp.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        for (const line of buf.split('\n')) {
          if (!line.startsWith('data:')) continue
          try {
            const ev = JSON.parse(line.slice(5))
            if (ev.type === 'progress') setEnrichStatus(ev.step)
            if (ev.type === 'done') {
              setEnrichStatus(`✅ ${ev.updated} actualizadas · ${ev.errors} errores`)
              qc.invalidateQueries({ queryKey: ['invoices'] })
            }
            if (ev.type === 'error') setEnrichStatus(`❌ ${ev.message}`)
          } catch { /* */ }
        }
        buf = buf.split('\n').pop() ?? ''
      }
    } catch (e) {
      setEnrichStatus(`❌ ${e instanceof Error ? e.message : 'Error de red'}`)
    } finally {
      setEnriching(false)
    }
  }

  async function handleXmlUpload(e: React.ChangeEvent<HTMLInputElement>) {
    setShowTools(false)
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setXmlUploading(true)
    setXmlStatus(`Leyendo ${files.length} archivo(s)...`)
    try {
      const fileData = await Promise.all(
        files.map(f => new Promise<{ filename: string; content: string }>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = (ev) => resolve({ filename: f.name, content: ev.target!.result as string })
          reader.onerror = reject
          reader.readAsText(f, 'utf-8')
        }))
      )
      setXmlStatus(`Procesando ${fileData.length} XML(s)...`)
      const res = await api.post('/invoices/parse-xml', { files: fileData })
      const { updated, notFound, errors } = res.data
      setXmlStatus(`✅ ${updated} actualizadas · ${notFound} no encontradas · ${errors} errores`)
      if (updated > 0) qc.invalidateQueries({ queryKey: ['invoices'] })
    } catch (err: unknown) {
      const msg = (err as any)?.response?.data?.message ?? (err instanceof Error ? err.message : 'Error')
      setXmlStatus(`❌ ${msg}`)
    } finally {
      setXmlUploading(false)
      if (xmlInputRef.current) xmlInputRef.current.value = ''
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const totalPending = dashboard ? dashboard.overdue.amount + dashboard.dueSoon.amount + dashboard.current.amount : 0
  const overdueCount = dashboard?.overdue.count ?? 0

  return (
    <AppShell active="cxc" title="Cobranza">
      <div className="p-8 space-y-6" style={{ maxWidth: 1400 }}>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--clr-text)' }}>Cobranza</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--clr-text-subtle)' }}>
              CxC activa: {fmt(totalPending)} · {overdueCount} factura{overdueCount !== 1 ? 's' : ''} vencida{overdueCount !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Botón selección múltiple */}
            <button
              onClick={() => selectionMode ? exitSelection() : setSelectionMode(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
              style={{
                background: selectionMode ? 'var(--clr-primary)' : 'var(--clr-surface)',
                border: '1px solid var(--clr-border)',
                color: selectionMode ? 'var(--clr-on-primary)' : 'var(--clr-text-muted)',
              }}
            >
              <ListChecks size={13} />
              {selectionMode ? 'Cancelar selección' : 'Selección múltiple'}
            </button>

            <div className="relative">
              <button
                onClick={() => setShowTools((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
                style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', color: 'var(--clr-text-muted)' }}
              >
                Herramientas <ChevronDown size={12} />
              </button>
              {showTools && (
                <div className="absolute right-0 top-10 z-50 rounded-xl p-2 space-y-1 min-w-[220px]" style={{ background: 'var(--clr-sidebar)', border: '1px solid var(--clr-border)' }}>
                  <button
                    onClick={() => { setShowPctForm(true); setShowTools(false) }}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium"
                    style={{ color: 'var(--clr-orange)' }}
                  >
                    ⚡ Calcular detracción automática
                  </button>
                  <button
                    onClick={() => { runEnrichCpe(); setShowTools(false) }}
                    disabled={enriching}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-50"
                    style={{ color: 'var(--clr-primary)' }}
                  >
                    🔄 Sincronizar SUNAT CPE
                  </button>
                  <label className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer" style={{ color: 'var(--clr-text-muted)' }}>
                    <input ref={xmlInputRef} type="file" accept=".xml" multiple className="hidden" onChange={handleXmlUpload} disabled={xmlUploading} />
                    📂 Subir XML(s) SUNAT
                  </label>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Pct form overlay */}
        {showPctForm && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl" style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-orange-border)' }}>
            <span className="text-xs" style={{ color: 'var(--clr-text-muted)' }}>% detracción para todos los clientes:</span>
            <input
              autoFocus type="number" min={0} max={100} step={0.01}
              value={pctInput}
              onChange={(e) => setPctInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') applyDetraccionToAll(); if (e.key === 'Escape') setShowPctForm(false) }}
              className="w-16 rounded px-2 py-1 text-xs border outline-none"
              style={{ background: 'var(--clr-bg)', color: 'var(--clr-text)', borderColor: 'var(--clr-orange-border)' }}
            />
            <span className="text-xs" style={{ color: 'var(--clr-text-subtle)' }}>%</span>
            <button onClick={applyDetraccionToAll} disabled={enriching} className="px-3 py-1 rounded text-xs font-bold" style={{ background: '#ea580c', color: 'white' }}>
              Aplicar
            </button>
            <button onClick={() => setShowPctForm(false)} className="text-xs" style={{ color: 'var(--clr-text-subtle)' }}>✕</button>
          </div>
        )}

        {/* Status messages */}
        {enrichStatus && (
          <p style={{ fontSize: 12, color: enrichStatus.startsWith('✅') ? 'var(--clr-success)' : enrichStatus.startsWith('❌') ? 'var(--clr-danger)' : 'var(--clr-text-subtle)' }}>
            {enrichStatus}
          </p>
        )}
        {xmlStatus && (
          <p style={{ fontSize: 12, color: xmlStatus.startsWith('✅') ? 'var(--clr-success)' : xmlStatus.startsWith('❌') ? 'var(--clr-danger)' : 'var(--clr-text-muted)' }}>
            {xmlStatus}
          </p>
        )}
        {pdfFallbackMsg && <p style={{ fontSize: 12, color: '#d97706' }}>⚠ {pdfFallbackMsg}</p>}
        {pdfError       && <p style={{ fontSize: 12, color: 'var(--clr-danger)' }}>❌ {pdfError}</p>}

        {/* Filter bar + KPIs */}
        <div className="flex items-start gap-6 flex-wrap">
          {/* Tabs */}
          <div className="flex gap-1 p-1 rounded-xl flex-1" style={{ background: 'var(--clr-sidebar)', border: '1px solid var(--clr-border)' }}>
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => { setActiveTab(t.key); setPage(1) }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex-1 justify-center"
                style={{
                  background: activeTab === t.key ? 'var(--clr-primary)' : 'transparent',
                  color: activeTab === t.key ? 'var(--clr-on-primary)' : 'var(--clr-text-subtle)',
                  border: 'none',
                }}
              >
                {t.label}
                {t.badge > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'var(--clr-danger)', color: 'white' }}>
                    {t.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'var(--clr-sidebar)', border: '1px solid var(--clr-border)' }}>
            <Search size={13} style={{ color: 'var(--clr-text-subtle)' }} />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="Buscar cliente, RUC o factura…"
              className="bg-transparent text-sm outline-none w-44"
              style={{ color: 'var(--clr-text)' }}
            />
          </div>
        </div>

        {/* KPI chips */}
        {dashboard && (
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl px-5 py-4" style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderTop: '2px solid var(--clr-primary)' }}>
              <div className="flex items-center gap-2 mb-1">
                <Clock size={13} style={{ color: 'var(--clr-primary-lt)' }} />
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--clr-primary-lt)' }}>Por vencer</span>
              </div>
              <div className="text-xl font-bold" style={{ color: 'var(--clr-text)' }}>{fmt(dashboard.dueSoon.amount)}</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--clr-text-subtle)' }}>{dashboard.dueSoon.count} facturas</div>
              <div className="text-[10px] mt-1" style={{ color: 'var(--clr-text-subtle)' }}>Saldo neto sin detracción</div>
            </div>
            <div className="rounded-xl px-5 py-4" style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderTop: '2px solid var(--clr-danger)' }}>
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown size={13} style={{ color: 'var(--clr-danger)' }} />
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--clr-danger)' }}>Vencidas</span>
              </div>
              <div className="text-xl font-bold" style={{ color: 'var(--clr-text)' }}>{fmt(dashboard.overdue.amount)}</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--clr-text-subtle)' }}>{dashboard.overdue.count} facturas</div>
              <div className="text-[10px] mt-1" style={{ color: 'var(--clr-text-subtle)' }}>Saldo neto sin detracción</div>
            </div>
            <div className="rounded-xl px-5 py-4" style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderTop: '2px solid var(--clr-success)' }}>
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 size={13} style={{ color: 'var(--clr-success)' }} />
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--clr-success)' }}>Cobrado (historial)</span>
              </div>
              <div className="text-xl font-bold" style={{ color: 'var(--clr-text)' }}>{fmt(dashboard.paid.amount)}</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--clr-text-subtle)' }}>{dashboard.paid.count} facturas</div>
              <div className="text-[10px] mt-1" style={{ color: 'var(--clr-text-subtle)' }}>Valor facturado incl. detracción</div>
            </div>
          </div>
        )}

        {/* ── Barra de selección múltiple ── */}
        {selectionMode && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, padding:'10px 14px', borderRadius:10, background:'var(--clr-primary-bg)', border:'1px solid var(--clr-primary-border)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontSize:12, fontWeight:600, color:'var(--clr-primary)' }}>
                {selectedIds.size === 0 ? 'Haz clic en una factura para seleccionarla' : `${selectedIds.size} seleccionada${selectedIds.size !== 1 ? 's' : ''}`}
              </span>
              {bulkResult && (
                <span style={{ fontSize:12, fontWeight:600, color: bulkResult.startsWith('✅') ? 'var(--clr-success)' : 'var(--clr-danger)' }}>
                  {bulkResult}
                </span>
              )}
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button
                onClick={selectedIds.size < filteredItems.filter(i=>i.status!=='PAID').length ? selectAll : deselectAll}
                style={{ fontSize:11, fontWeight:600, padding:'4px 12px', borderRadius:6, background:'none', border:'1px solid var(--clr-primary-border)', color:'var(--clr-primary)', cursor:'pointer' }}
              >
                {selectedIds.size < filteredItems.filter(i=>i.status!=='PAID').length ? 'Seleccionar todas' : 'Deseleccionar todas'}
              </button>
              {selectedIds.size > 0 && (
                <button
                  onClick={handleBulkPay}
                  disabled={bulkPaying}
                  style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, fontWeight:700, padding:'5px 16px', borderRadius:7, background: bulkPaying ? '#15803d' : '#16a34a', color:'#fff', border:'none', cursor: bulkPaying ? 'wait' : 'pointer' }}
                >
                  {bulkPaying ? <Loader2 size={13} style={{ animation:'spin 1s linear infinite' }} /> : <CheckCircle size={13} />}
                  {bulkPaying ? 'Procesando…' : `Marcar ${selectedIds.size} como cobrada${selectedIds.size!==1?'s':''}`}
                </button>
              )}
              <button onClick={exitSelection} style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, padding:'4px 10px', borderRadius:6, background:'none', border:'1px solid var(--clr-border)', color:'var(--clr-text-muted)', cursor:'pointer' }}>
                <XIcon size={11} /> Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Invoice cards */}
        <div className="space-y-3">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-44 rounded-xl animate-pulse" style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)' }} />
            ))
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 rounded-xl" style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)' }}>
              <CheckCircle2 size={36} className="mb-3" style={{ color: 'var(--clr-text-subtle)' }} />
              <p className="font-medium" style={{ color: 'var(--clr-text-subtle)' }}>Sin facturas en esta categoría</p>
              <p className="text-xs mt-1" style={{ color: 'var(--clr-text-subtle)' }}>Prueba cambiando los filtros</p>
            </div>
          ) : (
            filteredItems.map((inv) => {
              const isOverdue  = inv.urgency === 'overdue' || inv.status === 'OVERDUE'
              const lBorder    = borderColor[inv.status] ?? '#3b82f6'
              const label      = statusLabel[inv.status] ?? 'Pendiente'
              const badge      = STATUS_BADGE[inv.status] ?? STATUS_BADGE.PENDING
              const paidCuotas = (inv.cuotas ?? []).filter((c: any) => c.status === 'PAID')
              const paid       = paidCuotas.length > 0
                ? paidCuotas.reduce((s: number, c: any) => s + Number(c.amount), 0)
                : inv.status === 'PAID' ? Number(inv.total) : 0
              const detraccion = Number((inv as any).detraccion ?? 0)
              const saldo      = Math.max(0, Number(inv.total) - detraccion - paid)

              return (
                <div
                  key={inv.id}
                  onClick={() => selectionMode && inv.status !== 'PAID' ? toggleSelect(inv.id) : openPreview(inv)}
                  style={{
                    position: 'relative',
                    background: 'var(--clr-surface)',
                    border: selectionMode && selectedIds.has(inv.id)
                      ? '1px solid var(--clr-primary)'
                      : `1px solid ${isOverdue ? 'var(--clr-danger-border)' : 'var(--clr-border)'}`,
                    borderLeft: `4px solid ${lBorder}`,
                    borderRadius: 12,
                    cursor: 'pointer',
                    transition: 'box-shadow 0.15s',
                    boxShadow: selectionMode && selectedIds.has(inv.id) ? '0 0 0 2px rgba(59,130,246,0.2)' : 'none',
                  }}
                >
                  <div style={{ padding: '13px 16px 14px' }}>

                  {/* ── Row 1: Checkbox · Client · Badge · Amount ── */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5 }}>
                    {/* Checkbox (visible en modo selección) */}
                    {selectionMode && inv.status !== 'PAID' && (
                      <button
                        onClick={() => toggleSelect(inv.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0, color: selectedIds.has(inv.id) ? 'var(--clr-primary)' : 'var(--clr-text-subtle)' }}
                      >
                        {selectedIds.has(inv.id)
                          ? <CheckSquare size={18} />
                          : <Square size={18} />}
                      </button>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Número de factura prominente en modo selección */}
                      {selectionMode && (
                        <div style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: 'var(--clr-primary)', marginBottom: 2 }}>
                          {inv.series}-{inv.number}
                        </div>
                      )}
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--clr-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                        {inv.client.businessName}
                      </span>
                    </div>
                    <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 20, flexShrink: 0, background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
                      {label}
                    </span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: inv.status === 'PAID' ? 'var(--clr-success)' : isOverdue ? 'var(--clr-danger)' : 'var(--clr-text)', fontFamily: 'monospace', flexShrink: 0 }}>
                      {fmt(inv.status === 'PAID' ? Number(inv.total) : saldo)}
                    </span>
                  </div>

                  {/* ── Row 2: Invoice · Description ── */}
                  <div style={{ fontSize: 11, color: 'var(--clr-text-subtle)', marginBottom: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--clr-doc-number)', background: 'var(--clr-doc-number-bg)', padding: '1px 6px', borderRadius: 4 }}>{inv.series}-{inv.number}</span>
                    {inv.description && <span> · {inv.description}</span>}
                    {paid > 0 && inv.status !== 'PAID' && (
                      <span style={{ marginLeft: 10, color: 'var(--clr-success)', fontWeight: 600 }}>
                        Pagado {fmt(paid)} · Total {fmt(Number(inv.total))}
                      </span>
                    )}
                    {inv.currency === 'USD' && <span style={{ marginLeft: 8, fontWeight: 700, color: '#d97706' }}> USD</span>}
                  </div>

                  {/* ── OTs vinculadas ── */}
                  {inv.workOrders && inv.workOrders.length > 0 && (
                    <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {inv.workOrders.map((wo) => {
                        const woLabel =
                          wo.status === 'PAID'      ? 'Pagada' :
                          wo.status === 'BILLED' && inv.status === 'PARTIAL' ? 'Facturado Parcialmente' :
                          wo.status === 'BILLED' && inv.status === 'OVERDUE'  ? 'Vencida' :
                          wo.status === 'BILLED'    ? 'Facturada' :
                          wo.status === 'COMPLETED' ? 'Completada' : wo.status
                        const woColor =
                          wo.status === 'PAID'      ? { bg: 'var(--clr-success-bg)', text: 'var(--clr-success)' } :
                          inv.status === 'PARTIAL'  ? { bg: 'rgba(251,191,36,0.12)', text: '#d97706' } :
                          inv.status === 'OVERDUE'  ? { bg: 'var(--clr-danger-bg)', text: 'var(--clr-danger)' } :
                          { bg: 'var(--clr-violet-bg)', text: 'var(--clr-violet)' }
                        return (
                          <div key={wo.id} style={{ background: 'var(--clr-bg)', border: '1px solid var(--clr-border)', borderLeft: '3px solid var(--clr-violet)', borderRadius: 7, padding: '7px 11px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <Wrench size={10} style={{ color: 'var(--clr-violet)', flexShrink: 0 }} />
                              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--clr-violet)' }}>OT {wo.number}</span>
                              <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: woColor.bg, color: woColor.text, fontWeight: 700 }}>{woLabel}</span>
                              <span style={{ fontSize: 10, color: 'var(--clr-text-subtle)', display: 'flex', alignItems: 'center', gap: 3 }}><Truck size={9} /> {wo.equipment.name}</span>
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--clr-text)', fontFamily: 'monospace' }}>{fmt(Number(wo.subtotal))}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Detracción editable */}
                  {Number(inv.detraccion) > 0 && (
                    <div onClick={(e) => e.stopPropagation()} className="text-xs mb-3 flex items-center gap-2">
                      <span style={{ color: 'var(--clr-text-subtle)' }}>Detracción:</span>
                      {editingDetraccion === inv.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            autoFocus type="number" step="0.01" value={detraccionInput}
                            onChange={(e) => setDetraccionInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') saveDetraccion(inv); if (e.key === 'Escape') setEditingDetraccion(null) }}
                            className="w-24 rounded px-2 py-0.5 text-xs border outline-none"
                            style={{ background: 'var(--clr-bg)', color: 'var(--clr-text)', borderColor: 'var(--clr-orange-border)' }}
                          />
                          <button onClick={() => saveDetraccion(inv)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-success)', fontWeight: 700 }}>✓</button>
                          <button onClick={() => setEditingDetraccion(null)} style={{ color: 'var(--clr-text-subtle)' }}>✕</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditingDetraccion(inv.id); setDetraccionInput(Number(inv.detraccion).toFixed(2)) }}
                          className="font-semibold hover:underline"
                          style={{ color: 'var(--clr-orange)' }}
                        >
                          {fmt(inv.detraccion)} (click para editar)
                        </button>
                      )}
                    </div>
                  )}

                  {/* ── Cuotas (colapsado por defecto cuando hay muchas) ── */}
                  {inv.cuotas && inv.cuotas.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--clr-text-subtle)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Cuotas · {inv.cuotas.filter(c => c.status === 'PAID').length}/{inv.cuotas.length} pagadas
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {inv.cuotas.map((c) => {
                          const cPaid    = c.status === 'PAID'
                          const cOverdue = c.status === 'OVERDUE'
                          const daysLeft = Math.ceil((parseISO(c.dueDate).getTime() - Date.now()) / 86400000)
                          const cColor   = cPaid ? 'var(--clr-success)' : cOverdue ? 'var(--clr-danger)' : daysLeft <= 7 ? '#d97706' : 'var(--clr-text-subtle)'
                          const cBg     = cPaid ? 'var(--clr-success-bg)' : cOverdue ? 'var(--clr-danger-bg)' : 'transparent'
                          const cBorder = cPaid ? 'var(--clr-success-border)' : cOverdue ? 'var(--clr-danger-border)' : 'var(--clr-border)'
                          return (
                            <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 9px', borderRadius: 7, background: cBg, border: `1px solid ${cBorder}` }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 10, fontWeight: 700, color: cColor, fontFamily: 'monospace', minWidth: 46 }}>C{c.number}</span>
                                <span style={{ fontSize: 10, color: 'var(--clr-text-subtle)' }}>{format(parseISO(c.dueDate), "dd MMM yyyy", { locale: es })}</span>
                                {!cPaid && !cOverdue && daysLeft >= 0 && daysLeft <= 7 && (
                                  <span style={{ fontSize: 9, color: '#d97706' }}>{daysLeft}d</span>
                                )}
                                {cOverdue && <span style={{ fontSize: 9, color: 'var(--clr-danger)', fontWeight: 700 }}>VENCIDA</span>}
                              </div>
                              <span style={{ fontSize: 12, fontWeight: 700, color: cColor, fontFamily: 'monospace' }}>{fmt(c.amount)}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── Row 3: Date/urgency · Actions ── */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', paddingTop: 8, borderTop: '1px solid var(--clr-border)' }}>

                    {/* Left: date + urgency chip */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10, color: 'var(--clr-text-subtle)' }}>
                        {format(parseISO(inv.issueDate), 'dd MMM', { locale: es })} → {format(parseISO(inv.dueDate), 'dd MMM yyyy', { locale: es })}
                      </span>
                      {inv.status !== 'PAID' && (
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 7px', borderRadius: 20, background: isOverdue ? 'var(--clr-danger-bg)' : 'rgba(251,191,36,0.12)', color: isOverdue ? 'var(--clr-danger)' : '#d97706', border: `1px solid ${isOverdue ? 'var(--clr-danger-border)' : 'rgba(251,191,36,0.25)'}` }}>
                          {isOverdue ? `Vencida ${Math.abs(inv.daysUntilDue)}d` : `Vence en ${inv.daysUntilDue}d`}
                        </span>
                      )}
                    </div>

                    {/* Right: action buttons */}
                    <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {/* WhatsApp */}
                      {inv.client.whatsapp ? (
                        <a
                          href={(() => {
                            const d = inv.client.whatsapp!.replace(/\D/g, '')
                            const phone = d.startsWith('51') && d.length >= 11 ? d : '51' + d
                            const dueStr   = format(parseISO(inv.dueDate),   "dd 'de' MMMM 'de' yyyy", { locale: es })
                            const issueStr = format(parseISO(inv.issueDate), "dd 'de' MMMM 'de' yyyy", { locale: es })
                            const invPaid   = inv.status === 'PAID'
                            const invOverdue = !invPaid && (inv.status === 'OVERDUE' || inv.status === 'PARTIAL' || inv.daysUntilDue < 0)
                            const msg = invPaid
                              ? `✅ Estimados ${inv.client.businessName},\n\nAdjuntamos el detalle de la siguiente factura:\n\n📄 *Factura:* ${inv.series}-${inv.number}\n💰 *Monto:* ${fmt(inv.total)}\n📅 *Emitida:* ${issueStr}\n\nGracias por su pago. Quedo a su disposición ante cualquier consulta.\n\nAtentamente,\n*${company?.name ?? 'Gruas Omega S.A.C.'}*`
                              : invOverdue
                              ? `⚠️ Estimados ${inv.client.businessName},\n\nLes informamos que la siguiente factura se encuentra *VENCIDA*:\n\n📄 *Factura:* ${inv.series}-${inv.number}\n💰 *Monto:* ${fmt(inv.total)}\n📅 *Venció:* ${dueStr}\n\nPor favor coordinen el pago a la brevedad.\n\nAtentamente,\n*${company?.name ?? 'Gruas Omega S.A.C.'}*`
                              : `📅 Estimados ${inv.client.businessName},\n\nLes recordamos que la siguiente factura vence en *${inv.daysUntilDue} días*:\n\n📄 *Factura:* ${inv.series}-${inv.number}\n💰 *Monto:* ${fmt(inv.total)}\n📅 *Vence:* ${dueStr}\n\nAnte cualquier consulta, no duden en contactarnos.\n\nAtentamente,\n*${company?.name ?? 'Gruas Omega S.A.C.'}*`
                            return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
                          })()}
                          target="_blank" rel="noopener noreferrer"
                          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600, background: 'var(--clr-wa-btn-bg)', color: 'var(--clr-wa-btn)', border: '1px solid var(--clr-wa-btn-border)', textDecoration: 'none' }}
                        >
                          <WhatsAppIcon size={12} /> WA
                        </a>
                      ) : inv.status === 'PAID' ? (
                        <button disabled title="Sin WhatsApp registrado" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600, background: 'var(--clr-wa-btn-bg)', color: 'var(--clr-wa-btn)', border: '1px solid var(--clr-wa-btn-border)', opacity: 0.4, cursor: 'not-allowed' }}>
                          <WhatsAppIcon size={12} /> WA
                        </button>
                      ) : null}

                      {/* PDF */}
                      <button
                        onClick={() => downloadInvoicePdf(inv)}
                        disabled={downloadingPdf === inv.id || !company}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600, background: 'var(--clr-surface-hover)', border: '1px solid var(--clr-border)', color: 'var(--clr-text-muted)', opacity: (downloadingPdf === inv.id || !company) ? 0.4 : 1 }}
                      >
                        <FilePdf size={12} /> {downloadingPdf === inv.id ? '…' : 'PDF'}
                      </button>

                      {/* Email */}
                      {inv.client.email ? (() => {
                        const est = emailStatus[inv.id] ?? 'idle'
                        const msg = emailMsg[inv.id] ?? ''
                        return (
                          <button
                            onClick={() => sendInvoiceEmail(inv)}
                            disabled={est === 'sending'}
                            title={msg || `Enviar a ${inv.client.email}`}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600,
                              background: est === 'ok' ? 'var(--clr-success-bg)' : est === 'error' ? 'var(--clr-danger-bg)' : 'var(--clr-surface-hover)',
                              color:      est === 'ok' ? 'var(--clr-success)'    : est === 'error' ? 'var(--clr-danger)'    : 'var(--clr-text-muted)',
                              border:     est === 'ok' ? '1px solid var(--clr-success-border)' : est === 'error' ? '1px solid var(--clr-danger-border)' : '1px solid var(--clr-border)',
                              opacity: est === 'sending' ? 0.6 : 1,
                            }}
                          >
                            {est === 'sending' ? <span style={{ width: 11, height: 11, border: '2px solid var(--clr-primary)', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                              : est === 'ok' ? <CheckCircle size={12} />
                              : est === 'error' ? <AlertCircle size={12} />
                              : <Mail size={12} />}
                            {est === 'sending' ? 'Enviando…' : est === 'ok' ? 'Enviado' : est === 'error' ? 'Error' : 'Email'}
                          </button>
                        )
                      })() : inv.status === 'PAID' ? (
                        <button disabled title="Sin email registrado" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600, background: 'var(--clr-surface-hover)', border: '1px solid var(--clr-border)', color: 'var(--clr-text-muted)', opacity: 0.4, cursor: 'not-allowed' }}>
                          <Mail size={12} /> Email
                        </button>
                      ) : null}

                      {/* Registrar pago */}
                      {inv.status !== 'PAID' && (
                        <button
                          onClick={() => setSelectedInvoice(inv)}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, fontSize: 11, fontWeight: 700, background: 'var(--clr-primary)', color: 'var(--clr-on-primary)', border: 'none' }}
                        >
                          Pagar
                        </button>
                      )}
                    </div>
                  </div>

                  </div>{/* end padding container */}
                </div>
              )
            })
          )}
        </div>

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs" style={{ color: 'var(--clr-text-subtle)' }}>
              {data.total} facturas · Página {data.page} de {data.totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40"
                style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', color: 'var(--clr-text-muted)' }}
              >
                Anterior
              </button>
              <button
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={page === data.totalPages}
                className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40"
                style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', color: 'var(--clr-text-muted)' }}
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      <PaymentModal invoice={selectedInvoice} onClose={() => setSelectedInvoice(null)} />

      {/* ── Modal Vista Previa Factura ─────────────────────────────────────── */}
      {previewInv && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={(e) => { if (e.target === e.currentTarget) setPreviewInv(null) }}
        >
          <div style={{ background: 'var(--clr-surface)', borderRadius: 16, width: '100%', maxWidth: 860, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 64px rgba(0,0,0,0.4)' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--clr-border)' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--clr-text)' }}>
                  {previewInv.series}-{previewInv.number.padStart(8, '0')}
                </div>
                <div style={{ fontSize: 12, color: 'var(--clr-text-subtle)', marginTop: 2 }}>
                  {previewInv.client?.businessName ?? '—'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => company && downloadInvoicePDFLocal(previewInv, company)}
                  disabled={!company}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: 'var(--clr-primary)', color: 'var(--clr-on-primary)', border: 'none', cursor: 'pointer' }}
                >
                  <Download size={14} /> Descargar PDF
                </button>
                <button
                  onClick={() => setPreviewInv(null)}
                  style={{ display: 'flex', alignItems: 'center', padding: 8, borderRadius: 8, background: 'var(--clr-surface-hover)', border: '1px solid var(--clr-border)', cursor: 'pointer', color: 'var(--clr-text-muted)' }}
                >
                  <XIcon size={16} />
                </button>
              </div>
            </div>
            {/* Contenido PDF */}
            <div style={{ flex: 1, overflow: 'hidden', borderRadius: '0 0 16px 16px', minHeight: 0 }}>
              {previewLoading ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--clr-text-subtle)', fontSize: 14 }}>
                  <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                  Generando vista previa…
                </div>
              ) : previewUrl ? (
                <iframe
                  src={previewUrl}
                  style={{ width: '100%', height: '100%', border: 'none', minHeight: 500 }}
                  title="Vista previa de factura"
                />
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
