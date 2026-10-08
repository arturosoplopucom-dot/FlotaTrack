import { jsPDF } from 'jspdf'
import QRCode from 'qrcode'
import type { Decimal } from '@prisma/client/runtime/library'

// ─── Tipos públicos ────────────────────────────────────────────────────────────

type InvoiceData = {
  series: string
  number: string
  amount: Decimal | number
  igv: Decimal | number
  total: Decimal | number
  detraccion: Decimal | number
  detraccionCode?: string | null
  cuentaBN?: string | null
  issueDate: Date
  dueDate: Date
  status: string
  description: string | null
  notes?: string | null
  currency?: string
  client: { businessName: string; ruc: string; address?: string | null }
}

type CompanyData = {
  name: string
  ruc: string
  address: string | null
  phone: string | null
  email: string | null
}

export type XmlInvoiceLine = {
  description: string
  qty: number
  unit: string
  unitPrice: number
  lineTotal: number
}

export type XmlInvoiceData = {
  series: string
  number: string
  tipoDoc: string
  issueDate: Date
  dueDate: Date | null
  clientRuc: string
  clientName: string
  lines: XmlInvoiceLine[]
  baseImponible: number
  igv: number
  total: number
  detraccionCode: string
  detraccionPct: number
  detraccionAmount: number
  cuentaBN: string
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (v: Decimal | number | string, dec = 2) =>
  Number(v).toLocaleString('es-PE', { minimumFractionDigits: dec, maximumFractionDigits: dec })

const fmtDate = (d: Date) => {
  try { return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) }
  catch { return d.toISOString().substring(0, 10) }
}

// SPOT code → name
const SPOT: Record<string, string> = {
  '001': 'Azúcar y melaza de caña',
  '002': 'Arroz pilado',
  '003': 'Alcohol etílico',
  '004': 'Recursos hidrobiológicos',
  '005': 'Maíz amarillo duro',
  '006': 'Arena y piedra',
  '007': 'Residuos, subproductos, desechos y desperdicios',
  '009': 'Bienes exonerados del IGV',
  '010': 'Carne y despojos comestibles',
  '011': 'Aceite de pescado',
  '012': 'Harina, polvo y pellets de pescado',
  '016': 'Minerales metálicos no auríferos',
  '017': 'Bienes cubiertos por reforma agraria',
  '018': 'Primera venta de inmuebles gravada con IGV',
  '019': 'Arrendamiento de bienes muebles e inmuebles',
  '020': 'Mantenimiento y reparación de bienes muebles',
  '021': 'Movimiento de carga',
  '022': 'Otros servicios empresariales',
  '023': 'Leche cruda entera',
  '024': 'Fabricación de bienes por encargo',
  '025': 'Servicios empresariales',
  '026': 'Contratos de construcción',
  '027': 'Demás servicios gravados con el IGV',
  '028': 'Transporte de bienes vía aérea o acuática',
  '029': 'Intermediación laboral y tercerización',
  '030': 'Arrendamiento de bienes muebles',
  '031': 'Arrendamiento de inmuebles (no habitacional)',
  '032': 'Carne de vacuno',
  '033': 'Madera',
  '034': 'Oro gravado con el IGV',
  '035': 'Minerales no metálicos',
  '036': 'Plomo',
  '037': 'Caña de azúcar',
  '038': 'Servicios de transporte de carga terrestre',
  '039': 'Contratos de construcción VRAEM',
  '040': 'Intermediación laboral — nuevos regímenes',
}

