import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import AdmZip from 'adm-zip'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { generateInvoicePdfFromXml } from '../invoices/invoice-pdf.server'

// ─── Constants ────────────────────────────────────────────────────────────────

const SIRE_BASE         = 'https://api-sire.sunat.gob.pe/v1/contribuyente/migeigv'
const SEC_BASE          = 'https://api-seguridad.sunat.gob.pe/v1/clientessol'
const SCOPE             = 'https://api.sunat.gob.pe/v1/contribuyente/migeigv'
// Scopes CPE — verificados contra código fuente de SIRE
const SCOPE_CPE_CTRL       = 'https://api-cpe.sunat.gob.pe/v1/contribuyente/controlcpe'
const SCOPE_CPE_CONSULT    = 'https://api-cpe.sunat.gob.pe/v1/contribuyente/consultacpe'
// Scope para descargar XMLs/PDFs individuales — el que usa la macro Excel de SUNAT
const SCOPE_COMPROBANTES   = 'https://api.sunat.gob.pe/v1/contribuyente/comprobantes'
const SCOPE_CPE            = SCOPE_CPE_CTRL   // alias principal
const CPE_BASE          = 'https://api.sunat.gob.pe/v1/contribuyente/contribuyentes'
const POLL_INTERVAL_MS = 10_000
const POLL_TIMEOUT_MS  = 8 * 60 * 1000  // 8 min

// ─── In-memory token cache (sustituye Redis) ──────────────────────────────────

const tokenCache = new Map<string, { token: string; expiresAt: number }>()

// ─── SBS Tipo de Cambio Venta (cache por fecha) ───────────────────────────────
// SUNAT SPOT usa el TC de venta SBS de la fecha de emisión. El SIRE CSV puede
// exportar un TC diferente (promedio mensual), lo que causa detracciones incorrectas.

const sbsTcCache = new Map<string, number>()

async function getSbsTipoCambioVenta(fecha: Date): Promise<number> {
  const fechaStr = fecha.toISOString().slice(0, 10)  // YYYY-MM-DD
  if (sbsTcCache.has(fechaStr)) return sbsTcCache.get(fechaStr)!
  try {
    // BCRP API: TC sistema bancario SBS venta (S/ por US$) — gratuito, sin API key
    const url = `https://estadisticas.bcrp.gob.pe/estadisticas/series/api/PD04640PD/json/${fechaStr}/${fechaStr}/`
    const res  = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return 0
    // BCRP API puede incluir HTML de debug (xdebug PHP) después del JSON — cortar antes del <
    const text    = await res.text()
    const htmlPos = text.indexOf('<')
    const jsonStr = htmlPos > 0 ? text.slice(0, htmlPos).trim() : text.trim()
    const data    = JSON.parse(jsonStr) as { periods?: Array<{ values: string[] }> }
    const tc   = parseFloat(data.periods?.[0]?.values?.[0] ?? '0')
    if (tc > 1) sbsTcCache.set(fechaStr, tc)
    return tc > 1 ? tc : 0
  } catch {
    return 0
  }
}

// ─── Encryption (AES-256-GCM con clave derivada de JWT_SECRET) ────────────────

function encKey(): Buffer {
  return crypto.createHash('sha256')
    .update(process.env.JWT_SECRET ?? 'flotatrack-fallback-key')
    .digest()
}

function encryptText(plain: string): { enc: string; iv: string; tag: string } {
  const iv     = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', encKey(), iv)
  const buf    = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return { enc: buf.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64') }
}

function decryptText(enc: string, iv: string, tag: string): string {
  const d = crypto.createDecipheriv('aes-256-gcm', encKey(), Buffer.from(iv, 'base64'))
  d.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([d.update(Buffer.from(enc, 'base64')), d.final()]).toString('utf8')
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function getToken(
  clientId: string, clientSecret: string,
  ruc: string, usuarioSol: string, claveSol: string,
): Promise<string> {
  const cached = tokenCache.get(ruc)
  if (cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) return cached.token

  const tokenUrl = `${SEC_BASE}/${encodeURIComponent(clientId)}/oauth2/token/`
  const body = new URLSearchParams({
    grant_type:    'password',
    scope:         SCOPE,
    client_id:     clientId,
    client_secret: clientSecret,
    username:      ruc + usuarioSol,
    password:      claveSol,
  }).toString()

  const res = await fetch(tokenUrl, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`SUNAT autenticación HTTP ${res.status}: ${err.substring(0, 200)}`)
  }
  const data = await res.json() as { access_token: string; expires_in: number }
  tokenCache.set(ruc, { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 })
  return data.access_token
}

// ─── Token para exportación RVIE (client_credentials — igual que SIRE Paso 1) ─

const exportTokenCache = new Map<string, { token: string; expiresAt: number }>()
const cpeTokenCache    = new Map<string, { token: string; expiresAt: number }>()

async function getExportToken(clientId: string, clientSecret: string): Promise<string> {
  const cached = exportTokenCache.get(clientId)
  if (cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) return cached.token

  const ATTEMPTS = [
    { url: `https://api-seguridad.sunat.gob.pe/v1/clientesextranet/${encodeURIComponent(clientId)}/oauth2/token/`, scope: SCOPE },
    { url: `https://api-seguridad.sunat.gob.pe/v1/clientesextranet/${encodeURIComponent(clientId)}/oauth2/token/`, scope: 'https://api-sire.sunat.gob.pe' },
    { url: `https://api-seguridad.sunat.gob.pe/v1/clientessol/${encodeURIComponent(clientId)}/oauth2/token/`,      scope: SCOPE },
    { url: `https://api-seguridad.sunat.gob.pe/v1/clientessolatlas/oauth2/token`,                                   scope: SCOPE },
  ]

  let lastErr = ''
  for (const { url, scope } of ATTEMPTS) {
    try {
      const body = new URLSearchParams({ grant_type: 'client_credentials', scope, client_id: clientId, client_secret: clientSecret }).toString()
      const res  = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
      const text = await res.text()
      console.log(`[Sunat] exportToken ${url.split('/')[4]} scope=${scope.split('/').pop()} → ${res.status} body="${text.substring(0, 150)}"`)
      if (res.ok) {
        try {
          const data = JSON.parse(text) as { access_token: string; expires_in: number }
          exportTokenCache.set(clientId, { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 })
          return data.access_token
        } catch {
          lastErr = `${res.status} OK pero body inválido: ${text.substring(0, 100)}`
          continue
        }
      }
      if (res.status === 401) throw new Error(`SUNAT 401: Client ID o Secret inválidos`)
      lastErr = `HTTP ${res.status}: ${text.substring(0, 100)}`
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('SUNAT 401')) throw e
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }
  throw new Error(`No se pudo obtener token de exportación SUNAT. Último error: ${lastErr}`)
}

// ─── Token CPE (password grant) — intenta controlcpe luego consultacpe (igual que SIRE) ──

async function fetchCpeTokenForScope(
  clientId: string, clientSecret: string,
  ruc: string, usuarioSol: string, claveSol: string,
  scope: string,
): Promise<string> {
  const tokenUrl = `${SEC_BASE}/${encodeURIComponent(clientId)}/oauth2/token/`
  const body = new URLSearchParams({
    grant_type:    'password',
    scope,
    client_id:     clientId,
    client_secret: clientSecret,
    username:      ruc + usuarioSol,
    password:      claveSol,
  }).toString()

  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), 15_000)
  let res: Response
  try {
    res = await fetch(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: abort.signal })
  } catch (e) {
    clearTimeout(timer)
    throw new Error(`CPE token sin respuesta (scope=${scope.split('/').pop()}): ${e instanceof Error ? e.message : String(e)}`)
  }
  clearTimeout(timer)
  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`CPE token HTTP ${res.status} (scope=${scope.split('/').pop()}): ${err.substring(0, 200)}`)
  }
  const data = await res.json() as { access_token: string; expires_in: number }
  return data.access_token
}

async function getTokenCpe(
  clientId: string, clientSecret: string,
  ruc: string, usuarioSol: string, claveSol: string,
): Promise<string> {
  const cacheKey = `${ruc}-cpe`
  const cached = cpeTokenCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) return cached.token

  // SIRE usa scope "comprobantes" para descargar PDFs individuales (macro Excel SUNAT).
  // Fallback a controlcpe y consultacpe.
  const expiresIn = 3600
  let token: string | null = null
  let lastErr: unknown
  for (const scope of [SCOPE_COMPROBANTES, SCOPE_CPE_CTRL, SCOPE_CPE_CONSULT]) {
    try {
      token = await fetchCpeTokenForScope(clientId, clientSecret, ruc, usuarioSol, claveSol, scope)
      console.log(`[getTokenCpe] token obtenido con scope=${scope.split('/').pop()}`)
      break
    } catch (e) {
      lastErr = e
      console.log(`[getTokenCpe] scope ${scope.split('/').pop()} falló: ${e}`)
    }
  }
  if (!token) throw new Error(`No se pudo obtener token CPE: ${lastErr}`)

  cpeTokenCache.set(cacheKey, { token: token!, expiresAt: Date.now() + expiresIn * 1000 })
  return token!
}

