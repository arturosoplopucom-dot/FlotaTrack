import { useEffect, useState, useRef } from 'react'
import { useForm } from 'react-hook-form'
import {
  Building2, Phone, Mail, MapPin, Image, Server, Save, CheckCircle,
  AlertCircle, Shield, RefreshCw, ChevronRight, FileCheck,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import AppShell from '../components/AppShell'
import { api } from '../lib/api'
import { useAuthStore } from '../store/auth.store'

// ─── Types ────────────────────────────────────────────────────────────────────

type ProfileForm = { name: string; ruc: string; phone: string; email: string; address: string; logoUrl: string }
type SmtpForm   = { host: string; port: string; secure: boolean; user: string; pass: string; fromName: string }
type SunatForm  = { clientId: string; clientSecret: string; usuarioSol: string; claveSol: string; sunatPdfPath: string; cpeToken: string }

type SyncResult = {
  periodo: string; totalSunat: number
  imported: number; matched: number; skipped: number; newClients: number
}

// ─── Shared UI components ─────────────────────────────────────────────────────

function Section({ title, icon: Icon, children }: { title: string; icon: typeof Building2; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 12, padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <Icon size={18} style={{ color: 'var(--clr-primary-lt)' }} />
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--clr-text)', margin: 0 }}>{title}</h2>
      </div>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, color: 'var(--clr-text-muted)', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}

const inpStyle: React.CSSProperties = {
  width: '100%', background: 'var(--clr-surface)', color: 'var(--clr-text)', borderRadius: 8,
  padding: '9px 12px', border: '1px solid var(--clr-border)', fontSize: 13,
  outline: 'none', boxSizing: 'border-box',
}

function SaveButton({ status, label = 'Guardar cambios' }: { status: 'idle' | 'saving' | 'ok' | 'error'; label?: string }) {
  const bg = status === 'ok' ? '#15803d' : status === 'error' ? '#b91c1c' : '#2563eb'
  return (
    <button
      type="submit"
      disabled={status === 'saving'}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, color: 'var(--clr-on-primary)', background: bg, border: 'none', cursor: 'pointer', opacity: status === 'saving' ? 0.5 : 1 }}
    >
      {status === 'saving'
        ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        : status === 'ok'    ? <CheckCircle size={15} />
        : status === 'error' ? <AlertCircle size={15} />
        : <Save size={15} />}
      {status === 'saving' ? 'Guardando...' : status === 'ok' ? 'Guardado' : status === 'error' ? 'Error' : label}
    </button>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CompanyProfilePage() {
  const company       = useAuthStore((s) => s.company)
  const updateCompany = useAuthStore((s) => s.updateCompany)
  const token         = useAuthStore((s) => s.token)
  const navigate      = useNavigate()

  const [profileStatus, setProfileStatus] = useState<'idle'|'saving'|'ok'|'error'>('idle')
  const [smtpStatus,    setSmtpStatus]    = useState<'idle'|'saving'|'ok'|'error'>('idle')
  const [smtpTestStatus, setSmtpTestStatus] = useState<'idle'|'testing'|'ok'|'error'>('idle')
  const [smtpTestMsg,    setSmtpTestMsg]    = useState('')
  const [sunatStatus,   setSunatStatus]   = useState<'idle'|'saving'|'ok'|'error'>('idle')

  const [syncPeriod,  setSyncPeriod]  = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [syncRunning, setSyncRunning] = useState(false)
  const [syncSteps,   setSyncSteps]   = useState<string[]>([])
  const [syncResult,  setSyncResult]  = useState<SyncResult | null>(null)
  const [syncError,   setSyncError]   = useState<string | null>(null)
  const stepsEndRef = useRef<HTMLDivElement>(null)

  const [sunatCfg, setSunatCfg] = useState<{ clientId: string; usuarioSol: string; hasClientSecret: boolean; hasClaveSol: boolean; sunatPdfPath: string; hasCpeToken: boolean } | null>(null)

  const profile = useForm<ProfileForm>()
  const smtp    = useForm<SmtpForm>()
  const sunat   = useForm<SunatForm>()

  useEffect(() => {
    if (!company) return
    profile.reset({ name: company.name ?? '', ruc: company.ruc ?? '', phone: company.phone ?? '', email: company.email ?? '', address: company.address ?? '', logoUrl: company.logoUrl ?? '' })
    const sc = company.smtpConfig
    if (sc) smtp.reset({ host: sc.host ?? '', port: sc.port ? String(sc.port) : '', secure: sc.secure ?? false, user: sc.user ?? '', pass: sc.pass ?? '', fromName: sc.fromName ?? '' })
  }, [company])

  useEffect(() => {
    api.get('/sunat/config').then((r) => {
      if (r.data) {
        setSunatCfg(r.data)
        sunat.reset({ clientId: r.data.clientId ?? '', usuarioSol: r.data.usuarioSol ?? '', clientSecret: '', claveSol: '', sunatPdfPath: r.data.sunatPdfPath ?? '', cpeToken: '' })
      }
    }).catch(() => {})
  }, [])

  useEffect(() => { stepsEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [syncSteps])

  const saveProfile = profile.handleSubmit(async (data) => {
    setProfileStatus('saving')
    try {
      const updated = await api.patch('/company', { name: data.name || undefined, ruc: data.ruc || undefined, phone: data.phone || undefined, email: data.email || undefined, address: data.address || undefined, logoUrl: data.logoUrl || undefined }).then((r) => r.data)
      updateCompany(updated)
      setProfileStatus('ok'); setTimeout(() => setProfileStatus('idle'), 3000)
    } catch { setProfileStatus('error'); setTimeout(() => setProfileStatus('idle'), 3000) }
  })

  const saveSmtp = smtp.handleSubmit(async (data) => {
    setSmtpStatus('saving')
    try {
      await api.patch('/company', { smtpConfig: { host: data.host || undefined, port: data.port ? parseInt(data.port) : undefined, secure: data.secure, user: data.user || undefined, pass: data.pass || undefined, fromName: data.fromName || undefined } })
      setSmtpStatus('ok'); setTimeout(() => setSmtpStatus('idle'), 3000)
    } catch { setSmtpStatus('error'); setTimeout(() => setSmtpStatus('idle'), 3000) }
  })

  const testSmtp = async () => {
    const data = smtp.getValues()
    if (!data.host || !data.user || !data.pass) {
      setSmtpTestStatus('error'); setSmtpTestMsg('Completa host, usuario y contraseña primero')
      setTimeout(() => setSmtpTestStatus('idle'), 4000)
      return
    }
    setSmtpTestStatus('testing'); setSmtpTestMsg('')
    try {
      const res = await api.post('/company/smtp/test', { host: data.host, port: data.port ? parseInt(data.port) : 587, secure: data.secure, user: data.user, pass: data.pass })
      if (res.data.ok) { setSmtpTestStatus('ok'); setSmtpTestMsg('Conexión exitosa') }
      else             { setSmtpTestStatus('error'); setSmtpTestMsg(res.data.error ?? 'Error de conexión') }
    } catch (err: any) {
      setSmtpTestStatus('error')
      setSmtpTestMsg(err?.response?.data?.error ?? 'Error al conectar')
    }
    setTimeout(() => { setSmtpTestStatus('idle'); setSmtpTestMsg('') }, 5000)
  }

  const saveSunat = sunat.handleSubmit(async (data) => {
    setSunatStatus('saving')
    try {
      const res = await api.patch('/sunat/config', {
        clientId:     data.clientId,
        usuarioSol:   data.usuarioSol,
        clientSecret: data.clientSecret  || undefined,
        claveSol:     data.claveSol      || undefined,
        sunatPdfPath: data.sunatPdfPath  ?? '',
        cpeToken:     data.cpeToken      || undefined,
      })
      setSunatCfg(res.data)
      sunat.reset({ clientId: data.clientId, usuarioSol: data.usuarioSol, clientSecret: '', claveSol: '', sunatPdfPath: data.sunatPdfPath, cpeToken: '' })
      setSunatStatus('ok'); setTimeout(() => setSunatStatus('idle'), 3000)
    } catch { setSunatStatus('error'); setTimeout(() => setSunatStatus('idle'), 3000) }
  })

  const startSync = async () => {
    const periodo = syncPeriod.replace('-', '')
    setSyncRunning(true); setSyncSteps([]); setSyncResult(null); setSyncError(null)
    try {
      const response = await fetch('/api/sunat/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ periodo }),
      })
      if (!response.body) throw new Error('Sin respuesta del servidor')
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n'); buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const evt = JSON.parse(line.slice(6))
            if (evt.type === 'progress') setSyncSteps((prev) => [...prev, evt.step])
            else if (evt.type === 'done')  { setSyncResult(evt);        setSyncRunning(false) }
            else if (evt.type === 'error') { setSyncError(evt.message); setSyncRunning(false) }
          } catch { /* ignore malformed SSE line */ }
        }
      }
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Error de conexión')
      setSyncRunning(false)
    }
  }

  const logoUrl = profile.watch('logoUrl')

  return (
    <AppShell active="profile" title="Empresa">
      <div style={{ padding: 24, maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {logoUrl ? (
            <img src={logoUrl} alt="logo" style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'contain', background: 'white', padding: 4, border: '1px solid var(--clr-border)' }} />
          ) : (
            <div style={{ width: 56, height: 56, borderRadius: 12, background: 'rgba(30,58,138,0.3)', border: '1px solid #1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Building2 size={24} style={{ color: 'var(--clr-primary-lt)' }} />
            </div>
          )}
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--clr-text)', margin: 0 }}>{company?.name}</h1>
            <p style={{ fontSize: 13, color: 'var(--clr-text-subtle)', margin: '4px 0 0' }}>RUC {company?.ruc} · Plan {company?.plan}</p>
          </div>
        </div>

        {/* Información general */}
        <Section title="Información de la empresa" icon={Building2}>
          <form onSubmit={saveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label="Razón social *">
                <input {...profile.register('name', { required: true })} style={inpStyle} placeholder="Gruas Omega S.A.C." />
              </Field>
              <Field label="RUC *">
                <input {...profile.register('ruc', { required: true, pattern: /^\d{11}$/ })} style={{ ...inpStyle, fontFamily: 'monospace' }} placeholder="20XXXXXXXXX" maxLength={11} />
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label="Teléfono">
                <div style={{ position: 'relative' }}>
                  <Phone size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--clr-text-subtle)' }} />
                  <input {...profile.register('phone')} style={{ ...inpStyle, paddingLeft: 32 }} placeholder="+51 01 234-5678" />
                </div>
              </Field>
              <Field label="Correo electrónico">
                <div style={{ position: 'relative' }}>
                  <Mail size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--clr-text-subtle)' }} />
                  <input {...profile.register('email')} type="email" style={{ ...inpStyle, paddingLeft: 32 }} placeholder="contacto@empresa.pe" />
                </div>
              </Field>
            </div>
            <Field label="Dirección fiscal">
              <div style={{ position: 'relative' }}>
                <MapPin size={14} style={{ position: 'absolute', left: 12, top: 14, color: 'var(--clr-text-subtle)' }} />
                <input {...profile.register('address')} style={{ ...inpStyle, paddingLeft: 32 }} placeholder="Av. Principal 123, Lima" />
              </div>
            </Field>
            <Field label="URL del logo">
              <div style={{ position: 'relative' }}>
                <Image size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--clr-text-subtle)' }} />
                <input {...profile.register('logoUrl')} style={{ ...inpStyle, paddingLeft: 32 }} placeholder="https://..." />
              </div>
            </Field>
            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}><SaveButton status={profileStatus} /></div>
          </form>
        </Section>

        {/* SMTP */}
        <Section title="Configuración de correo (SMTP)" icon={Server}>
          <p style={{ fontSize: 12, color: 'var(--clr-text-subtle)', marginBottom: 16, marginTop: 0 }}>
            Configura el servidor de correo para notificaciones de facturas y alertas de cobranza.
          </p>
          <form onSubmit={saveSmtp} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
              <Field label="Servidor SMTP (host)"><input {...smtp.register('host')} style={inpStyle} placeholder="smtp.gmail.com" /></Field>
              <Field label="Puerto"><input {...smtp.register('port')} type="number" style={inpStyle} placeholder="587" /></Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label="Usuario / correo"><input {...smtp.register('user')} style={inpStyle} placeholder="tucorreo@gmail.com" /></Field>
              <Field label="Contraseña / app password"><input {...smtp.register('pass')} type="password" style={inpStyle} placeholder="••••••••••••••••" /></Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label="Nombre del remitente"><input {...smtp.register('fromName')} style={inpStyle} placeholder="Gruas Omega S.A.C." /></Field>
              <Field label="Seguridad">
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, height: 40, cursor: 'pointer' }}>
                  <input {...smtp.register('secure')} type="checkbox" style={{ width: 16, height: 16, accentColor: '#2563eb' }} />
                  <span style={{ fontSize: 13, color: 'var(--clr-text)' }}>Usar SSL/TLS (puerto 465)</span>
                </label>
              </Field>
            </div>

            {/* Ayuda Gmail */}
            <div style={{ background: 'var(--clr-primary-bg)', border: '1px solid var(--clr-primary-border)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--clr-text-muted)' }}>
              <strong>Gmail:</strong> host <code style={{ background: 'var(--clr-bg)', padding: '1px 5px', borderRadius: 4 }}>smtp.gmail.com</code> · puerto <code style={{ background: 'var(--clr-bg)', padding: '1px 5px', borderRadius: 4 }}>587</code> · usuario = tu correo Gmail · contraseña = <strong>App Password</strong> (16 chars, se genera en Google → Seguridad → Contraseñas de aplicación, requiere 2FA activo)
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, paddingTop: 4 }}>
              {smtpTestMsg && (
                <span style={{ fontSize: 12, color: smtpTestStatus === 'ok' ? 'var(--clr-success)' : 'var(--clr-danger)' }}>{smtpTestMsg}</span>
              )}
              <button
                type="button"
                onClick={testSmtp}
                disabled={smtpTestStatus === 'testing'}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500, color: smtpTestStatus === 'ok' ? 'var(--clr-success)' : smtpTestStatus === 'error' ? 'var(--clr-danger)' : 'var(--clr-text-subtle)', background: 'transparent', border: `1px solid ${smtpTestStatus === 'ok' ? 'var(--clr-success-border)' : smtpTestStatus === 'error' ? 'var(--clr-danger-border)' : 'var(--clr-border)'}`, cursor: 'pointer' }}
              >
                {smtpTestStatus === 'testing' ? <span style={{ width: 12, height: 12, border: '2px solid var(--clr-primary)', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} /> : smtpTestStatus === 'ok' ? <CheckCircle size={14} /> : smtpTestStatus === 'error' ? <AlertCircle size={14} /> : <Server size={14} />}
                {smtpTestStatus === 'testing' ? 'Probando...' : 'Probar conexión'}
              </button>
              <SaveButton status={smtpStatus} />
            </div>
          </form>
        </Section>

        {/* SUNAT */}
        <Section title="Conexión SUNAT (SIRE)" icon={Shield}>
          <p style={{ fontSize: 12, color: 'var(--clr-text-subtle)', marginBottom: 16, marginTop: 0 }}>
            Ingresa tus credenciales de API SUNAT (usuario secundario SOL) para importar automáticamente las
            facturas emitidas en SUNAT al módulo de CxC.
          </p>

          {sunatCfg && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, background: 'var(--clr-surface-hover)', border: '1px solid var(--clr-border)', borderRadius: 8, padding: '10px 16px' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: sunatCfg.hasClientSecret && sunatCfg.hasClaveSol ? 'var(--clr-success)' : '#d97706', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--clr-text)' }}>
                {sunatCfg.hasClientSecret && sunatCfg.hasClaveSol
                  ? `Credenciales configuradas · ${sunatCfg.clientId} · ${sunatCfg.usuarioSol}`
                  : 'Credenciales incompletas — guarda Client Secret y Clave SOL'}
              </span>
            </div>
          )}

          <form onSubmit={saveSunat} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label="Client ID (SUNAT API)">
                <input {...sunat.register('clientId', { required: true })} style={inpStyle} placeholder="0-XXXXXXXX-XXXX-XXXX-XXXX" />
              </Field>
              <Field label="Client Secret">
                <input {...sunat.register('clientSecret')} type="password" style={inpStyle}
                  placeholder={sunatCfg?.hasClientSecret ? '(guardado — ingresar para cambiar)' : 'Client Secret de SUNAT'} />
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label="Usuario SOL secundario">
                <input {...sunat.register('usuarioSol', { required: true })} style={inpStyle} placeholder="USUARIOXXX" />
              </Field>
              <Field label="Clave SOL">
                <input {...sunat.register('claveSol')} type="password" style={inpStyle}
                  placeholder={sunatCfg?.hasClaveSol ? '(guardado — ingresar para cambiar)' : 'Clave SOL del usuario secundario'} />
              </Field>
            </div>
            <div style={{ background: 'var(--clr-primary-bg)', border: '1px solid var(--clr-primary-border)', borderRadius: 8, padding: 12, fontSize: 12, color: 'var(--clr-text-muted)' }}>
              <p style={{ margin: '0 0 4px' }}><strong>¿Cómo obtener el Client ID?</strong> Ingresa a Clave SOL → Aplicaciones → Crear nueva aplicación.</p>
              <p style={{ margin: 0 }}><strong>¿Usuario secundario?</strong> Clave SOL → Usuarios → Crear usuario con perfil "Consulta SIRE".</p>
            </div>

            {/* Bearer Token CPE */}
            <div style={{ paddingTop: 16, borderTop: '1px solid var(--clr-border)' }}>
              <div style={{ marginBottom: 16, padding: 12, background: 'var(--clr-bg)', border: '1px solid var(--clr-border)', borderRadius: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--clr-text)' }}>Bearer Token CPE (SUNAT API)</span>
                  {sunatCfg?.hasCpeToken && (
                    <span style={{ fontSize: 11, background: 'var(--clr-success-bg)', color: 'var(--clr-success)', border: '1px solid var(--clr-success-border)', padding: '2px 8px', borderRadius: 20 }}>Configurado</span>
                  )}
                </div>
                <Field label="Token Bearer">
                  <input
                    {...sunat.register('cpeToken')}
                    type="password"
                    style={inpStyle}
                    placeholder={sunatCfg?.hasCpeToken ? '(guardado — ingresar para cambiar)' : 'Token obtenido del portal de desarrolladores SUNAT'}
                  />
                </Field>
                <p style={{ fontSize: 11, color: 'var(--clr-text-subtle)', marginTop: 4, marginBottom: 0 }}>
                  Token de acceso a la API CPE de SUNAT (controlcpe/consultacpe). Se usa para descargar el PDF oficial del comprobante emitido.
                </p>
              </div>

              <div style={{ marginBottom: 16 }}>
                <Field label="Carpeta PDFs SUNAT Facturador SOL (alternativo)">
                  <input
                    {...sunat.register('sunatPdfPath')}
                    style={inpStyle}
                    placeholder="C:\Users\usuario\Documents\GRUAS"
                  />
                </Field>
                <p style={{ fontSize: 11, color: 'var(--clr-text-subtle)', marginTop: 4, marginBottom: 0 }}>
                  Ruta raíz donde SUNAT Facturador SOL guarda los PDFs localmente. Se usa si la API CPE no está disponible.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}><SaveButton status={sunatStatus} label="Guardar credenciales" /></div>
          </form>

          {/* Sincronización */}
          <div style={{ marginTop: 24, paddingTop: 24, borderTop: '1px solid var(--clr-border)' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--clr-text)', margin: '0 0 8px' }}>
              <FileCheck size={16} style={{ color: 'var(--clr-success)' }} />
              Importar facturas desde SUNAT
            </h3>
            <p style={{ fontSize: 12, color: 'var(--clr-text-subtle)', margin: '0 0 16px' }}>
              FlotaTrack descarga el Registro de Ventas RVIE del período seleccionado y lo importa
              al módulo CxC, vinculando automáticamente las OTs completadas por monto.
            </p>

            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
              <Field label="Período a sincronizar">
                <input
                  type="month"
                  value={syncPeriod}
                  onChange={(e) => setSyncPeriod(e.target.value)}
                  style={{ ...inpStyle, width: 176 }}
                  disabled={syncRunning}
                />
              </Field>
              <button
                type="button"
                onClick={startSync}
                disabled={syncRunning || !sunatCfg?.hasClientSecret}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: '#15803d', color: 'white', border: 'none', cursor: 'pointer', opacity: syncRunning || !sunatCfg?.hasClientSecret ? 0.4 : 1 }}
              >
                {syncRunning
                  ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <RefreshCw size={15} />}
                {syncRunning ? 'Sincronizando...' : 'Sincronizar desde SUNAT'}
              </button>
            </div>

            {/* Progreso SSE */}
            {(syncSteps.length > 0 || syncRunning) && (
              <div style={{ marginTop: 16, background: 'var(--clr-bg)', border: '1px solid var(--clr-border)', borderRadius: 8, padding: 16, maxHeight: 192, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {syncSteps.map((step, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--clr-text-muted)' }}>
                    <ChevronRight size={12} style={{ color: '#3b82f6', flexShrink: 0 }} />
                    {step}
                  </div>
                ))}
                {syncRunning && (
                  <div className="animate-pulse" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--clr-primary)' }}>
                    <span style={{ width: 8, height: 8, background: 'var(--clr-primary)', borderRadius: '50%' }} />
                    Esperando SUNAT...
                  </div>
                )}
                <div ref={stepsEndRef} />
              </div>
            )}

            {/* Resultado */}
            {syncResult && (
              <div style={{ marginTop: 16, background: 'var(--clr-success-bg)', border: '1px solid var(--clr-success-border)', borderRadius: 8, padding: 16 }}>
                <p style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: 'var(--clr-success)', margin: '0 0 12px' }}>
                  <CheckCircle size={16} /> Sincronización completada
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                  {[
                    { label: 'En SUNAT',   val: syncResult.totalSunat, color: 'var(--clr-text)' },
                    { label: 'Importadas', val: syncResult.imported,   color: 'var(--clr-success)' },
                    { label: 'Vinc. a OT', val: syncResult.matched,    color: 'var(--clr-primary)' },
                    { label: 'Omitidas',   val: syncResult.skipped,    color: '#d97706' },
                  ].map(({ label, val, color }) => (
                    <div key={label} style={{ textAlign: 'center' }}>
                      <p style={{ fontSize: 24, fontWeight: 700, color, margin: 0 }}>{val}</p>
                      <p style={{ fontSize: 11, color: 'var(--clr-text-subtle)', margin: '2px 0 0' }}>{label}</p>
                    </div>
                  ))}
                </div>
                {syncResult.newClients > 0 && (
                  <p style={{ fontSize: 12, color: 'var(--clr-primary)', marginTop: 12, marginBottom: 0 }}>
                    + {syncResult.newClients} {syncResult.newClients === 1 ? 'cliente nuevo creado' : 'clientes nuevos creados'} desde SUNAT
                  </p>
                )}
              </div>
            )}

            {/* Error */}
            {syncError && (
              <div style={{ marginTop: 16, background: 'var(--clr-danger-bg)', border: '1px solid var(--clr-danger-border)', borderRadius: 8, padding: 16, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <AlertCircle size={16} style={{ color: 'var(--clr-danger)', flexShrink: 0, marginTop: 2 }} />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--clr-danger)', margin: 0 }}>Error al sincronizar</p>
                  <p style={{ fontSize: 12, color: 'var(--clr-text-muted)', margin: '4px 0 0' }}>{syncError}</p>
                </div>
              </div>
            )}
          </div>
        </Section>

      </div>
    </AppShell>
  )
}
