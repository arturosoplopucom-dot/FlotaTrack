import { jsPDF } from 'jspdf'

// ─── COLOR PALETTE ────────────────────────────────────────────────────────────
const NAVY_PDF   = [15,  34,  68]  as [number, number, number]
const BLUE_PDF   = [37,  99,  235] as [number, number, number]
const LIGHT_PDF  = [240, 246, 255] as [number, number, number]
const BORDER_PDF = [226, 232, 240] as [number, number, number]
const TEXT_PDF   = [30,  41,  59]  as [number, number, number]
const MUTED_PDF  = [100, 116, 139] as [number, number, number]
const WHITE_PDF  = [255, 255, 255] as [number, number, number]

const NAVY_XLS  = '#0F2244'
const BLUE_XLS  = '#1E40AF'
const ALT_XLS   = '#EFF6FF'
const WHITE_XLS = '#FFFFFF'
const RED_XLS   = '#7F1D1D'

// ─── PASTEL THEME ─────────────────────────────────────────────────────────────
// Fondos pastel con texto oscuro (WCAG AA ≥ 4.5:1)
const PASTEL_THEMES = {
  blue:  { titleBg: '#BFDBFE', titleTxt: '#1E3A8A', subBg: '#DBEAFE', subTxt: '#1E40AF', hdrBg: '#93C5FD', hdrTxt: '#1E3A8A', altBg: '#EFF6FF' },
  teal:  { titleBg: '#99F6E4', titleTxt: '#134E4A', subBg: '#CCFBF1', subTxt: '#0F766E', hdrBg: '#5EEAD4', hdrTxt: '#134E4A', altBg: '#F0FDFA' },
  amber: { titleBg: '#FDE68A', titleTxt: '#78350F', subBg: '#FEF3C7', subTxt: '#92400E', hdrBg: '#FCD34D', hdrTxt: '#78350F', altBg: '#FFFBEB' },
  slate: { titleBg: '#CBD5E1', titleTxt: '#0F172A', subBg: '#E2E8F0', subTxt: '#1E293B', hdrBg: '#94A3B8', hdrTxt: '#0F172A', altBg: '#F8FAFC' },
} as const

export type ExcelTheme = 'dark' | keyof typeof PASTEL_THEMES

