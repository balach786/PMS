import ExcelJS from 'exceljs';
import type { ReportTable } from '../report.js';

// BK brand palette (taken from the supplied poster)
const NAVY = '1D3B61';
const GOLD = 'B69952';
const LIGHT = 'F4F6FA';

/**
 * Properly formatted Excel workbook:
 *  - title block with pump name, report title, date range, generated date
 *  - bold gold header row with freeze panes + auto filter
 *  - typed cells (numbers stay numeric so Excel can sum them)
 *  - totals row in navy with bold type
 */
export async function buildXlsx(
  table: ReportTable,
  totals?: Record<string, unknown> | null,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BK Petrol Pump Manager';
  workbook.created = table.generatedAt;

  const sheet = workbook.addWorksheet(table.title.slice(0, 31), {
    views: [{ state: 'frozen', ySplit: table.summary?.length ? table.summary.length + 7 : 6 }],
  });

  const colCount = Math.max(table.columns.length, 1);

  // --- Title block -------------------------------------------------------
  const titleRow = sheet.addRow([table.pumpName]);
  titleRow.font = { size: 16, bold: true, color: { argb: 'FF' + NAVY } };
  sheet.mergeCells(1, 1, 1, colCount);

  if (table.pumpAddress) {
    sheet.addRow([table.pumpAddress]).font = { size: 10, color: { argb: 'FF555555' } };
    sheet.mergeCells(2, 1, 2, colCount);
  }

  const reportTitleRow = sheet.addRow([table.title]);
  reportTitleRow.font = { size: 13, bold: true, color: { argb: 'FF' + NAVY } };
  sheet.mergeCells(reportTitleRow.number, 1, reportTitleRow.number, colCount);

  sheet.addRow([`Date range: ${table.rangeLabel}`]).font = { size: 10, italic: true };
  sheet.addRow([`Generated: ${table.generatedAt.toLocaleString('en-GB')}`]).font = {
    size: 10,
    italic: true,
    color: { argb: 'FF666666' },
  };
  sheet.addRow([]);

  if (table.summary?.length) {
    for (const item of table.summary) {
      const r = sheet.addRow([item.label, item.value]);
      r.getCell(1).font = { bold: true, color: { argb: 'FF' + NAVY } };
      r.getCell(2).font = { bold: true };
    }
    sheet.addRow([]);
  }

  // --- Header ------------------------------------------------------------
  const headerRow = sheet.addRow(table.columns.map((c) => c.header));
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF' + NAVY },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = { bottom: { style: 'medium', color: { argb: 'FF' + GOLD } } };
  });
  headerRow.height = 22;

  table.columns.forEach((col, idx) => {
    const width = col.width ?? Math.max(12, Math.min(34, String(col.header).length + 6));
    sheet.getColumn(idx + 1).width = width;
  });

  // --- Data --------------------------------------------------------------
  const firstDataRow = sheet.lastRow!.number + 1;
  for (const row of table.rows) {
    const values = table.columns.map((c) => {
      const raw = row[c.key];
      const type = c.type ?? 'text';
      if (type === 'money' || type === 'number') {
        const n = Number(raw);
        return Number.isFinite(n) ? n : raw === undefined || raw === null ? null : String(raw);
      }
      if (type === 'date' || type === 'datetime') {
        const d = raw ? new Date(raw as string) : null;
        return d && !Number.isNaN(d.getTime()) ? d : raw ?? null;
      }
      return raw === undefined || raw === null ? '' : String(raw);
    });
    const added = sheet.addRow(values);
    table.columns.forEach((col, idx) => {
      const cell = added.getCell(idx + 1);
      const type = col.type ?? 'text';
      if (type === 'money') cell.numFmt = '#,##0.00';
      else if (type === 'number') cell.numFmt = '#,##0.000';
      else if (type === 'date') cell.numFmt = 'dd mmm yyyy';
      else if (type === 'datetime') cell.numFmt = 'dd mmm yyyy hh:mm';
      cell.alignment = {
        horizontal: col.align ?? (type === 'money' || type === 'number' ? 'right' : 'left'),
        vertical: 'middle',
      };
    });
  }

  const lastDataRow = sheet.lastRow!.number;

  if (table.rows.length && firstDataRow <= lastDataRow) {
    sheet.autoFilter = {
      from: { row: headerRow.number, column: 1 },
      to: { row: headerRow.number, column: colCount },
    };
  }

  // --- Totals ------------------------------------------------------------
  if (totals && table.rows.length) {
    const totalValues = table.columns.map((c) => {
      const raw = totals[c.key];
      if (raw === undefined || raw === null) return null;
      if (c.total) {
        const n = Number(raw);
        return Number.isFinite(n) ? n : raw;
      }
      return String(raw);
    });
    const totalRow = sheet.addRow(totalValues);
    totalRow.eachCell((cell, colNumber) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + NAVY } };
      const col = table.columns[colNumber - 1];
      if (col?.type === 'money') cell.numFmt = '#,##0.00';
      else if (col?.type === 'number') cell.numFmt = '#,##0.000';
      cell.alignment = {
        horizontal: col?.align ?? (col?.type === 'money' || col?.type === 'number' ? 'right' : 'left'),
      };
    });
  }

  // zebra striping
  if (table.rows.length) {
    for (let r = firstDataRow; r <= lastDataRow; r++) {
      if ((r - firstDataRow) % 2 === 1) {
        const row = sheet.getRow(r);
        row.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + LIGHT } };
        });
      }
    }
  }

  if (table.note) {
    sheet.addRow([]);
    const noteRow = sheet.addRow([table.note]);
    noteRow.font = { italic: true, size: 9, color: { argb: 'FF666666' } };
    sheet.mergeCells(noteRow.number, 1, noteRow.number, colCount);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
