import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type KeyType = 'platform' | 'client' | 'backup' | 'gas_tank';

@Injectable()
export class KeyResolverService {
  private readonly logger = new Logger(KeyResolverService.name);
  private readonly cache = new Map<string, string>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the EOA address registered in cvh_keyvault.derived_keys for the
   * specified (clientId, keyType) tuple. Caches per-process for the lifetime
   * of the worker (key addresses are immutable while is_active=1).
   */
  async resolveAddress(clientId: number, keyType: KeyType): Promise<string> {
    const cacheKey = `${clientId}:${keyType}`;
    const hit = this.cache.get(cacheKey);
    if (hit) return hit;

    const rows = await this.prisma.$queryRaw<Array<{ address: string }>>`
      SELECT address FROM cvh_keyvault.derived_keys
      WHERE client_id = ${BigInt(clientId)}
        AND key_type = ${keyType}
        AND is_active = 1
      ORDER BY id DESC
      LIMIT 1
    `;

    if (rows.length === 0) {
      throw new Error(
        `No active ${keyType} key found for client ${clientId}`,
      );
    }

    const address = rows[0].address;
    this.cache.set(cacheKey, address);
    return address;
  }
}
