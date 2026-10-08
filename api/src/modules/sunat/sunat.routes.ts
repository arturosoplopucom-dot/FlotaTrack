import { Router, Response } from 'express'
import { authenticate, AuthRequest } from '../../middlewares/auth.middleware'
import { sunatService } from './sunat.service'
import { prisma } from '../../config/database'

const router = Router()
router.use(authenticate)

// GET /api/sunat/config — configuración enmascarada
router.get('/config', async (req: AuthRequest, res: Response) => {
  try {
    const company = await prisma.company.findUnique({ where: { id: req.user!.companyId } })
    const cfg = company?.sunatConfig as Record<string, string> | null
    res.json(sunatService.maskConfig(cfg))
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

// PATCH /api/sunat/config — guardar credenciales cifradas
router.patch('/config', async (req: AuthRequest, res: Response) => {
  try {
    const { clientId, clientSecret, usuarioSol, claveSol, nubefactUrl, nubefactToken, sunatPdfPath, cpeToken } = req.body
    if (!clientId || !usuarioSol) {
      res.status(400).json({ message: 'clientId y usuarioSol son requeridos' })
      return
    }

    const company = await prisma.company.findUnique({ where: { id: req.user!.companyId } })
    const current = (company?.sunatConfig ?? {}) as Record<string, string>

    // Cifrar solo los campos que llegaron; conservar los anteriores si no se envían
    const newCfg: Record<string, string> = { ...current, clientId, usuarioSol }
    if (clientSecret) {
      const cs = sunatService.encryptConfig({ clientId, clientSecret, usuarioSol, claveSol: claveSol ?? '' })
      newCfg.clientSecretEnc = cs.clientSecretEnc
      newCfg.clientSecretIv  = cs.clientSecretIv
      newCfg.clientSecretTag = cs.clientSecretTag
    }
    if (claveSol) {
      const cl = sunatService.encryptConfig({ clientId, clientSecret: clientSecret ?? '', usuarioSol, claveSol })
      newCfg.claveSolEnc = cl.claveSolEnc
      newCfg.claveSolIv  = cl.claveSolIv
      newCfg.claveSolTag = cl.claveSolTag
    }
    if (nubefactUrl !== undefined)    newCfg.nubefactUrl   = nubefactUrl
    if (nubefactToken)                newCfg.nubefactToken = nubefactToken
    if (sunatPdfPath !== undefined)   newCfg.sunatPdfPath  = sunatPdfPath
    if (cpeToken)                     newCfg.cpeToken      = cpeToken

    await prisma.company.update({
      where: { id: req.user!.companyId },
      data:  { sunatConfig: newCfg },
    })
    res.json(sunatService.maskConfig(newCfg))
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

// GET /api/sunat/diag-cpe — diagnóstico OAuth CPE (temporal)
router.get('/diag-cpe', async (req: AuthRequest, res: Response) => {
  try {
    const result = await sunatService.diagCpe(req.user!.companyId)
    res.json(result)
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Error' })
  }
})

// POST /api/sunat/sync — sincronizar RVIE para un período
router.post('/sync', async (req: AuthRequest, res: Response) => {
  const { periodo } = req.body  // YYYYMM
  if (!periodo || !/^\d{6}$/.test(periodo)) {
    res.status(400).json({ message: 'Período inválido. Formato: YYYYMM (ej: 202609)' })
    return
  }

  // SSE para enviar progreso en tiempo real
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const send = (type: 'progress' | 'done' | 'error', payload: object) =>
    res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`)

  try {
    const result = await sunatService.syncRVIE(
      req.user!.companyId,
      periodo,
      (step) => send('progress', { step }),
    )
    send('done', result)
  } catch (err: unknown) {
    send('error', { message: err instanceof Error ? err.message : 'Error inesperado' })
  } finally {
    res.end()
  }
})

// POST /api/sunat/enrich-cpe — enriquecer facturas existentes con detracción y vencimiento real
router.post('/enrich-cpe', async (req: AuthRequest, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const send = (type: 'progress' | 'done' | 'error', payload: object) =>
    res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`)

  try {
    const result = await sunatService.enrichFromCpe(
      req.user!.companyId,
      (step) => send('progress', { step }),
    )
    send('done', result)
  } catch (err: unknown) {
    send('error', { message: err instanceof Error ? err.message : 'Error inesperado' })
  } finally {
    res.end()
  }
})

export default router
