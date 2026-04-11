import * as fs from 'fs';
import * as path from 'path';

/**
 * Streaming XLSX generator shim.
 * NOTE: The exceljs package is not installed in this service.
 * This implementation writes a TSV (tab-separated) file as a compatible
 * alternative that Excel/LibreOffice can open directly.
 * Replace with full ExcelJS implementation once the package is added.
 */
export class XlsxGenerator {
  private writeStream: fs.WriteStream;
  private columns: string[];
  private rowCount = 0;
  private pending: Promise<void>;

  constructor(columns: string[], outputPath: string) {
    this.columns = columns;

    // Ensure output directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.writeStream = fs.createWriteStream(outputPath);

    // Write TSV header row
    const header = columns.map((c) => this.escapeTsv(c)).join('\t') + '\n';
    this.pending = new Promise<void>((resolve, reject) => {
      this.writeStream.write(header, (err) => (err ? reject(err) : resolve()));
    });
  }

  addRow(row: Record<string, unknown>): void {
    const line =
      this.columns
        .map((col) => {
          const value = row[col];
          const str =
            value !== null && value !== undefined && typeof value === 'object'
              ? JSON.stringify(value)
              : String(value ?? '');
          return this.escapeTsv(str);
        })
        .join('\t') + '\n';

    this.pending = this.pending.then(
      () =>
        new Promise<void>((resolve, reject) => {
          this.writeStream.write(line, (err) =>
            err ? reject(err) : resolve(),
          );
        }),
    );
    this.rowCount++;
  }

  async finish(): Promise<number> {
    await this.pending;
    await new Promise<void>((resolve, reject) => {
      this.writeStream.end((err: Error | null | undefined) =>
        err ? reject(err) : resolve(),
      );
    });
    return this.rowCount;
  }

  getRowCount(): number {
    return this.rowCount;
  }

  private escapeTsv(value: string): string {
    // Replace tabs and newlines to keep TSV valid
    return value.replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
  }
}