// Número a letras en español (para montos de factura)
function toLetras(amount: number): string {
  const whole = Math.floor(Math.abs(amount))
  const cents = Math.round((Math.abs(amount) - whole) * 100)

  const UNITS = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
    'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE']
  const TENS  = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA']
  const HUND  = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS',
    'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS']

  function below1000(n: number): string {
    if (n === 0) return ''
    if (n === 100) return 'CIEN'
    const h = Math.floor(n / 100)
    const rem = n % 100
    const parts: string[] = []
    if (h > 0) parts.push(HUND[h])
    if (rem === 0)     { /* nada */ }
    else if (rem < 20) { parts.push(UNITS[rem]) }
    else {
      const t = Math.floor(rem / 10), u = rem % 10
      parts.push(u === 0 ? TENS[t] : `${TENS[t]} Y ${UNITS[u]}`)
    }
    return parts.join(' ')
  }

  function convert(n: number): string {
    if (n === 0) return 'CERO'
    const parts: string[] = []
    const mil = Math.floor(n / 1_000_000)
    const thou = Math.floor((n % 1_000_000) / 1000)
    const rest = n % 1000
    if (mil > 0)  parts.push(mil === 1 ? 'UN MILLÓN' : `${below1000(mil)} MILLONES`)
    if (thou > 0) parts.push(thou === 1 ? 'MIL' : `${below1000(thou)} MIL`)
    if (rest > 0) parts.push(below1000(rest))
    return parts.filter(Boolean).join(' ')
  }

  return `${convert(whole)} Y ${String(cents).padStart(2, '0')}/100`
}

// ─── Tipos internos del renderizador ──────────────────────────────────────────

type PdfLine = { qty: number; unit: string; description: string; unitPrice: number; lineTotal: number }

type PdfData = {
  series: string; number: string; tipoDoc: string
  issueDate: Date; dueDate: Date | null
  clientRuc: string; clientName: string
  lines: PdfLine[]
  baseImponible: number; igv: number; total: number
  detraccionCode: string; detraccionPct: number; detraccionAmount: number
  cuentaBN: string
  currency: string
  status?: string
}

// ─── Renderizador único formato SUNAT ─────────────────────────────────────────

