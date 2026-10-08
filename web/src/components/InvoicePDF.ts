import { jsPDF } from 'jspdf'
import QRCode from 'qrcode'
import type { Invoice } from '../hooks/useInvoices'
import type { CompanyProfile } from '../hooks/useFlota'

// ── Colores SUNAT ──────────────────────────────────────────────────────────────
const BLACK  = [0,   0,   0]   as [number, number, number]
const DARK   = [30,  30,  30]  as [number, number, number]
const GRAY   = [100, 100, 100] as [number, number, number]
const LGRAY  = [220, 220, 220] as [number, number, number]
const WHITE  = [255, 255, 255] as [number, number, number]
const AMBER  = [180,  83,   9] as [number, number, number]
const AMBER_BG = [255, 248, 220] as [number, number, number]
const GREEN  = [21, 128,  61]  as [number, number, number]

const fmt = (n: number | string) =>
  Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtDate = (iso: string) => {
  try { return new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) }
  catch { return iso }
}

// ── Monto en letras (formato peruano) ─────────────────────────────────────────
const UNIDADES = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
  'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE']
const DECENAS  = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA']
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS',
  'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS']

function _numToWords(n: number): string {
  if (n === 0) return 'CERO'
  if (n === 100) return 'CIEN'
  let r = ''
  if (n >= 1000000) {
    const m = Math.floor(n / 1000000)
    r += (m === 1 ? 'UN MILLÓN' : _numToWords(m) + ' MILLONES') + ' '
    n %= 1000000
  }
  if (n >= 1000) {
    const th = Math.floor(n / 1000)
    r += (th === 1 ? 'MIL' : _numToWords(th) + ' MIL') + ' '
    n %= 1000
  }
  if (n >= 100) { r += CENTENAS[Math.floor(n / 100)] + ' '; n %= 100 }
  if (n >= 20)  { r += DECENAS[Math.floor(n / 10)] + (n % 10 > 0 ? ' Y ' + UNIDADES[n % 10] : '') + ' ' }
  else if (n > 0) r += UNIDADES[n] + ' '
  return r.trim()
}

function amountToWords(total: number, currency: 'PEN' | 'USD'): string {
  const int  = Math.floor(total)
  const cents = Math.round((total - int) * 100)
  const label = currency === 'PEN' ? 'SOLES' : 'DÓLARES AMERICANOS'
  return `SON: ${_numToWords(int)} Y ${String(cents).padStart(2, '0')}/100 ${label}`
}

// ── QR SUNAT: formato para representación impresa ─────────────────────────────
function buildSunatQrData(inv: Invoice, ruc: string): string {
  const igv    = Number(inv.igv) || (Number(inv.total) - Number(inv.amount))
  const fecha  = inv.issueDate ? inv.issueDate.substring(0, 10) : ''
  const tipDoc = inv.series.startsWith('F') || inv.series.startsWith('E') ? '01' : '03'
  return [ruc, tipDoc, inv.series, inv.number.padStart(8, '0'),
    igv.toFixed(2), Number(inv.total).toFixed(2), fecha, '6', inv.client.ruc].join('|')
}

function calcDetraccionPct(detraccion: number, total: number): number {
  if (total <= 0 || detraccion <= 0) return 0
  const raw = (detraccion / total) * 100
  const rates = [4, 6, 9, 10, 12, 15]
  const closest = rates.reduce((p, c) => Math.abs(c - raw) < Math.abs(p - raw) ? c : p)
  return Math.abs(closest - raw) < 2 ? closest : Math.round(raw * 100) / 100
}

// ── Tipo de documento ──────────────────────────────────────────────────────────
const TIPO_DOC: Record<string, string> = {
  F: 'FACTURA ELECTRÓNICA', B: 'BOLETA DE VENTA ELECTRÓNICA', E: 'FACTURA ELECTRÓNICA',
}

