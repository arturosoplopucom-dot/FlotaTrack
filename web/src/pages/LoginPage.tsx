import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { Truck, AlertCircle } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../store/auth.store'

type LoginForm = { ruc: string; email: string; password: string }

const inpStyle: React.CSSProperties = {
  width: '100%', background: 'var(--clr-surface)', color: 'var(--clr-text)',
  borderRadius: 8, padding: '12px 14px', border: '1px solid var(--clr-border)',
  fontSize: 14, outline: 'none', boxSizing: 'border-box',
}

export default function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [error, setError] = useState('')
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<LoginForm>({
    defaultValues: { ruc: '', email: '', password: '' }
  })

  const onSubmit = async (data: LoginForm) => {
    setError('')
    try {
      const res = await api.post('/auth/login', data)
      setAuth(res.data.token, res.data.user, res.data.company)
      navigate('/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al iniciar sesión')
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--clr-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>

        {/* Logo / Brand */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, background: 'var(--clr-primary)', borderRadius: 16, marginBottom: 16 }}>
            <Truck size={28} style={{ color: 'var(--clr-on-primary)' }} />
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--clr-text)', margin: '0 0 6px' }}>FlotaTrack</h1>
          <p style={{ fontSize: 14, color: 'var(--clr-text-subtle)', margin: 0 }}>Gestión de maquinaria pesada</p>
        </div>

        {/* Form card */}
        <form
          onSubmit={handleSubmit(onSubmit)}
          style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 14, padding: 32, display: 'flex', flexDirection: 'column', gap: 18 }}
        >
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--clr-text-muted)', marginBottom: 6 }}>
              RUC de la empresa
            </label>
            <input
              {...register('ruc', { required: true })}
              placeholder="20601234567"
              style={{ ...inpStyle, fontFamily: 'monospace' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--clr-text-muted)', marginBottom: 6 }}>
              Correo electrónico
            </label>
            <input
              {...register('email', { required: true })}
              type="email"
              placeholder="admin@empresa.pe"
              style={inpStyle}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--clr-text-muted)', marginBottom: 6 }}>
              Contraseña
            </label>
            <input
              {...register('password', { required: true })}
              type="password"
              placeholder="••••••••"
              style={inpStyle}
            />
          </div>

          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--clr-danger-bg)', border: '1px solid var(--clr-danger-border)', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: 'var(--clr-danger)' }}>
              <AlertCircle size={14} style={{ flexShrink: 0 }} />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            style={{ width: '100%', background: 'var(--clr-primary)', color: 'var(--clr-on-primary)', border: 'none', borderRadius: 8, padding: '13px 0', fontSize: 14, fontWeight: 700, cursor: isSubmitting ? 'not-allowed' : 'pointer', opacity: isSubmitting ? 0.6 : 1, marginTop: 4 }}
          >
            {isSubmitting ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--clr-text-subtle)', marginTop: 20 }}>
          FlotaTrack · Sistema de gestión de flota
        </p>
      </div>
    </div>
  )
}