// ─── EXCEL (.xlsx) ────────────────────────────────────────────────────────────
export async function exportToExcel(
  rows: Record<string, unknown>[],
  filename: string,
  title: string,
  theme: ExcelTheme = 'dark'
) {
  if (!rows.length) return
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  const headers = Object.keys(rows[0])

  const p = theme !== 'dark' ? PASTEL_THEMES[theme] : null
  const T = {
    titleBg:  p ? p.titleBg : NAVY_XLS,
    titleTxt: p ? p.titleTxt : WHITE_XLS,
    subBg:    p ? p.subBg   : BLUE_XLS,
    subTxt:   p ? p.subTxt  : WHITE_XLS,
    hdrBg:    p ? p.hdrBg   : '#1D4ED8',
    hdrTxt:   p ? p.hdrTxt  : WHITE_XLS,
    altBg:    p ? p.altBg   : ALT_XLS,
  }

  const isNumericVal = (v: unknown): boolean => {
    if (v == null || v === '' || v === '—') return true
    if (typeof v === 'number') return true
    if (typeof v === 'string') return /^S\/\s?[\d,.]+$|^\d[\d,.]*$/.test(v.trim())
    return false
  }
  // Detect numeric columns (for right-align + number format)
  const isNumeric = (key: string) => rows.every((r) => isNumericVal(r[key]))

  const numericCols = new Set(headers.filter(isNumeric))

  // Column widths
  const colWidths = headers.map((h) => {
    const max = Math.max(h.length, ...rows.map((r) => String(r[h] ?? '').length))
    return Math.min(Math.max(max + 3, 10), 42)
  })

  const parseNum = (v: unknown): number | null => {
    if (typeof v === 'number') return v
    if (typeof v === 'string') {
      const clean = v.replace(/S\/\s?/g, '').replace(/,/g, '').trim()
      const n = parseFloat(clean)
      return isNaN(n) ? null : n
    }
    return null
  }

  // ── Title row (merged across all columns)
  const titleRow = [
    {
      value: title,
      columnSpan: headers.length,
      fontWeight: 'bold' as const,
      fontSize: 14,
      backgroundColor: T.titleBg,
      color: T.titleTxt,
      height: 30,
      align: 'center' as const,
      verticalAlign: 'middle' as const,
    },
    ...headers.slice(1).map(() => null),
  ]

  // ── Subtitle / date row
  const dateStr = new Date().toLocaleDateString('es-PE', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  const subtitleRow = [
    {
      value: `Generado: ${dateStr}  ·  FlotaTrack`,
      columnSpan: headers.length,
      fontSize: 9,
      backgroundColor: T.subBg,
      color: T.subTxt,
      height: 18,
      align: 'center' as const,
      verticalAlign: 'middle' as const,
    },
    ...headers.slice(1).map(() => null),
  ]

  // ── Header row
  const headerRow = headers.map((h, i) => ({
    value: h,
    fontWeight: 'bold' as const,
    fontSize: 10,
    backgroundColor: T.hdrBg,
    color: T.hdrTxt,
    height: 22,
    align: (numericCols.has(h) ? 'right' : 'center') as 'right' | 'center',
    verticalAlign: 'middle' as const,
    borderColor: T.subBg,
    width: colWidths[i],
  }))

  // ── Data rows
  const dataRows = rows.map((row, rowIdx) => {
    const bg = rowIdx % 2 === 0 ? WHITE_XLS : T.altBg
    return headers.map((h) => {
      const raw = row[h]
      const num = numericCols.has(h) ? parseNum(raw) : null

      if (num !== null) {
        // Detect currency vs plain number
        const isCurrency = typeof raw === 'string' && /S\//.test(raw)
        return {
          value: num,
          type: Number as unknown as NumberConstructor,
          format: isCurrency ? '"S/ "#,##0.00' : Number.isInteger(num) ? '#,##0' : '#,##0.00',
          backgroundColor: bg,
          align: 'right' as const,
          fontSize: 9,
          height: 16,
          color: isCurrency && num < 0 ? RED_XLS : undefined,
        }
      }

      return {
        value: raw == null || raw === '—' ? '' : String(raw),
        type: String as unknown as StringConstructor,
        backgroundColor: bg,
        fontSize: 9,
        height: 16,
      }
    })
  })

  // ── Summary / totals row (optional — detect if last row has numeric sums)
  const looksLikeTotals = headers.filter((h) => numericCols.has(h)).length >= 2

  let totalsRow: unknown[] | null = null
  if (looksLikeTotals && rows.length > 1) {
    totalsRow = headers.map((h) => {
      if (numericCols.has(h)) {
        const total = rows.reduce((sum, r) => {
          const n = parseNum(r[h])
          return sum + (n ?? 0)
        }, 0)
        const isCurrency = rows.some((r) => typeof r[h] === 'string' && /S\//.test(String(r[h])))
        return {
          value: total,
          type: Number as unknown as NumberConstructor,
          format: isCurrency ? '"S/ "#,##0.00' : '#,##0.00',
          fontWeight: 'bold' as const,
          backgroundColor: '#DBEAFE',
          color: '#1E3A8A',
          align: 'right' as const,
          fontSize: 9,
          height: 18,
        }
      }
      return {
        value: h === headers[0] ? `Total (${rows.length} registros)` : '',
        type: String as unknown as StringConstructor,
        fontWeight: 'bold' as const,
        backgroundColor: '#DBEAFE',
        color: '#1E3A8A',
        fontSize: 9,
        height: 18,
      }
    })
  }

  const allRows = [titleRow, subtitleRow, headerRow, ...dataRows, ...(totalsRow ? [totalsRow] : [])]

  const result = writeXlsxFile(allRows as Parameters<typeof writeXlsxFile>[0], {
    columns: colWidths.map((w) => ({ width: w })),
  })
  // write-excel-file v4 returns { toBlob(), toFile() } instead of a plain promise
  if (result && typeof (result as { toFile?: unknown }).toFile === 'function') {
    await (result as { toFile: (name: string) => Promise<void> }).toFile(`${filename}.xlsx`)
  }
}

// ─── PDF ──────────────────────────────────────────────────────────────────────
export function exportToPDF(
  rows: Record<string, unknown>[],
  filename: string,
  title: string,
  theme: ExcelTheme = 'dark'
) {
  if (!rows.length) return

  const isPastel = theme !== 'dark'
  // Pastel color palette (blue)
  const P_HEADER_BG: [number,number,number] = [239, 246, 255]  // blue-50
  const P_HEADER_TXT: [number,number,number] = [30, 58, 138]   // blue-900
  const P_SUB_TXT: [number,number,number]    = [30, 64, 175]   // blue-800
  const P_TH_BG: [number,number,number]      = [147, 197, 253] // blue-300
  const P_ACCENT: [number,number,number]     = [59, 130, 246]  // blue-500

  const headers = Object.keys(rows[0])
  const isLandscape = headers.length > 7
  const doc = new jsPDF({ orientation: isLandscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' })

  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const MARGIN = 12

  // ── Header bar
  if (isPastel) {
    doc.setFillColor(...P_HEADER_BG)
    doc.rect(0, 0, pageW, 28, 'F')
    // Left accent bar
    doc.setFillColor(...P_ACCENT)
    doc.rect(0, 0, 3, 28, 'F')
    // Bottom accent line
    doc.setFillColor(...P_TH_BG)
    doc.rect(0, 25.5, pageW, 2, 'F')
  } else {
    doc.setFillColor(...NAVY_PDF)
    doc.rect(0, 0, pageW, 28, 'F')
    doc.setFillColor(...BLUE_PDF)
    doc.rect(0, 24, pageW, 2, 'F')
  }

  // Logo
  doc.setTextColor(...(isPastel ? P_HEADER_TXT : WHITE_PDF))
  doc.setFontSize(15)
  doc.setFont('helvetica', 'bold')
  doc.text('FlotaTrack', MARGIN + (isPastel ? 2 : 0), 11)

  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...(isPastel ? P_SUB_TXT : MUTED_PDF))
  doc.text('Sistema de Gestión de Maquinaria Pesada', MARGIN + (isPastel ? 2 : 0), 17)

  // Title right
  doc.setTextColor(...(isPastel ? P_HEADER_TXT : WHITE_PDF))
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(title, pageW - MARGIN, 11, { align: 'right' })

  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...(isPastel ? P_SUB_TXT : MUTED_PDF))
  doc.text(
    `Generado: ${new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })}`,
    pageW - MARGIN, 17, { align: 'right' }
  )

  // ── Calculate column widths
  const tableW = pageW - MARGIN * 2
  const maxLens = headers.map((h) =>
    Math.max(h.length, ...rows.map((r) => String(r[h] ?? '').length))
  )
  const totalLen = maxLens.reduce((a, b) => a + b, 0)
  const colWidths = maxLens.map((l) => Math.max((l / totalLen) * tableW, isLandscape ? 14 : 18))

  // Normalize to fit exactly
  const actualTotal = colWidths.reduce((a, b) => a + b, 0)
  const scale = tableW / actualTotal
  const normWidths = colWidths.map((w) => w * scale)

  const HEADER_H = 8
  const ROW_H    = 6
  const FOOTER_H = 10

  function drawHeader(startY: number) {
    doc.setFillColor(...(isPastel ? P_TH_BG : BLUE_PDF))
    doc.rect(MARGIN, startY, tableW, HEADER_H, 'F')
    doc.setTextColor(...(isPastel ? P_HEADER_TXT : WHITE_PDF))
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'bold')
    let x = MARGIN
    headers.forEach((h, i) => {
      doc.text(
        truncate(h, Math.floor(normWidths[i] / 1.6)),
        x + 2,
        startY + HEADER_H / 2 + 1.5
      )
      x += normWidths[i]
    })
    return startY + HEADER_H
  }

  function drawFooter(pageNum: number, totalPages: number) {
    doc.setFillColor(...LIGHT_PDF)
    doc.rect(0, pageH - FOOTER_H, pageW, FOOTER_H, 'F')
    doc.setDrawColor(...BORDER_PDF)
    doc.setLineWidth(0.2)
    doc.line(0, pageH - FOOTER_H, pageW, pageH - FOOTER_H)
    doc.setFontSize(6.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MUTED_PDF)
    doc.text('FlotaTrack — Confidencial', MARGIN, pageH - 3.5)
    doc.text(`Página ${pageNum} de ${totalPages}`, pageW / 2, pageH - 3.5, { align: 'center' })
    doc.text(new Date().toLocaleDateString('es-PE'), pageW - MARGIN, pageH - 3.5, { align: 'right' })
  }

  function truncate(s: string, maxLen: number) {
    return s.length > maxLen ? s.slice(0, maxLen - 1) + '…' : s
  }

  // ── First page table
  let y = drawHeader(32)
  let currentPage = 1
  const pageBreakY = pageH - FOOTER_H - 2

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)

  rows.forEach((row, rowIdx) => {
    if (y + ROW_H > pageBreakY) {
      drawFooter(currentPage, 1) // temp page count
      doc.addPage()
      currentPage++
      // Repeat header on new page
      if (isPastel) {
        doc.setFillColor(...P_HEADER_BG)
        doc.rect(0, 0, pageW, 10, 'F')
        doc.setFillColor(...P_ACCENT)
        doc.rect(0, 0, 3, 10, 'F')
      } else {
        doc.setFillColor(...NAVY_PDF)
        doc.rect(0, 0, pageW, 10, 'F')
      }
      doc.setTextColor(...(isPastel ? P_HEADER_TXT : WHITE_PDF))
      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      doc.text(`${title} (cont.)`, MARGIN + (isPastel ? 2 : 0), 7)
      y = drawHeader(14)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
    }

    // Alternating background
    if (rowIdx % 2 === 1) {
      doc.setFillColor(...LIGHT_PDF)
      doc.rect(MARGIN, y, tableW, ROW_H, 'F')
    }

    // Bottom border
    doc.setDrawColor(...BORDER_PDF)
    doc.setLineWidth(0.08)
    doc.line(MARGIN, y + ROW_H, MARGIN + tableW, y + ROW_H)

    // Cell values
    doc.setTextColor(...TEXT_PDF)
    let x = MARGIN
    headers.forEach((h, i) => {
      const val = String(row[h] ?? '—')
      const maxC = Math.floor(normWidths[i] / 1.55)
      doc.text(truncate(val, maxC), x + 1.5, y + ROW_H / 2 + 1.5)
      x += normWidths[i]
    })

    y += ROW_H
  })

  // ── Totals row
  const numericCols = headers.filter((h) =>
    rows.every((r) => {
      const v = r[h]
      if (v == null || v === '' || v === '—') return true
      return typeof v === 'number' || (typeof v === 'string' && /^S\/\s?[\d,.]+$|^\d[\d,.]*$/.test(v.trim()))
    })
  )

  if (numericCols.length >= 2) {
    if (y + ROW_H + 1 > pageBreakY) {
      doc.addPage(); currentPage++
      y = 14
    }
    doc.setFillColor(219, 234, 254) // blue-100
    doc.rect(MARGIN, y, tableW, ROW_H + 1, 'F')
    doc.setDrawColor(...BLUE_PDF)
    doc.setLineWidth(0.3)
    doc.line(MARGIN, y, MARGIN + tableW, y)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(30, 64, 175)
    let x = MARGIN
    headers.forEach((h, i) => {
      if (numericCols.includes(h)) {
        const total = rows.reduce((s, r) => {
          const raw = r[h]
          const n = typeof raw === 'number' ? raw : parseFloat(String(raw ?? '').replace(/S\/\s?/g, '').replace(/,/g, ''))
          return s + (isNaN(n) ? 0 : n)
        }, 0)
        const isCur = rows.some((r) => typeof r[h] === 'string' && /S\//.test(String(r[h])))
        const label = isCur ? `S/ ${total.toLocaleString('es-PE', { minimumFractionDigits: 2 })}` : total.toLocaleString('es-PE')
        doc.text(label, x + normWidths[i] - 1.5, y + (ROW_H + 1) / 2 + 1.5, { align: 'right' })
      } else if (i === 0) {
        doc.text(`Total (${rows.length})`, x + 1.5, y + (ROW_H + 1) / 2 + 1.5)
      }
      x += normWidths[i]
    })
    y += ROW_H + 1
  }

  // ── Footers on all pages (now we know total)
  const totalPages = (doc as unknown as { getNumberOfPages: () => number }).getNumberOfPages?.() ?? doc.internal.pages.length - 1
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    drawFooter(p, totalPages)
  }

  doc.save(`${filename}.pdf`)
}