async function buildInvoicePDF(inv: Invoice, company: CompanyProfile): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W  = 210
  const L  = 12          // margen izquierdo
  const R  = W - L       // margen derecho
  const CW = R - L       // ancho contenido
  const cur = inv.currency

  const setC  = (c: [number,number,number]) => doc.setTextColor(c[0], c[1], c[2])
  const setF  = (c: [number,number,number]) => doc.setFillColor(c[0], c[1], c[2])
  const setD  = (c: [number,number,number]) => doc.setDrawColor(c[0], c[1], c[2])
  const bdr   = (x: number, y: number, w: number, h: number) => { setD(BLACK); doc.setLineWidth(0.3); doc.rect(x, y, w, h, 'S') }
  const fill  = (c: [number,number,number], x: number, y: number, w: number, h: number) => { setF(c); doc.rect(x, y, w, h, 'F') }
  const hline = (x1: number, y: number, x2: number) => { setD(LGRAY); doc.setLineWidth(0.2); doc.line(x1, y, x2, y) }
  const vline = (x: number, y1: number, y2: number) => { setD(LGRAY); doc.setLineWidth(0.2); doc.line(x, y1, x, y2) }

  const tipoLetra = inv.series.charAt(0).toUpperCase()
  const tipoLabel = TIPO_DOC[tipoLetra] ?? 'COMPROBANTE DE PAGO'
  const serieNum  = `${inv.series}-${inv.number.padStart(8, '0')}`
  const baseAmt   = Number(inv.amount) > 0 ? Number(inv.amount) : Number(inv.total) / 1.18
  const igvAmt    = Number(inv.igv)    > 0 ? Number(inv.igv)    : Number(inv.total) - baseAmt
  const totalAmt  = Number(inv.total)
  const detraccion = Number(inv.detraccion ?? 0)

  // ══════════════════════════════════════════════════════════════════
  // BLOQUE 1 — CABECERA: Emisor (izq) + Cuadro doc (der)
  // ══════════════════════════════════════════════════════════════════
  let y = 12
  const BOX_RIGHT_W = 65
  const BOX_RIGHT_X = R - BOX_RIGHT_W

  // Cuadro derecho con borde grueso — tipo SUNAT
  setD(BLACK); doc.setLineWidth(0.6)
  doc.rect(BOX_RIGHT_X, y, BOX_RIGHT_W, 28, 'S')

  // Línea separadora interna horizontal
  doc.setLineWidth(0.3)
  doc.line(BOX_RIGHT_X, y + 9, BOX_RIGHT_X + BOX_RIGHT_W, y + 9)
  doc.line(BOX_RIGHT_X, y + 17, BOX_RIGHT_X + BOX_RIGHT_W, y + 17)

  // Contenido del cuadro
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); setC(DARK)
  doc.text(tipoLabel, BOX_RIGHT_X + BOX_RIGHT_W / 2, y + 6, { align: 'center' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); setC(DARK)
  doc.text(`RUC: ${company.ruc}`, BOX_RIGHT_X + BOX_RIGHT_W / 2, y + 14, { align: 'center' })
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); setC(DARK)
  doc.text(serieNum, BOX_RIGHT_X + BOX_RIGHT_W / 2, y + 24, { align: 'center' })

  // Bloque izquierdo — datos del emisor
  const leftW = BOX_RIGHT_X - L - 4
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); setC(DARK)
  doc.text(company.name, L, y + 7, { maxWidth: leftW })

  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); setC(GRAY)
  let ey = y + 13
  if (company.address) {
    const addressLines = doc.splitTextToSize(company.address, leftW)
    doc.text(addressLines, L, ey)
    ey += addressLines.length * 4.5
  }
  if (company.phone) { doc.text(`Teléfono: ${company.phone}`, L, ey); ey += 4.5 }
  if (company.email) { doc.text(company.email, L, ey) }

  y += 34

  // ══════════════════════════════════════════════════════════════════
  // BLOQUE 2 — DATOS DEL COMPROBANTE Y CLIENTE
  // ══════════════════════════════════════════════════════════════════
  // Tabla estilo SUNAT: filas con borde y etiqueta:valor
  const ROW_H = 7.5
  const LBL_W = 50   // ancho etiqueta en fila simple
  const VAL_X = L + LBL_W + 2

  // Fila de una columna
  const drawRow1 = (label: string, val: string, multiLine?: boolean) => {
    const textLines = multiLine ? doc.splitTextToSize(val, CW - LBL_W - 4) : [val]
    const rh = multiLine ? Math.max(ROW_H, textLines.length * 4.2 + 4) : ROW_H
    bdr(L, y, CW, rh)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); setC(DARK)
    doc.text(label, L + 2, y + 5)
    doc.setFont('helvetica', 'normal')
    doc.text(textLines, VAL_X, y + 5)
    y += rh
  }

  // Fila de dos columnas separadas al 55/45
  const HALF = CW * 0.55
  const drawRow2 = (label1: string, val1: string, label2: string, val2: string) => {
    bdr(L, y, CW, ROW_H)
    vline(L + HALF, y, y + ROW_H)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); setC(DARK)
    doc.text(label1, L + 2, y + 5)
    doc.setFont('helvetica', 'normal'); setC(DARK)
    doc.text(val1, L + HALF - 2, y + 5, { align: 'right', maxWidth: HALF - LBL_W - 4 })
    doc.setFont('helvetica', 'bold')
    doc.text(label2, L + HALF + 2, y + 5)
    doc.setFont('helvetica', 'normal')
    doc.text(val2, R, y + 5, { align: 'right' })
    y += ROW_H
  }


  const formasPago: Record<string, string> = { PENDING: 'Crédito', PARTIAL: 'Crédito', OVERDUE: 'Crédito', PAID: 'Contado' }
  drawRow2('Fecha de Emisión :', fmtDate(inv.issueDate), 'Forma de pago :', formasPago[inv.status] ?? 'Crédito')
  drawRow1('Señor(es) :', inv.client.businessName)
  drawRow1('RUC :', inv.client.ruc)
  if (inv.client.email) drawRow1('E-mail :', inv.client.email)
  const monedaLabel = cur === 'PEN' ? 'SOLES' : 'DÓLARES AMERICANOS'
  drawRow1('Tipo de Moneda :', monedaLabel)
  if (inv.description) drawRow1('Observación :', inv.description, true)

  y += 4

  // ══════════════════════════════════════════════════════════════════
  // BLOQUE 3 — TABLA DE ÍTEMS
  // ══════════════════════════════════════════════════════════════════
  // Columnas: Cantidad(18) | Unidad(22) | Descripción(grow) | Valor Unitario(35 right-aligned)
  const C_QTY  = L
  const C_UND  = L + 18
  const C_DESC = L + 40
  const C_VU   = R         // Valor Unitario: right-aligned al borde derecho

  // Cabecera de tabla
  fill(DARK, L, y, CW, 7)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); setC(WHITE)
  doc.text('Cantidad',      C_QTY  + 1,  y + 5)
  doc.text('Unidad',        C_UND  + 1,  y + 5)
  doc.text('Descripción',   C_DESC + 1,  y + 5)
  doc.text('Valor Unitario', C_VU,       y + 5, { align: 'right' })
  y += 7

  // Líneas verticales de cabecera
  setD(LGRAY); doc.setLineWidth(0.2)
  doc.line(C_UND,  y - 7, C_UND,  y)
  doc.line(C_DESC, y - 7, C_DESC, y)

  // Ítems
  const items = inv.workOrders && inv.workOrders.length > 0
    ? inv.workOrders.map(wo => ({
        qty: '1.00',
        unit: 'SERVICIO',
        desc: `${wo.description ?? wo.number}${wo.equipment ? ' — ' + wo.equipment.name : ''}`,
        vu: fmt(Number(wo.subtotal) / 1.18),
      }))
    : [{
        qty: '1.00',
        unit: 'UNIDAD',
        desc: inv.description ?? `Servicios — ${serieNum}`,
        vu: fmt(baseAmt),
      }]

  items.forEach((item, idx) => {
    const descLines = doc.splitTextToSize(item.desc, C_VU - C_DESC - 32)
    const rowH = Math.max(8, descLines.length * 4 + 4)
    const bg = idx % 2 === 0 ? [248, 250, 252] as [number,number,number] : WHITE
    fill(bg, L, y, CW, rowH)
    bdr(L, y, CW, rowH)
    doc.line(C_UND,  y, C_UND,  y + rowH)
    doc.line(C_DESC, y, C_DESC, y + rowH)

    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); setC(DARK)
    doc.text(item.qty,   C_QTY  + 1,  y + 5.5)
    doc.text(item.unit,  C_UND  + 1,  y + 5.5)
    doc.text(descLines,  C_DESC + 1,  y + 5.5)
    doc.text(item.vu,    C_VU,        y + 5.5, { align: 'right' })
    y += rowH
  })

  y += 3

  // ── Valor de Venta de Operaciones Gratuitas (campo SUNAT estándar) ─────────
  bdr(L, y, CW / 2, 7)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); setC(GRAY)
  doc.text('Valor de Venta de Operaciones Gratuitas :', L + 2, y + 5)
  doc.setFont('helvetica', 'bold'); setC(DARK)
  doc.text(`S/ 0.00`, L + CW / 2 - 2, y + 5, { align: 'right' })
  y += 10

  // ══════════════════════════════════════════════════════════════════
  // BLOQUE 4 — MONTO EN LETRAS + TOTALES
  // ══════════════════════════════════════════════════════════════════
  const TOT_W = 80
  const TOT_X = R - TOT_W
  const letrasY = y

  // Monto en letras (izquierda)
  const letras = amountToWords(totalAmt, cur)
  const letrasLines = doc.splitTextToSize(letras, TOT_X - L - 4)
  fill([248, 248, 248], L, y, TOT_X - L - 4, letrasLines.length * 4.5 + 6)
  bdr(L, y, TOT_X - L - 4, letrasLines.length * 4.5 + 6)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); setC(DARK)
  doc.text(letrasLines, L + 2, y + 5)

  // Tabla de totales (derecha) — estilo SUNAT
  const igvPct = baseAmt > 0 ? Math.round((igvAmt / baseAmt) * 100) : 18
  const TROW_H = 6
  type TotalRow = [string, string, boolean?]
  const totalRows: TotalRow[] = [
    ['Sub Total Ventas :',         `S/ ${fmt(baseAmt)}`],
    ['Anticipos :',                `S/ 0.00`],
    ['Descuentos :',               `S/ 0.00`],
    ['Valor Venta :',              `S/ ${fmt(baseAmt)}`],
    ['ISC :',                      `S/ 0.00`],
    [`IGV (${igvPct}.00%) :`,      `S/ ${fmt(igvAmt)}`],
    ['Otros Cargos :',             `S/ 0.00`],
    ['Otros Tributos :',           `S/ 0.00`],
    ['Monto de redondeo :',        `S/ 0.00`],
    ['Importe Total :',            `S/ ${fmt(totalAmt)}`, true],
  ]

  totalRows.forEach(([label, value, bold]) => {
    const isTotal = bold === true
    if (isTotal) {
      fill(DARK, TOT_X, y, TOT_W, TROW_H + 1)
      bdr(TOT_X, y, TOT_W, TROW_H + 1)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); setC(WHITE)
      doc.text(label, TOT_X + 2, y + TROW_H - 1)
      doc.text(value, R, y + TROW_H - 1, { align: 'right' })
      y += TROW_H + 1
    } else {
      bdr(TOT_X, y, TOT_W, TROW_H)
      hline(TOT_X, y, TOT_X + TOT_W)
      doc.setFont('helvetica', label.startsWith('Valor') ? 'bold' : 'normal')
      doc.setFontSize(7.5); setC(DARK)
      doc.text(label, TOT_X + 2, y + TROW_H - 1.5)
      doc.text(value, R, y + TROW_H - 1.5, { align: 'right' })
      y += TROW_H
    }
  })

  y = Math.max(y, letrasY + letrasLines.length * 4.5 + 8) + 4

  // ══════════════════════════════════════════════════════════════════
  // BLOQUE 5 — DETRACCIÓN (si aplica)
  // ══════════════════════════════════════════════════════════════════
  // ── BLOQUE 5A: Información de la detracción ──────────────────────────────────
  const neto = detraccion > 0 ? totalAmt - detraccion : totalAmt

  if (detraccion > 0) {
    const pct = calcDetraccionPct(detraccion, totalAmt)

    // Caja ámbar
    setF(AMBER_BG); setD([210, 160, 30]); doc.setLineWidth(0.4)
    doc.rect(L, y, CW, 40, 'FD')

    // Título
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); setC(DARK)
    doc.text('Información de la detracción', L + 3, y + 6)
    doc.setLineWidth(0.2); setD([210, 160, 30])
    doc.line(L, y + 8, L + CW, y + 8)

    // Filas label:valor
    const detRow = (label: string, value: string, iy: number) => {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); setC(GRAY)
      doc.text(label, L + 3, iy)
      doc.setFont('helvetica', 'bold'); setC(DARK)
      doc.text(value, L + 52, iy, { maxWidth: CW - 56 })
    }
    detRow('Leyenda :',
      'Operación sujeta al Sistema de Pago de Obligaciones Tributarias con el Gobierno Central',
      y + 14)
    detRow('Bien o Servicio :', '019  Arrendamiento de bienes muebles e inmuebles', y + 21)
    detRow('Medio Pago :', '003  Transferencia de fondos', y + 28)

    // Última línea: Nro. Cta. | Porcentaje | Monto — en una sola fila
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); setC(GRAY)
    doc.text('Nro. Cta. Banco de la Nación :', L + 3, y + 36)
    doc.setFont('helvetica', 'bold'); setC(DARK)
    doc.text('00030092120', L + 58, y + 36)
    doc.setFont('helvetica', 'normal'); setC(GRAY)
    doc.text('Porcentaje de detracción:', L + 94, y + 36)
    doc.setFont('helvetica', 'bold'); setC(DARK)
    doc.text(pct.toFixed(2), L + 140, y + 36)
    doc.setFont('helvetica', 'normal'); setC(GRAY)
    doc.text('Monto detracción:', L + 148, y + 36)
    doc.setFont('helvetica', 'bold'); setC(DARK)
    doc.text(`S/ ${fmt(detraccion)}`, R, y + 36, { align: 'right' })

    y += 44
  }

  // ── BLOQUE 5B: Información del crédito (siempre que no sea Contado) ──────────
  if (inv.status !== 'PAID') {
    // Caja de crédito
    bdr(L, y, CW, 8)
    // Título inline
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); setC(DARK)
    doc.text('Información del crédito', L + 2, y + 5.5)
    doc.setFont('helvetica', 'normal'); setC(GRAY)
    doc.text(':', L + 55, y + 5.5)
    y += 8

    // Monto neto pendiente
    bdr(L, y, CW, 7)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); setC(GRAY)
    doc.text('Monto neto pendiente de pago', L + 2, y + 5)
    doc.setFont('helvetica', 'bold'); setC(DARK)
    doc.text(':', L + 60, y + 5)
    doc.text(`S/ ${fmt(neto)}`, L + 64, y + 5)
    y += 7

    // Total de cuotas
    bdr(L, y, CW, 7)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); setC(GRAY)
    doc.text('Total de Cuotas', L + 2, y + 5)
    doc.setFont('helvetica', 'bold'); setC(DARK)
    doc.text(':', L + 40, y + 5)
    doc.text('1', L + 44, y + 5)
    y += 7

    // Tabla de cuotas — 3 grupos de columnas (formato SUNAT)
    const colW = CW / 3  // cada grupo ocupa un tercio del ancho
    const subCols = [0, colW, colW * 2]  // offsets de cada grupo
    const NUM_W  = 14    // "Nº Cuota"
    const DATE_W = 28    // "Fec. Venc."

    // Cabecera de cuotas
    fill([230, 230, 230], L, y, CW, 7)
    bdr(L, y, CW, 7)
    subCols.forEach((ox, gi) => {
      const gx = L + ox
      if (gi > 0) { setD(BLACK); doc.setLineWidth(0.3); doc.line(gx, y, gx, y + 7) }
      setD(LGRAY); doc.setLineWidth(0.2)
      doc.line(gx + NUM_W, y, gx + NUM_W, y + 7)
      doc.line(gx + NUM_W + DATE_W, y, gx + NUM_W + DATE_W, y + 7)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); setC(DARK)
      doc.text('Nº\nCuota', gx + 2, y + 2.5, { lineHeightFactor: 1.2 })
      doc.text('Fec. Venc.', gx + NUM_W + 2, y + 5)
      doc.text('Monto', gx + colW - 2, y + 5, { align: 'right' })
    })
    y += 7

    // Fila de datos — solo la primera columna tiene datos
    bdr(L, y, CW, 8)
    subCols.forEach((ox, gi) => {
      const gx = L + ox
      if (gi > 0) { setD(BLACK); doc.setLineWidth(0.3); doc.line(gx, y, gx, y + 8) }
      setD(LGRAY); doc.setLineWidth(0.2)
      doc.line(gx + NUM_W, y, gx + NUM_W, y + 8)
      doc.line(gx + NUM_W + DATE_W, y, gx + NUM_W + DATE_W, y + 8)
      if (gi === 0) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); setC(DARK)
        doc.text('01', gx + 2, y + 5.5)
        doc.text(fmtDate(inv.dueDate), gx + NUM_W + 2, y + 5.5)
        doc.text(`S/ ${fmt(neto)}`, gx + colW - 2, y + 5.5, { align: 'right' })
      }
    })
    y += 10
  }

  // ══════════════════════════════════════════════════════════════════
  // BLOQUE 6 — QR SUNAT + REPRESENTACIÓN IMPRESA
  // ══════════════════════════════════════════════════════════════════
  const qrY = Math.max(y + 4, 240)

  try {
    const qrData   = buildSunatQrData(inv, company.ruc)
    const qrDataUrl = await QRCode.toDataURL(qrData, {
      width: 128, margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
    })
    doc.addImage(qrDataUrl, 'PNG', L, qrY, 28, 28)
  } catch { /* continúa sin QR */ }

  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); setC(DARK)
  doc.text('Representación Impresa del Comprobante Electrónico', L + 32, qrY + 5)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); setC(GRAY)
  doc.text('Consulte su comprobante en: https://ww1.sunat.gob.pe/ol-ti-itconsultaunificadalibre/', L + 32, qrY + 10)
  doc.text(`Emisor: ${company.ruc}  ·  ${company.name}`, L + 32, qrY + 15)
  doc.text(`Adquirente: ${inv.client.ruc}  ·  ${inv.client.businessName}`, L + 32, qrY + 20)

  if (inv.status === 'PAID') {
    fill(GREEN, L + 32, qrY + 24, 26, 8)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); setC(WHITE)
    doc.text('CANCELADO', L + 34, qrY + 29.5)
  }

  // ── Footer ────────────────────────────────────────────────────────
  const footerY = 285
  setD(LGRAY); doc.setLineWidth(0.3); doc.line(L, footerY, R, footerY)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); setC(GRAY)
  doc.text(`${serieNum}  ·  ${company.name}  ·  RUC ${company.ruc}`, L, footerY + 5)
  doc.text(`Generado el ${new Date().toLocaleDateString('es-PE')}`, R, footerY + 5, { align: 'right' })

  return doc
}

export async function downloadInvoicePDFLocal(inv: Invoice, company: CompanyProfile): Promise<void> {
  const doc = await buildInvoicePDF(inv, company)
  doc.save(`${inv.series}-${inv.number.padStart(8, '0')}.pdf`)
}

export async function previewInvoicePDFUrl(inv: Invoice, company: CompanyProfile): Promise<string> {
  const doc = await buildInvoicePDF(inv, company)
  return doc.output('datauristring')
}
