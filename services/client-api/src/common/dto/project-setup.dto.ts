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

- **platform** — CryptoVaultHub manages all signing keys
- **co-sign** — Client co-signs withdrawal transactions`,
    example: 'platform',
    enum: ['platform', 'co-sign'],
  })
  @IsEnum(['platform', 'co-sign'])
  custodyMode!: 'platform' | 'co-sign';
}