async function renderSunatPdf(data: PdfData, co: CompanyData): Promise<Buffer> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const PW = 210; const PH = 297
  const ML = 10; const MR = PW - 10         // left / right margin

  // Colores
  const BLACK:  [number,number,number] = [0, 0, 0]
  const DARK:   [number,number,number] = [30, 30, 30]
  const GRAY:   [number,number,number] = [100, 100, 100]
  const LGRAY:  [number,number,number] = [200, 200, 200]
  const HLGRAY: [number,number,number] = [240, 240, 240]
  const WHITE:  [number,number,number] = [255, 255, 255]

  const setFill  = (c: [number,number,number]) => doc.setFillColor(c[0], c[1], c[2])
  const setDraw  = (c: [number,number,number]) => doc.setDrawColor(c[0], c[1], c[2])
  const setColor = (c: [number,number,number]) => doc.setTextColor(c[0], c[1], c[2])
  const fillRect = (x: number, y: number, w: number, h: number) => doc.rect(x, y, w, h, 'F')
  const strokeRect = (x: number, y: number, w: number, h: number) => doc.rect(x, y, w, h, 'S')
  const hline = (x1: number, y: number, x2: number) => doc.line(x1, y, x2, y)
  const vline = (x: number, y1: number, y2: number) => doc.line(x, y1, x, y2)

  const tipoLabel = data.tipoDoc === '03' ? 'BOLETA DE VENTA ELECTRÓNICA' : 'FACTURA ELECTRÓNICA'
  const numFmt    = data.number.padStart(8, '0')
  const currency  = data.currency === 'USD' ? 'DÓLARES AMERICANOS' : 'SOLES'
  const currSym   = data.currency === 'USD' ? 'USD' : 'S/'

  // ── ENCABEZADO (y=10…53) ─────────────────────────────────────────────────────

  // Columna izquierda: datos empresa
  let y = 14
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); setColor(DARK)
  doc.text(co.name.toUpperCase(), ML, y); y += 6

  if (co.address) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); setColor(GRAY)
    const addrLines = co.address.length > 70 ? [co.address.substring(0, 68), co.address.substring(68)] : [co.address]
    for (const line of addrLines) { doc.text(line, ML, y); y += 4.5 }
  }
  if (co.phone || co.email) {
    const info = [co.phone ? `Tlf: ${co.phone}` : '', co.email ?? ''].filter(Boolean).join('   ')
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); setColor(GRAY)
    doc.text(info, ML, y)
  }

  // Columna derecha: caja factura
  const BX = 128; const BW = 72; const BH = 40
  const BY = 10
  setDraw(DARK); doc.setLineWidth(0.8)
  strokeRect(BX, BY, BW, BH)
  doc.setLineWidth(0.3)
  hline(BX, BY + 13, BX + BW)   // línea bajo tipo
  hline(BX, BY + 23, BX + BW)   // línea bajo RUC

  const bCx = BX + BW / 2
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); setColor(DARK)
  doc.text(tipoLabel, bCx, BY + 9, { align: 'center' })

  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); setColor(DARK)
  doc.text(`RUC ${co.ruc}`, bCx, BY + 19.5, { align: 'center' })

  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); setColor(DARK)
  doc.text(`${data.series} - ${numFmt}`, bCx, BY + 34, { align: 'center' })

  // Línea separadora bajo cabecera
  y = 55
  setDraw(LGRAY); doc.setLineWidth(0.4)
  hline(ML, y, MR)

  // ── GRID DE DATOS (y=57…100) ──────────────────────────────────────────────────

  const GRID_L = ML
  const GRID_R = MR
  const GW     = GRID_R - GRID_L
  const ROW_H  = 8
  const COL2_X = 120   // segunda columna en fila partida
  doc.setLineWidth(0.25); setDraw(LGRAY)

  function gridRow(label: string, value: string, yy: number, halfRight = false, labelX = GRID_L + 2) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); setColor(GRAY)
    doc.text(label, labelX, yy + 2.5)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); setColor(DARK)
    const maxW = halfRight ? (GRID_R - labelX - 4) : (GW - labelX - GRID_L - 2)
    if (value.length > 0) doc.text(value, labelX, yy + 6.2, { maxWidth: maxW })
    hline(GRID_L, yy + ROW_H, GRID_R)
  }

  y = 57

  // Fila 1: fecha emisión | forma pago
  const formaPago = data.dueDate && data.issueDate &&
    data.dueDate.toDateString() !== data.issueDate.toDateString() ? 'CRÉDITO' : 'CONTADO'

  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); setColor(GRAY)
  doc.text('Fecha de Emisión:', GRID_L + 2, y + 2.5)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); setColor(DARK)
  doc.text(fmtDate(data.issueDate), GRID_L + 2, y + 6.2)

  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); setColor(GRAY)
  doc.text('Forma de Pago:', COL2_X + 2, y + 2.5)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); setColor(DARK)
  doc.text(formaPago, COL2_X + 2, y + 6.2)

  setDraw(LGRAY); hline(GRID_L, y + ROW_H, GRID_R)
  vline(COL2_X, y, y + ROW_H)
  y += ROW_H

  // Fila 2: señor(es)
  gridRow('Señor(es):', data.clientName, y); y += ROW_H

  // Fila 3: RUC cliente
  gridRow('RUC:', data.clientRuc, y); y += ROW_H

  // Fila 4: tipo moneda
  gridRow('Tipo de Moneda:', currency, y); y += ROW_H

  // Borde exterior del grid
  setDraw(LGRAY); doc.setLineWidth(0.3)
  strokeRect(GRID_L, 57, GW, y - 57)

  y += 4

  // ── TABLA DE ITEMS ────────────────────────────────────────────────────────────

  const COL_QTY  = ML;         const COL_QTY_W  = 18
  const COL_UNIT = ML + 18;    const COL_UNIT_W = 28
  const COL_DESC = ML + 46;    const COL_DESC_W = 100
  const COL_VALU = ML + 146;   const COL_VALU_W = MR - (ML + 146)

  const TABLE_TOP = y
  const THEAD_H = 7

  // Cabecera tabla — fondo gris
  setFill(HLGRAY); fillRect(ML, y, MR - ML, THEAD_H)
  setDraw(LGRAY); doc.setLineWidth(0.3)
  strokeRect(ML, y, MR - ML, THEAD_H)

  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); setColor(DARK)
  doc.text('Cantidad',     COL_QTY  + COL_QTY_W  / 2, y + 4.5, { align: 'center' })
  doc.text('Unidad',       COL_UNIT + COL_UNIT_W / 2, y + 4.5, { align: 'center' })
  doc.text('Descripción',  COL_DESC + 2,               y + 4.5)
  doc.text('Valor Unitario', MR - 2,                   y + 4.5, { align: 'right' })
  y += THEAD_H

  // Líneas verticales de la cabecera
  setDraw(LGRAY)
  vline(COL_UNIT, TABLE_TOP, TABLE_TOP + THEAD_H)
  vline(COL_DESC, TABLE_TOP, TABLE_TOP + THEAD_H)
  vline(COL_VALU, TABLE_TOP, TABLE_TOP + THEAD_H)

  // Filas de items
  const ROW_ITEM_H = 8
  for (let i = 0; i < data.lines.length; i++) {
    const ln = data.lines[i]
    const rowY = y

    if (i % 2 === 1) { setFill(HLGRAY); fillRect(ML, rowY, MR - ML, ROW_ITEM_H) }

    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); setColor(DARK)
    doc.text(fmt(ln.qty), COL_QTY + COL_QTY_W - 2, rowY + 5.5, { align: 'right' })
    doc.text(ln.unit.toUpperCase(), COL_UNIT + COL_UNIT_W / 2, rowY + 5.5, { align: 'center' })

    const desc = ln.description.length > 60 ? ln.description.substring(0, 58) + '…' : ln.description
    doc.text(desc, COL_DESC + 2, rowY + 5.5)
    doc.text(`${currSym} ${fmt(ln.unitPrice)}`, MR - 2, rowY + 5.5, { align: 'right' })

    setDraw(LGRAY); doc.setLineWidth(0.2)
    hline(ML, rowY + ROW_ITEM_H, MR)
    vline(COL_UNIT, rowY, rowY + ROW_ITEM_H)
    vline(COL_DESC, rowY, rowY + ROW_ITEM_H)
    vline(COL_VALU, rowY, rowY + ROW_ITEM_H)

    y += ROW_ITEM_H
  }

  // Borde exterior de la tabla
  setDraw(LGRAY); doc.setLineWidth(0.3)
  strokeRect(ML, TABLE_TOP, MR - ML, y - TABLE_TOP)

  y += 5

  // ── SECCIÓN INFERIOR (izq: letras | der: totales) ─────────────────────────────

  const BOT_L = ML
  const BOT_SPLIT = 105        // columna derecha desde aquí
  const BOT_R = MR

  const TOT_LABEL_X = BOT_SPLIT + 2
  const TOT_VAL_X   = BOT_R - 2
  const TOT_ROW_H   = 6.2
  const TOTAL_ROWS: [string, string][] = [
    ['Sub Total Ventas:',        `${currSym} ${fmt(data.baseImponible)}`],
    ['Anticipos:',               `${currSym} 0.00`],
    ['Descuentos:',              `${currSym} 0.00`],
    ['Valor Venta:',             `${currSym} ${fmt(data.baseImponible)}`],
    ['ISC:',                     `${currSym} 0.00`],
    [`IGV (${fmt(data.igv / data.baseImponible * 100, 2)}%):`, `${currSym} ${fmt(data.igv)}`],
    ['Otros Cargos:',            `${currSym} 0.00`],
    ['Otros Tributos:',          `${currSym} 0.00`],
    ['Monto de redondeo:',       `${currSym} 0.00`],
  ]

  const totBlockH = TOTAL_ROWS.length * TOT_ROW_H + 10  // +10 para fila TOTAL
  const botY = y

  // Columna izquierda: letras
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); setColor(GRAY)
  doc.text('Valor de Venta de Operaciones Gratuitas:', BOT_L, botY + 5)
  doc.setFont('helvetica', 'bold'); setColor(DARK)
  doc.text(`${currSym} 0.00`, BOT_L + 90, botY + 5, { align: 'right' })

  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); setColor(GRAY)
  doc.text('SON:', BOT_L, botY + 13)
  doc.setFont('helvetica', 'normal'); setColor(DARK)
  doc.text(`${toLetras(Number(data.total))} ${currency}`,
    BOT_L + 8, botY + 13, { maxWidth: BOT_SPLIT - BOT_L - 10 })

  // Columna derecha: totales
  let ty = botY
  for (const [label, val] of TOTAL_ROWS) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); setColor(GRAY)
    doc.text(label, TOT_LABEL_X, ty + 4.5)
    doc.setFont('helvetica', 'normal'); setColor(DARK)
    doc.text(val, TOT_VAL_X, ty + 4.5, { align: 'right' })
    setDraw(LGRAY); doc.setLineWidth(0.2)
    hline(BOT_SPLIT, ty + TOT_ROW_H, BOT_R)
    ty += TOT_ROW_H
  }

  // Fila IMPORTE TOTAL
  setFill(HLGRAY); fillRect(BOT_SPLIT, ty, BOT_R - BOT_SPLIT, 9)
  setDraw(LGRAY); doc.setLineWidth(0.4)
  strokeRect(BOT_SPLIT, ty, BOT_R - BOT_SPLIT, 9)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); setColor(DARK)
  doc.text('IMPORTE TOTAL:', TOT_LABEL_X, ty + 6)
  doc.text(`${currSym} ${fmt(data.total)}`, TOT_VAL_X, ty + 6, { align: 'right' })

  y = Math.max(ty + 14, botY + 28)

  // ── DETRACCIÓN ────────────────────────────────────────────────────────────────

  if (data.detraccionAmount > 0) {
    const detrCode  = data.detraccionCode || ''
    const detrName  = SPOT[detrCode] ?? `Código ${detrCode}`
    const detrPct   = data.detraccionPct > 0 ? data.detraccionPct
      : Math.round((data.detraccionAmount / data.total) * 10000) / 100
    const neto      = data.total - data.detraccionAmount
    const cuentaBN  = data.cuentaBN || ''

    const DETR_H = cuentaBN ? 50 : 46
    setDraw(LGRAY); doc.setLineWidth(0.4)
    strokeRect(ML, y, MR - ML, DETR_H)

    // Título con fondo
    setFill(HLGRAY); fillRect(ML, y, MR - ML, 8)
    setDraw(LGRAY); hline(ML, y + 8, MR)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); setColor(DARK)
    doc.text('DATOS DE LA OPERACIÓN SUJETA A DETRACCIÓN', ML + (MR - ML) / 2, y + 5.5, { align: 'center' })

    const DL = ML + 3; const DR = MR - 3
    const DX2 = 118   // segunda columna de datos detr.
    let dy = y + 13

    const detrRow = (label: string, value: string, x2 = false, valBold = false) => {
      const lx = x2 ? DX2 + 2 : DL
      const vx = x2 ? DR : DX2 - 3
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); setColor(GRAY)
      doc.text(label, lx, dy)
      doc.setFont('helvetica', valBold ? 'bold' : 'normal'); doc.setFontSize(8); setColor(DARK)
      const maxW = x2 ? (DR - DX2 - 4) : (DX2 - DL - 4)
      doc.text(value, x2 ? vx : lx, x2 ? dy + 4.5 : dy + 4.5, { maxWidth: maxW, align: x2 ? 'right' : 'left' })
    }

    // Leyenda (full width)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); setColor(GRAY)
    doc.text('Leyenda:', DL, dy)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); setColor(DARK)
    doc.text('OPERACIÓN SUJETA AL SISTEMA DE PAGO DE OBLIGACIONES TRIBUTARIAS CON EL GOBIERNO CENTRAL',
      DL + 18, dy + 1, { maxWidth: DR - DL - 20 })
    dy += 10

    // Bien o Servicio | medio pago (dos columnas)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); setColor(GRAY)
    doc.text('Bien o Servicio:', DL, dy)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); setColor(DARK)
    const bsText = detrCode ? `${detrCode} - ${detrName}` : detrName
    doc.text(bsText, DL, dy + 4.5, { maxWidth: DX2 - DL - 4 })

    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); setColor(GRAY)
    doc.text('Medio de Pago:', DX2 + 2, dy)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); setColor(DARK)
    doc.text('003 - Transferencia de fondos', DX2 + 2, dy + 4.5)
    dy += 10

    // Nro. Cta. BN
    if (cuentaBN) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); setColor(GRAY)
      doc.text('Nro. Cta. Banco de la Nación:', DL, dy)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); setColor(DARK)
      doc.text(cuentaBN, DL, dy + 4.5)
      dy += 10
    }

    // Porcentaje | Monto
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); setColor(GRAY)
    doc.text('Porcentaje de Detracción:', DL, dy)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); setColor(DARK)
    doc.text(`${fmt(detrPct, 2)} %`, DL, dy + 5)

    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); setColor(GRAY)
    doc.text('Monto de Detracción:', DX2 + 2, dy)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); setColor(DARK)
    doc.text(`${currSym} ${fmt(data.detraccionAmount)}`, DR, dy + 5, { align: 'right' })

    y += DETR_H + 3

    // Crédito: monto neto
    setDraw(LGRAY); doc.setLineWidth(0.4)
    strokeRect(ML, y, MR - ML, 9)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); setColor(GRAY)
    doc.text('Monto Neto Pendiente de Pago:', ML + 3, y + 5.5)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); setColor(DARK)
    doc.text(`${currSym} ${fmt(neto)}`, ML + 78, y + 5.5)

    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); setColor(GRAY)
    doc.text('Total de Cuotas:', MR - 75, y + 5.5)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); setColor(DARK)
    doc.text('1', MR - 3, y + 5.5, { align: 'right' })

    y += 13

    // Cuotas table
    const DUE = data.dueDate ? fmtDate(data.dueDate) : fmtDate(new Date(data.issueDate.getTime() + 30 * 86400000))

    setFill(HLGRAY); fillRect(ML, y, MR - ML, 6)
    setDraw(LGRAY); doc.setLineWidth(0.3)
    strokeRect(ML, y, MR - ML, 6)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); setColor(DARK)
    const CX1 = ML + 20, CX2 = ML + 90, CX3 = ML + 150
    doc.text('Nº Cuota', ML + 10, y + 4, { align: 'center' })
    doc.text('Fec. Vencimiento', CX1 + 35, y + 4, { align: 'center' })
    doc.text('Monto', CX3 + 10, y + 4, { align: 'center' })
    vline(CX1, y, y + 6); vline(CX3, y, y + 6)
    y += 6

    setDraw(LGRAY)
    strokeRect(ML, y, MR - ML, 7)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); setColor(DARK)
    doc.text('01', ML + 10, y + 5, { align: 'center' })
    doc.text(DUE, CX1 + 35, y + 5, { align: 'center' })
    doc.text(`${currSym} ${fmt(neto)}`, CX3 + 10, y + 5, { align: 'center' })
    vline(CX1, y, y + 7); vline(CX3, y, y + 7)
    y += 11
  }

  // ── QR + PIE ──────────────────────────────────────────────────────────────────

  const qrY = Math.max(y + 6, PH - 42)
  try {
    const qrStr = [
      co.ruc, data.tipoDoc === '03' ? '03' : '01',
      data.series, numFmt,
      data.igv.toFixed(2), data.total.toFixed(2),
      data.issueDate.toISOString().substring(0, 10),
      '6', data.clientRuc,
    ].join('|')
    const qrBuf = await QRCode.toBuffer(qrStr, { width: 90, margin: 1 })
    doc.addImage(qrBuf as unknown as string, 'PNG', ML, qrY, 24, 24)
  } catch { /* sin QR */ }

  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); setColor(DARK)
  doc.text('Representación Impresa del Comprobante de Pago Electrónico', ML + 28, qrY + 5)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); setColor(GRAY)
  doc.text('Verifique este documento en:', ML + 28, qrY + 9.5)
  doc.setTextColor(37, 99, 235)
  doc.text('https://ww1.sunat.gob.pe/ol-ti-itconsultaunificadalibre/', ML + 28, qrY + 14)
  setColor(GRAY)
  doc.text(`Emisor: ${co.ruc} — ${co.name}`, ML + 28, qrY + 18.5)
  doc.text(`Adquirente: ${data.clientRuc} — ${data.clientName}`, ML + 28, qrY + 22.5)

  // Pie de página
  setDraw(LGRAY); doc.setLineWidth(0.3); hline(ML, PH - 8, MR)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); setColor(LGRAY)
  doc.text(`${data.series}-${numFmt}  ·  ${co.name}  ·  RUC ${co.ruc}`, ML, PH - 4)
  doc.text(`Emitido: ${fmtDate(new Date())}`, MR, PH - 4, { align: 'right' })

  return Buffer.from(doc.output('arraybuffer'))
}

