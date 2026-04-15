import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export type SanctionsListSource =
  | 'OFAC_SDN'
  | 'OFAC_CONSOLIDATED'
  | 'EU'
  | 'UN'
  | 'UK_OFSI';

export interface SanctionsSyncResult {
  source: SanctionsListSource;
  totalParsed: number;
  upserted: number;
  deactivated: number;
  errors: number;
}

interface ParsedSanctionEntry {
  sdnId: string;
  entityName: string;
  cryptoAddress: string;
  currency: string;
}

/**
 * Downloads and parses sanctions lists from OFAC SDN, OFAC Consolidated,
 * EU Sanctions, UN Consolidated, and UK OFSI.
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
   * Initialize daily sanctions list sync jobs (staggered by 1 hour).
   */
  async initSyncJob(): Promise<void> {
    const schedules: { name: string; source: SanctionsListSource; cron: string }[] = [
      { name: 'sync-ofac-sdn',          source: 'OFAC_SDN',          cron: '0 2 * * *' },
      { name: 'sync-ofac-consolidated',  source: 'OFAC_CONSOLIDATED', cron: '0 3 * * *' },
      { name: 'sync-eu-sanctions',       source: 'EU',                cron: '0 4 * * *' },
      { name: 'sync-un-consolidated',    source: 'UN',                cron: '0 5 * * *' },
      { name: 'sync-uk-ofsi',            source: 'UK_OFSI',           cron: '0 6 * * *' },
    ];

    for (const schedule of schedules) {
      await this.sanctionsQueue.add(
        schedule.name,
        { source: schedule.source },
        {
          repeat: { pattern: schedule.cron },
          jobId: `sanctions-${schedule.source}-daily`,
        },
      );
    }

    this.logger.log(
      `Sanctions list sync jobs initialized: ${schedules.map((s) => `${s.source} at ${s.cron}`).join(', ')}`,
    );
  }

  /**
   * BullMQ worker: process sanctions list sync based on job source.
   */
  async process(job: Job<{ source?: SanctionsListSource }>): Promise<SanctionsSyncResult> {
    const source = job.data?.source ?? 'OFAC_SDN';

    try {
      switch (source) {
        case 'OFAC_SDN':
          return await this.syncOfacList();
        case 'OFAC_CONSOLIDATED':
          return await this.syncOfacConsolidatedList();
        case 'EU':
          return await this.syncEuSanctionsList();
        case 'UN':
          return await this.syncUnConsolidatedList();
        case 'UK_OFSI':
          return await this.syncUkOfsiList();
        default:
          this.logger.warn(`Unknown sanctions source: ${source}, falling back to OFAC SDN`);
          return await this.syncOfacList();
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Sanctions list sync failed for ${source}: ${msg}`,
      );
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Shared upsert + deactivate logic
  // ---------------------------------------------------------------------------

  /**
   * Upsert parsed entries for a given list source, then deactivate stale entries.
   * Uses staging approach to avoid deactivate-all window vulnerability.
   */
  private async upsertAndDeactivate(
    source: SanctionsListSource,
    entries: ParsedSanctionEntry[],
    result: SanctionsSyncResult,
  ): Promise<void> {
    const newAddresses = entries.map((e) => e.cryptoAddress.toLowerCase());

    // Upsert each entry within a transaction
    try {
      await this.prisma.$transaction(
        entries.map((entry) =>
          this.prisma.sanctionsEntry.upsert({
            where: {
              listSource_address: {
                listSource: source,
                address: entry.cryptoAddress.toLowerCase(),
              },
            },
            update: {
              isActive: true,
              entityName: entry.entityName,
              entityId: entry.sdnId,
              addressType: entry.currency,
              lastSyncedAt: new Date(),
            },
            create: {
              listSource: source,
              address: entry.cryptoAddress.toLowerCase(),
              addressType: entry.currency,
              entityName: entry.entityName,
              entityId: entry.sdnId,
              isActive: true,
              lastSyncedAt: new Date(),
            },
          }),
        ),
      );
      result.upserted = entries.length;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to upsert ${source} sanctions entries: ${msg}`);
      result.errors = entries.length;
    }

    // Deactivate entries not found in new list
    if (newAddresses.length > 0) {
      const deactivateResult = await this.prisma.sanctionsEntry.updateMany({
        where: {
          listSource: source,
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
      source,
      totalParsed: result.totalParsed.toString(),
      upserted: result.upserted.toString(),
      deactivated: result.deactivated.toString(),
      errors: result.errors.toString(),
      timestamp: new Date().toISOString(),
    });

    this.logger.log(
      `${source} sync complete: ${result.upserted} upserted, ${result.deactivated} deactivated, ${result.errors} errors`,
    );
  }

  // ---------------------------------------------------------------------------
  // OFAC SDN
  // ---------------------------------------------------------------------------

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

    await this.upsertAndDeactivate('OFAC_SDN', entries, result);
    return result;
  }

  // ---------------------------------------------------------------------------
  // OFAC Consolidated (same XML format as SDN)
  // ---------------------------------------------------------------------------

  /**
   * Download and process the OFAC Consolidated Non-SDN list.
   * Uses the same XML format as OFAC SDN — the parseOfacXml parser handles both.
   */
  async syncOfacConsolidatedList(): Promise<SanctionsSyncResult> {
    const result: SanctionsSyncResult = {
      source: 'OFAC_CONSOLIDATED',
      totalParsed: 0,
      upserted: 0,
      deactivated: 0,
      errors: 0,
    };

    const url = this.config.get<string>(
      'OFAC_CONSOLIDATED_URL',
      'https://www.treasury.gov/ofac/downloads/consolidated/cons_advanced.xml',
    );

    this.logger.log(`Downloading OFAC Consolidated list from ${url}`);

    const response = await axios.get(url, {
      timeout: 120_000,
      responseType: 'text',
    });

    // Same XML format as OFAC SDN
    const entries = this.parseOfacXml(response.data);
    result.totalParsed = entries.length;

    this.logger.log(`Parsed ${entries.length} crypto addresses from OFAC Consolidated list`);

    await this.upsertAndDeactivate('OFAC_CONSOLIDATED', entries, result);
    return result;
  }

  // ---------------------------------------------------------------------------
  // EU Sanctions
  // ---------------------------------------------------------------------------

  /**
   * Download and process the EU Financial Sanctions (FSD) XML list.
   *
   * The EU FSD XML schema differs significantly from OFAC:
   *   <export> -> <sanctionEntity> -> <nameAlias>, <identification>
   * Crypto addresses are rare but may appear in <identification> elements
   * with regulationType containing digital/crypto references.
   *
   * NOTE: Full XML parser implementation is stubbed — the EU schema requires
   * dedicated parsing logic. This method downloads the XML, attempts to extract
   * crypto addresses, and logs results. If parsing yields no results, it still
   * updates the sync event for audit trail.
   */
  async syncEuSanctionsList(): Promise<SanctionsSyncResult> {
    const result: SanctionsSyncResult = {
      source: 'EU',
      totalParsed: 0,
      upserted: 0,
      deactivated: 0,
      errors: 0,
    };

    const url = this.config.get<string>(
      'EU_SANCTIONS_URL',
      'https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content?token=dG9rZW4tMjAxNw',
    );

    this.logger.log(`Downloading EU Sanctions list from ${url}`);

    try {
      const response = await axios.get(url, {
        timeout: 120_000,
        responseType: 'text',
      });

      const entries = this.parseEuSanctionsXml(response.data);
      result.totalParsed = entries.length;

      this.logger.log(`Parsed ${entries.length} crypto addresses from EU Sanctions list`);

      if (entries.length > 0) {
        await this.upsertAndDeactivate('EU', entries, result);
      } else {
        // Still publish sync event for audit trail even with zero entries
        await this.redis.publishToStream('sanctions:sync', {
          event: 'sanctions.sync_complete',
          source: 'EU',
          totalParsed: '0',
          upserted: '0',
          deactivated: '0',
          errors: '0',
          timestamp: new Date().toISOString(),
        });
        this.logger.log('EU sync complete: 0 crypto addresses found in current list');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to download/parse EU Sanctions list: ${msg}`);
      result.errors = 1;
    }

    return result;
  }

  /**
   * Parse EU FSD XML for crypto addresses.
   * EU schema: <export><sanctionEntity><identification> elements where
   * identificationScheme may reference digital currency / crypto wallet.
   */
  parseEuSanctionsXml(xmlData: string): ParsedSanctionEntry[] {
    const entries: ParsedSanctionEntry[] = [];

    try {
      const parsed = this.xmlParser.parse(xmlData);

      const sanctionEntities =
        parsed?.export?.sanctionEntity ??
        [];
      const entityList = Array.isArray(sanctionEntities)
        ? sanctionEntities
        : [sanctionEntities];

      for (const entity of entityList) {
        if (!entity) continue;

        const entityId = entity['@_euReferenceNumber']?.toString() ??
          entity['@_logicalId']?.toString() ?? '';

        // Extract entity name from nameAlias
        const nameAliases = entity.nameAlias ?? [];
        const names = Array.isArray(nameAliases) ? nameAliases : [nameAliases];
        const entityName = names[0]?.['@_wholeName'] ?? names[0]?.wholeName ?? '';

        // Check identification entries for crypto addresses
        const identifications = entity.identification ?? [];
        const idList = Array.isArray(identifications) ? identifications : [identifications];

        for (const id of idList) {
          if (!id) continue;

          const idType =
            id['@_identificationScheme'] ??
            id.identificationScheme ??
            id['@_regulationType'] ??
            '';

          if (
            typeof idType === 'string' &&
            (idType.toLowerCase().includes('digital currency') ||
             idType.toLowerCase().includes('crypto') ||
             idType.toLowerCase().includes('virtual asset'))
          ) {
            const address =
              id['@_number'] ?? id.number ?? id['@_latinNumber'] ?? '';

            if (address) {
              entries.push({
                sdnId: entityId,
                entityName: typeof entityName === 'string' ? entityName : '',
                cryptoAddress: address.toString().trim(),
                currency: id['@_currency'] ?? 'Unknown',
              });
            }
          }
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to parse EU Sanctions XML: ${msg}`);
    }

    return entries;
  }

  // ---------------------------------------------------------------------------
  // UN Consolidated
  // ---------------------------------------------------------------------------

  /**
   * Download and process the UN Security Council Consolidated Sanctions list.
   *
   * The UN XML schema: <CONSOLIDATED_LIST><INDIVIDUALS|ENTITIES><INDIVIDUAL|ENTITY>
   * Crypto addresses are not common in UN lists but may appear in
   * <INDIVIDUAL_DOCUMENT> or free-text fields. This parser checks for
   * document entries referencing digital currency.
   */
  async syncUnConsolidatedList(): Promise<SanctionsSyncResult> {
    const result: SanctionsSyncResult = {
      source: 'UN',
      totalParsed: 0,
      upserted: 0,
      deactivated: 0,
      errors: 0,
    };

    const url = this.config.get<string>(
      'UN_CONSOLIDATED_URL',
      'https://scsanctions.un.org/resources/xml/en/consolidated.xml',
    );

    this.logger.log(`Downloading UN Consolidated list from ${url}`);

    try {
      const response = await axios.get(url, {
        timeout: 120_000,
        responseType: 'text',
      });

      const entries = this.parseUnConsolidatedXml(response.data);
      result.totalParsed = entries.length;

      this.logger.log(`Parsed ${entries.length} crypto addresses from UN Consolidated list`);

      if (entries.length > 0) {
        await this.upsertAndDeactivate('UN', entries, result);
      } else {
        await this.redis.publishToStream('sanctions:sync', {
          event: 'sanctions.sync_complete',
          source: 'UN',
          totalParsed: '0',
          upserted: '0',
          deactivated: '0',
          errors: '0',
          timestamp: new Date().toISOString(),
        });
        this.logger.log('UN sync complete: 0 crypto addresses found in current list');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to download/parse UN Consolidated list: ${msg}`);
      result.errors = 1;
    }

    return result;
  }

  /**
   * Parse UN Consolidated XML for crypto addresses.
   * Checks both INDIVIDUALS and ENTITIES sections for document references
   * that may contain digital currency addresses.
   */
  parseUnConsolidatedXml(xmlData: string): ParsedSanctionEntry[] {
    const entries: ParsedSanctionEntry[] = [];

    try {
      const parsed = this.xmlParser.parse(xmlData);
      const root = parsed?.CONSOLIDATED_LIST ?? parsed?.consolidatedList ?? {};

      // Process both individuals and entities
      const sections = [
        root?.INDIVIDUALS?.INDIVIDUAL ?? [],
        root?.ENTITIES?.ENTITY ?? [],
      ];

      for (const section of sections) {
        const entityList = Array.isArray(section) ? section : [section];

        for (const entity of entityList) {
          if (!entity) continue;

          const entityId =
            entity?.DATAID?.toString() ??
            entity?.REFERENCE_NUMBER?.toString() ?? '';

          const entityName =
            [entity?.FIRST_NAME, entity?.SECOND_NAME, entity?.THIRD_NAME]
              .filter(Boolean)
              .join(' ') || entity?.NAME_ORIGINAL_SCRIPT || '';

          // Check documents for crypto addresses
          const documents = entity?.INDIVIDUAL_DOCUMENT ?? entity?.ENTITY_DOCUMENT ?? [];
          const docList = Array.isArray(documents) ? documents : [documents];

          for (const doc of docList) {
            if (!doc) continue;

            const docType =
              doc?.TYPE_OF_DOCUMENT ?? doc?.TYPE_OF_DOCUMENT2 ?? '';

            if (
              typeof docType === 'string' &&
              (docType.toLowerCase().includes('digital currency') ||
               docType.toLowerCase().includes('crypto') ||
               docType.toLowerCase().includes('virtual asset'))
            ) {
              const address = doc?.NUMBER ?? doc?.NOTE ?? '';

              if (address) {
                entries.push({
                  sdnId: entityId,
                  entityName: typeof entityName === 'string' ? entityName : '',
                  cryptoAddress: address.toString().trim(),
                  currency: 'Unknown',
                });
              }
            }
          }
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to parse UN Consolidated XML: ${msg}`);
    }

    return entries;
  }

  // ---------------------------------------------------------------------------
  // UK OFSI
  // ---------------------------------------------------------------------------

  /**
   * Download and process the UK OFSI Consolidated List.
   *
   * The UK OFSI 2022 format XML schema:
   *   <ArrayOfFinancialSanctionsTarget><FinancialSanctionsTarget>
   *   Contains <GroupID>, <Names>, <Addresses>, <OtherInformation>
   *   Crypto addresses may appear in <OtherInformation> or ID-related fields.
   */
  async syncUkOfsiList(): Promise<SanctionsSyncResult> {
    const result: SanctionsSyncResult = {
      source: 'UK_OFSI',
      totalParsed: 0,
      upserted: 0,
      deactivated: 0,
      errors: 0,
    };

    const url = this.config.get<string>(
      'UK_OFSI_URL',
      'https://ofsistorage.blob.core.windows.net/publishlive/2022format/ConList.xml',
    );

    this.logger.log(`Downloading UK OFSI list from ${url}`);

    try {
      const response = await axios.get(url, {
        timeout: 120_000,
        responseType: 'text',
      });

      const entries = this.parseUkOfsiXml(response.data);
      result.totalParsed = entries.length;

      this.logger.log(`Parsed ${entries.length} crypto addresses from UK OFSI list`);

      if (entries.length > 0) {
        await this.upsertAndDeactivate('UK_OFSI', entries, result);
      } else {
        await this.redis.publishToStream('sanctions:sync', {
          event: 'sanctions.sync_complete',
          source: 'UK_OFSI',
          totalParsed: '0',
          upserted: '0',
          deactivated: '0',
          errors: '0',
          timestamp: new Date().toISOString(),
        });
        this.logger.log('UK OFSI sync complete: 0 crypto addresses found in current list');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to download/parse UK OFSI list: ${msg}`);
      result.errors = 1;
    }

    return result;
  }

  /**
   * Parse UK OFSI XML for crypto addresses.
   * Checks FinancialSanctionsTarget entries for ID and OtherInformation
   * fields that reference digital currency / crypto wallet addresses.
   */
  parseUkOfsiXml(xmlData: string): ParsedSanctionEntry[] {
    const entries: ParsedSanctionEntry[] = [];

    try {
      const parsed = this.xmlParser.parse(xmlData);

      const targets =
        parsed?.ArrayOfFinancialSanctionsTarget?.FinancialSanctionsTarget ?? [];
      const targetList = Array.isArray(targets) ? targets : [targets];

      for (const target of targetList) {
        if (!target) continue;

        const entityId = target?.GroupID?.toString() ?? target?.UniqueID?.toString() ?? '';

        // Extract entity name
        const names = target?.Names?.Name ?? [];
        const nameList = Array.isArray(names) ? names : [names];
        const firstName = nameList[0]?.Name1 ?? '';
        const lastName = nameList[0]?.Name6 ?? nameList[0]?.Name2 ?? '';
        const entityName = [firstName, lastName].filter(Boolean).join(' ');

        // Check OtherInformation for crypto references
        const otherInfo = target?.OtherInformation?.OtherInfo ?? [];
        const infoList = Array.isArray(otherInfo) ? otherInfo : [otherInfo];

        for (const info of infoList) {
          if (!info) continue;

          const infoText = typeof info === 'string' ? info : info?.toString() ?? '';

          // UK OFSI may encode crypto addresses as:
          // "Digital currency wallet address: 0x..."
          const cryptoMatch = infoText.match(
            /(?:digital currency|crypto|virtual asset)[^:]*:\s*([a-zA-Z0-9]{20,})/i,
          );

          if (cryptoMatch && cryptoMatch[1]) {
            entries.push({
              sdnId: entityId,
              entityName: typeof entityName === 'string' ? entityName : '',
              cryptoAddress: cryptoMatch[1].trim(),
              currency: 'Unknown',
            });
          }
        }

        // Also check ID elements if present
        const ids = target?.IDs?.ID ?? [];
        const idList = Array.isArray(ids) ? ids : [ids];

        for (const id of idList) {
          if (!id) continue;

          const idType = id?.IDType ?? '';
          if (
            typeof idType === 'string' &&
            (idType.toLowerCase().includes('digital currency') ||
             idType.toLowerCase().includes('crypto'))
          ) {
            const address = id?.IDNumber ?? '';
            if (address) {
              entries.push({
                sdnId: entityId,
                entityName: typeof entityName === 'string' ? entityName : '',
                cryptoAddress: address.toString().trim(),
                currency: 'Unknown',
              });
            }
          }
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to parse UK OFSI XML: ${msg}`);
    }

    return entries;
  }

  // ---------------------------------------------------------------------------
  // OFAC SDN XML parser
  // ---------------------------------------------------------------------------

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
              const currencyVal = id.idCountry ?? id.currency ?? 'Unknown';
              entries.push({
                sdnId,
                entityName,
                cryptoAddress: address.trim(),
                currency: typeof currencyVal === 'string' ? currencyVal : 'Unknown',
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
