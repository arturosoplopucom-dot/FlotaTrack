import { jsPDF } from 'jspdf'
import type { WorkOrder, CompanyProfile, ServiceReportInWO } from '../hooks/useFlota'

// ─── Colores ─────────────────────────────────────────────────────────────────
const BLUE_H : [number,number,number] = [74, 126, 187]
const BLUE_L : [number,number,number] = [189, 215, 238]
const BLUE_M : [number,number,number] = [42, 93, 156]
const WHITE  : [number,number,number] = [255, 255, 255]
const BLACK  : [number,number,number] = [0, 0, 0]
const LGRAY  : [number,number,number] = [245, 245, 245]

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmtDate = (iso: string) => {
  try {
    const d = new Date(iso)
    return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`
  } catch { return iso }
}

const fmt12h = (t?: string | null) => {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'p.m.' : 'a.m.'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

const fmtNum = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function getEquiposCombinados(reports: ServiceReportInWO[]): string {
  const seen = new Set<string>()
  const names: string[] = []
  for (const r of reports) {
    const n = r.equipment?.name ?? ''
    if (n && !seen.has(n)) { seen.add(n); names.push(n) }
  }
  return names.join(' Y ')
}

// ─── Build PDF ────────────────────────────────────────────────────────────────
export function buildLiquidacionDetalladaPDF(wo: WorkOrder, company: CompanyProfile): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W  = doc.internal.pageSize.getWidth()
  const L  = 12   // margen izquierdo
  const R  = W - L
  let   y  = 12

  const reports  = wo.serviceReports ?? []
  const sym      = wo.currency === 'USD' ? '$' : 'S/'
  const subtotal = Number(wo.subtotal)
  const today    = new Date().toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const year     = new Date().getFullYear()
  const docNum   = `${wo.number.replace(/\D/g, '')} - ${year}`
  const equipos  = getEquiposCombinados(reports)

  // helpers de bajo nivel
  const sf  = (c: [number,number,number]) => doc.setFillColor(c[0], c[1], c[2])
  const sc  = (c: [number,number,number]) => doc.setTextColor(c[0], c[1], c[2])
  const sd  = (c: [number,number,number]) => doc.setDrawColor(c[0], c[1], c[2])
  const fill = (x: number, yy: number, w: number, h: number, c: [number,number,number]) => {
    sf(c); doc.rect(x, yy, w, h, 'F')
  }
  const stroke = (x: number, yy: number, w: number, h: number, c: [number,number,number]) => {
    sd(c); doc.rect(x, yy, w, h, 'S')
  }

  // ── CABECERA ─────────────────────────────────────────────────────────────
  // Dividimos el ancho: izquierda 78mm (empresa) | derecha el resto (título + cliente)
  const COMP_W  = 78
  const TITLE_X = L + COMP_W + 2   // X donde empieza la columna derecha
  const TITLE_W = R - TITLE_X

  // Dimensiones del bloque superior
  const TITLE_ROW_H  = 12   // "LIQUIDACION DE SERVICIOS"
  const FECHA_ROW_H  = 9
  // Filas cliente: CLIENTE, COTIZACIÓN N°, ATENCIÓN, EQUIPO, LUGAR = 5 filas
  const CLIENT_ROWS  = 5
  const CLIENT_ROW_H = 6.5
  const CLIENT_H     = CLIENT_ROWS * CLIENT_ROW_H  // 32.5mm
  const TOTAL_HEADER_H = TITLE_ROW_H + FECHA_ROW_H + CLIENT_H  // 53.5mm

  // ── Caja empresa (izquierda, altura total de cabecera) ──
  stroke(L, y, COMP_W, TOTAL_HEADER_H, BLUE_H)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); sc(BLUE_M)
  doc.text(company.name.toUpperCase(), L + 4, y + 9)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); sc(BLACK)
  const compLines = [
    `Razón Social: ${company.name}`,
    `Ruc: ${company.ruc}`,
    ...(company.address ? [`Dirección: ${company.address}`] : []),
    ...(company.phone   ? [`Teléfonos: ${company.phone}`]   : []),
  ]
  compLines.forEach((line, i) => doc.text(line, L + 4, y + 17 + i * 6.5))

  // ── Columna derecha ──
  // Fila 1: LIQUIDACION DE SERVICIOS + número
  fill(TITLE_X, y, TITLE_W, TITLE_ROW_H, BLUE_M)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); sc(WHITE)
  doc.text('LIQUIDACION DE SERVICIOS', TITLE_X + 4, y + TITLE_ROW_H / 2 + 0.5, { baseline: 'middle' })
  doc.text(docNum, R, y + TITLE_ROW_H / 2 + 0.5, { align: 'right', baseline: 'middle' })

  // Fila 2: FECHA EMISIÓN
  const fyStart = y + TITLE_ROW_H
  fill(TITLE_X, fyStart, TITLE_W, FECHA_ROW_H, LGRAY)
  stroke(TITLE_X, fyStart, TITLE_W, FECHA_ROW_H, BLUE_H)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); sc(BLACK)
  doc.text('FECHA EMISIÓN', TITLE_X + 4, fyStart + FECHA_ROW_H / 2 + 0.5, { baseline: 'middle' })
  doc.setFont('helvetica', 'normal')
  doc.text(today, R, fyStart + FECHA_ROW_H / 2 + 0.5, { align: 'right', baseline: 'middle' })

  // Bloque cliente
  const cyStart = fyStart + FECHA_ROW_H
  stroke(TITLE_X, cyStart, TITLE_W, CLIENT_H, BLUE_H)

  const clientRows: [string, string][] = [
    ['CLIENTE:',      wo.client.businessName],
    ['COTIZACIÓN N°:', wo.quote?.number ?? ''],
    ['ATENCIÓN:',     wo.client.contactName ?? ''],
    ['EQUIPO:',       equipos],
    ['LUGAR:',        wo.location ?? ''],
  ]
  doc.setFontSize(8)
  clientRows.forEach(([label, val], i) => {
    const rowY = cyStart + (i + 0.5) * CLIENT_ROW_H + 0.5
    doc.setFont('helvetica', 'bold');   sc(BLACK); doc.text(label, TITLE_X + 3, rowY, { baseline: 'middle' })
    doc.setFont('helvetica', 'normal'); sc(BLACK)
    const maxW = TITLE_W - 32
    const lines = doc.splitTextToSize(val, maxW)
    doc.text(lines[0] ?? '', TITLE_X + 30, rowY, { baseline: 'middle' })
  })

  y += TOTAL_HEADER_H + 7

  // ── TABLA DE REPORTES ──────────────────────────────────────────────────────
  // Columnas (mm): NR | Fecha | HI | HF | Rec | Hrs | PxH | Monto | Trabajo
  const COL = [14, 20, 18, 18, 12, 14, 18, 20] as const
  const TRABW = R - L - COL.reduce((a, b) => a + b, 0)
  const COLS  = [...COL, TRABW]
  const TOT_W = COLS.reduce((a, b) => a + b, 0)

  const HEADERS = [
    ['N°', 'Reporte'],
    ['Fecha', ''],
    ['Hora de', 'Inicio'],
    ['Hora de', 'termino'],
    ['Reco-', 'rrido'],
    ['Horas', 'totales'],
    ['Precio', 'x hora'],
    ['Monto', ''],
    ['Trabajo Realizado', ''],
  ]

  // Encabezado tabla
  const HDR_H = 11
  fill(L, y, TOT_W, HDR_H, BLUE_H)
  sc(WHITE); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5)
  let cx = L
  HEADERS.forEach((lines, i) => {
    const cy1 = y + HDR_H / 2 - (lines[1] ? 2.5 : 0.5)
    doc.text(lines[0], cx + COLS[i] / 2, cy1, { align: 'center', baseline: 'middle' })
    if (lines[1]) doc.text(lines[1], cx + COLS[i] / 2, cy1 + 4, { align: 'center', baseline: 'middle' })
    sd(WHITE); doc.rect(cx, y, COLS[i], HDR_H, 'S')
    cx += COLS[i]
  })
  y += HDR_H

  // Filas de datos
  doc.setFontSize(8)
  const DATA_H = 12
  reports.forEach((r, idx) => {
    const rowBg: [number,number,number] = WHITE
    fill(L, y, TOT_W, DATA_H, rowBg)
    sc(BLACK); doc.setFont('helvetica', 'normal')

    const monto    = `${sym} ${fmtNum(Number(r.amount))}`
    const precXH   = `${sym} ${fmtNum(Number(r.unitRate))}`
    const cells = [
      { v: r.number,                                    align: 'center' as const, isNum: false },
      { v: fmtDate(r.reportDate),                       align: 'center' as const, isNum: false },
      { v: fmt12h(r.startTime),                         align: 'center' as const, isNum: false },
      { v: fmt12h(r.endTime),                           align: 'center' as const, isNum: false },
      { v: r.travelKm != null ? Number(r.travelKm).toFixed(1) : '', align: 'center' as const, isNum: false },
      { v: Number(r.totalHours).toFixed(1),             align: 'center' as const, isNum: false },
      { v: precXH,                                      align: 'right'  as const, isNum: true  },
      { v: monto,                                       align: 'right'  as const, isNum: true  },
      { v: r.workDescription ?? '',                     align: 'left'   as const, isNum: false },
    ]

    let cx2 = L
    cells.forEach((cell, ci) => {
      const colW = COLS[ci]
      const py   = y + DATA_H / 2 + 0.5

      if (ci === cells.length - 1) {
        // Trabajo Realizado — wrap text
        const wrapped = doc.splitTextToSize(cell.v, colW - 3)
        const lineH   = 3.5
        const startY  = y + DATA_H / 2 - ((wrapped.length - 1) * lineH) / 2
        wrapped.slice(0, 2).forEach((line: string, li: number) =>
          doc.text(line, cx2 + 2, startY + li * lineH, { baseline: 'middle' })
        )
      } else {
        const tx = cell.align === 'right' ? cx2 + colW - 2 : cx2 + colW / 2
        doc.text(cell.v, tx, py, { align: cell.align, baseline: 'middle' })
      }

      sd(BLUE_H); doc.rect(cx2, y, colW, DATA_H, 'S')
      cx2 += colW
    })
    y += DATA_H
  })

  // ── MONTO A PAGAR (subtotal + IGV + total) ────────────────────────────────
  const igv        = Math.round(subtotal * 0.18 * 100) / 100
  const totalConIgv = Math.round(subtotal * 1.18 * 100) / 100
  const montoColX  = L + COLS.slice(0, 7).reduce((a, b) => a + b, 0)
  const montoColR  = montoColX + COLS[7] - 2

  const totRows: [string, string, boolean][] = [
    ['MONTO A PAGAR',    `${sym} ${fmtNum(subtotal)}`,      false],
    [`IGV (18%)`,        `${sym} ${fmtNum(igv)}`,           false],
    ['TOTAL A PAGAR',    `${sym} ${fmtNum(totalConIgv)}`,   true ],
  ]
  const MPAY_H = 9
  totRows.forEach(([label, monto, isBold]) => {
    const rowColor: [number,number,number] = isBold ? BLUE_H : BLUE_L
    fill(L, y, TOT_W, MPAY_H, rowColor)
    stroke(L, y, TOT_W, MPAY_H, BLUE_H)
    const weight = isBold ? 'bold' : 'normal'
    doc.setFont('helvetica', 'bold'); doc.setFontSize(isBold ? 9.5 : 8.5); sc(BLACK)
    doc.text(label, L + 4, y + MPAY_H / 2 + 0.5, { baseline: 'middle' })
    doc.setFont('helvetica', weight); doc.setFontSize(isBold ? 9.5 : 8.5)
    doc.text(monto, montoColR, y + MPAY_H / 2 + 0.5, { align: 'right', baseline: 'middle' })
    y += MPAY_H
  })
  y += 7

  // ── FOOTER ────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); sc(BLACK)
  doc.text('FORMA DE PAGO:', L, y + 4)
  doc.text('CONDICION DE VENTA:', L + TOT_W / 2, y + 4)
  y += 10

  // Tabla de cuentas corrientes
  const CC_H = 24
  fill(L, y, TOT_W, CC_H, LGRAY)
  stroke(L, y, TOT_W, CC_H, BLUE_H)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); sc(BLACK)
  doc.text('CUENTAS CORRIENTES', L + TOT_W / 2, y + 5.5, { align: 'center' })

  // Línea vertical central
  const midX = L + TOT_W / 2
  sd(BLUE_H); doc.line(midX, y, midX, y + CC_H)

  const colPad = 3
  doc.setFontSize(7.5)

  // Izquierda: BCP SOLES
  doc.setFont('helvetica', 'bold'); doc.text('Entidad bancaria: BCP SOLES', L + colPad, y + 11)
  doc.setFont('helvetica', 'normal')
  doc.text('N° cuenta', L + colPad, y + 16.5)
  doc.text('CCI',       L + colPad, y + 21)

  // Derecha: BCP DOLARES
  doc.setFont('helvetica', 'bold'); doc.text('BCP DOLARES', midX + colPad, y + 11)
  doc.setFont('helvetica', 'normal')
  doc.text('N° cuenta', midX + colPad, y + 16.5)
  doc.text('CCI',       midX + colPad, y + 21)

  return doc
}

// ─── Exportar PDF (descarga) ──────────────────────────────────────────────────
export function exportLiquidacionDetallada(wo: WorkOrder, company: CompanyProfile): void {
  buildLiquidacionDetalladaPDF(wo, company).save(`Liquidacion-Detallada-${wo.number}.pdf`)
}

// ─── Preview en nueva ventana ─────────────────────────────────────────────────
export function previewLiquidacionDetallada(wo: WorkOrder, company: CompanyProfile): void {
  const url = buildLiquidacionDetalladaPDF(wo, company).output('bloburl')
  window.open(url as unknown as string, '_blank')
}
