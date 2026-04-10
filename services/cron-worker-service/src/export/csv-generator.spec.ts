import { CsvGenerator } from './csv-generator';

describe('CsvGenerator', () => {
  let generator: CsvGenerator;

  function collectOutput(
    gen: CsvGenerator,
    rows: Record<string, unknown>[],
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: string[] = [];
      gen.on('data', (chunk: Buffer | string) =>
        chunks.push(chunk.toString()),
      );
      gen.on('end', () => resolve(chunks.join('')));
      gen.on('error', reject);

      for (const row of rows) {
        gen.write(row);
      }
      gen.end();
    });
  }

  it('should generate header row from provided columns', async () => {
    generator = new CsvGenerator(['name', 'age', 'city']);
    const output = await collectOutput(generator, [
      { name: 'Alice', age: 30, city: 'NYC' },
    ]);

    const lines = output.split('\r\n');
    expect(lines[0]).toBe('name,age,city');
  });

  it('should escape commas in field values', async () => {
    generator = new CsvGenerator(['name', 'address']);
    const output = await collectOutput(generator, [
      { name: 'Alice', address: '123 Main St, Apt 4' },
    ]);

    const lines = output.split('\r\n');
    // The address field should be quoted because it contains a comma
    expect(lines[1]).toBe('Alice,"123 Main St, Apt 4"');
  });

  it('should escape double quotes by doubling them', async () => {
    generator = new CsvGenerator(['name', 'quote']);
    const output = await collectOutput(generator, [
      { name: 'Alice', quote: 'She said "hello"' },
    ]);

    const lines = output.split('\r\n');
    // Double quotes are escaped by doubling: " becomes ""
    expect(lines[1]).toBe('Alice,"She said ""hello"""');
  });

  it('should handle newlines in field values', async () => {
    generator = new CsvGenerator(['name', 'bio']);
    const output = await collectOutput(generator, [
      { name: 'Alice', bio: 'Line1\nLine2' },
    ]);

    // The field with newline should be quoted
    expect(output).toContain('"Line1\nLine2"');
  });

  it('should handle null values as empty string', async () => {
    generator = new CsvGenerator(['name', 'email']);
    const output = await collectOutput(generator, [
      { name: 'Alice', email: null },
    ]);

    const lines = output.split('\r\n');
    expect(lines[1]).toBe('Alice,');
  });

  it('should handle undefined values as empty string', async () => {
    generator = new CsvGenerator(['name', 'phone']);
    const output = await collectOutput(generator, [
      { name: 'Bob' }, // phone is undefined
    ]);

    const lines = output.split('\r\n');
    expect(lines[1]).toBe('Bob,');
  });

  it('should write header only once for multiple rows', async () => {
    generator = new CsvGenerator(['id', 'value']);
    const output = await collectOutput(generator, [
      { id: 1, value: 'a' },
      { id: 2, value: 'b' },
      { id: 3, value: 'c' },
    ]);

    const lines = output.split('\r\n').filter((l) => l.length > 0);
    expect(lines.length).toBe(4); // 1 header + 3 data rows
    expect(lines[0]).toBe('id,value');
    expect(lines[1]).toBe('1,a');
    expect(lines[2]).toBe('2,b');
    expect(lines[3]).toBe('3,c');
  });

  it('should handle object values by JSON-stringifying them', async () => {
    generator = new CsvGenerator(['name', 'metadata']);
    const output = await collectOutput(generator, [
      { name: 'Alice', metadata: { key: 'value' } },
    ]);

    const lines = output.split('\r\n');
    // JSON.stringify produces {"key":"value"} which contains quotes, so it must be quoted and escaped
    expect(lines[1]).toContain('"');
    expect(lines[1]).toContain('key');
  });
});
