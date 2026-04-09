import { Transform, TransformCallback } from 'stream';

/**
 * Streaming JSON array generator.
 * Outputs a valid JSON array by writing opening bracket,
 * comma-separated objects, and closing bracket.
 */
export class JsonGenerator extends Transform {
  private firstRow = true;
  private rowCount = 0;

  constructor() {
    super({ objectMode: true });
  }

  _construct(callback: TransformCallback): void {
    this.push('[\n');
    callback();
  }

  _transform(
    row: Record<string, unknown>,
    _encoding: string,
    callback: TransformCallback,
  ): void {
    try {
      const prefix = this.firstRow ? '  ' : ',\n  ';
      this.firstRow = false;
      this.rowCount++;

      this.push(prefix + JSON.stringify(row));
      callback();
    } catch (error) {
      callback(error instanceof Error ? error : new Error(String(error)));
    }
  }

  _flush(callback: TransformCallback): void {
    this.push('\n]\n');
    callback();
  }

  getRowCount(): number {
    return this.rowCount;
  }
}