// ─── GERENCIAL PDF ────────────────────────────────────────────────────────────
import type { ProfitabilityReport } from '../hooks/useReports'

const CATEGORY_LABEL_PDF: Record<string, string> = {
  FUEL: 'Combustible', TOLL: 'Peajes', ALLOWANCE: 'Viáticos', MAINTENANCE: 'Mantenimiento', OTHER: 'Otros',
}
const CATEGORY_COLOR_PDF: Record<string, [number, number, number]> = {
  FUEL: [245, 158, 11], TOLL: [6, 182, 212], ALLOWANCE: [139, 92, 246], MAINTENANCE: [239, 68, 68], OTHER: [107, 114, 128],
}
const PERIOD_LABEL: Record<string, string> = { '1m': 'Último mes', '3m': 'Últimos 3 meses', '6m': 'Últimos 6 meses', '1y': 'Último año', 'all': 'Histórico completo' }

export function exportGerencialPDF(data: ProfitabilityReport, companyName: string) {
  const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W    = 210, H = 297, M = 14
  const s    = data.summary
  const pLabel = PERIOD_LABEL[data.period] ?? data.period
  const dateStr = new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })

  const fmtS = (n: number) => `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const fmtK = (n: number) => n >= 1_000_000 ? `S/ ${(n/1_000_000).toFixed(2)}M` : n >= 1000 ? `S/ ${(n/1000).toFixed(1)}k` : fmtS(n)
  const fmtP = (n: number) => `${n.toFixed(1)}%`

  // ═══════════════════════════════════════════════════════════════════════════
  // PÁGINA 1 — PORTADA
  // ═══════════════════════════════════════════════════════════════════════════

  // Fondo navy superior (60% de la página)
  doc.setFillColor(15, 34, 68)
  doc.rect(0, 0, W, 185, 'F')

  // Franja azul accent
  doc.setFillColor(37, 99, 235)
  doc.rect(0, 183, W, 3, 'F')

  // Barra lateral izquierda decorativa
  doc.setFillColor(37, 99, 235)
  doc.rect(0, 0, 5, 185, 'F')

  // ── Logo FlotaTrack
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(28)
  doc.setFont('helvetica', 'bold')
  doc.text('FlotaTrack', M + 8, 35)

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(148, 163, 184)
  doc.text('Sistema de Gestión de Maquinaria Pesada', M + 8, 43)

  // ── Línea separadora
  doc.setDrawColor(37, 99, 235)
  doc.setLineWidth(0.5)
  doc.line(M + 8, 50, W - M, 50)

  // ── Título principal
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(26)
  doc.setFont('helvetica', 'bold')
  doc.text('INFORME', M + 8, 78)
  doc.text('GERENCIAL', M + 8, 92)

  doc.setFontSize(13)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(148, 163, 184)
  doc.text('de Rentabilidad y Análisis Operativo', M + 8, 103)

  // ── Badges período y empresa
  const badgeY = 122
  // Período
  doc.setFillColor(37, 99, 235)
  doc.roundedRect(M + 8, badgeY, 55, 10, 2, 2, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'bold')
  doc.text(pLabel.toUpperCase(), M + 8 + 27.5, badgeY + 6.5, { align: 'center' })

  // KPI preview (3 números grandes en la portada)
  const kpiY = 146
  const kpiW = (W - M * 2 - 16) / 3
  ;[
    { l: 'INGRESOS', v: fmtK(s.totalRevenue), c: [96, 165, 250] as [number,number,number] },
    { l: 'MARGEN BRUTO', v: fmtK(s.grossMargin), c: [74, 222, 128] as [number,number,number] },
    { l: 'MARGEN %', v: fmtP(s.marginPct), c: s.marginPct >= 20 ? [74, 222, 128] as [number,number,number] : [251, 191, 36] as [number,number,number] },
  ].forEach(({ l, v, c }, i) => {
    const kx = M + 8 + i * (kpiW + 8)
    doc.setFillColor(25, 45, 85)
    doc.roundedRect(kx, kpiY, kpiW, 24, 3, 3, 'F')
    doc.setTextColor(148, 163, 184)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.text(l, kx + kpiW / 2, kpiY + 7, { align: 'center' })
    doc.setTextColor(...c)
    doc.setFontSize(15)
    doc.setFont('helvetica', 'bold')
    doc.text(v, kx + kpiW / 2, kpiY + 18, { align: 'center' })
  })

  // ── Parte inferior blanca — empresa y fecha
  doc.setFillColor(248, 250, 252)
  doc.rect(0, 185, W, H - 185, 'F')

  doc.setFillColor(37, 99, 235)
  doc.rect(0, 183, W, 3, 'F')

  doc.setTextColor(15, 34, 68)
  doc.setFontSize(15)
  doc.setFont('helvetica', 'bold')
  doc.text(companyName || 'Mi Empresa', M + 8, 210)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 116, 139)
  doc.text(`Fecha de generación: ${dateStr}`, M + 8, 220)
  doc.text('Documento confidencial — Para uso interno de gerencia', M + 8, 228)

  // Nota de confidencialidad
  doc.setFillColor(239, 246, 255)
  doc.roundedRect(M + 8, 240, W - M * 2 - 8, 18, 3, 3, 'F')
  doc.setDrawColor(147, 197, 253)
  doc.setLineWidth(0.3)
  doc.roundedRect(M + 8, 240, W - M * 2 - 8, 18, 3, 3, 'S')
  doc.setTextColor(30, 64, 175)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('INFORMACIÓN CONFIDENCIAL', M + 8 + (W - M * 2 - 8) / 2, 249, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(71, 113, 188)
  doc.text('Este documento contiene información financiera de uso exclusivo para la dirección de la empresa.', M + 8 + (W - M * 2 - 8) / 2, 255, { align: 'center' })

  doc.setFontSize(7.5)
  doc.setTextColor(148, 163, 184)
  doc.text('FlotaTrack ERP · 1', W / 2, H - 5, { align: 'center' })

  // ═══════════════════════════════════════════════════════════════════════════
  // PÁGINA 2 — RESUMEN EJECUTIVO
  // ═══════════════════════════════════════════════════════════════════════════
  doc.addPage()

  function sectionHeader(title: string, sub: string, pageNum: number) {
    doc.setFillColor(15, 34, 68)
    doc.rect(0, 0, W, 22, 'F')
    doc.setFillColor(37, 99, 235)
    doc.rect(0, 0, 4, 22, 'F')
    doc.setFillColor(37, 99, 235)
    doc.rect(4, 19, W - 4, 1, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text(title, M + 4, 10)
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(148, 163, 184)
    doc.text(sub, M + 4, 17)
    // FlotaTrack right
    doc.setTextColor(148, 163, 184)
    doc.setFontSize(8)
    doc.text('FlotaTrack', W - M, 12, { align: 'right' })
    doc.setFontSize(7)
    doc.text(`${pLabel} · ${dateStr}`, W - M, 18, { align: 'right' })
    // Footer
    doc.setFontSize(7.5)
    doc.setTextColor(148, 163, 184)
    doc.text(`FlotaTrack ERP · ${pageNum}`, W / 2, H - 5, { align: 'center' })
  }

  sectionHeader('RESUMEN EJECUTIVO', 'Indicadores clave de rentabilidad operativa', 2)

  // ── KPIs en grid (2 cols x 4 rows)
  let y = 30
  const kpiCols = 2
  const kpiCW   = (W - M * 2 - 8) / kpiCols
  const kpiH    = 28

  const kpiItems = [
    { l: 'Ingresos Operativos',   v: fmtK(s.totalRevenue),        sub: `${fmtP(100)} de la operación`, col: [59,130,246] as [number,number,number] },
    { l: 'Costos Totales',         v: fmtK(s.totalCosts),           sub: `${fmtP(s.totalCosts / Math.max(s.totalRevenue, 1) * 100)} de ingresos`, col: [239,68,68] as [number,number,number] },
    { l: 'Margen Bruto',          v: fmtK(s.grossMargin),          sub: `Rentabilidad: ${fmtP(s.marginPct)}`, col: [34,197,94] as [number,number,number] },
    { l: 'Costo de Mantenimiento',v: fmtK(s.totalMaintCost),       sub: `${fmtP(s.totalMaintCost / Math.max(s.totalCosts, 1) * 100)} del total costos`, col: [139,92,246] as [number,number,number] },
    { l: 'Total Facturado',        v: fmtK(s.totalInvoiced),        sub: 'Comprobantes emitidos', col: [59,130,246] as [number,number,number] },
    { l: 'Total Cobrado',          v: fmtK(s.totalCollected),       sub: `${fmtP(s.totalCollected / Math.max(s.totalInvoiced, 1) * 100)} cobrado`, col: [34,197,94] as [number,number,number] },
    { l: 'Saldo por Cobrar (CxC)', v: fmtK(s.pendingCollection),   sub: `${fmtP(s.pendingCollection / Math.max(s.totalInvoiced, 1) * 100)} pendiente`, col: [245,158,11] as [number,number,number] },
    { l: 'OTs Completadas',        v: String(s.completedOTs),       sub: `${s.activeOTs} activas · ${s.draftOTs} borrador`, col: [34,197,94] as [number,number,number] },
  ]

  kpiItems.forEach(({ l, v, sub, col }, idx) => {
    const col_i = idx % kpiCols
    const row_i = Math.floor(idx / kpiCols)
    const kx = M + col_i * (kpiCW + 8)
    const ky = y + row_i * (kpiH + 6)

    // Card background
    doc.setFillColor(248, 250, 252)
    doc.roundedRect(kx, ky, kpiCW, kpiH, 3, 3, 'F')
    doc.setDrawColor(226, 232, 240)
    doc.setLineWidth(0.25)
    doc.roundedRect(kx, ky, kpiCW, kpiH, 3, 3, 'S')

    // Color accent left bar
    doc.setFillColor(...col)
    doc.roundedRect(kx, ky, 3, kpiH, 1, 1, 'F')

    // Label
    doc.setTextColor(100, 116, 139)
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.text(l.toUpperCase(), kx + 7, ky + 8)

    // Value
    doc.setTextColor(15, 34, 68)
    doc.setFontSize(15)
    doc.setFont('helvetica', 'bold')
    doc.text(v, kx + 7, ky + 19)

    // Sub
    doc.setTextColor(...col)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.text(sub, kx + 7, ky + 25)
  })

  // ── Margen visual (gauge simple)
  y = 30 + 4 * (kpiH + 6) + 10
  const marginPct = Math.min(Math.max(s.marginPct, 0), 100)
  const gaugeW    = W - M * 2
  doc.setFillColor(226, 232, 240)
  doc.roundedRect(M, y, gaugeW, 7, 3, 3, 'F')
  const fillW = (marginPct / 100) * gaugeW
  const fillColor = s.marginPct >= 30 ? [34,197,94] : s.marginPct >= 15 ? [245,158,11] : [239,68,68]
  doc.setFillColor(...fillColor as [number,number,number])
  doc.roundedRect(M, y, fillW, 7, 3, 3, 'F')
  doc.setTextColor(15, 34, 68)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text(`Margen operativo: ${fmtP(s.marginPct)}`, M, y - 3)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(100, 116, 139)
  const verdict = s.marginPct >= 30 ? '✓ Excelente rentabilidad' : s.marginPct >= 15 ? '~ Rentabilidad aceptable' : '⚠ Margen bajo — requiere atención'
  doc.text(verdict, M + gaugeW, y - 3, { align: 'right' })

  // ═══════════════════════════════════════════════════════════════════════════
  // PÁGINA 3 — EVOLUCIÓN MENSUAL + COSTOS
  // ═══════════════════════════════════════════════════════════════════════════
  doc.addPage()
  sectionHeader('ANÁLISIS FINANCIERO', 'Evolución mensual de ingresos, costos y distribución de gastos', 3)

  if (data.byMonth.length > 0) {
    y = 30
    doc.setTextColor(15, 34, 68)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('Ingresos vs. Costos por mes', M, y)

    const chartY   = y + 5
    const chartH   = 65
    const chartW   = W - M * 2
    const months   = data.byMonth.slice(-12)
    const maxVal   = Math.max(...months.flatMap((m) => [m.revenue, m.costs]), 1)
    const slotW    = chartW / months.length
    const barW     = Math.max(Math.min(slotW * 0.35, 14), 4)

    // Grid lines
    doc.setDrawColor(226, 232, 240)
    doc.setLineWidth(0.2)
    for (let g = 0; g <= 4; g++) {
      const gy = chartY + chartH - (g / 4) * chartH
      doc.line(M, gy, M + chartW, gy)
      const label = fmtK((maxVal * g / 4))
      doc.setFontSize(5.5)
      doc.setTextColor(148, 163, 184)
      doc.text(label, M - 1, gy + 1.5, { align: 'right' })
    }

    months.forEach((m, i) => {
      const cx    = M + i * slotW + slotW / 2
      const revH  = (m.revenue / maxVal) * chartH
      const cosH  = (m.costs   / maxVal) * chartH

      // Revenue bar (blue)
      doc.setFillColor(59, 130, 246)
      doc.rect(cx - barW - 1, chartY + chartH - revH, barW, revH, 'F')

      // Cost bar (red)
      doc.setFillColor(239, 68, 68)
      doc.rect(cx + 1, chartY + chartH - cosH, barW, cosH, 'F')

      // Month label
      doc.setFontSize(6.5)
      doc.setTextColor(100, 116, 139)
      doc.setFont('helvetica', 'normal')
      doc.text(m.month.slice(5), cx, chartY + chartH + 5, { align: 'center' })
    })

    // Baseline
    doc.setDrawColor(30, 41, 59)
    doc.setLineWidth(0.4)
    doc.line(M, chartY + chartH, M + chartW, chartY + chartH)

    // Legend
    const legY = chartY + chartH + 10
    doc.setFillColor(59, 130, 246); doc.rect(M, legY, 6, 4, 'F')
    doc.setTextColor(30, 41, 59); doc.setFontSize(7.5); doc.text('Ingresos', M + 8, legY + 3.5)
    doc.setFillColor(239, 68, 68); doc.rect(M + 40, legY, 6, 4, 'F')
    doc.text('Costos', M + 48, legY + 3.5)
    // Margin line hint
    doc.setFillColor(34, 197, 94); doc.rect(M + 75, legY, 6, 4, 'F')
    doc.text('Margen positivo', M + 83, legY + 3.5)

    y = legY + 14
  }

  // ── Distribución de costos
  if (data.byCostCategory.length > 0) {
    const totalCat = data.byCostCategory.reduce((s, d) => s + d.amount, 0)
    doc.setTextColor(15, 34, 68)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('Distribución de Costos', M, y)
    y += 6

    const maxCat = Math.max(...data.byCostCategory.map((c) => c.amount), 1)
    const barH   = 8, barGap = 4, labelW = 36, valW = 22
    const barsW  = W - M * 2 - labelW - valW - 12

    data.byCostCategory.forEach((cat) => {
      const col = CATEGORY_COLOR_PDF[cat.category] ?? [107, 114, 128]
      const bw  = (cat.amount / maxCat) * barsW
      const pct = totalCat > 0 ? (cat.amount / totalCat * 100) : 0

      doc.setFillColor(240, 242, 244)
      doc.roundedRect(M + labelW + 2, y, barsW, barH, 1, 1, 'F')

      doc.setFillColor(...col)
      doc.roundedRect(M + labelW + 2, y, bw, barH, 1, 1, 'F')

      doc.setTextColor(30, 41, 59)
      doc.setFontSize(7.5)
      doc.setFont('helvetica', 'normal')
      doc.text(CATEGORY_LABEL_PDF[cat.category] ?? cat.category, M + labelW, y + 5.5, { align: 'right' })

      doc.setTextColor(100, 116, 139)
      doc.setFontSize(7)
      doc.text(`${fmtK(cat.amount)} (${pct.toFixed(0)}%)`, M + labelW + 2 + barsW + 3, y + 5.5)

      y += barH + barGap
    })
    y += 8
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PÁGINA 4 — CLIENTES & EQUIPOS
  // ═══════════════════════════════════════════════════════════════════════════
  doc.addPage()
  sectionHeader('RENDIMIENTO OPERATIVO', 'Top clientes por ingresos y equipos por utilización', 4)
  y = 30

  // ── TOP CLIENTES
  if (data.byClient.length > 0) {
    doc.setTextColor(15, 34, 68)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('Top Clientes por Ingresos', M, y); y += 5

    // Table header
    doc.setFillColor(15, 34, 68)
    doc.rect(M, y, W - M * 2, 8, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'bold')
    const clientCols = [M + 4, M + 60, M + 108, M + 135, M + 155]
    ;['#  Cliente', 'Ingresos', 'Costos', 'Margen', 'Margen %'].forEach((h, i) => {
      const align = i > 0 ? 'right' : 'left'
      doc.text(h, clientCols[i] ?? M, y + 5.5, { align: align as 'right' | 'left' })
    })
    y += 8

    const maxClientRev = Math.max(...data.byClient.map((c) => c.revenue), 1)
    data.byClient.slice(0, 8).forEach((c, idx) => {
      const bg = idx % 2 === 0 ? [255, 255, 255] : [248, 250, 252]
      doc.setFillColor(...bg as [number,number,number])
      doc.rect(M, y, W - M * 2, 14, 'F')

      doc.setTextColor(15, 34, 68)
      doc.setFontSize(7.5)
      doc.setFont('helvetica', 'bold')
      doc.text(`${idx + 1}.`, M + 4, y + 5.5)

      doc.setFont('helvetica', 'normal')
      const name = c.name.length > 32 ? c.name.slice(0, 30) + '…' : c.name
      doc.text(name, M + 10, y + 5.5)

      // Mini bar
      const barMaxW = 45
      doc.setFillColor(219, 234, 254)
      doc.rect(M + 10, y + 7, barMaxW, 3, 'F')
      doc.setFillColor(59, 130, 246)
      doc.rect(M + 10, y + 7, (c.revenue / maxClientRev) * barMaxW, 3, 'F')

      const mc = c.marginPct >= 20 ? [34,197,94] : c.marginPct >= 0 ? [245,158,11] : [239,68,68]
      ;[fmtK(c.revenue), fmtK(c.costs), fmtK(c.margin)].forEach((v, vi) => {
        doc.setTextColor(30, 41, 59)
        doc.setFont('helvetica', 'normal')
        doc.text(v, (clientCols[vi + 1] ?? M), y + 5.5, { align: 'right' })
      })
      doc.setTextColor(...mc as [number,number,number])
      doc.setFont('helvetica', 'bold')
      doc.text(fmtP(c.marginPct), clientCols[4] ?? M, y + 5.5, { align: 'right' })

      doc.setDrawColor(226, 232, 240)
      doc.setLineWidth(0.1)
      doc.line(M, y + 14, M + (W - M * 2), y + 14)

      y += 14
    })
    y += 8
  }

  // ── TOP EQUIPOS
  if (data.byEquipment.length > 0) {
    doc.setTextColor(15, 34, 68)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('Equipos por Rentabilidad', M, y); y += 5

    doc.setFillColor(15, 34, 68)
    doc.rect(M, y, W - M * 2, 8, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'bold')
    const equipCols = [M + 4, M + 90, M + 130, M + 160]
    ;['#  Equipo', 'Ingresos', 'OTs', 'Horas'].forEach((h, i) => {
      doc.text(h, equipCols[i] ?? M, y + 5.5, { align: i > 0 ? 'right' : 'left' })
    })
    y += 8

    const maxEquipRev = Math.max(...data.byEquipment.map((e) => e.revenue), 1)
    data.byEquipment.slice(0, 7).forEach((e, idx) => {
      const bg = idx % 2 === 0 ? [255,255,255] : [248,250,252]
      doc.setFillColor(...bg as [number,number,number])
      doc.rect(M, y, W - M * 2, 14, 'F')

      doc.setTextColor(15, 34, 68); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold')
      doc.text(`${idx + 1}.`, M + 4, y + 5.5)
      doc.setFont('helvetica', 'normal')
      const name = e.name.length > 40 ? e.name.slice(0, 38) + '…' : e.name
      doc.text(name, M + 10, y + 5.5)

      const barMaxW = 72
      doc.setFillColor(254, 243, 199)
      doc.rect(M + 10, y + 7, barMaxW, 3, 'F')
      doc.setFillColor(245, 158, 11)
      doc.rect(M + 10, y + 7, (e.revenue / maxEquipRev) * barMaxW, 3, 'F')

      doc.setTextColor(30, 41, 59)
      doc.text(fmtK(e.revenue), equipCols[1] ?? M, y + 5.5, { align: 'right' })
      doc.text(String(e.otCount), equipCols[2] ?? M, y + 5.5, { align: 'right' })
      doc.text(e.hours > 0 ? `${e.hours.toFixed(0)}h` : '—', equipCols[3] ?? M, y + 5.5, { align: 'right' })

      doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.1)
      doc.line(M, y + 14, M + (W - M * 2), y + 14)
      y += 14
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PÁGINA 5 — TOP OTs (solo si existen)
  // ═══════════════════════════════════════════════════════════════════════════
  if (data.topOTs.length > 0) {
    doc.addPage()
    sectionHeader('ÓRDENES DE TRABAJO DESTACADAS', 'Principales OTs por margen bruto en el período', 5)
    y = 30

    doc.setFillColor(15, 34, 68)
    doc.rect(M, y, W - M * 2, 8, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'bold')
    const otCols = [M + 4, M + 38, M + 105, M + 130, M + 153, M + 174]
    ;['OT', 'Cliente', 'Ingresos', 'Costos', 'Margen', '%'].forEach((h, i) => {
      doc.text(h, otCols[i] ?? M, y + 5.5, { align: i >= 2 ? 'right' : 'left' })
    })
    y += 8

    data.topOTs.forEach((ot, idx) => {
      const bg = idx % 2 === 0 ? [255,255,255] : [248,250,252]
      doc.setFillColor(...bg as [number,number,number])
      doc.rect(M, y, W - M * 2, 9, 'F')

      doc.setTextColor(37, 99, 235); doc.setFontSize(7); doc.setFont('helvetica', 'bold')
      doc.text(ot.number, M + 4, y + 6)

      doc.setTextColor(30, 41, 59); doc.setFont('helvetica', 'normal')
      const cn = ot.clientName.length > 36 ? ot.clientName.slice(0, 34) + '…' : ot.clientName
      doc.text(cn, M + 38, y + 6)

      doc.text(fmtK(ot.revenue), otCols[2] ?? M, y + 6, { align: 'right' })
      doc.setTextColor(239, 68, 68)
      doc.text(fmtK(ot.costs),   otCols[3] ?? M, y + 6, { align: 'right' })
      doc.setTextColor(34, 197, 94)
      doc.text(fmtK(ot.margin),  otCols[4] ?? M, y + 6, { align: 'right' })

      const mc = ot.marginPct >= 20 ? [34,197,94] : ot.marginPct >= 0 ? [245,158,11] : [239,68,68]
      doc.setTextColor(...mc as [number,number,number])
      doc.setFont('helvetica', 'bold')
      doc.text(fmtP(ot.marginPct), otCols[5] ?? M, y + 6, { align: 'right' })

      doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.1)
      doc.line(M, y + 9, M + (W - M * 2), y + 9)
      y += 9
    })
  }

  doc.save(`informe-gerencial-${data.period}.pdf`)
}

// ─── SHARED PASTEL HTML REPORT TEMPLATE ──────────────────────────────────────
// CSS compartido para todos los reportes PDF con encabezado pastel

export const PASTEL_REPORT_CSS = `
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:Arial,sans-serif; font-size:11px; color:#1e293b; background:#fff; padding:18px 22px; }

  .rpt-header {
    background: linear-gradient(135deg, #bfdbfe 0%, #dbeafe 60%, #eff6ff 100%);
    border: 1.5px solid #93c5fd;
    border-radius: 10px;
    padding: 16px 20px;
    margin-bottom: 14px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    position: relative;
    overflow: hidden;
  }
  .rpt-header::before {
    content: '';
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 5px;
    background: #3b82f6;
    border-radius: 10px 0 0 10px;
  }
  .rpt-header-left  { padding-left: 10px; }
  .rpt-brand        { font-size: 9px; font-weight: 700; color: #3b82f6; letter-spacing:.08em; text-transform:uppercase; margin-bottom:3px; }
  .rpt-title        { font-size: 18px; font-weight: 800; color: #1e3a8a; margin-bottom: 3px; }
  .rpt-subtitle     { font-size: 11px; color: #1e40af; }
  .rpt-header-right { text-align: right; font-size: 11px; color: #1e40af; min-width: 120px; }

  .rpt-stats { display: flex; gap: 10px; margin-bottom: 14px; }
  .rpt-stat  { flex: 1; border-radius: 8px; padding: 10px 14px; border: 1px solid transparent; }
  .rpt-stat .n { font-size: 22px; font-weight: 800; line-height: 1; }
  .rpt-stat .l { font-size: 9px; font-weight: 700; margin-top: 3px; text-transform: uppercase; letter-spacing:.05em; }

  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  thead th {
    background: #bfdbfe;
    color: #1e3a8a;
    padding: 8px 10px;
    text-align: left;
    font-weight: 700;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: .05em;
    border-bottom: 2px solid #93c5fd;
    white-space: nowrap;
  }
  thead th.r { text-align: right; }
  thead th.c { text-align: center; }
  tbody tr { border-bottom: 1px solid #f1f5f9; }
  tbody tr:nth-child(even) { background: #f8fafc; }

  .rpt-footer {
    margin-top: 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 7px 12px;
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    border-radius: 6px;
    font-size: 9px;
    color: #1e40af;
  }
  .rpt-footer-brand { font-weight: 700; color: #1e3a8a; }
  @page { size: A4 landscape; margin: 10mm; }
  @media print { body { padding: 0; } .rpt-header { border-radius: 0; } .rpt-header::before { border-radius: 0; } .no-print { display: none; } }
`

/** Genera el bloque <head> completo para un reporte PDF pastel */
export function buildPastelHtmlHead(pageTitle: string, extraCss = ''): string {
  return `<head><meta charset="utf-8"><title>${pageTitle}</title><style>${PASTEL_REPORT_CSS}${extraCss}</style></head>`
}

/** Genera el encabezado pastel (banner superior) del reporte */
export function buildPastelHeader(opts: {
  title: string
  subtitle: string
  brand?: string
  rightHtml: string
}): string {
  return `
  <div class="rpt-header">
    <div class="rpt-header-left">
      <div class="rpt-brand">${opts.brand ?? 'FlotaTrack · Reporte'}</div>
      <div class="rpt-title">${opts.title}</div>
      <div class="rpt-subtitle">${opts.subtitle}</div>
    </div>
    <div class="rpt-header-right">${opts.rightHtml}</div>
  </div>`
}

/** Genera el footer pastel estándar */
export function buildPastelFooter(leftText: string, rightText: string): string {
  return `
  <div class="rpt-footer">
    <span><span class="rpt-footer-brand">FlotaTrack</span> · ${leftText}</span>
    <span>${rightText}</span>
  </div>`
}

// ─── LEGACY (kept for compatibility) ─────────────────────────────────────────
export function exportToCSV(rows: Record<string, unknown>[], filename: string) {
  exportToExcel(rows, filename, filename).catch(() => {
    // Fallback to CSV
    if (!rows.length) return
    const headers = Object.keys(rows[0])
    const esc = (v: unknown) => { const s = v == null ? '' : String(v); return s.includes(';') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s }
    const csv = [headers.join(';'), ...rows.map((r) => headers.map((h) => esc(r[h])).join(';'))].join('\n')
    const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${filename}.csv`; a.click()
  })
}

export function printReport(title: string) {
  const prev = document.title; document.title = title; window.print(); document.title = prev
}
