import {
  IsString,
  IsOptional,
  IsInt,
  IsArray,
  ArrayMinSize,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAddressGroupDto {
  @ApiPropertyOptional({
    description: 'External ID from your system to link this group.',
    example: 'user-12345',
    maxLength: 255,
    type: String,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  externalId?: string;

  @ApiPropertyOptional({
    description: 'Human-readable label for the group.',
    example: 'VIP Customer - John Doe',
    maxLength: 255,
    type: String,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  label?: string;
}

export class ProvisionAddressGroupDto {
  @ApiProperty({
    description: 'Array of chain IDs to provision this group on.',
    example: [1, 56, 137],
    type: [Number],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  chainIds!: number[];
}

export class ListAddressGroupsQueryDto {
  @ApiPropertyOptional({
    description: 'Page number (1-indexed).',
    example: 1,
    default: 1,
    type: Number,
  })
  @IsOptional()
  @IsInt()
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Results per page (1-100).',
    example: 20,
    default: 20,
    type: Number,
  })
  @IsOptional()
  @IsInt()
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Filter by group status.',
    example: 'active',
    enum: ['active', 'disabled'],
  })
  @IsOptional()
  @IsString()
  status?: string;
}

export class ListDeployTracesQueryDto {
  @ApiPropertyOptional({
    description: 'Page number (1-indexed).',
    example: 1,
    default: 1,
    type: Number,
  })
  @IsOptional()
  @IsInt()
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Results per page (1-100).',
    example: 20,
    default: 20,
    type: Number,
  })
  @IsOptional()
  @IsInt()
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Filter by chain ID.',
    example: '56',
    type: String,
  })
  @IsOptional()
  @IsString()
  chainId?: string;

  @ApiPropertyOptional({
    description: 'Filter by resource type.',
    example: 'forwarder',
    enum: ['wallet', 'forwarder', 'factory', 'token_contract'],
  })
  @IsOptional()
  @IsString()
  resourceType?: string;
}
