import { Transform, TransformCallback } from 'stream';

/**
 * RFC 4180 compliant CSV streaming generator.
 * Escapes fields containing commas, quotes, or newlines.
 */
export class CsvGenerator extends Transform {
  private headerWritten = false;
  private columns: string[];

  constructor(columns: string[]) {
    super({ objectMode: true });
    this.columns = columns;
  }

  private escapeField(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }

    const str = typeof value === 'object' ? JSON.stringify(value) : String(value);

    // RFC 4180: fields containing commas, double quotes, or newlines must be quoted
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }

    return str;
  }

  _transform(
    row: Record<string, unknown>,
    _encoding: string,
    callback: TransformCallback,
  ): void {
    try {
      // Write header row on first chunk
      if (!this.headerWritten) {
        const headerLine = this.columns
          .map((col) => this.escapeField(col))
          .join(',');
        this.push(headerLine + '\r\n');
        this.headerWritten = true;
      }

      // Write data row
      const dataLine = this.columns
        .map((col) => this.escapeField(row[col]))
        .join(',');
      this.push(dataLine + '\r\n');

      callback();
    } catch (error) {
      callback(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
