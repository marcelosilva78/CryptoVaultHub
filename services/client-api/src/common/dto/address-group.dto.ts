import {
  IsString,
  IsArray,
  IsInt,
  IsOptional,
  MaxLength,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ListDeployTracesQueryDto {
  @ApiPropertyOptional({ type: Number, example: 1 })
  @IsOptional()
  @IsInt()
  page?: number = 1;

  @ApiPropertyOptional({ type: Number, example: 20 })
  @IsOptional()
  @IsInt()
  limit?: number = 20;

  @ApiPropertyOptional({ type: String, example: '1' })
  @IsOptional()
  @IsString()
  chainId?: string;

  @ApiPropertyOptional({ type: String, example: 'forwarder' })
  @IsOptional()
  @IsString()
  resourceType?: string;
}

export class CreateAddressGroupDto {
  @ApiProperty({
    description: 'Human-readable label for this address group.',
    example: 'Production Wallets',
    maxLength: 100,
    type: String,
  })
  @IsString()
  @MaxLength(100)
  label!: string;

  @ApiProperty({
    description: `Array of chain IDs to include in this address group. Each chain ID refers to a supported blockchain network.

**Constraints:**
- Minimum 1 chain ID required
- Maximum 10 chain IDs allowed (HIGH-6 security constraint)`,
    example: [1, 137, 42161],
    type: [Number],
    isArray: true,
  })
  @IsArray()
  @IsInt({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  chainIds!: number[];
}

export class UpdateAddressGroupDto {
  @ApiPropertyOptional({
    description: 'Updated human-readable label for this address group.',
    example: 'Staging Wallets',
    maxLength: 100,
    type: String,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @ApiPropertyOptional({
    description: 'Updated list of chain IDs. This replaces the entire chain list.',
    example: [1, 137],
    type: [Number],
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  chainIds?: number[];
}