// Token específico para cada scope (igual que authManager.getComprobantesToken de SIRE)
async function getTokenForScope(
  clientId: string, clientSecret: string,
  ruc: string, usuarioSol: string, claveSol: string,
  scope: string,
): Promise<string> {
  const cacheKey = `${ruc}-${scope.split('/').pop()}`
  const cached = cpeTokenCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) return cached.token
  const token = await fetchCpeTokenForScope(clientId, clientSecret, ruc, usuarioSol, claveSol, scope)
  cpeTokenCache.set(cacheKey, { token, expiresAt: Date.now() + 3600 * 1000 })
  return token
}

// ─── Consulta de CPE por factura ──────────────────────────────────────────────

type CpeDetail = {
  detraccion: number
  dueDate: Date | null
  importeTotal?: number   // en la moneda original del comprobante
  moneda?: string         // USD | PEN | etc.
}

async function getCpeDetail(
  ruc: string, token: string,
  serie: string, numero: string,
  codTipo = '01',
): Promise<CpeDetail> {
  const url = `${CPE_BASE}/${ruc}/comprobantes2/fcpe`
  const params = new URLSearchParams({
    numRuc:              ruc,
    codTipoComprobante:  codTipo,
    serie,
    numero,
  })
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), 10_000)
  let res: Response
  try {
    res = await fetch(`${url}?${params}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: abort.signal,
    })
  } catch {
    clearTimeout(timer)
    return { detraccion: 0, dueDate: null }
  }
  clearTimeout(timer)

  if (!res.ok) return { detraccion: 0, dueDate: null }

  const data = await res.json() as {
    montoDetraccion?: number
    porcentajeDetraccion?: number
    importeTotal?: number
    moneda?: string
    cuotas?: { fechaVencimiento?: string; monto?: number }[]
    fechaVencimiento?: string
  }

  // Calcular detracción desde el response
  let detraccion = 0
  if (data.montoDetraccion) {
    detraccion = data.montoDetraccion
  } else if (data.porcentajeDetraccion && data.importeTotal) {
    // SUNAT SPOT exige soles enteros — ROUND sin decimales
    detraccion = Math.round(data.importeTotal * (data.porcentajeDetraccion / 100))
  }

  // Fecha de vencimiento real (primera cuota o campo directo)
  let dueDate: Date | null = null
  const rawDate = data.cuotas?.[0]?.fechaVencimiento ?? data.fechaVencimiento
  if (rawDate) {
    // formato posible: DD/MM/YYYY o YYYY-MM-DD
    if (rawDate.includes('/')) {
      const [d, m, y] = rawDate.split('/')
      dueDate = new Date(`${y}-${m}-${d}`)
    } else {
      dueDate = new Date(rawDate)
    }
  }

  return { detraccion, dueDate, importeTotal: data.importeTotal, moneda: data.moneda }
}

// ─── Parser completo XML UBL 2.1 Perú — para generación de PDF con todos los datos ──

import type { XmlInvoiceData, XmlInvoiceLine } from '../invoices/invoice-pdf.server'

function parseFullInvoiceXml(xml: string): XmlInvoiceData | null {
  // ID y tipo
  const idMatch = xml.match(/<cbc:ID>([A-Z][A-Z\d]{2,3}-\d+)<\/cbc:ID>/)
  if (!idMatch) return null
  const fullId = idMatch[1]
  const dash   = fullId.lastIndexOf('-')
  const series = fullId.substring(0, dash)
  const number = fullId.substring(dash + 1)
  const tipoDoc = series.startsWith('B') ? '03' : '01'

  // Fecha emisión
  const issueDateStr = xml.match(/<cbc:IssueDate>([\d-]+)<\/cbc:IssueDate>/)?.[1]
  const issueDate = issueDateStr ? new Date(issueDateStr + 'T00:00:00') : new Date()

  // Cliente
  const clientRuc  = xml.match(/<cac:AccountingCustomerParty>[\s\S]*?<cbc:CompanyID>([\d]+)<\/cbc:CompanyID>/)?.[1] ?? ''
  const clientName = (
    xml.match(/<cac:AccountingCustomerParty>[\s\S]*?<cbc:RegistrationName>([^<]+)<\/cbc:RegistrationName>/)?.[1] ??
    xml.match(/<cac:AccountingCustomerParty>[\s\S]*?<cbc:Name>([^<]+)<\/cbc:Name>/)?.[1] ?? ''
  ).trim()

  // PaymentTerms
  const blocks = xml.match(/<cac:PaymentTerms>[\s\S]*?<\/cac:PaymentTerms>/g) ?? []
  let detraccionCode = ''; let detraccionPct = 0; let detraccionAmount = 0; let dueDate: Date | null = null
  for (const block of blocks) {
    const bid = (block.match(/<cbc:ID>([^<]+)<\/cbc:ID>/)?.[1] ?? '').trim()
    if (bid === 'Detraccion') {
      detraccionPct    = parseFloat(block.match(/<cbc:PaymentPercent>([\d.]+)<\/cbc:PaymentPercent>/)?.[1] ?? '0')
      detraccionAmount = parseFloat(block.match(/<cbc:Amount[^>]*>([\d.]+)<\/cbc:Amount>/)?.[1] ?? '0')
      detraccionCode   = (block.match(/<cbc:PaymentMeansID>([^<]+)<\/cbc:PaymentMeansID>/)?.[1] ?? '').trim()
    }
    if (/^Cuota/i.test(bid) && !dueDate) {
      const d = block.match(/<cbc:PaymentDueDate>([\d-]+)<\/cbc:PaymentDueDate>/)
      if (d) dueDate = new Date(d[1] + 'T00:00:00')
    }
  }

  // Totales
  const baseImponible = parseFloat(
    xml.match(/<cac:LegalMonetaryTotal>[\s\S]*?<cbc:LineExtensionAmount[^>]*>([\d.]+)<\/cbc:LineExtensionAmount>/)?.[1] ?? '0'
  )
  const igvMatch = xml.match(/<cac:TaxTotal>[\s\S]*?<cbc:TaxAmount[^>]*>([\d.]+)<\/cbc:TaxAmount>/)
  const igv   = parseFloat(igvMatch?.[1] ?? '0')
  const total = parseFloat(
    xml.match(/<cbc:PayableAmount[^>]*>([\d.]+)<\/cbc:PayableAmount>/)?.[1] ?? '0'
  )

  // Líneas
  const lineBlocks = xml.match(/<cac:InvoiceLine>[\s\S]*?<\/cac:InvoiceLine>/g) ?? []
  const lines: XmlInvoiceLine[] = lineBlocks.map(lb => {
    const description = (lb.match(/<cbc:Description>([^<]+)<\/cbc:Description>/)?.[1] ?? '').trim()
    const qty       = parseFloat(lb.match(/<cbc:InvoicedQuantity[^>]*>([\d.]+)<\/cbc:InvoicedQuantity>/)?.[1] ?? '1')
    const unit      = (lb.match(/<cbc:InvoicedQuantity[^>]*unitCode="([^"]+)"/)?.[1] ?? 'ZZ').trim()
    const lineTotal = parseFloat(lb.match(/<cbc:LineExtensionAmount[^>]*>([\d.]+)<\/cbc:LineExtensionAmount>/)?.[1] ?? '0')
    const unitPrice = parseFloat(lb.match(/<cbc:PriceAmount[^>]*>([\d.]+)<\/cbc:PriceAmount>/)?.[1] ?? String(lineTotal / (qty || 1)))
    return { description: description || 'Servicio', qty, unit, unitPrice, lineTotal }
  })
  if (lines.length === 0) {
    lines.push({ description: `${series}-${number}`, qty: 1, unit: 'ZZ', unitPrice: baseImponible, lineTotal: baseImponible })
  }

  // Nro. Cta. Banco de la Nación (en PaymentMeans o FinancialInstitutionBranch)
  const cuentaBN = (
    xml.match(/<cac:PaymentMeans>[\s\S]*?<cac:PayeeFinancialAccount>[\s\S]*?<cbc:ID>(\d{8,20})<\/cbc:ID>/)?.[1] ??
    xml.match(/<cac:FinancialInstitutionBranch>[\s\S]*?<cbc:ID>(\d{8,20})<\/cbc:ID>/)?.[1] ?? ''
  )

  return { series, number, tipoDoc, issueDate, dueDate, clientRuc, clientName, lines, baseImponible, igv, total, detraccionCode, detraccionPct, detraccionAmount, cuentaBN }
}

// ─── Parse XML de factura individual (UBL 2.1 peruano) ───────────────────────

function parseInvoiceXmlContent(xml: string): {
  series: string; number: string; detraccion: number; dueDate: Date | null
  detraccionCode: string; cuentaBN: string
  totalOriginal: number | null; currencyId: string | null
  formaPago: string
} | null {
  const idMatch = xml.match(/<cbc:ID>([A-Z][A-Z\d]{2,3}-\d+)<\/cbc:ID>/)
  if (!idMatch) return null
  const fullId = idMatch[1]
  const dash   = fullId.lastIndexOf('-')
  const series = fullId.substring(0, dash)
  const number = fullId.substring(dash + 1)

  const blocks = xml.match(/<cac:PaymentTerms>[\s\S]*?<\/cac:PaymentTerms>/g) ?? []
  let detraccion = 0
  let dueDate: Date | null = null
  let detraccionCode = ''
  let formaPago = ''

  for (const block of blocks) {
    const bid = (block.match(/<cbc:ID>([^<]+)<\/cbc:ID>/)?.[1] ?? '').trim()
    if (bid === 'FormaPago') {
      formaPago = (block.match(/<cbc:PaymentMeansID>([^<]+)<\/cbc:PaymentMeansID>/)?.[1] ?? '').trim()
    }
    if (bid === 'Detraccion') {
      const amt = block.match(/<cbc:Amount[^>]*>([\d.]+)<\/cbc:Amount>/)
      if (amt) detraccion = parseFloat(amt[1])
      detraccionCode = (block.match(/<cbc:PaymentMeansID>([^<]+)<\/cbc:PaymentMeansID>/)?.[1] ?? '').trim()
    }
    if (/^Cuota/i.test(bid) && !dueDate) {
      const d = block.match(/<cbc:PaymentDueDate>([\d-]+)<\/cbc:PaymentDueDate>/)
      if (d) dueDate = new Date(d[1])
    }
  }

  const cuentaBN = (
    xml.match(/<cac:PaymentMeans>[\s\S]*?<cac:PayeeFinancialAccount>[\s\S]*?<cbc:ID>(\d{8,20})<\/cbc:ID>/)?.[1] ??
    xml.match(/<cac:FinancialInstitutionBranch>[\s\S]*?<cbc:ID>(\d{8,20})<\/cbc:ID>/)?.[1] ?? ''
  )

  // Monto original en la moneda del comprobante (UBL 2.1: <cbc:PayableAmount currencyID="USD">)
  const payableMatch = xml.match(/<cbc:PayableAmount[^>]*currencyID="([A-Z]{3})"[^>]*>([\d.]+)<\/cbc:PayableAmount>/)
  const currencyId    = payableMatch?.[1] ?? null
  const totalOriginal = payableMatch ? parseFloat(payableMatch[2]) : null

  return { series, number, detraccion, dueDate, detraccionCode, cuentaBN, totalOriginal, currencyId, formaPago }
}

// ─── Ticket polling ───────────────────────────────────────────────────────────

async function pollTicket(periodo: string, numTicket: string, token: string): Promise<string> {
  const pollUrl =
    `${SIRE_BASE}/libros/rvierce/gestionprocesosmasivos/web/masivo/consultaestadotickets` +
    `?perIni=${periodo}&perFin=${periodo}&page=1&perPage=20&numTicket=${numTicket}`

  const deadline = Date.now() + POLL_TIMEOUT_MS
  let attempt = 0

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
    attempt++

    const res = await fetch(pollUrl, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) { console.warn(`[Sunat] Poll HTTP ${res.status} — reintentando (${attempt})`); continue }

    const data = await res.json() as {
      registros?: Array<{
        codEstadoProceso?: string; desEstadoProceso?: string; codEstadoEnvio?: string
        perTributario?: string; codProceso?: string; numTicket?: string
        detalleTicket?: { numTicket?: string; codEstadoEnvio?: string; nomArchivoReporte?: string; codTipoArchivoReporte?: string } | Array<{ numTicket?: string; codEstadoEnvio?: string; nomArchivoReporte?: string; codTipoArchivoReporte?: string }>
        archivoReporte?: Array<{ nomArchivoReporte?: string; codTipoArchivoReporte?: string }>
        subProcesos?: Array<{ nomArchivoContenido?: string }>
        nomArchivoContenido?: string; nomArchivoImportacion?: string
      }>
    }

    const reg = data.registros?.[0]
    if (!reg) continue

    const detalle = Array.isArray(reg.detalleTicket) ? reg.detalleTicket[0] : reg.detalleTicket ?? null
    const estado  = reg.codEstadoProceso ?? reg.codEstadoEnvio ?? detalle?.codEstadoEnvio
    console.log(`[Sunat] Ticket estado: ${estado} / ${reg.desEstadoProceso} (intento ${attempt})`)

    if (estado === '04') throw new Error(`SUNAT rechazó el ticket ${numTicket} (error en procesamiento)`)
    if (estado === '06' || reg.desEstadoProceso === 'Terminado') {
      const nomArchivo =
        reg.archivoReporte?.[0]?.nomArchivoReporte ??
        detalle?.nomArchivoReporte ??
        reg.subProcesos?.[0]?.nomArchivoContenido ??
        reg.nomArchivoContenido ?? reg.nomArchivoImportacion

      if (nomArchivo) {
        const params = new URLSearchParams({
          nomArchivoReporte:      nomArchivo,
          codTipoArchivoReporte:  reg.archivoReporte?.[0]?.codTipoArchivoReporte ?? detalle?.codTipoArchivoReporte ?? 'null',
          perTributario:          reg.perTributario ?? periodo,
          codProceso:             reg.codProceso ?? '10',
          numTicket:              detalle?.numTicket ?? reg.numTicket ?? numTicket,
          codLibro:               '140100',  // RVIE
        })
        return `${SIRE_BASE}/libros/rvierce/gestionprocesosmasivos/web/masivo/archivoreporte?${params}`
      }
    }
  }
  throw new Error(`Timeout esperando SUNAT después de ${POLL_TIMEOUT_MS / 60000} min`)
}

// ─── CSV parsing (layout RVIE verificado con SIRE) ────────────────────────────

type RvieRecord = {
  serie: string; numero: string; tipoComprobante: string
  rucCliente: string; razonSocial: string
  fechaEmision: string  // DD/MM/YYYY
  baseImponible: number; igv: number; importeTotal: number
  moneda: string; estadoComprobante: string
  tipoCambio: number  // SBS exchange rate on issue date (col 27); 1 for PEN
}

function parseCsvRvie(csv: string): RvieRecord[] {
  const lines = csv.split('\n').filter(l => l.trim())
  return lines.slice(1).map(line => {
    const cols = line.split(',')
    const baseImp = parseFloat(cols[14] ?? '0') + parseFloat(cols[15] ?? '0')
    const igv     = parseFloat(cols[16] ?? '0') + parseFloat(cols[17] ?? '0')
    return {
      serie:             (cols[7]  ?? '').trim(),
      numero:            (cols[8]  ?? '').trim(),
      tipoComprobante:   (cols[6]  ?? '').trim(),
      rucCliente:        (cols[11] ?? '').trim(),
      razonSocial:       (cols[12] ?? '').trim(),
      fechaEmision:      (cols[4]  ?? '').trim(),
      baseImponible:     baseImp,
      igv,
      importeTotal:      parseFloat(cols[25] ?? '0') || (baseImp + igv),
      moneda:            ((cols[26] ?? '').trim() || 'PEN'),
      tipoCambio:        parseFloat(cols[27] ?? '1') || 1,
      estadoComprobante: (cols[34] ?? '').trim(),
    }
  }).filter(r =>
    r.serie && r.numero &&
    r.tipoComprobante === '01' &&   // solo facturas
    r.estadoComprobante === '1',    // solo vigentes
  )
}

function parseSunatDate(ddmmyyyy: string): Date {
  const [d, m, y] = ddmmyyyy.split('/')
  if (d && m && y) return new Date(parseInt(y), parseInt(m) - 1, parseInt(d))
  return new Date()
}

// ─── Exported service ─────────────────────────────────────────────────────────

export type SyncProgress = (step: string) => void

export type SunatConfigInput = {
  clientId: string
  clientSecret: string
  usuarioSol: string
  claveSol: string
}

// Busca recursivamente un PDF por nombre en una carpeta raíz
function findPdfInDir(root: string, names: string[]): string | null {
  if (!fs.existsSync(root)) return null
  const nameSet = new Set(names.map(n => n.toLowerCase()))
  const stack   = [root]
  while (stack.length) {
    const dir = stack.pop()!
    let entries: fs.Dirent[]
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { continue }
    for (const e of entries) {
      if (e.isDirectory()) { stack.push(path.join(dir, e.name)); continue }
      if (nameSet.has(e.name.toLowerCase())) return path.join(dir, e.name)
    }
  }
  return null
}

export const sunatService = {

  encryptConfig(input: SunatConfigInput) {
    const cs = encryptText(input.clientSecret)
    const cl = encryptText(input.claveSol)
    return {
      clientId:         input.clientId,
      usuarioSol:       input.usuarioSol,
      clientSecretEnc:  cs.enc,
      clientSecretIv:   cs.iv,
      clientSecretTag:  cs.tag,
      claveSolEnc:      cl.enc,
      claveSolIv:       cl.iv,
      claveSolTag:      cl.tag,
    }
  },

  maskConfig(cfg: Record<string, string> | null) {
    if (!cfg) return null
    return {
      clientId:              cfg.clientId ?? '',
      usuarioSol:            cfg.usuarioSol ?? '',
      hasClientSecret:       !!cfg.clientSecretEnc,
      hasClaveSol:           !!cfg.claveSolEnc,
      nubefactUrl:           cfg.nubefactUrl ?? '',
      hasNubefactToken:      !!cfg.nubefactToken,
      sunatPdfPath:          cfg.sunatPdfPath ?? '',
      hasCpeToken:           !!cfg.cpeToken,
      defaultDetraccionPct:  cfg.defaultDetraccionPct ? Number(cfg.defaultDetraccionPct) : 0,
    }
  },

  async syncRVIE(
    companyId: string,
    periodo: string,           // YYYYMM — e.g. "202609"
    onProgress: SyncProgress,
  ) {
    // 1. Cargar configuración
    const company = await prisma.company.findUnique({ where: { id: companyId } })
    const cfg = company?.sunatConfig as Record<string, string> | null
    if (!cfg?.clientId || !cfg?.clientSecretEnc || !cfg?.claveSolEnc) {
      throw new Error('Configura las credenciales SUNAT en Perfil de Empresa → Conexión SUNAT')
    }
    const ruc          = company!.ruc
    const clientSecret = decryptText(cfg.clientSecretEnc, cfg.clientSecretIv, cfg.clientSecretTag)
    const claveSol     = decryptText(cfg.claveSolEnc,     cfg.claveSolIv,     cfg.claveSolTag)

    // 2. Token SOL (password grant)
    onProgress('Autenticando con SUNAT...')
    const token = await getToken(cfg.clientId, clientSecret, ruc, cfg.usuarioSol, claveSol)

    // 3. Solicitar exportación RVIE
    // Endpoint correcto: /exportapropuesta con codOrigenEnvio=1 (contribuyente emisor)
    onProgress('Solicitando registro de ventas RVIE a SUNAT...')
    const exportUrl =
      `${SIRE_BASE}/libros/rvie/propuesta/web/propuesta/${periodo}` +
      `/exportapropuesta?codTipoArchivo=1&codOrigenEnvio=1&numRuc=${ruc}`

    console.log(`[Sunat] exportUrl → ${exportUrl}`)
    const exportRes = await fetch(exportUrl, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })
    console.log(`[Sunat] exportRes.status = ${exportRes.status}`)
    if (!exportRes.ok) {
      const body = await exportRes.text().catch(() => '')
      console.log(`[Sunat] exportRes.body = ${body.substring(0, 500)}`)
      throw new Error(`Error SUNAT al solicitar RVIE HTTP ${exportRes.status}: ${body.substring(0, 200)}`)
    }
    const { numTicket } = await exportRes.json() as { numTicket?: string }
    if (!numTicket) throw new Error('SUNAT no devolvió número de ticket. Verifique el período ingresado.')

    // 4. Polling del ticket
    onProgress(`Ticket ${numTicket} obtenido. Esperando procesamiento en SUNAT...`)
    const fileUrl = await pollTicket(periodo, numTicket, token)

    // 6. Descargar archivo (ZIP o CSV)
    onProgress('Descargando archivo de facturas...')
    const fileRes = await fetch(fileUrl, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'text/csv,application/octet-stream,*/*' },
    })
    if (!fileRes.ok) throw new Error(`Error al descargar archivo SUNAT HTTP ${fileRes.status}`)

    const buffer = Buffer.from(await fileRes.arrayBuffer())
    let csvContent: string

    // Map serie-numero → datos extraídos de XMLs del ZIP
    const xmlDataMap = new Map<string, {
      detraccion: number; dueDate: Date | null; detraccionCode: string; cuentaBN: string
      totalOriginal: number | null; currencyId: string | null; formaPago: string
    }>()

    const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b
    if (isZip) {
      const zip     = new AdmZip(buffer)
      const entries = zip.getEntries()
      console.log(`[Sunat] ZIP contiene ${entries.length} archivo(s): ${entries.map(e => e.entryName).join(', ')}`)

      // Extraer CSV principal
      const csvEntry = entries.find(e => e.entryName.endsWith('.csv') || e.entryName.endsWith('.txt'))
      if (!csvEntry) throw new Error('No se encontró CSV dentro del ZIP de SUNAT')
      csvContent = csvEntry.getData().toString('utf8')

      // Parsear XMLs de facturas individuales si el ZIP los incluye
      const xmlEntries = entries.filter(e => e.entryName.toLowerCase().endsWith('.xml'))
      if (xmlEntries.length > 0) {
        onProgress(`ZIP contiene ${xmlEntries.length} XML(s). Extrayendo detracción y vencimiento...`)
        for (const xe of xmlEntries) {
          try {
            const xml    = xe.getData().toString('utf8')
            const parsed = parseInvoiceXmlContent(xml)
            if (parsed) {
              xmlDataMap.set(`${parsed.series}-${parsed.number}`, {
                detraccion: parsed.detraccion, dueDate: parsed.dueDate,
                detraccionCode: parsed.detraccionCode, cuentaBN: parsed.cuentaBN,
                totalOriginal: parsed.totalOriginal, currencyId: parsed.currencyId,
                formaPago: parsed.formaPago,
              })
            }
          } catch { /* continuar con la siguiente */ }
        }
        console.log(`[Sunat] XMLs parseados: ${xmlDataMap.size} con datos de detracción`)
      }
    } else {
      csvContent = buffer.toString('utf8')
    }

    // 6. Parsear
    onProgress('Procesando registros del CSV...')
    const records = parseCsvRvie(csvContent)
    if (records.length === 0) {
      return { periodo, totalSunat: 0, imported: 0, matched: 0, skipped: 0, newClients: 0 }
    }

    onProgress(`${records.length} facturas vigentes encontradas. Importando...`)

    // 7. Intentar token CPE solo si el ZIP no trajo XMLs con datos
    let tokenCpe: string | null = null
    if (xmlDataMap.size === 0) {
      try {
        tokenCpe = await getTokenCpe(cfg.clientId, clientSecret, ruc, cfg.usuarioSol, claveSol)
        onProgress('Token CPE obtenido. Se consultará detracción y vencimiento por factura...')
      } catch {
        onProgress('Sin XMLs en ZIP ni acceso CPE — se usará detraccionPct del cliente.')
      }
    } else {
      onProgress(`${xmlDataMap.size} facturas con detracción extraída del ZIP. Importando...`)
    }

    // 8. Importar a FlotaTrack
    let imported = 0, matched = 0, skipped = 0, newClients = 0

    for (const rec of records) {
      // ¿Ya existe esta factura?
      const existing = await prisma.invoice.findFirst({
        where: { companyId, series: rec.serie, number: rec.numero },
      })
      if (existing) {
        // Si ya existe pero sin detracción, intentar completarla desde CPE o XML del ZIP
        const existingDet = Number((existing as any).detraccion ?? 0)
        if (existingDet === 0) {
          let detraccion = 0; let detraccionCode = ''; let cuentaBN = ''
          const xmlData = xmlDataMap.get(`${rec.serie}-${rec.numero}`)
          if (xmlData?.detraccion  > 0) { detraccion = xmlData.detraccion; detraccionCode = xmlData.detraccionCode; cuentaBN = xmlData.cuentaBN }
          if (detraccion === 0 && tokenCpe) {
            try {
              const cpe = await getCpeDetail(ruc, tokenCpe, rec.serie, rec.numero)
              if (cpe.detraccion > 0) detraccion = cpe.detraccion
            } catch { /* ignorar */ }
          }
          if (detraccion > 0) {
            await prisma.invoice.update({
              where: { id: existing.id },
              data: {
                detraccion: new Prisma.Decimal(detraccion),
                ...(detraccionCode && { detraccionCode }),
                ...(cuentaBN       && { cuentaBN }),
              },
            })
          }
        }
        skipped++; continue
      }

      // Buscar o crear cliente por RUC
      let client = await prisma.client.findFirst({ where: { companyId, ruc: rec.rucCliente } })
      if (!client) {
        client = await prisma.client.create({
          data: {
            companyId,
            ruc:          rec.rucCliente,
            businessName: rec.razonSocial || `RUC ${rec.rucCliente}`,
            creditDays:   30,
            active:       true,
          },
        })
        newClients++
      }

      // Buscar OT COMPLETED del mismo cliente con monto ≈ (tolerancia 1%)
      const tolerance = Math.max(rec.baseImponible * 0.01, 5)
      const matchedWO = await prisma.workOrder.findFirst({
        where: {
          companyId,
          clientId: client.id,
          status:   'COMPLETED',
          subtotal: { gte: rec.baseImponible - tolerance, lte: rec.baseImponible + tolerance },
        },
      })

      const issueDate = parseSunatDate(rec.fechaEmision)
      let dueDate = new Date(issueDate.getTime() + client.creditDays * 24 * 60 * 60 * 1000)
      let detraccion = 0
      let detraccionCode = ''
      let cuentaBN = ''

      // Fuente 1: XMLs del ZIP (datos exactos de SUNAT sin API adicional)
      const xmlData = xmlDataMap.get(`${rec.serie}-${rec.numero}`)
      let xmlTotalUsd: number | null = null
      if (xmlData) {
        if (xmlData.detraccion > 0)   detraccion     = xmlData.detraccion
        if (xmlData.dueDate)          dueDate        = xmlData.dueDate
        if (xmlData.detraccionCode)   detraccionCode = xmlData.detraccionCode
        if (xmlData.cuentaBN)         cuentaBN       = xmlData.cuentaBN
        // Si el XML tiene el monto original en USD, usarlo directamente
        if (xmlData.currencyId === 'USD' && xmlData.totalOriginal) {
          xmlTotalUsd = xmlData.totalOriginal
        }
        // Contado → vencimiento igual a emisión (sin bloque de crédito en PDF)
        if (xmlData.formaPago.toLowerCase() === 'contado') {
          dueDate = new Date(issueDate)
        }
      }

      // Fuente 2: CPE API (si no había XMLs en el ZIP)
      if (detraccion === 0 && tokenCpe) {
        try {
          const cpe = await getCpeDetail(ruc, tokenCpe, rec.serie, rec.numero)
          if (cpe.detraccion > 0) detraccion = cpe.detraccion
          if (cpe.dueDate)        dueDate    = cpe.dueDate
        } catch { /* continuar */ }
      }

      // Marcar si la detraccion ya provino del XML o CPE (en ese caso ya es correcta)
      const detracFromSource12 = detraccion > 0

      // Fuente 3: porcentaje configurado en el cliente
      if (detraccion === 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pct  = Number((client as any).detraccionPct  ?? 0)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const code = String((client as any).detraccionCode ?? '')
        if (pct > 0 && rec.importeTotal >= 700) {
          detraccion     = Math.round(rec.importeTotal * (pct / 100))
          if (code && !detraccionCode) detraccionCode = code
        }
      }

      // Fuente 4: porcentaje por defecto de la empresa (sunatConfig.defaultDetraccionPct)
      if (detraccion === 0) {
        const defaultPct = Number(cfg?.defaultDetraccionPct ?? 0)
        if (defaultPct > 0 && rec.importeTotal >= 700) {
          detraccion = Math.round(rec.importeTotal * (defaultPct / 100))
        }
      }

      // Para facturas USD: calcular total PEN usando TC SBS de la fecha de emisión.
      // El SIRE CSV puede exportar un TC diferente al que usó la factura original,
      // lo que causa detracciones incorrectas (ej: S/178 en vez de S/179).
      const isUsd   = rec.moneda === 'USD'
      let totalUsd: number | null = xmlTotalUsd  // del XML (exacto)
      let tcambio: number | null  = null
      let totalPen  = rec.importeTotal            // default: usar total del SIRE CSV

      if (isUsd) {
        // Obtener monto USD original si no vino del XML
        if (!totalUsd && rec.tipoCambio > 1) {
          totalUsd = Math.round((rec.importeTotal / rec.tipoCambio) * 100) / 100
        }

        if (totalUsd) {
          // Consultar TC SBS de la fecha de emisión para recalcular el total PEN correcto
          const sbsTc = await getSbsTipoCambioVenta(issueDate)
          if (sbsTc > 0) {
            totalPen = Math.round(totalUsd * sbsTc * 100) / 100
            tcambio  = sbsTc
            // Si la detraccion vino de Fuente 3 (client pct), recalcularla con totalPen correcto
            if (!detracFromSource12 && detraccion > 0 && totalPen >= 700) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const pct = Number((client as any).detraccionPct ?? 0)
              if (pct > 0) detraccion = Math.round(totalPen * (pct / 100))
            }
          } else {
            // SBS API no disponible — fallback a TC del SIRE CSV
            tcambio = rec.tipoCambio > 1
              ? rec.tipoCambio
              : (totalUsd > 0 ? Math.round((rec.importeTotal / totalUsd) * 10000) / 10000 : null)
          }
        }
      }

      const invoice = await prisma.invoice.create({
        data: {
          companyId,
          clientId:      client.id,
          series:        rec.serie,
          number:        rec.numero,
          description:   `Importada desde SUNAT SIRE — ${rec.razonSocial}`,
          amount:        rec.baseImponible,
          igv:           rec.igv,
          total:         totalPen,
          detraccion,
          detraccionCode,
          cuentaBN,
          issueDate,
          dueDate,
          currency:      isUsd ? 'USD' : 'PEN',
          ...(totalUsd !== null && { totalUsd, tcambio }),
        },
      })

      if (matchedWO) {
        await prisma.$transaction([
          prisma.workOrder.update({
            where: { id: matchedWO.id },
            data:  { status: 'BILLED', invoiceId: invoice.id },
          }),
        ])
        matched++
      }

      imported++
    }

    return { periodo, totalSunat: records.length, imported, matched, skipped, newClients }
  },

  // ─── Enriquecer facturas existentes con CPE (detracción + vencimiento real) ──

  async enrichFromCpe(companyId: string, onProgress: SyncProgress) {
    const company = await prisma.company.findUnique({ where: { id: companyId } })
    const cfg = company?.sunatConfig as Record<string, string> | null
    if (!cfg?.clientId || !cfg?.clientSecretEnc || !cfg?.claveSolEnc) {
      throw new Error('Configura las credenciales SUNAT en Perfil de Empresa → Conexión SUNAT')
    }
    const ruc          = company!.ruc
    const clientSecret = decryptText(cfg.clientSecretEnc, cfg.clientSecretIv, cfg.clientSecretTag)
    const claveSol     = decryptText(cfg.claveSolEnc,     cfg.claveSolIv,     cfg.claveSolTag)

    // Intentar token CPE (scope diferente al SIRE)
    onProgress('Conectando con SUNAT CPE...')
    let tokenCpe: string | null = null
    try {
      tokenCpe = await getTokenCpe(cfg.clientId, clientSecret, ruc, cfg.usuarioSol, claveSol)
      onProgress('Token CPE obtenido. Consultando facturas...')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      onProgress(`CPE no disponible (${msg.substring(0, 80)}). Calculando detracción por notas del CSV...`)
    }

    // Facturas sin detracción (valor 0)
    const invoices = await prisma.invoice.findMany({
      where: { companyId, detraccion: { lte: 0 } },
      select: { id: true, series: true, number: true, total: true, notes: true, issueDate: true },
      orderBy: { issueDate: 'desc' },
      take: 300,
    })

    onProgress(`${invoices.length} facturas sin detracción encontradas. Procesando...`)

    let updated = 0, noDetraccion = 0, errors = 0

    for (const inv of invoices) {
      try {
        let detraccion = 0
        let dueDate: Date | null = null

        // Ruta 1: CPE API (cuando hay token disponible)
        if (tokenCpe) {
          try {
            const cpe = await getCpeDetail(ruc, tokenCpe, inv.series, inv.number)
            detraccion = cpe.detraccion
            dueDate    = cpe.dueDate
            // Si el CPE confirma que es USD y tiene el importe original, guardarlo
            if (cpe.moneda === 'USD' && cpe.importeTotal && cpe.importeTotal > 0) {
              const totalPen = Number(inv.total)
              const totalUsd = cpe.importeTotal
              const tcambio  = totalUsd > 0 ? Math.round((totalPen / totalUsd) * 10000) / 10000 : null
              await prisma.invoice.update({
                where: { id: inv.id },
                data: { totalUsd, ...(tcambio !== null && { tcambio }) },
              })
            }
          } catch {
            // CPE falló para esta factura — continúa al fallback
          }
        }

        // Ruta 2: detraccionPct del cliente
        if (detraccion === 0) {
          const clientRow = await prisma.client.findFirst({
            where: { invoices: { some: { id: inv.id } } },
            select: { detraccionPct: true },
          })
          const pct   = Number(clientRow?.detraccionPct ?? 0)
          const total = Number(inv.total)
          if (pct > 0 && total >= 700) {
            // SUNAT SPOT exige soles enteros — ROUND sin decimales
            detraccion = Math.round(total * (pct / 100))
          }
        }

        // Ruta 3: porcentaje por defecto de la empresa (sunatConfig.defaultDetraccionPct)
        if (detraccion === 0) {
          const defaultPct = Number(cfg?.defaultDetraccionPct ?? 0)
          const total      = Number(inv.total)
          if (defaultPct > 0 && total >= 700) {
            // SUNAT SPOT exige soles enteros — ROUND sin decimales
            detraccion = Math.round(total * (defaultPct / 100))
          }
        }

        if (detraccion > 0 || dueDate) {
          await prisma.invoice.update({
            where: { id: inv.id },
            data: {
              ...(detraccion > 0 && { detraccion }),
              ...(dueDate       && { dueDate }),
            },
          })
          updated++
        } else {
          noDetraccion++
        }
      } catch {
        errors++
      }
    }

    onProgress('Proceso completado.')
    return { updated, noDetraccion, errors, total: invoices.length }
  },

  // ─── Enriquecer facturas USD con monto original (XML local → CPE API) ─────────
  async enrichUsdAmounts(companyId: string, onProgress: SyncProgress) {
    const company = await prisma.company.findUnique({ where: { id: companyId } })
    const cfg = company?.sunatConfig as Record<string, string> | null
    const sunatPdfPath = cfg?.sunatPdfPath ?? ''

    // Token CPE (opcional)
    let tokenCpe: string | null = null
    if (cfg?.clientId && cfg?.clientSecretEnc && cfg?.claveSolEnc) {
      try {
        const clientSecret = decryptText(cfg.clientSecretEnc, cfg.clientSecretIv, cfg.clientSecretTag)
        const claveSol     = decryptText(cfg.claveSolEnc,     cfg.claveSolIv,     cfg.claveSolTag)
        tokenCpe = await getTokenCpe(cfg.clientId, clientSecret, company!.ruc, cfg.usuarioSol, claveSol)
        onProgress('Token CPE obtenido. Procesando facturas USD...')
      } catch {
        onProgress('CPE no disponible. Usando solo XMLs locales...')
      }
    }

    const invoices = await prisma.invoice.findMany({
      where: { companyId, currency: 'USD', totalUsd: null },
      select: { id: true, series: true, number: true, total: true },
      orderBy: { issueDate: 'desc' },
      take: 500,
    })

    onProgress(`${invoices.length} facturas USD sin monto original encontradas.`)

    let updated = 0, noSource = 0, errors = 0

    for (const inv of invoices) {
      try {
        let totalUsd: number | null = null

        // ── Fuente 1: XML local ──────────────────────────────────────────────
        if (!totalUsd && sunatPdfPath) {
          const numPadded = inv.number.padStart(8, '0')
          const xmlNames  = [
            `${inv.series}-${numPadded}.xml`,
            `${company!.ruc}-01-${inv.series}-${numPadded}.xml`,
          ]
          const xmlPath = findPdfInDir(sunatPdfPath, xmlNames)
          if (xmlPath) {
            const xml    = fs.readFileSync(xmlPath, 'utf-8')
            const parsed = parseInvoiceXmlContent(xml)
            if (parsed?.currencyId === 'USD' && parsed.totalOriginal) {
              totalUsd = parsed.totalOriginal
            }
          }
        }

        // ── Fuente 2: CPE API (SUNAT) ────────────────────────────────────────
        if (!totalUsd && tokenCpe) {
          try {
            const cpe = await getCpeDetail(company!.ruc, tokenCpe, inv.series, inv.number)
            if (cpe.moneda === 'USD' && cpe.importeTotal && cpe.importeTotal > 0) {
              totalUsd = cpe.importeTotal
            }
          } catch { /* continúa */ }
        }

        if (!totalUsd) {
          noSource++
          continue
        }

        const totalPen = Number(inv.total)
        const tcambio  = totalUsd > 0 ? Math.round((totalPen / totalUsd) * 10000) / 10000 : null

        await prisma.invoice.update({
          where: { id: inv.id },
          data: { totalUsd, ...(tcambio !== null && { tcambio }) },
        })
        updated++
      } catch {
        errors++
      }
    }

    onProgress(`Completado. ${updated} actualizadas, ${noSource} sin fuente, ${errors} errores.`)
    return { updated, noSource, errors, total: invoices.length }
  },

  // ─── Raw CPE response (debug) ─────────────────────────────────────────────────
  async rawCpeResponse(companyId: string, serie: string, numero: string) {
    const company = await prisma.company.findUnique({ where: { id: companyId } })
    const cfg = company?.sunatConfig as Record<string, string> | null
    if (!cfg?.clientId || !cfg?.clientSecretEnc || !cfg?.claveSolEnc) {
      return { error: 'Sin credenciales SUNAT' }
    }
    const ruc          = company!.ruc
    const clientSecret = decryptText(cfg.clientSecretEnc, cfg.clientSecretIv, cfg.clientSecretTag)
    const claveSol     = decryptText(cfg.claveSolEnc,     cfg.claveSolIv,     cfg.claveSolTag)

    const results: Record<string, unknown> = {}

    // 1. Try SIRE (password grant, migeigv scope — same as syncRVIE)
    try {
      const tokenSire = await getToken(cfg.clientId, clientSecret, ruc, cfg.usuarioSol, claveSol)
      const url = `${CPE_BASE}/${ruc}/comprobantes2/fcpe`
      const params = new URLSearchParams({ numRuc: ruc, codTipoComprobante: '01', serie, numero })
      const res = await fetch(`${url}?${params}`, {
        headers: { Authorization: `Bearer ${tokenSire}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(12000),
      })
      const text = await res.text()
      results['migeigv_fcpe'] = { status: res.status, body: text.substring(0, 2000) }
    } catch (e) {
      results['migeigv_fcpe'] = { error: e instanceof Error ? e.message : String(e) }
    }

    // 2. Try alternative SUNAT endpoints
    for (const scope of [SCOPE_COMPROBANTES, SCOPE_CPE_CTRL, SCOPE_CPE_CONSULT]) {
      const label = scope.split('/').pop()!
      try {
        const token = await getTokenForScope(cfg.clientId, clientSecret, ruc, cfg.usuarioSol, claveSol, scope)
        const url = `${CPE_BASE}/${ruc}/comprobantes2/fcpe`
        const params = new URLSearchParams({ numRuc: ruc, codTipoComprobante: '01', serie, numero })
        const res = await fetch(`${url}?${params}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          signal: AbortSignal.timeout(12000),
        })
        const text = await res.text()
        results[label] = { status: res.status, body: text.substring(0, 2000) }
        if (res.ok) break
      } catch (e) {
        results[label] = { error: e instanceof Error ? e.message : String(e) }
      }
    }

    // 3. Try SIRE RVIE detail endpoint (alternative to fcpe)
    try {
      const tokenSire = await getToken(cfg.clientId, clientSecret, ruc, cfg.usuarioSol, claveSol)
      // SIRE RVIE detalle de comprobante
      const numPad = numero.padStart(8, '0')
      const sireDetailUrl = `${SIRE_BASE}/libros/rvie/propuesta/web/propuesta/comprobante?ruc=${ruc}&serie=${serie}&numero=${numPad}&codTipoComp=01`
      const res2 = await fetch(sireDetailUrl, {
        headers: { Authorization: `Bearer ${tokenSire}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(12000),
      })
      const text2 = await res2.text()
      results['sire_detalle'] = { status: res2.status, body: text2.substring(0, 2000) }
    } catch (e) {
      results['sire_detalle'] = { error: e instanceof Error ? e.message : String(e) }
    }

    return { ruc, serie, numero, results }
  },

  // ─── Diagnóstico OAuth CPE ────────────────────────────────────────────────────
  async diagCpe(companyId: string) {
    const company = await prisma.company.findUnique({ where: { id: companyId } })
    const cfg = company?.sunatConfig as Record<string, string> | null
    if (!cfg?.clientId) return { error: 'Sin clientId configurado' }

    const ruc = company!.ruc
    const log: string[] = []

    log.push(`clientId: ${cfg.clientId}`)
    log.push(`usuarioSol: ${cfg.usuarioSol ?? '(vacío)'}`)
    log.push(`hasClientSecret: ${!!cfg.clientSecretEnc}`)
    log.push(`hasClaveSol: ${!!cfg.claveSolEnc}`)
    log.push(`sunatPdfPath: "${cfg.sunatPdfPath ?? ''}"`)
    log.push(`hasCpeToken: ${!!cfg.cpeToken}`)

    if (!cfg.clientSecretEnc || !cfg.claveSolEnc) {
      return { log, error: 'Faltan clientSecret o claveSol' }
    }

    const clientSecret = decryptText(cfg.clientSecretEnc, cfg.clientSecretIv, cfg.clientSecretTag)
    const claveSol     = decryptText(cfg.claveSolEnc,     cfg.claveSolIv,     cfg.claveSolTag)

    const SEC_BASE_LOCAL = 'https://api-seguridad.sunat.gob.pe/v1/clientessol'
    const results: Record<string, string> = {}

    for (const scope of [SCOPE_COMPROBANTES, SCOPE_CPE_CTRL, SCOPE_CPE_CONSULT]) {
      const label = scope.split('/').pop()!
      const tokenUrl = `${SEC_BASE_LOCAL}/${encodeURIComponent(cfg.clientId)}/oauth2/token/`
      const body = new URLSearchParams({
        grant_type: 'password', scope,
        client_id: cfg.clientId, client_secret: clientSecret,
        username: ruc + cfg.usuarioSol, password: claveSol,
      }).toString()
      try {
        const res = await fetch(tokenUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
          signal: AbortSignal.timeout(15000),
        })
        const text = await res.text()
        if (res.ok) {
          const data = JSON.parse(text) as { access_token: string; expires_in: number }
          results[label] = `✅ OK expires_in=${data.expires_in}s`

          // Probar descarga PDF con facturas reales de la DB
          if (label === 'controlcpe') {
            // Probar con la factura más antigua (julio 2026) y la más reciente
            const oldest = await prisma.invoice.findFirst({
              where: { companyId, series: { startsWith: 'E' } },
              orderBy: { issueDate: 'asc' },
            })
            const newest = await prisma.invoice.findFirst({
              where: { companyId, series: { startsWith: 'E' } },
              orderBy: { issueDate: 'desc' },
            })
            const invoices = [...(oldest ? [oldest] : []), ...(newest && newest.id !== oldest?.id ? [newest] : [])]
            const testUrls: string[] = []
            for (const inv of invoices) {
              const numShort = inv.number.replace(/^0+/, '') || inv.number
              const numPad8  = numShort.padStart(8, '0')
              // Con sufijo -2/01 (formato original) y sin sufijo (fallback)
              testUrls.push(`${ruc}-01-${inv.series}-${numShort}-2/01`)
              if (numPad8 !== numShort) testUrls.push(`${ruc}-01-${inv.series}-${numPad8}-2/01`)
              testUrls.push(`${ruc}-01-${inv.series}-${numShort}`)
              if (numPad8 !== numShort) testUrls.push(`${ruc}-01-${inv.series}-${numPad8}`)
            }
            // fallback si no hay facturas
            if (testUrls.length === 0) {
              testUrls.push(`${ruc}-01-E001-1445-2/01`)
              testUrls.push(`${ruc}-01-E001-00001445-2/01`)
            }

            for (const key of [...new Set(testUrls)].slice(0, 8)) {
              const pdfUrl = `https://api-cpe.sunat.gob.pe/v1/contribuyente/controlcpe/comprobantes/${key}`
              try {
                const pdfRes = await fetch(pdfUrl, {
                  headers: {
                    'Accept': 'application/pdf,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'es-PE,es;q=0.9',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Referer': 'https://api-cpe.sunat.gob.pe/',
                    'Origin': 'https://api-cpe.sunat.gob.pe',
                    'Authorization': `Bearer ${data.access_token}`,
                  },
                  signal: AbortSignal.timeout(15000),
                })
                const buf = Buffer.from(await pdfRes.arrayBuffer())
                const isPdf = buf[0]===0x25 && buf[1]===0x50 && buf[2]===0x44 && buf[3]===0x46
                const preview = buf.toString('utf8').substring(0, 500)
                results[`pdf:${key}`] = `HTTP ${pdfRes.status} | ${buf.length}b | isPDF=${isPdf}${isPdf ? '' : ' → ' + preview}`
              } catch (e) {
                results[`pdf:${key}`] = `Error: ${e instanceof Error ? e.message : String(e)}`
              }
            }
          }
        } else {
          results[label] = `❌ HTTP ${res.status}: ${text.substring(0, 200)}`
        }
      } catch (e) {
        results[label] = `❌ Error: ${e instanceof Error ? e.message : String(e)}`
      }
    }

    return { log, results }
  },

  // ─── Obtener PDF de factura SUNAT ────────────────────────────────────────────
  // Orden: 1) Nubefact  2) SUNAT controlcpe (emisor)  3) SUNAT consultacpe (receptor)
  // La respuesta SUNAT puede ser PDF binario directo O JSON { valArchivo: base64(ZIP(pdf)) }
  async fetchInvoicePdf(
    companyId: string,
    series: string,
    number: string,
    tipoDoc = '01',
  ): Promise<Buffer> {
    const company = await prisma.company.findUnique({ where: { id: companyId } })
    const cfg = company?.sunatConfig as Record<string, string> | null

    const tag = `[fetchInvoicePdf] ${series}-${number}`

    // ── Intento 0: archivos locales del Facturador SOL / SIRE storage ────────────
    {
      const ruc      = company!.ruc
      const numPad   = number.padStart(8, '0')
      const numShort = number.replace(/^0+/, '') || number
      const tDoc     = tipoDoc === '01' ? '01' : tipoDoc
      const candidates = [
        `${ruc}_${tDoc}_${series}-${numShort}.pdf`,
        `${ruc}-${tDoc}-${series}-${numShort}.pdf`,
        `${ruc}_${tDoc}_${series}-${numPad}.pdf`,
        `${ruc}-${tDoc}-${series}-${numPad}.pdf`,
        `${series}-${numPad}.pdf`,
        `${series}-${numShort}.pdf`,
      ]
      // Soporta múltiples rutas separadas por ; (Facturador SOL)
      const searchRoots = [
        ...(cfg?.sunatPdfPath ?? '').split(';').map(p => p.trim()).filter(Boolean),
      ]
      for (const root of searchRoots) {
        try {
          const found = findPdfInDir(root, candidates)
          if (found) {
            console.log(`${tag} PDF local encontrado: ${found}`)
            return fs.readFileSync(found)
          }
        } catch { /* continuar con siguiente ruta */ }
      }
      console.log(`${tag} PDF local no encontrado (rutas: ${searchRoots.join(', ')})`)
    }

    // ── Intento 0b: XML local → parsear → generar PDF con datos completos (código 019, líneas) ──
    {
      const ruc      = company!.ruc
      const numPad   = number.padStart(8, '0')
      const numShort = number.replace(/^0+/, '') || number
      const tDoc     = tipoDoc === '01' ? '01' : tipoDoc
      const xmlCandidates = [
        `${ruc}-${tDoc}-${series}-${numPad}.xml`,
        `${ruc}-${tDoc}-${series}-${numShort}.xml`,
        `${ruc}-${tDoc}-${series}-${numPad}.XML`,
        `${series}-${numPad}.xml`,
        `${series}-${numShort}.xml`,
      ]
      const searchRoots = [
        ...(cfg?.sunatPdfPath ?? '').split(';').map((p: string) => p.trim()).filter(Boolean),
      ]
      for (const root of searchRoots) {
        try {
          const found = findPdfInDir(root, xmlCandidates)
          if (found) {
            console.log(`${tag} XML local encontrado: ${found}`)
            const xmlContent = fs.readFileSync(found, 'utf8')
            const xmlData    = parseFullInvoiceXml(xmlContent)
            if (xmlData) {
              const co = company!
              const buf = await generateInvoicePdfFromXml(xmlData, {
                name: co.name, ruc: co.ruc,
                address: co.address ?? null,
                phone:   co.phone   ?? null,
                email:   co.email   ?? null,
              })
              console.log(`${tag} PDF generado desde XML local ${buf.length} bytes`)
              return buf
            }
          }
        } catch (e) { console.log(`${tag} XML local error: ${e}`) }
      }
      if (searchRoots.length > 0) {
        console.log(`${tag} XML local no encontrado (rutas: ${searchRoots.join(', ')})`)
      }
    }

    // Desempaca la respuesta de SUNAT: PDF directo o JSON con valArchivo (ZIP en base64)
    const extractPdf = async (res: Response, label: string): Promise<Buffer | null> => {
      const ct = res.headers.get('content-type') ?? ''
      console.log(`${tag} ${label} → HTTP ${res.status} ct="${ct}"`)
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        console.log(`${tag} ${label} error body: ${body.substring(0, 300)}`)
        return null
      }
      const raw = Buffer.from(await res.arrayBuffer())
      // Verificar magic bytes %PDF (0x25 0x50 0x44 0x46)
      if (raw.length > 4 && raw[0] === 0x25 && raw[1] === 0x50 && raw[2] === 0x44 && raw[3] === 0x46) {
        console.log(`${tag} ${label} PDF binario directo ${raw.length} bytes`)
        return raw
      }
      // Puede ser JSON { valArchivo: base64(ZIP) }
      try {
        const text = raw.toString('utf8')
        console.log(`${tag} ${label} body (no PDF): ${text.substring(0, 400)}`)
        const json = JSON.parse(text) as Record<string, unknown>
        const val  = json['valArchivo'] as string | undefined
        if (val) {
          const zipBuf = Buffer.from(val, 'base64')
          const zip    = new AdmZip(zipBuf)
          const entry  = zip.getEntries().find(e => e.entryName.toLowerCase().endsWith('.pdf'))
          if (entry) {
            const buf = entry.getData()
            console.log(`${tag} ${label} PDF extraído de valArchivo ZIP ${buf.length} bytes`)
            return buf
          }
        }
      } catch { /* raw no era JSON */ }
      return null
    }

    // Intento 1: Nubefact (PSE propio — si está configurado)
    if (cfg?.nubefactUrl && cfg?.nubefactToken) {
      const url = `${cfg.nubefactUrl.replace(/\/$/, '')}/comprobantes/${tipoDoc}-${series}-${number}.pdf`
      console.log(`${tag} Nubefact → ${url}`)
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${cfg.nubefactToken}`, Accept: 'application/pdf' },
          signal: AbortSignal.timeout(10_000),
        })
        const buf = await extractPdf(res, 'Nubefact')
        if (buf) return buf
      } catch (e) { console.log(`${tag} Nubefact excepción: ${e}`) }
    }

    // Intento 2: SUNAT CPE API — replica la lógica de SIRE stepDownloadPdfs:
    // consultacpe endpoint + tokenComprobantes (scope comprobantes) con sufijo -2/01
    const ruc      = company!.ruc
    const numPad   = number.padStart(8, '0')
    const numShort = number.replace(/^0+/, '') || number
    const suffix   = ['07', '08'].includes(tipoDoc) ? (tipoDoc === '07' ? '-7/01' : '-8/01') : '-2/01'

    const CONSULTACPE = 'https://api-cpe.sunat.gob.pe/v1/contribuyente/consultacpe'
    const CONTROLCPE  = 'https://api-cpe.sunat.gob.pe/v1/contribuyente/controlcpe'

    // URLs en el mismo orden que SIRE: con sufijo primero, sin sufijo como fallback
    const cpeUrls: { label: string; url: string }[] = [
      { label: `consultacpe/${numPad}${suffix}`,  url: `${CONSULTACPE}/comprobantes/${ruc}-${tipoDoc}-${series}-${numPad}${suffix}` },
      ...(numShort !== numPad ? [{ label: `consultacpe/${numShort}${suffix}`, url: `${CONSULTACPE}/comprobantes/${ruc}-${tipoDoc}-${series}-${numShort}${suffix}` }] : []),
      { label: `controlcpe/${numPad}${suffix}`,   url: `${CONTROLCPE}/comprobantes/${ruc}-${tipoDoc}-${series}-${numPad}${suffix}` },
      ...(numShort !== numPad ? [{ label: `controlcpe/${numShort}${suffix}`,  url: `${CONTROLCPE}/comprobantes/${ruc}-${tipoDoc}-${series}-${numShort}${suffix}` }] : []),
      // sin sufijo como último recurso
      { label: `consultacpe/${numPad}`,  url: `${CONSULTACPE}/comprobantes/${ruc}-${tipoDoc}-${series}-${numPad}` },
      { label: `controlcpe/${numPad}`,   url: `${CONTROLCPE}/comprobantes/${ruc}-${tipoDoc}-${series}-${numPad}` },
    ]

    const cpeHeaders = {
      'Accept': 'application/pdf,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-PE,es;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Referer': 'https://api-cpe.sunat.gob.pe/',
      'Origin': 'https://api-cpe.sunat.gob.pe',
    }

    // Obtener tokens: igual que SIRE usa tokenComprobantes ?? tokenRvie
    const tokenAttempts: { label: string; token: string }[] = []
    if (cfg?.cpeToken) {
      tokenAttempts.push({ label: 'cpeToken estático', token: cfg.cpeToken })
    }
    if (cfg?.clientId && cfg?.clientSecretEnc && cfg?.claveSolEnc) {
      const clientSecret = decryptText(cfg.clientSecretEnc, cfg.clientSecretIv, cfg.clientSecretTag)
      const claveSol     = decryptText(cfg.claveSolEnc,     cfg.claveSolIv,     cfg.claveSolTag)
      // SIRE usa migeigv (= SCOPE) como tokenComprobantes principal para PDFs
      for (const scope of [SCOPE, SCOPE_COMPROBANTES, SCOPE_CPE_CONSULT, SCOPE_CPE_CTRL]) {
        try {
          const t = await getTokenForScope(cfg.clientId, clientSecret, ruc, cfg.usuarioSol, claveSol, scope)
          tokenAttempts.push({ label: `OAuth(${scope.split('/').pop()})`, token: t })
        } catch (e) { console.log(`${tag} scope ${scope.split('/').pop()} falló: ${e}`) }
      }
    }

    if (tokenAttempts.length === 0) {
      console.log(`${tag} Sin token CPE disponible`)
    }

    for (const { label: tLabel, token } of tokenAttempts) {
      for (const { label, url } of cpeUrls) {
        console.log(`${tag} [${tLabel}] ${label} → ${url}`)
        try {
          const res = await fetch(url, {
            headers: { ...cpeHeaders, Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(15_000),
          })
          const buf = await extractPdf(res, `[${tLabel}] ${label}`)
          if (buf) return buf
        } catch (e) { console.log(`${tag} [${tLabel}] ${label} excepción: ${e}`) }
      }
    }

    throw new Error('PDF no disponible en SUNAT. Descargue el PDF desde el portal SOL de SUNAT.')
  },

  // ─── Importar clientes desde CSV RVIE sin crear facturas ─────────────────
  async importClientsOnly(companyId: string, csvContent: string) {
    const records = parseCsvRvie(csvContent)

    // Leer detraccionPct por defecto de la configuración de la empresa
    const company = await prisma.company.findFirst({ where: { id: companyId } })
    const cfg = company?.sunatConfig as Record<string, string> | null
    const defaultDetraccionPct = Number(cfg?.defaultDetraccionPct ?? 0)

    const uniqueByRuc = new Map<string, string>()
    for (const r of records) {
      if (r.rucCliente && !uniqueByRuc.has(r.rucCliente)) {
        uniqueByRuc.set(r.rucCliente, r.razonSocial || `RUC ${r.rucCliente}`)
      }
    }

    let created = 0, skipped = 0
    for (const [ruc, businessName] of uniqueByRuc) {
      const existing = await prisma.client.findFirst({ where: { companyId, ruc } })
      if (existing) { skipped++; continue }
      await prisma.client.create({
        data: {
          companyId, ruc, businessName, creditDays: 30, active: true,
          detraccionPct: defaultDetraccionPct,
        },
      })
      created++
    }

    return { totalFacturas: records.length, totalCompradores: uniqueByRuc.size, created, skipped }
  },

  // ─── Eliminar todas las facturas (sin tocar clientes) ────────────────────
  async deleteAllInvoices(companyId: string) {
    await prisma.workOrder.updateMany({
      where: { companyId, invoiceId: { not: null } },
      data:  { invoiceId: null },
    })
    await prisma.payment.deleteMany({ where: { invoice: { companyId } } })
    const result = await prisma.invoice.deleteMany({ where: { companyId } })
    return { deleted: result.count }
  },
}
