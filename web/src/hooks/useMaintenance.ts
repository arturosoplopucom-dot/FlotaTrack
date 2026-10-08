import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export type MaintenanceInterval      = 'DATE' | 'HOURS' | 'BOTH' | 'KM'
export type MaintenanceUrgency       = 'OVERDUE' | 'DUE_SOON' | 'OK'
export type MaintenanceSessionStatus = 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'

export interface MaintenanceSession {
  id: string
  equipmentId: string
  planId?: string | null
  status: MaintenanceSessionStatus
  startedAt: string
  estimatedEnd?: string | null
  technician?: string | null
  workDescription?: string | null
  estimatedCost?: string | null
  completedAt?: string | null
  hoursAtClose?: string | null
  actualCost?: string | null
  completionNotes?: string | null
  odometerKmAtClose?: string | null
  nextMaintenanceKm?: string | null
  equipment?: { id: string; name: string; type: string; currentHours: string }
  plan?: { id: string; name: string } | null
}

export interface MaintenancePlan {
  id: string
  equipmentId: string
  name: string
  description?: string | null
  intervalType: MaintenanceInterval
  intervalDays?: number | null
  intervalHours?: string | null
  intervalKm?: string | null
  lastServiceAt?: string | null
  lastServiceHours?: string | null
  lastServiceKm?: string | null
  nextDueAt?: string | null
  nextDueHours?: string | null
  nextDueKm?: string | null
  active: boolean
  urgency: MaintenanceUrgency
  activeSession: MaintenanceSession | null
  equipment: { id: string; name: string; type: string; currentHours: string; status: string; odometerKm?: string | null }
  records: MaintenanceRecord[]
}

export interface MaintenanceRecord {
  id: string
  equipmentId: string
  planId?: string | null
  performedAt: string
  hoursAtService?: string | null
  technician?: string | null
  description?: string | null
  cost: string
  notes?: string | null
  equipment?: { name: string; type: string }
  plan?: { name: string } | null
}

export interface MaintenanceSummary {
  total: number
  overdue: number
  dueSoon: number
  ok: number
  alerts: MaintenancePlan[]
}

export function useMaintenancePlans(equipmentId?: string) {
  return useQuery<MaintenancePlan[]>({
    queryKey: ['maintenance-plans', equipmentId],
    queryFn: () => api.get('/maintenance/plans', { params: equipmentId ? { equipmentId } : {} }).then((r) => r.data),
  })
}

export function useMaintenanceRecords(equipmentId?: string) {
  return useQuery<MaintenanceRecord[]>({
    queryKey: ['maintenance-records', equipmentId],
    queryFn: () => api.get('/maintenance/records', { params: equipmentId ? { equipmentId } : {} }).then((r) => r.data),
  })
}

export function useMaintenanceSummary() {
  return useQuery<MaintenanceSummary>({
    queryKey: ['maintenance-summary'],
    queryFn: () => api.get('/maintenance/summary').then((r) => r.data),
  })
}

export function useCreatePlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      equipmentId: string; name: string; description?: string
      intervalType: MaintenanceInterval
      intervalDays?: number; intervalHours?: number; intervalKm?: number
      lastServiceAt?: string; lastServiceHours?: number; lastServiceKm?: number
    }) => api.post('/maintenance/plans', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance-plans'] })
      qc.invalidateQueries({ queryKey: ['maintenance-summary'] })
    },
  })
}

export function useUpdatePlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; [key: string]: unknown }) =>
      api.put(`/maintenance/plans/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maintenance-plans'] }),
  })
}

export function useDeletePlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/maintenance/plans/${id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance-plans'] })
      qc.invalidateQueries({ queryKey: ['maintenance-summary'] })
    },
  })
}

export function useCreateRecord() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      equipmentId: string; planId?: string
      performedAt: string; hoursAtService?: number
      technician?: string; description?: string; cost?: number
      notes?: string; updateEquipmentHours?: boolean
    }) => api.post('/maintenance/records', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance-plans'] })
      qc.invalidateQueries({ queryKey: ['maintenance-records'] })
      qc.invalidateQueries({ queryKey: ['maintenance-summary'] })
      qc.invalidateQueries({ queryKey: ['equipment'] })
    },
  })
}

export function useDeleteRecord() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/maintenance/records/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maintenance-records'] }),
  })
}

const INVALIDATE_ALL = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ['maintenance-plans'] })
  qc.invalidateQueries({ queryKey: ['maintenance-records'] })
  qc.invalidateQueries({ queryKey: ['maintenance-summary'] })
  qc.invalidateQueries({ queryKey: ['maintenance-sessions'] })
  qc.invalidateQueries({ queryKey: ['equipment'] })
}

export interface SessionHistoryItem extends MaintenanceSession {
  equipment: { id: string; name: string; type: string }
  plan?: { id: string; name: string } | null
}

export function useSessionHistory(params?: { from?: string; to?: string; equipmentId?: string }) {
  return useQuery<SessionHistoryItem[]>({
    queryKey: ['maintenance-sessions-history', params],
    queryFn: () => api.get('/maintenance/sessions/history', { params }).then((r) => r.data),
  })
}

export function useActiveSessions() {
  return useQuery<MaintenanceSession[]>({
    queryKey: ['maintenance-sessions'],
    queryFn: () => api.get('/maintenance/sessions/active').then((r) => r.data),
  })
}

export function useStartSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      equipmentId: string; planId?: string
      startedAt: string; estimatedEnd?: string
      technician?: string; workDescription?: string; estimatedCost?: number
    }) => api.post('/maintenance/sessions', data).then((r) => r.data),
    onSuccess: () => INVALIDATE_ALL(qc),
  })
}

export function useCompleteSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sessionId, ...data }: {
      sessionId: string; completedAt: string
      hoursAtClose?: number; actualCost?: number
      completionNotes?: string; technician?: string
      updateEquipmentHours?: boolean
      odometerKmAtClose?: number
      nextMaintenanceKm?: number
    }) => api.patch(`/maintenance/sessions/${sessionId}/complete`, data).then((r) => r.data),
    onSuccess: () => {
      INVALIDATE_ALL(qc)
      qc.invalidateQueries({ queryKey: ['odometer'] })
    },
  })
}

export function useCancelSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: string) => api.patch(`/maintenance/sessions/${sessionId}/cancel`, {}).then((r) => r.data),
    onSuccess: () => INVALIDATE_ALL(qc),
  })
}
