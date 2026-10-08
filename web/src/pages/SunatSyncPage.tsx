import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import AppShell from '../components/AppShell'
import {
  RefreshCw, CheckCircle, XCircle, AlertTriangle, Globe,
  ChevronRight, Settings, FileDown, Users, Loader2,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type SunatConfig = {
  clientId: string
  usuarioSol: string
  hasClientSecret: boolean
  hasClaveSol: boolean
  nubefactUrl?: string
  hasNubefactToken?: boolean
  sunatPdfPath?: string
} | null

type SyncResult = {
  periodo: string
  totalSunat: number
  imported: number
  matched: number
  skipped: number
  newClients: number
}

type LogEntry = { type: 'progress' | 'done' | 'error'; text: string; time: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nowHHMMSS() {
  return new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 4 }, (_, i) => CURRENT_YEAR - i)

// ─── Component ────────────────────────────────────────────────────────────────

export default function SunatSyncPage() {
  const navigate = useNavigate()
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth())  // 0-based
  const [year, setYear]   = useState(now.getFullYear())

  const [config, setConfig]     = useState<SunatConfig | undefined>(undefined)
  const [cfgLoading, setCfgLoading] = useState(true)

  const [running, setRunning]   = useState(false)
  const [log, setLog]           = useState<LogEntry[]>([])
  const [result, setResult]     = useState<SyncResult | null>(null)
  const [error, setError]       = useState<string | null>(null)

  const logRef = useRef<HTMLDivElement>(null)

  // Load SUNAT config status on mount
  useEffect(() => {
    api.get<SunatConfig>('/sunat/config')
      .then(r => setConfig(r.data))
      .catch(() => setConfig(null))
      .finally(() => setCfgLoading(false))
  }, [])

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [log])

  const isConfigured = !!(config?.clientId && config?.usuarioSol && config?.hasClientSecret && config?.hasClaveSol)

  const periodo = `${year}${String(month + 1).padStart(2, '0')}`  // YYYYMM

  function appendLog(entry: LogEntry) {
    setLog(prev => [...prev, entry])
  }

  async function handleSync() {
    if (running) return
    setRunning(true)
    setLog([])
    setResult(null)
    setError(null)

    const token = localStorage.getItem('ft_token')

    try {
      const res = await fetch('/api/sunat/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify({ periodo }),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => 'Error desconocido')
        throw new Error(`HTTP ${res.status}: ${text.substring(0, 200)}`)
      }

      const reader  = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer    = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          try {
            const payload = JSON.parse(trimmed.slice(5).trim()) as {
              type: 'progress' | 'done' | 'error'
              step?: string
              message?: string
            } & Partial<SyncResult>

            if (payload.type === 'progress') {
              appendLog({ type: 'progress', text: payload.step ?? '', time: nowHHMMSS() })
            } else if (payload.type === 'done') {
              appendLog({ type: 'done', text: '✓ Sincronización completada', time: nowHHMMSS() })
              setResult(payload as SyncResult)
            } else if (payload.type === 'error') {
              const msg = payload.message ?? 'Error desconocido'
              appendLog({ type: 'error', text: msg, time: nowHHMMSS() })
              setError(msg)
            }
          } catch { /* línea inválida, ignorar */ }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      appendLog({ type: 'error', text: msg, time: nowHHMMSS() })
      setError(msg)
    } finally {
      setRunning(false)
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  const sel: React.CSSProperties = {
    padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 500,
    border: '1px solid var(--clr-border)', background: 'var(--clr-surface)',
    color: 'var(--clr-text)', cursor: 'pointer', outline: 'none',
  }

  return (
    <AppShell active="sunat" title="Sincronización SUNAT">
      <div style={{ padding: '20px 24px', maxWidth: 860 }}>

        {/* ── Breadcrumb ── */}
        <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--clr-text-muted)', marginBottom:20 }}>
          <Globe size={13} />
          <span>SUNAT / SIRE</span>
          <ChevronRight size={12} />
          <span style={{ color:'var(--clr-text)', fontWeight:500 }}>Sincronización RVIE</span>
        </div>

        {/* ── Title ── */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color:'var(--clr-text)', margin:0 }}>
            Importar Facturas desde SUNAT
          </h1>
          <p style={{ fontSize: 13, color:'var(--clr-text-muted)', margin:'4px 0 0' }}>
            Conecta con el Registro de Ventas e Ingresos Electrónicos (RVIE) de SUNAT SIRE
            y descarga tus comprobantes directamente al sistema.
          </p>
        </div>

        {/* ── Config status card ── */}
        <div style={{
          background: 'var(--clr-surface)', border: '1px solid var(--clr-border)',
          borderRadius: 12, padding: '14px 18px', marginBottom: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            {cfgLoading ? (
              <Loader2 size={18} style={{ color:'var(--clr-text-muted)', animation:'spin 1s linear infinite' }} />
            ) : isConfigured ? (
              <CheckCircle size={18} style={{ color:'#16a34a' }} />
            ) : (
              <AlertTriangle size={18} style={{ color:'#d97706' }} />
            )}
            <div>
              <div style={{ fontSize:13, fontWeight:600, color:'var(--clr-text)' }}>
                {cfgLoading ? 'Cargando configuración…' : isConfigured
                  ? `Conectado — RUC SOL: ${config?.usuarioSol ?? ''}`
                  : 'Credenciales SUNAT no configuradas'}
              </div>
              {!cfgLoading && !isConfigured && (
                <div style={{ fontSize:11, color:'var(--clr-text-muted)', marginTop:2 }}>
                  Configura Client ID, Client Secret, Usuario SOL y Clave SOL
                </div>
              )}
            </div>
          </div>
          <button
            onClick={() => navigate('/profile')}
            style={{
              display:'inline-flex', alignItems:'center', gap:6, padding:'6px 14px',
              borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer',
              background:'none', border:'1px solid var(--clr-border)',
              color:'var(--clr-text)', whiteSpace:'nowrap',
            }}
          >
            <Settings size={13} />
            Configurar
          </button>
        </div>

        {/* ── Period selector + Sync button ── */}
        <div style={{
          background:'var(--clr-surface)', border:'1px solid var(--clr-border)',
          borderRadius:12, padding:'18px 20px', marginBottom:20,
        }}>
          <div style={{ fontSize:13, fontWeight:700, color:'var(--clr-text)', marginBottom:14 }}>
            Período de sincronización
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <label style={{ fontSize:11, color:'var(--clr-text-muted)', fontWeight:600 }}>MES</label>
              <select style={sel} value={month} onChange={e => setMonth(Number(e.target.value))}>
                {MONTHS.map((m, i) => (
                  <option key={i} value={i}>{m}</option>
                ))}
              </select>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <label style={{ fontSize:11, color:'var(--clr-text-muted)', fontWeight:600 }}>AÑO</label>
              <select style={sel} value={year} onChange={e => setYear(Number(e.target.value))}>
                {YEARS.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <label style={{ fontSize:11, color:'transparent', fontWeight:600 }}>.</label>
              <div style={{ display:'flex', gap:10, padding:'2px 0' }}>
                <div style={{
                  padding:'8px 14px', borderRadius:8, background:'var(--clr-surface-hover)',
                  fontSize:12, color:'var(--clr-text-muted)', fontWeight:600,
                  border:'1px solid var(--clr-border)',
                }}>
                  Período: {periodo}
                </div>

                <button
                  onClick={handleSync}
                  disabled={!isConfigured || running}
                  style={{
                    display:'inline-flex', alignItems:'center', gap:7,
                    padding:'8px 20px', borderRadius:8, fontSize:13, fontWeight:700,
                    border:'none', cursor: (!isConfigured || running) ? 'not-allowed' : 'pointer',
                    background: (!isConfigured || running) ? 'var(--clr-surface-hover)' : '#3b82f6',
                    color: (!isConfigured || running) ? 'var(--clr-text-muted)' : '#fff',
                    transition:'background 0.15s',
                  }}
                >
                  {running
                    ? <Loader2 size={14} style={{ animation:'spin 1s linear infinite' }} />
                    : <RefreshCw size={14} />}
                  {running ? 'Sincronizando…' : 'Sincronizar RVIE'}
                </button>
              </div>
            </div>
          </div>

          {!isConfigured && !cfgLoading && (
            <div style={{
              marginTop:12, padding:'8px 12px', borderRadius:8,
              background:'#fef3c7', border:'1px solid #fcd34d',
              fontSize:12, color:'#92400e',
            }}>
              Para sincronizar, primero configura tus credenciales SUNAT en la sección Empresa → Conexión SUNAT.
            </div>
          )}
        </div>

        {/* ── Progress log ── */}
        {log.length > 0 && (
          <div style={{
            background:'#0f172a', border:'1px solid #1e293b',
            borderRadius:12, padding:'14px 16px', marginBottom:20,
          }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#64748b', letterSpacing:'.08em', marginBottom:10, textTransform:'uppercase' }}>
              Log de sincronización
            </div>
            <div
              ref={logRef}
              style={{ maxHeight:280, overflowY:'auto', display:'flex', flexDirection:'column', gap:3 }}
            >
              {log.map((entry, i) => (
                <div key={i} style={{ display:'flex', gap:10, alignItems:'flex-start', fontFamily:'monospace', fontSize:12 }}>
                  <span style={{ color:'#475569', flexShrink:0, marginTop:1 }}>{entry.time}</span>
                  <span style={{
                    color: entry.type === 'error' ? '#f87171'
                         : entry.type === 'done'  ? '#4ade80'
                         : '#94a3b8',
                  }}>
                    {entry.type === 'error' ? '✗' : entry.type === 'done' ? '✓' : '›'}
                  </span>
                  <span style={{
                    color: entry.type === 'error' ? '#fca5a5'
                         : entry.type === 'done'  ? '#bbf7d0'
                         : '#e2e8f0',
                    wordBreak:'break-word',
                  }}>
                    {entry.text}
                  </span>
                </div>
              ))}
              {running && (
                <div style={{ display:'flex', gap:10, fontFamily:'monospace', fontSize:12 }}>
                  <span style={{ color:'#475569' }}>{nowHHMMSS()}</span>
                  <span style={{ color:'#60a5fa' }}>
                    <Loader2 size={11} style={{ animation:'spin 1s linear infinite', display:'inline', verticalAlign:'middle' }} />
                  </span>
                  <span style={{ color:'#60a5fa' }}>Esperando respuesta de SUNAT…</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Error banner ── */}
        {error && (
          <div style={{
            display:'flex', gap:10, alignItems:'flex-start',
            background:'#fef2f2', border:'1px solid #fecaca',
            borderRadius:10, padding:'12px 16px', marginBottom:20,
          }}>
            <XCircle size={16} style={{ color:'#dc2626', flexShrink:0, marginTop:1 }} />
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'#991b1b' }}>Error en la sincronización</div>
              <div style={{ fontSize:12, color:'#b91c1c', marginTop:3 }}>{error}</div>
            </div>
          </div>
        )}

        {/* ── Result cards ── */}
        {result && (
          <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
            {[
              { icon: Globe,        label:'Total SUNAT',     value: result.totalSunat,  color:'#3b82f6', bg:'#eff6ff', border:'#bfdbfe' },
              { icon: FileDown,     label:'Importadas',      value: result.imported,    color:'#16a34a', bg:'#f0fdf4', border:'#bbf7d0' },
              { icon: CheckCircle,  label:'Vinc. a OTs',     value: result.matched,     color:'#7c3aed', bg:'#f5f3ff', border:'#ddd6fe' },
              { icon: RefreshCw,    label:'Ya existían',     value: result.skipped,     color:'#d97706', bg:'#fffbeb', border:'#fde68a' },
              { icon: Users,        label:'Clientes nuevos', value: result.newClients,  color:'#0891b2', bg:'#f0fdff', border:'#a5f3fc' },
            ].map(({ icon: Icon, label, value, color, bg, border }) => (
              <div key={label} style={{
                flex:'1 1 140px', minWidth:130,
                background:bg, border:`1px solid ${border}`, borderRadius:12,
                padding:'14px 16px', textAlign:'center',
              }}>
                <Icon size={20} style={{ color, marginBottom:6 }} />
                <div style={{ fontSize:26, fontWeight:800, color, lineHeight:1 }}>{value}</div>
                <div style={{ fontSize:11, fontWeight:700, color, marginTop:4, opacity:0.8, textTransform:'uppercase', letterSpacing:'.04em' }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Padding bottom ── */}
        <div style={{ height: 40 }} />
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </AppShell>
  )
}
