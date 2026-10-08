import { Router, Response } from 'express'
import { authenticate, AuthRequest } from '../../middlewares/auth.middleware'
import { equipmentService } from './equipment.service'
import { prisma } from '../../config/database'

function parseCsv(raw: string): Record<string, string>[] {
  const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(Boolean)
  if (lines.length < 2) return []
  const headers = lines[0].split(';').map((h) => h.trim().replace(/^"|"$/g, '').toLowerCase())
  return lines.slice(1).map((line) => {
    const cols = line.split(';').map((c) => c.trim().replace(/^"|"$/g, ''))
    return Object.fromEntries(headers.map((h, i) => [h, cols[i] ?? '']))
  })
}

const router = Router()
router.use(authenticate)

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    res.json(await equipmentService.findAll(req.user!.companyId))
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.get('/availability', async (req: AuthRequest, res: Response) => {
  const { dateFrom, dateTo } = req.query as { dateFrom?: string; dateTo?: string }
  if (!dateFrom || !dateTo || !/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    res.status(400).json({ message: 'dateFrom y dateTo requeridos (YYYY-MM-DD)' })
    return
  }
  try {
    res.json(await equipmentService.getAvailability(req.user!.companyId, dateFrom, dateTo))
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.get('/:id', async (req: AuthRequest, res: Response) => {
  const id = String(req.params.id)
  try {
    res.json(await equipmentService.findOne(req.user!.companyId, id))
  } catch (err: unknown) {
    res.status(404).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    res.status(201).json(await equipmentService.create(req.user!.companyId, req.body))
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.put('/:id', async (req: AuthRequest, res: Response) => {
  const id = String(req.params.id)
  try {
    res.json(await equipmentService.update(req.user!.companyId, id, req.body))
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.get('/:id/odometer', async (req: AuthRequest, res: Response) => {
  try {
    res.json(await equipmentService.getOdometerLogs(req.user!.companyId, String(req.params.id)))
  } catch (err: unknown) {
    res.status(404).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.post('/:id/odometer', async (req: AuthRequest, res: Response) => {
  try {
    const { km, notes } = req.body
    if (!km || isNaN(Number(km))) { res.status(400).json({ message: 'km requerido' }); return }
    res.status(201).json(
      await equipmentService.registerOdometer(req.user!.companyId, String(req.params.id), Number(km), notes)
    )
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

// POST /api/equipment/import — carga masiva de equipos desde CSV
// Campos clave: nombre (o name) — identifica el equipo a actualizar/crear
// Modo upsert: si ya existe un equipo con ese nombre lo actualiza, si no lo crea
router.post('/import', async (req: AuthRequest, res: Response) => {
  try {
    const { csv, preview } = req.body as { csv: string; preview?: boolean }
    if (!csv || typeof csv !== 'string') { res.status(400).json({ message: 'Se requiere csv (texto)' }); return }
    const rows = parseCsv(csv)
    if (!rows.length) { res.status(400).json({ message: 'CSV vacío o sin filas de datos' }); return }

    const companyId = req.user!.companyId
    const existing = await prisma.equipment.findMany({ where: { companyId }, select: { id: true, name: true, serialNumber: true } })
    const byName   = new Map(existing.map((e) => [e.name.trim().toLowerCase(), e]))
    const bySN     = new Map(existing.map((e) => [e.serialNumber?.trim().toLowerCase() ?? '', e]).filter(([k]) => k))

    const FIELD_MAP: Record<string, string> = {
      'nombre': 'name', 'name': 'name',
      'marca': 'brand', 'brand': 'brand',
      'modelo': 'model', 'model': 'model',
      'serie': 'serialNumber', 'serial': 'serialNumber', 'serialnumber': 'serialNumber',
      'tipo': 'type', 'type': 'type',
      'capacidad': 'capacity', 'capacity': 'capacity',
      'tarifa_hora': 'hourlyRate', 'hourlyrate': 'hourlyRate', 'tarifa hora': 'hourlyRate',
      'tarifa_dia': 'dailyRate', 'dailyrate': 'dailyRate', 'tarifa dia': 'dailyRate',
      'notas': 'notes', 'notes': 'notes',
      'estado': 'status', 'status': 'status',
    }
    const TYPE_MAP: Record<string, string> = { grua: 'CRANE', crane: 'CRANE', montacargas: 'FORKLIFT', forklift: 'FORKLIFT', camion: 'TRUCK', truck: 'TRUCK', vehiculo: 'VEHICLE', vehicle: 'VEHICLE', otro: 'OTHER', other: 'OTHER' }
    const STATUS_MAP: Record<string, string> = { disponible: 'AVAILABLE', available: 'AVAILABLE', ocupado: 'IN_USE', 'en uso': 'IN_USE', in_use: 'IN_USE', mantenimiento: 'MAINTENANCE', maintenance: 'MAINTENANCE', inactivo: 'INACTIVE', inactive: 'INACTIVE' }

    type OpRow = { existing?: { id: string; name: string }; action: 'update' | 'create'; fields: Record<string, unknown>; displayName: string }
    const ops: OpRow[] = []

    for (const row of rows) {
      const mapped: Record<string, unknown> = {}
      for (const [csvKey, val] of Object.entries(row)) {
        const dbKey = FIELD_MAP[csvKey.trim().toLowerCase()]
        if (dbKey && val.trim()) {
          if (dbKey === 'type')       mapped[dbKey] = TYPE_MAP[val.trim().toLowerCase()] ?? val.trim().toUpperCase()
          else if (dbKey === 'status') mapped[dbKey] = STATUS_MAP[val.trim().toLowerCase()] ?? val.trim().toUpperCase()
          else if (dbKey === 'hourlyRate' || dbKey === 'dailyRate') mapped[dbKey] = parseFloat(val) || 0
          else mapped[dbKey] = val.trim()
        }
      }
      const nameKey = (mapped['name'] as string ?? '').trim().toLowerCase()
      const snKey   = (mapped['serialNumber'] as string ?? '').trim().toLowerCase()
      const found   = byName.get(nameKey) ?? (snKey ? bySN.get(snKey) : undefined)
      const displayName = (mapped['name'] as string) || (found?.name ?? '(sin nombre)')
      if (Object.keys(mapped).length > 0) {
        ops.push({ existing: found, action: found ? 'update' : 'create', fields: mapped, displayName })
      }
    }

    if (preview) {
      res.json({ ops: ops.map((o) => ({ action: o.action, displayName: o.displayName, fields: o.fields })), total: ops.length })
      return
    }

    let created = 0; let updated = 0
    for (const op of ops) {
      if (op.action === 'update' && op.existing) {
        await prisma.equipment.update({ where: { id: op.existing.id }, data: op.fields })
        updated++
      } else {
        await prisma.equipment.create({ data: { companyId, name: op.fields['name'] as string ?? 'Sin nombre', ...op.fields } })
        created++
      }
    }
    res.json({ created, updated, total: ops.length })
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Error al importar' })
  }
})

export default router
