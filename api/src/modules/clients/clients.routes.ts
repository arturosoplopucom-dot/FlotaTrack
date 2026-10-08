import { Router, Response } from 'express'
import { Prisma } from '@prisma/client'
import { authenticate, AuthRequest } from '../../middlewares/auth.middleware'
import { clientsService } from './clients.service'
import { prisma } from '../../config/database'

// Parse a raw CSV string → array of row objects (header row = keys)
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
    const data = await clientsService.findAll(req.user!.companyId)
    res.json(data)
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const data = await clientsService.findOne(req.user!.companyId, req.params.id as string)
    res.json(data)
  } catch (err: unknown) {
    res.status(404).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const data = await clientsService.create(req.user!.companyId, req.body)
    res.status(201).json(data)
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const data = await clientsService.update(req.user!.companyId, req.params.id as string, req.body)
    res.json(data)
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

// PATCH /api/clients/bulk-detraccion — aplica el mismo % a todos los clientes activos
router.patch('/bulk-detraccion', async (req: AuthRequest, res: Response) => {
  try {
    const { detraccionPct } = req.body
    const pct = parseFloat(detraccionPct)
    if (isNaN(pct) || pct < 0 || pct > 100) {
      res.status(400).json({ message: 'Porcentaje inválido (0-100)' })
      return
    }
    const result = await prisma.client.updateMany({
      where: { companyId: req.user!.companyId, active: true },
      data: { detraccionPct: new Prisma.Decimal(pct) },
    })
    res.json({ updated: result.count, detraccionPct: pct })
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

// POST /api/clients/import-contacts — bulk update contactos desde CSV
// Body: { csv: string } — texto del CSV con columnas ruc;telefono;whatsapp;email;direccion;contacto
router.post('/import-contacts', async (req: AuthRequest, res: Response) => {
  try {
    const { csv, preview } = req.body as { csv: string; preview?: boolean }
    if (!csv || typeof csv !== 'string') {
      res.status(400).json({ message: 'Se requiere el campo csv (texto)' })
      return
    }

    const rows = parseCsv(csv)
    if (!rows.length) {
      res.status(400).json({ message: 'El CSV está vacío o no tiene filas de datos' })
      return
    }

    const companyId = req.user!.companyId
    const allClients = await prisma.client.findMany({
      where: { companyId, active: true },
      select: { id: true, ruc: true, businessName: true, phone: true, whatsapp: true, email: true, address: true, contactName: true },
    })
    const byRuc = new Map(allClients.map((c) => [c.ruc, c]))

    const updates: Array<{ id: string; ruc: string; businessName: string; fields: Record<string, string> }> = []
    const notFound: string[] = []

    for (const row of rows) {
      const ruc = (row['ruc'] ?? '').trim()
      if (!ruc) continue
      const client = byRuc.get(ruc)
      if (!client) { notFound.push(ruc); continue }

      const fields: Record<string, string> = {}
      const map: Record<string, string> = {
        'telefono': 'phone', 'teléfono': 'phone', 'phone': 'phone',
        'whatsapp': 'whatsapp',
        'email': 'email', 'correo': 'email',
        'direccion': 'address', 'dirección': 'address', 'address': 'address',
        'contacto': 'contactName', 'contact': 'contactName', 'contactname': 'contactName',
      }
      for (const [csvKey, dbKey] of Object.entries(map)) {
        const val = (row[csvKey] ?? '').trim()
        if (val) fields[dbKey] = val
      }
      if (Object.keys(fields).length > 0) {
        updates.push({ id: client.id, ruc, businessName: client.businessName, fields })
      }
    }

    if (preview) {
      res.json({ updates: updates.map((u) => ({ ruc: u.ruc, businessName: u.businessName, fields: u.fields })), notFound, total: updates.length })
      return
    }

    let updated = 0
    for (const u of updates) {
      await prisma.client.update({ where: { id: u.id }, data: u.fields })
      updated++
    }

    res.json({ updated, notFound, total: rows.length })
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Error al importar' })
  }
})

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    await clientsService.remove(req.user!.companyId, req.params.id as string)
    res.json({ message: 'Cliente desactivado' })
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

export default router
