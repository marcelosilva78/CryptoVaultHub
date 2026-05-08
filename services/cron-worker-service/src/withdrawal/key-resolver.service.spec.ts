import { Test } from '@nestjs/testing';
import { KeyResolverService } from './key-resolver.service';
import { PrismaService } from '../prisma/prisma.service';

describe('KeyResolverService', () => {
  let service: KeyResolverService;
  let mockPrisma: { $queryRaw: jest.Mock };

  beforeEach(async () => {
    mockPrisma = { $queryRaw: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        KeyResolverService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = moduleRef.get(KeyResolverService);
  });

  it('returns the EOA address for the active key matching (clientId, keyType)', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      { address: '0x04a093d209F5320d6b20F96550649523bc7903Ac' },
    ]);

    const addr = await service.resolveAddress(8, 'platform');

    expect(addr).toBe('0x04a093d209F5320d6b20F96550649523bc7903Ac');
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('caches subsequent calls for the same (clientId, keyType) tuple', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ address: '0xabc' }]);

    await service.resolveAddress(8, 'platform');
    await service.resolveAddress(8, 'platform');

    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('throws when no active key found', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    await expect(service.resolveAddress(8, 'platform')).rejects.toThrow(
      /No active platform key/,
    );
  });
});
