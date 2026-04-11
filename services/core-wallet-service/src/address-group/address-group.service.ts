import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { ContractService } from '../blockchain/contract.service';

export interface CreateAddressGroupDto {
  clientId: number;
  projectId: number;
  externalId?: string;
  label?: string;
}

export interface ProvisionGroupDto {
  clientId: number;
  groupId: number;
  chainIds: number[];
}

/**
 * AddressGroupService: Create groups with a shared computed CREATE2 address,
 * and provision deposit addresses per chain using the same derivation salt.
 */
@Injectable()
export class AddressGroupService {
  private readonly logger = new Logger(AddressGroupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contractService: ContractService,
  ) {}

  /**
   * Create a new address group. Computes a deterministic address
   * using CREATE2 salt derived from the group UID.
   */
  async createGroup(dto: CreateAddressGroupDto) {
    const groupUid = `ag_${randomUUID().replace(/-/g, '')}`;

    // Compute a unique derivation salt from the group UID
    const derivationSalt = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'string'],
        [dto.clientId, dto.projectId, groupUid],
      ),
    );

    // Check uniqueness of salt per client
    const existingSalt = await this.prisma.addressGroup.findUnique({
      where: {
        uq_client_salt: {
          clientId: BigInt(dto.clientId),
          derivationSalt,
        },
      },
    });
    if (existingSalt) {
      throw new ConflictException(
        'Address group with this derivation salt already exists',
      );
    }

    // Compute the shared address on a reference chain (chain 1 by default)
    // All chains with the same factory + salt yield the same CREATE2 address
    let computedAddress: string;
    try {
      // Try to get the hot wallet for the first available chain
      const hotWallet = await this.prisma.wallet.findFirst({
        where: {
          clientId: BigInt(dto.clientId),
          walletType: 'hot',
        },
      });
      const gasTank = await this.prisma.wallet.findFirst({
        where: {
          clientId: BigInt(dto.clientId),
          walletType: 'gas_tank',
        },
      });

      if (hotWallet && gasTank) {
        computedAddress = await this.contractService.computeForwarderAddress(
          hotWallet.chainId,
          hotWallet.address,
          gasTank.address,
          derivationSalt,
        );
      } else {
        // Fallback: derive from salt directly
        computedAddress = ethers.getCreate2Address(
          ethers.ZeroAddress,
          derivationSalt,
          ethers.keccak256('0x'),
        );
      }
    } catch {
      // Fallback: derive deterministically from salt
      computedAddress = ethers.getCreate2Address(
        ethers.ZeroAddress,
        derivationSalt,
        ethers.keccak256('0x'),
      );
    }

    const group = await this.prisma.addressGroup.create({
      data: {
        groupUid,
        clientId: BigInt(dto.clientId),
        projectId: BigInt(dto.projectId),
        externalId: dto.externalId ?? null,
        label: dto.label ?? null,
        derivationSalt,
        computedAddress,
        status: 'active',
      },
    });

    this.logger.log(
      `Address group ${groupUid} created for client ${dto.clientId}: ${computedAddress}`,
    );

    return this.serializeGroup(group);
  }

  /**
   * Provision an address group on specific chains.
   * Creates deposit addresses on each chain using the group's salt.
   */
  async provisionOnChains(dto: ProvisionGroupDto) {
    const group = await this.prisma.addressGroup.findFirst({
      where: {
        id: BigInt(dto.groupId),
        clientId: BigInt(dto.clientId),
      },
    });
    if (!group) {
      throw new NotFoundException(
        `Address group ${dto.groupId} not found`,
      );
    }

    const results: Array<{
      chainId: number;
      address: string;
      status: 'created' | 'already_exists' | 'error';
      error?: string;
    }> = [];

    for (const chainId of dto.chainIds) {
      try {
        // Check if already provisioned
        const existing = await this.prisma.depositAddress.findFirst({
          where: {
            clientId: BigInt(dto.clientId),
            chainId,
            addressGroupId: group.id,
          },
        });
        if (existing) {
          results.push({
            chainId,
            address: existing.address,
            status: 'already_exists',
          });
          continue;
        }

        // Get the hot wallet for this chain
        const hotWallet = await this.prisma.wallet.findUnique({
          where: {
            uq_client_chain_type: {
              clientId: BigInt(dto.clientId),
              chainId,
              walletType: 'hot',
            },
          },
        });
        const gasTank = await this.prisma.wallet.findUnique({
          where: {
            uq_client_chain_type: {
              clientId: BigInt(dto.clientId),
              chainId,
              walletType: 'gas_tank',
            },
          },
        });

        if (!hotWallet || !gasTank) {
          results.push({
            chainId,
            address: '',
            status: 'error',
            error: `Hot wallet or gas tank not found on chain ${chainId}`,
          });
          continue;
        }

        // Compute the forwarder address on this chain
        const forwarderAddress =
          await this.contractService.computeForwarderAddress(
            chainId,
            hotWallet.address,
            gasTank.address,
            group.derivationSalt,
          );

        // Create the deposit address
        await this.prisma.depositAddress.create({
          data: {
            clientId: BigInt(dto.clientId),
            chainId,
            walletId: hotWallet.id,
            address: forwarderAddress,
            externalId: group.externalId ?? group.groupUid,
            label: group.label,
            salt: group.derivationSalt,
            isDeployed: false,
            addressGroupId: group.id,
          },
        });

        results.push({
          chainId,
          address: forwarderAddress,
          status: 'created',
        });
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Failed to provision group ${dto.groupId} on chain ${chainId}: ${msg}`,
        );
        results.push({
          chainId,
          address: '',
          status: 'error',
          error: msg,
        });
      }
    }

    this.logger.log(
      `Address group ${dto.groupId} provisioned on ${results.filter((r) => r.status === 'created').length}/${dto.chainIds.length} chains`,
    );

    return { groupId: dto.groupId, provisions: results };
  }

  /**
   * List address groups for a client.
   */
  async listGroups(
    clientId: number,
    params: {
      projectId?: number;
      status?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      clientId: BigInt(clientId),
    };
    if (params.projectId) where.projectId = BigInt(params.projectId);
    if (params.status) where.status = params.status;

    const [groups, total] = await Promise.all([
      this.prisma.addressGroup.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.addressGroup.count({ where }),
    ]);

    // For each group, get provisioned chains
    const groupsWithChains = await Promise.all(
      groups.map(async (group: any) => {
        const addresses = await this.prisma.depositAddress.findMany({
          where: { addressGroupId: group.id },
          select: { chainId: true, address: true, isDeployed: true },
        });
        return {
          ...this.serializeGroup(group),
          chains: addresses.map((a) => ({
            chainId: a.chainId,
            address: a.address,
            isDeployed: a.isDeployed,
          })),
        };
      }),
    );

    return {
      groups: groupsWithChains,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Get a single address group with its chain details.
   */
  async getGroup(clientId: number, groupId: number) {
    const group = await this.prisma.addressGroup.findFirst({
      where: {
        id: BigInt(groupId),
        clientId: BigInt(clientId),
      },
    });
    if (!group) {
      throw new NotFoundException(
        `Address group ${groupId} not found`,
      );
    }

    const addresses = await this.prisma.depositAddress.findMany({
      where: { addressGroupId: group.id },
    });

    return {
      ...this.serializeGroup(group),
      chains: addresses.map((a) => ({
        chainId: a.chainId,
        address: a.address,
        isDeployed: a.isDeployed,
        depositAddressId: Number(a.id),
        createdAt: a.createdAt,
      })),
    };
  }

  private serializeGroup(group: Record<string, unknown>) {
    return {
      id: Number(group.id),
      groupUid: group.groupUid,
      clientId: Number(group.clientId),
      projectId: Number(group.projectId),
      externalId: group.externalId ?? null,
      label: group.label ?? null,
      derivationSalt: group.derivationSalt,
      computedAddress: group.computedAddress,
      status: group.status,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    };
  }
}
