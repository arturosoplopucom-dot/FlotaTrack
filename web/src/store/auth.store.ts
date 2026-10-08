import { create } from 'zustand'

type User = { id: string; name: string; email: string; role: string }
export type SmtpConfig = {
  host?: string; port?: number; secure?: boolean; user?: string; password?: string; fromName?: string
}

export type Company = {
  id: string; name: string; ruc: string; plan: string
  phone?: string; email?: string; address?: string; logoUrl?: string
  smtpConfig?: SmtpConfig | null
}

type AuthState = {
  token: string | null
  user: User | null
  company: Company | null
  setAuth: (token: string, user: User, company: Company) => void
  updateCompany: (patch: Partial<Company>) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('ft_token'),
  user: (() => { try { return JSON.parse(localStorage.getItem('ft_user') || 'null') } catch { return null } })(),
  company: (() => { try { return JSON.parse(localStorage.getItem('ft_company') || 'null') } catch { return null } })(),
  setAuth: (token, user, company) => {
    localStorage.setItem('ft_token', token)
    localStorage.setItem('ft_user', JSON.stringify(user))
    localStorage.setItem('ft_company', JSON.stringify(company))
    set({ token, user, company })
  },
  updateCompany: (patch) => set((state) => {
    const updated = state.company ? { ...state.company, ...patch } : state.company
    if (updated) localStorage.setItem('ft_company', JSON.stringify(updated))
    return { company: updated }
  }),
  logout: () => {
    localStorage.removeItem('ft_token')
    localStorage.removeItem('ft_user')
    localStorage.removeItem('ft_company')
    set({ token: null, user: null, company: null })
  },
}))
