import PDFDocument from 'pdfkit';
import type { ReportTable } from '../report.js';
import { formatCell } from '../report.js';

const NAVY = '#1D3B61';
const GOLD = '#B69952';
const MUTED = '#6B7280';
const STRIPE = '#F1F4F9';

interface Layout {
  orientation: 'portrait' | 'landscape';
  x: number;
  width: number;
  colWidths: number[];
}

function layoutFor(columns: ReportTable['columns']): (page: { width: number; height: number }) => Layout {
  return (page) => {
    const margin = 32;
    const width = page.width - margin * 2;
    const weights = columns.map((c) => c.width ?? Math.max(10, String(c.header).length + 6));
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    return {
      orientation: page.width > page.height ? 'landscape' : 'portrait',
      x: margin,
      width,
      colWidths: weights.map((w) => (w / totalWeight) * width),
    };
  };
}

/**
 * Generates a branded PDF report: pump name, title, date range, generated
 * timestamp, a neatly laid out table with zebra striping, page breaks with a
 * repeated header, and a totals row.
 */
export async function buildPdf(
  table: ReportTable,
  totals?: Record<string, unknown> | null,
): Promise<Buffer> {
  const useLandscape = table.columns.length > 5;
  const doc = new PDFDocument({
    size: 'A4',
    layout: useLandscape ? 'landscape' : 'portrait',
    margin: 32,
    bufferPages: false,
  });

  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((resolve, reject) => {
    doc.on('end', () => resolve());
    doc.on('error', reject);
  });

  const L = layoutFor(table.columns)(doc.page);

  const drawHeader = () => {
    doc
      .rect(L.x, doc.y, L.width, 3)
      .fill(GOLD);
    doc.moveDown(0.6);
    doc.font('Helvetica-Bold').fontSize(16).fillColor(NAVY).text(table.pumpName, L.x, doc.y);
    if (table.pumpAddress) {
      doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(table.pumpAddress, L.x, doc.y + 1);
    }
    doc.moveDown(0.2);
    doc.font('Helvetica-Bold').fontSize(12).fillColor(NAVY).text(table.title);
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(MUTED)
      .text(`Date range: ${table.rangeLabel}    |    Generated: ${table.generatedAt.toLocaleString('en-GB')}`);
    doc.moveDown(0.5);
  };

  const ensureSpace = (needed: number) => {
    if (doc.y + needed > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      drawHeader();
      drawTableHeader();
    }
  };

  const rowHeight = 18;

  const drawTableHeader = () => {
    const y = doc.y;
    doc.rect(L.x, y, L.width, rowHeight).fill(NAVY);
    let cx = L.x;
    table.columns.forEach((col, i) => {
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor('#FFFFFF')
        .text(String(col.header), cx + 4, y + 5, {
          width: L.colWidths[i] - 8,
          align: col.align === 'right' ? 'right' : col.align === 'center' ? 'center' : 'left',
          ellipsis: true,
          lineBreak: false,
        });
      cx += L.colWidths[i];
    });
    doc.y = y + rowHeight;
  };

  drawHeader();

  if (table.summary?.length) {
    const boxHeight = Math.ceil(table.summary.length / 2) * 16 + 12;
    ensureSpace(boxHeight + 10);
    const startY = doc.y;
    doc.rect(L.x, startY, L.width, boxHeight).fillAndStroke(STRIPE, '#DDE3EC');
    table.summary.forEach((item, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = L.x + 10 + col * (L.width / 2);
      const y = startY + 8 + row * 16;
      doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(`${item.label}: `, x, y, { continued: true, lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(9).fillColor(NAVY).text(item.value, { lineBreak: false });
    });
    doc.y = startY + boxHeight + 8;
  }

  drawTableHeader();

  table.rows.forEach((row, index) => {
    ensureSpace(rowHeight);
    const y = doc.y;
    if (index % 2 === 1) doc.rect(L.x, y, L.width, rowHeight).fill(STRIPE);
    let cx = L.x;
    table.columns.forEach((col, i) => {
      const value = formatCell(row[col.key], col.type ?? 'text');
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#1F2937')
        .text(value, cx + 4, y + 5, {
          width: L.colWidths[i] - 8,
          align: col.align === 'right' ? 'right' : col.align === 'center' ? 'center' : 'left',
          ellipsis: true,
          lineBreak: false,
        });
      cx += L.colWidths[i];
    });
    doc.y = y + rowHeight;
  });

  if (!table.rows.length) {
    ensureSpace(rowHeight * 2);
    doc
      .font('Helvetica-Oblique')
      .fontSize(10)
      .fillColor(MUTED)
      .text('No records found for the selected filters.', L.x + 4, doc.y + 6);
    doc.y += rowHeight;
  }

  if (totals && table.rows.length) {
    ensureSpace(rowHeight + 4);
    const y = doc.y;
    doc.rect(L.x, y, L.width, rowHeight).fill(NAVY);
    let cx = L.x;
    table.columns.forEach((col, i) => {
      const raw = totals[col.key];
      const value = raw === undefined || raw === null ? '' : formatCell(raw, col.type ?? 'text');
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor('#FFFFFF')
        .text(value, cx + 4, y + 5, {
          width: L.colWidths[i] - 8,
          align: col.align === 'right' ? 'right' : col.align === 'center' ? 'center' : 'left',
          ellipsis: true,
          lineBreak: false,
        });
      cx += L.colWidths[i];
    });
    doc.y = y + rowHeight;
  }

  if (table.note) {
    doc.moveDown(0.6);
    doc.font('Helvetica-Oblique').fontSize(8).fillColor(MUTED).text(table.note, L.x, doc.y, {
      width: L.width,
    });
  }

  // footer with page numbers
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#9CA3AF')
      .text(
        `BK Petrol Pump Manager  |  ${table.pumpName}  |  Page ${i - range.start + 1} of ${range.count}`,
        L.x,
        doc.page.height - doc.page.margins.bottom + 10,
        { width: L.width, align: 'center', lineBreak: false },
      );
  }

  doc.end();
  await done;
  return Buffer.concat(chunks);
}
