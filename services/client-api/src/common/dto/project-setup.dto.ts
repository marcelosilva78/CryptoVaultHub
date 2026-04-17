import {
  IsString,
  IsOptional,
  IsInt,
  IsArray,
  IsEnum,
  ArrayMinSize,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProjectDto {
  @ApiProperty({
    description: 'Human-readable project name.',
    example: 'My DeFi Gateway',
    minLength: 2,
    maxLength: 100,
  })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({
    description: 'Optional project description.',
    example: 'Multi-chain payment processing for our marketplace.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({
    description: `Array of chain IDs to deploy contracts on.

**Supported chain IDs:**
| Chain | Chain ID |
|-------|----------|
| Ethereum | 1 |
| BSC | 56 |
| Polygon | 137 |
| Arbitrum | 42161 |
| Base | 8453 |`,
    example: [56, 137],
    type: [Number],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  chains!: number[];

  @ApiProperty({
    description: `Custody mode for the project.

- **full_custody** — CryptoVaultHub manages all signing keys (auto-signs both platform and client keys)
- **co_sign** — Platform key managed by CVH, client key managed by client (needs co-sign for withdrawals)
- **client_only** — Both keys managed by the client`,
    example: 'full_custody',
    enum: ['full_custody', 'co_sign', 'client_only'],
  })
  @IsEnum(['full_custody', 'co_sign', 'client_only'])
  custodyMode!: 'full_custody' | 'co_sign' | 'client_only';
}