// ─── Exportaciones públicas ────────────────────────────────────────────────────

export async function generateInvoicePdfServer(
  inv: InvoiceData,
  company: CompanyData,
): Promise<Buffer> {
  const total         = Number(inv.total)
  const baseImponible = Number(inv.amount) > 0 ? Number(inv.amount) : total / 1.18
  const igv           = Number(inv.igv) > 0 ? Number(inv.igv) : total - baseImponible
  const detracAmt     = Number(inv.detraccion ?? 0)
  const detracCode    = inv.detraccionCode ?? ''
  const detracPct     = detracAmt > 0
    ? Math.round((detracAmt / total) * 10000) / 100
    : 0

  const line: PdfLine = {
    qty:       1,
    unit:      'ZZ',
    description: inv.description ?? `${inv.series}-${inv.number.padStart(8, '0')}`,
    unitPrice:   baseImponible,
    lineTotal:   baseImponible,
  }

  return renderSunatPdf({
    series:           inv.series,
    number:           inv.number,
    tipoDoc:          inv.series.startsWith('B') ? '03' : '01',
    issueDate:        inv.issueDate,
    dueDate:          inv.dueDate ?? null,
    clientRuc:        inv.client.ruc,
    clientName:       inv.client.businessName,
    lines:            [line],
    baseImponible,
    igv,
    total,
    detraccionCode:   detracCode,
    detraccionPct:    detracPct,
    detraccionAmount: detracAmt,
    cuentaBN:         inv.cuentaBN ?? '',
    currency:         inv.currency ?? 'PEN',
    status:           inv.status,
  }, company)
}

export async function generateInvoicePdfFromXml(
  inv: XmlInvoiceData,
  company: CompanyData,
): Promise<Buffer> {
  return renderSunatPdf({
    series:           inv.series,
    number:           inv.number,
    tipoDoc:          inv.tipoDoc,
    issueDate:        inv.issueDate,
    dueDate:          inv.dueDate,
    clientRuc:        inv.clientRuc,
    clientName:       inv.clientName,
    lines:            inv.lines,
    baseImponible:    inv.baseImponible,
    igv:              inv.igv,
    total:            inv.total,
    detraccionCode:   inv.detraccionCode,
    detraccionPct:    inv.detraccionPct,
    detraccionAmount: inv.detraccionAmount,
    cuentaBN:         inv.cuentaBN,
    currency:         'PEN',
  }, company)
}
