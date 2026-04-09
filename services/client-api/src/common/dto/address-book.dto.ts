import {
  IsString,
  IsOptional,
  IsInt,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddAddressDto {
  @ApiProperty({
    description: `The EVM-compatible blockchain address to whitelist for withdrawals. Must be a valid 0x-prefixed address with exactly 40 hexadecimal characters. Once added, the address enters a **24-hour cooldown period** before it can be used as a withdrawal destination. This cooldown is a security measure to prevent unauthorized withdrawals to newly added addresses in the event of an API key compromise.

**Important:**
- The address is validated for format only — no on-chain existence check is performed
- The same address can be whitelisted for multiple chains
- Addresses are not case-sensitive (checksummed and non-checksummed addresses are both accepted)`,
    example: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD68',
    pattern: '^0x[0-9a-fA-F]{40}$',
    type: String,
  })
  @IsString()
  @Matches(/^0x[0-9a-fA-F]{40}$/, {
    message: 'address must be a valid Ethereum address',
  })
  address!: string;

  @ApiProperty({
    description: `The chain ID this whitelisted address is valid for. An address can be whitelisted on multiple chains by creating separate entries for each chain. The chain must be supported by the platform.

**Supported chain IDs:**
- \`1\` — Ethereum Mainnet
- \`56\` — BNB Smart Chain
- \`137\` — Polygon
- \`42161\` — Arbitrum One
- \`10\` — Optimism
- \`43114\` — Avalanche C-Chain
- \`8453\` — Base`,
    example: 1,
    type: Number,
  })
  @IsInt()
  chainId!: number;

  @ApiProperty({
    description: 'Human-readable label for identifying this address. Use descriptive names like the recipient name or purpose. Labels are unique per client+chain combination — attempting to add an address with an existing label on the same chain will return a 409 conflict.',
    example: 'Treasury Cold Wallet',
    maxLength: 100,
    type: String,
  })
  @IsString()
  @MaxLength(100)
  label!: string;

  @ApiPropertyOptional({
    description: 'Optional notes or metadata for this address entry. Visible in the Client Portal and included in audit logs. Useful for recording the purpose, ownership, or approval details for this address.',
    example: 'Approved by CFO on 2026-04-01 for monthly settlements',
    maxLength: 255,
    type: String,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;
}

export class UpdateAddressDto {
  @ApiPropertyOptional({
    description: 'Updated label for this whitelisted address. Changing the label does not reset the cooldown period.',
    example: 'Treasury Cold Wallet (Primary)',
    maxLength: 100,
    type: String,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @ApiPropertyOptional({
    description: 'Updated notes for this whitelisted address.',
    example: 'Updated by ops team — verified ownership via Etherscan',
    maxLength: 255,
    type: String,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;
}

export class ListAddressesQueryDto {
  @ApiPropertyOptional({
    description: 'Page number for pagination (1-indexed). Defaults to 1.',
    example: 1,
    minimum: 1,
    default: 1,
    type: Number,
  })
  @IsOptional()
  @IsInt()
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Maximum number of addresses to return per page. Defaults to 50.',
    example: 50,
    minimum: 1,
    maximum: 200,
    default: 50,
    type: Number,
  })
  @IsOptional()
  @IsInt()
  limit?: number = 50;

  @ApiPropertyOptional({
    description: 'Filter addresses by chain ID. If omitted, addresses for all chains are returned.',
    example: 1,
    type: Number,
  })
  @IsOptional()
  @IsInt()
  chainId?: number;
}
