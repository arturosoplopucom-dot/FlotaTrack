import { Router, Response } from 'express'
import { authenticate, AuthRequest } from '../../middlewares/auth.middleware'
import { operatorsService } from './operators.service'
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
    res.json(await operatorsService.findAll(req.user!.companyId))
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.get('/:id', async (req: AuthRequest, res: Response) => {
  const id = String(req.params.id)
  try {
    res.json(await operatorsService.findOne(req.user!.companyId, id))
  } catch (err: unknown) {
    res.status(404).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    res.status(201).json(await operatorsService.create(req.user!.companyId, req.body))
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.put('/:id', async (req: AuthRequest, res: Response) => {
  const id = String(req.params.id)
  try {
    res.json(await operatorsService.update(req.user!.companyId, id, req.body))
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

// POST /api/operators/import — carga masiva de operarios desde CSV
// Clave: dni — identifica el operario; si existe lo actualiza, si no lo crea
router.post('/import', async (req: AuthRequest, res: Response) => {
  try {
    const { csv, preview } = req.body as { csv: string; preview?: boolean }
    if (!csv || typeof csv !== 'string') { res.status(400).json({ message: 'Se requiere csv (texto)' }); return }
    const rows = parseCsv(csv)
    if (!rows.length) { res.status(400).json({ message: 'CSV vacío o sin filas de datos' }); return }

    const companyId = req.user!.companyId
    const existing  = await prisma.operator.findMany({ where: { companyId }, select: { id: true, name: true, dni: true } })
    const byDni     = new Map(existing.map((o) => [o.dni.trim(), o]))

    const FIELD_MAP: Record<string, string> = {
      'nombre': 'name', 'name': 'name',
      'dni': 'dni',
      'licencia': 'licenseNumber', 'license': 'licenseNumber', 'licensenumber': 'licenseNumber', 'numero_licencia': 'licenseNumber',
      'vencimiento': 'licenseExpiry', 'licenseexpiry': 'licenseExpiry', 'vencimiento_licencia': 'licenseExpiry',
      'telefono': 'phone', 'teléfono': 'phone', 'phone': 'phone',
      'estado': 'status', 'status': 'status',
    }
    const STATUS_MAP: Record<string, string> = { activo: 'ACTIVE', active: 'ACTIVE', inactivo: 'INACTIVE', inactive: 'INACTIVE', suspendido: 'SUSPENDED', suspended: 'SUSPENDED' }

    type OpRow = { existing?: { id: string; name: string; dni: string }; action: 'update' | 'create'; fields: Record<string, unknown>; displayName: string; dni: string }
    const ops: OpRow[] = []

    for (const row of rows) {
      const mapped: Record<string, unknown> = {}
      for (const [csvKey, val] of Object.entries(row)) {
        const dbKey = FIELD_MAP[csvKey.trim().toLowerCase()]
        if (dbKey && val.trim()) {
          if (dbKey === 'status') mapped[dbKey] = STATUS_MAP[val.trim().toLowerCase()] ?? val.trim().toUpperCase()
          else mapped[dbKey] = val.trim()
        }
      }
      const dni = (mapped['dni'] as string ?? '').trim()
      if (!dni && !mapped['name']) continue
      const found = dni ? byDni.get(dni) : undefined
      const displayName = (mapped['name'] as string) || found?.name || '(sin nombre)'
      if (Object.keys(mapped).length > 0) {
        ops.push({ existing: found, action: found ? 'update' : 'create', fields: mapped, displayName, dni })
      }
    }

    if (preview) {
      res.json({ ops: ops.map((o) => ({ action: o.action, displayName: o.displayName, dni: o.dni, fields: o.fields })), total: ops.length })
      return
    }

    let created = 0; let updated = 0
    for (const op of ops) {
      if (op.action === 'update' && op.existing) {
        await prisma.operator.update({ where: { id: op.existing.id }, data: op.fields })
        updated++
      } else if (op.fields['name'] && op.fields['dni']) {
        await prisma.operator.create({ data: { companyId, name: op.fields['name'] as string, dni: op.fields['dni'] as string, ...op.fields } })
        created++
      }
    }
    res.json({ created, updated, total: ops.length })
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Error al importar' })
  }
})

export default router
