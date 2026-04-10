import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export interface SanctionsSyncResult {
  source: string;
  totalParsed: number;
  upserted: number;
  deactivated: number;
  errors: number;
}

interface ParsedSanctionEntry {
  entityId: string;
  entityName: string;
  address: string;
  addressType: string;
}

/**
 * Downloads and parses OFAC SDN list (and optionally EU/UN lists).
 * Extracts crypto addresses and upserts to the sanctions_entries table.
 */
@Processor('sanctions-sync', { concurrency: 2 })
@Injectable()
export class SanctionsListSyncService extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(SanctionsListSyncService.name);
  private readonly xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });

  constructor(
    @InjectQueue('sanctions-sync')
    private readonly sanctionsQueue: Queue,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.initSyncJob();
  }

  /**
   * Initialize daily sanctions list sync job.
   */
  async initSyncJob(): Promise<void> {
    await this.sanctionsQueue.add(
      'sync-ofac',
      {},
      {
        repeat: {
          pattern: '0 2 * * *', // Daily at 2 AM UTC
        },
        jobId: 'sanctions-sync-daily',
      },
    );
    this.logger.log('Sanctions list sync job initialized (daily at 2 AM UTC)');
  }

  /**
   * BullMQ worker: process sanctions list sync.
   */
  async process(job: Job): Promise<SanctionsSyncResult> {
    try {
      return await this.syncOfacList();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Sanctions list sync failed: ${msg}`,
      );
      throw error;
    }
  }

  /**
   * Download and process the OFAC SDN Advanced XML list.
   */
  async syncOfacList(): Promise<SanctionsSyncResult> {
    const result: SanctionsSyncResult = {
      source: 'OFAC_SDN',
      totalParsed: 0,
      upserted: 0,
      deactivated: 0,
      errors: 0,
    };

    const url = this.config.get<string>(
      'OFAC_SDN_URL',
      'https://www.treasury.gov/ofac/downloads/sdn_advanced.xml',
    );

    this.logger.log(`Downloading OFAC SDN list from ${url}`);

    const response = await axios.get(url, {
      timeout: 120_000,
      responseType: 'text',
    });

    const entries = this.parseOfacXml(response.data);
    result.totalParsed = entries.length;

    this.logger.log(`Parsed ${entries.length} crypto addresses from OFAC SDN list`);

    // Use staging approach to avoid deactivate-all window vulnerability:
    // 1. Upsert all new entries (set isActive: true)
    // 2. After all upserts, deactivate entries NOT in the new list
    const newAddresses = entries.map(e => e.address.toLowerCase());
    const now = new Date();

    // Upsert each entry within a transaction
    try {
      await this.prisma.$transaction(
        entries.map(entry =>
          this.prisma.sanctionsEntry.upsert({
            where: {
              listSource_address: {
                listSource: 'OFAC_SDN',
                address: entry.address.toLowerCase(),
              },
            },
            update: {
              isActive: true,
              entityName: entry.entityName,
              entityId: entry.entityId,
              addressType: entry.addressType,
              lastSyncedAt: now,
            },
            create: {
              listSource: 'OFAC_SDN',
              address: entry.address.toLowerCase(),
              addressType: entry.addressType,
              entityName: entry.entityName,
              entityId: entry.entityId,
              isActive: true,
              lastSyncedAt: now,
            },
          }),
        ),
      );
      result.upserted = entries.length;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to upsert sanctions entries: ${msg}`);
      result.errors = entries.length;
    }

    // Deactivate entries not found in new list
    if (newAddresses.length > 0) {
      const deactivateResult = await this.prisma.sanctionsEntry.updateMany({
        where: {
          listSource: 'OFAC_SDN',
          address: { notIn: newAddresses },
          isActive: true,
        },
        data: { isActive: false },
      });
      result.deactivated = deactivateResult.count;
    }

    // Publish sync complete event
    await this.redis.publishToStream('sanctions:sync', {
      event: 'sanctions.sync_complete',
      source: 'OFAC_SDN',
      totalParsed: result.totalParsed.toString(),
      upserted: result.upserted.toString(),
      deactivated: result.deactivated.toString(),
      errors: result.errors.toString(),
      timestamp: new Date().toISOString(),
    });

    this.logger.log(
      `OFAC sync complete: ${result.upserted} upserted, ${result.deactivated} deactivated, ${result.errors} errors`,
    );

    return result;
  }

  /**
   * Parse the OFAC SDN Advanced XML and extract crypto wallet addresses.
   * The XML contains <sdnEntry> elements with <idList><id> sub-elements.
   * Crypto addresses are identified by idType containing "Digital Currency Address".
   */
  parseOfacXml(xmlData: string): ParsedSanctionEntry[] {
    const entries: ParsedSanctionEntry[] = [];

    try {
      const parsed = this.xmlParser.parse(xmlData);

      // Navigate the OFAC XML structure
      const sdnList =
        parsed?.sdnList?.sdnEntry ??
        parsed?.Sanctions?.SDNEntry ??
        [];

      const sdnEntries = Array.isArray(sdnList) ? sdnList : [sdnList];

      for (const sdn of sdnEntries) {
        if (!sdn) continue;

        const sdnId = sdn.uid?.toString() ?? sdn['@_uid'] ?? '';
        const entityName =
          [sdn.firstName, sdn.lastName].filter(Boolean).join(' ') ||
          sdn.sdnName ||
          '';

        // Check ID list for crypto addresses
        const idList = sdn.idList?.id ?? sdn.idList?.ID ?? [];
        const ids = Array.isArray(idList) ? idList : [idList];

        for (const id of ids) {
          if (!id) continue;

          const idType = id.idType ?? id.idTypeDescription ?? '';
          if (
            typeof idType === 'string' &&
            idType.toLowerCase().includes('digital currency')
          ) {
            const address = id.idNumber ?? id.idValue ?? '';

            if (address) {
              const currency = id.idCountry ?? id.currency ?? 'Unknown';
              entries.push({
                entityId: sdnId,
                entityName,
                address: address.trim(),
                addressType: typeof currency === 'string' ? currency : 'Unknown',
              });
            }
          }
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to parse OFAC XML: ${msg}`);
    }

    return entries;
  }
}
