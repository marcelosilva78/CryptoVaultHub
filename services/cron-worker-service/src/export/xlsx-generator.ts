import { Writable } from 'stream';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Streaming XLSX generator using exceljs streaming workbook.
 * Writes rows incrementally to avoid loading entire dataset in memory.
 */
export class XlsxGenerator {
  private workbook: ExcelJS.stream.xlsx.WorkbookWriter;
  private worksheet: ExcelJS.Worksheet;
  private columns: string[];
  private rowCount = 0;

  constructor(columns: string[], outputPath: string) {
    this.columns = columns;

    // Ensure output directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const stream = fs.createWriteStream(outputPath);
    this.workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream,
      useStyles: true,
    });

    this.worksheet = this.workbook.addWorksheet('Export');

    // Set column definitions with auto-width hints
    this.worksheet.columns = columns.map((col) => ({
      header: col,
      key: col,
      width: Math.max(col.length + 4, 15),
    }));

    // Style the header row
    const headerRow = this.worksheet.getRow(1);
    headerRow.font = { bold: true, size: 11 };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1A1D25' },
    };
    headerRow.font = { bold: true, color: { argb: 'FFE2A828' }, size: 11 };
    headerRow.commit();
  }

  addRow(row: Record<string, unknown>): void {
    const values: Record<string, unknown> = {};
    for (const col of this.columns) {
      const value = row[col];
      // Convert objects/arrays to JSON string for Excel
      values[col] =
        value !== null && value !== undefined && typeof value === 'object'
          ? JSON.stringify(value)
          : value;
    }
    this.worksheet.addRow(values).commit();
    this.rowCount++;
  }

  async finish(): Promise<number> {
    this.worksheet.commit();
    await this.workbook.commit();
    return this.rowCount;
  }

  getRowCount(): number {
    return this.rowCount;
  }
}
