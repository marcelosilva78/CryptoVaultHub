import { Test, TestingModule } from '@nestjs/testing';
import { ExportWorkerService } from './export.worker';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';

// Mock fs module
jest.mock('fs', () => ({
  createWriteStream: jest.fn(),
  unlinkSync: jest.fn(),
}));

/**
 * Helper: create a mock async generator that yields chunks, then
 * signals itself done so the for-await loop terminates.
 * Also provides an `end()` stub expected by the source code.
 */
function createMockGenerator(chunks: string[]) {
  return {
    end: jest.fn(),
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk;
      }
      // Immediately terminate - no waiting for end()
    },
  };
}

describe('ExportWorkerService', () => {
  let service: ExportWorkerService;
  let prisma: any;
  let mockWriteStream: any;

  beforeEach(async () => {
    mockWriteStream = {
      write: jest.fn().mockReturnValue(true),
      on: jest.fn().mockImplementation(function (
        _event: string,
        cb: (...args: any[]) => void,
      ) {
        // Simulate the finish event firing immediately
        if (_event === 'finish') {
          setTimeout(cb, 2);
        }
        return mockWriteStream;
      }),
      once: jest.fn().mockImplementation(function (
        _event: string,
        cb: () => void,
      ) {
        setTimeout(cb, 1);
        return mockWriteStream;
      }),
      destroy: jest.fn(),
      end: jest.fn(),
    };

    (fs.createWriteStream as jest.Mock).mockReturnValue(mockWriteStream);

    prisma = {
      deposit: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExportWorkerService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<ExportWorkerService>(ExportWorkerService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should process export with CSV format and write header + rows', async () => {
    const csvChunks = [
      'txHash,blockNumber,fromAddress,toAddress,amount,status,createdAt\n',
      '0xabc,100,0xFrom,0xTo,1.5,confirmed,2026-01-01T00:00:00.000Z\n',
    ];
    jest.spyOn(service as any, 'createDataGenerator').mockReturnValue(
      createMockGenerator(csvChunks),
    );

    const result = await service.executeExport({
      clientId: 1,
      exportType: 'transactions',
      format: 'csv',
      outputDir: '/tmp',
    });

    expect(result).toMatch(/^\/tmp\/export_transactions_1_\d+\.csv$/);
    expect(mockWriteStream.write).toHaveBeenCalledTimes(2);
    expect(mockWriteStream.write).toHaveBeenCalledWith(csvChunks[0]);
    expect(mockWriteStream.write).toHaveBeenCalledWith(csvChunks[1]);
  });

  it('should process export with JSON format', async () => {
    const jsonChunks = ['{"txHash":"0xdef","amount":"2.0"}\n'];
    jest.spyOn(service as any, 'createDataGenerator').mockReturnValue(
      createMockGenerator(jsonChunks),
    );

    const result = await service.executeExport({
      clientId: 2,
      exportType: 'deposits',
      format: 'json',
      outputDir: '/tmp',
    });

    expect(result).toMatch(/\.json$/);
    expect(mockWriteStream.write).toHaveBeenCalledWith(jsonChunks[0]);
  });

  it('should handle 0 rows (empty export, header only for CSV)', async () => {
    const csvChunks = [
      'txHash,blockNumber,fromAddress,toAddress,amount,status,createdAt\n',
    ];
    jest.spyOn(service as any, 'createDataGenerator').mockReturnValue(
      createMockGenerator(csvChunks),
    );

    const result = await service.executeExport({
      clientId: 1,
      exportType: 'transactions',
      format: 'csv',
      outputDir: '/tmp',
    });

    expect(result).toMatch(/\.csv$/);
    expect(mockWriteStream.write).toHaveBeenCalledTimes(1);
  });

  it('should return correct file path on success', async () => {
    jest.spyOn(service as any, 'createDataGenerator').mockReturnValue(
      createMockGenerator([]),
    );

    const result = await service.executeExport({
      clientId: 42,
      exportType: 'balances',
      format: 'json',
      outputDir: '/data/exports',
    });

    expect(result).toContain('/data/exports/export_balances_42_');
    expect(result).toMatch(/\.json$/);
    expect(fs.createWriteStream).toHaveBeenCalledWith(
      expect.stringMatching(
        /^\/data\/exports\/export_balances_42_\d+\.json$/,
      ),
    );
  });

  it('should clean up partial file on error', async () => {
    mockWriteStream.write.mockImplementation(() => {
      throw new Error('Disk full');
    });

    jest.spyOn(service as any, 'createDataGenerator').mockReturnValue(
      createMockGenerator(['header\n', 'data\n']),
    );

    await expect(
      service.executeExport({
        clientId: 1,
        exportType: 'test',
        format: 'csv',
        outputDir: '/tmp',
      }),
    ).rejects.toThrow('Disk full');

    expect(mockWriteStream.destroy).toHaveBeenCalled();
    expect(fs.unlinkSync).toHaveBeenCalled();
  });

  it('should call generator.end() after streaming completes', async () => {
    const mockGen = createMockGenerator(['data\n']);
    jest.spyOn(service as any, 'createDataGenerator').mockReturnValue(mockGen);

    await service.executeExport({
      clientId: 1,
      exportType: 'test',
      format: 'csv',
      outputDir: '/tmp',
    });

    expect(mockGen.end).toHaveBeenCalled();
  });
});
