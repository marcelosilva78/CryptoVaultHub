import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';

interface ExportJobData {
  clientId: number;
  exportType: string;
  format: 'csv' | 'json';
  filters?: Record<string, any>;
  outputDir: string;
}

/**
 * Export worker: generates CSV/JSON exports of transaction data.
 * Streams data to disk to handle large datasets without memory pressure.
 */
@Injectable()
export class ExportWorkerService {
  private readonly logger = new Logger(ExportWorkerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Execute an export job.
   */
  async executeExport(data: ExportJobData): Promise<string> {
    const filename = `export_${data.exportType}_${data.clientId}_${Date.now()}.${data.format}`;
    const filePath = path.join(data.outputDir, filename);

    const writeStream = fs.createWriteStream(filePath);
    const generator = this.createDataGenerator(data);

    try {
      for await (const chunk of generator) {
        const canContinue = writeStream.write(chunk);
        if (!canContinue) {
          await new Promise<void>((resolve) => writeStream.once('drain', resolve));
        }
      }

      // Attach the finish listener BEFORE ending the stream
      // to avoid missing the event if it fires synchronously
      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
        generator.end(); // end AFTER attaching finish listener
      });

      this.logger.log(`Export completed: ${filePath}`);
      return filePath;
    } catch (error) {
      // Clean up partial file on error
      writeStream.destroy();
      try {
        fs.unlinkSync(filePath);
      } catch {
        // ignore cleanup errors
      }
      throw error;
    }
  }

  /**
   * Create an async data generator based on export type.
   */
  private createDataGenerator(data: ExportJobData): AsyncDataGenerator {
    return new AsyncDataGenerator(this.prisma, data);
  }
}

/**
 * Async generator that streams data from the database.
 */
class AsyncDataGenerator {
  private ended = false;
  private chunks: string[] = [];
  private resolveWaiting: (() => void) | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly data: ExportJobData,
  ) {
    this.generateData();
  }

  private async generateData(): Promise<void> {
    const batchSize = 1000;
    let offset = 0;
    let hasMore = true;

    // Write header for CSV
    if (this.data.format === 'csv') {
      this.push('txHash,blockNumber,fromAddress,toAddress,amount,status,createdAt\n');
    }

    while (hasMore && !this.ended) {
      const deposits = await this.prisma.deposit.findMany({
        where: {
          clientId: BigInt(this.data.clientId),
          ...(this.data.filters?.status ? { status: this.data.filters.status } : {}),
        },
        orderBy: { detectedAt: 'desc' },
        skip: offset,
        take: batchSize,
      });

      if (deposits.length < batchSize) {
        hasMore = false;
      }

      for (const deposit of deposits) {
        if (this.data.format === 'csv') {
          this.push(
            `${deposit.txHash},${deposit.blockNumber},${deposit.fromAddress},${deposit.forwarderAddress},${deposit.amount},${deposit.status},${deposit.detectedAt.toISOString()}\n`,
          );
        } else {
          this.push(JSON.stringify(deposit) + '\n');
        }
      }

      offset += batchSize;
    }
  }

  private push(chunk: string): void {
    this.chunks.push(chunk);
    if (this.resolveWaiting) {
      const resolve = this.resolveWaiting;
      this.resolveWaiting = null;
      resolve();
    }
  }

  end(): void {
    this.ended = true;
    if (this.resolveWaiting) {
      const resolve = this.resolveWaiting;
      this.resolveWaiting = null;
      resolve();
    }
  }

  async *[Symbol.asyncIterator](): AsyncIterator<string> {
    while (!this.ended || this.chunks.length > 0) {
      if (this.chunks.length > 0) {
        yield this.chunks.shift()!;
      } else {
        await new Promise<void>((resolve) => {
          this.resolveWaiting = resolve;
        });
      }
    }
  }
}
