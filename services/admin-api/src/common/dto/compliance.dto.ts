import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListAlertsQueryDto {
  @ApiPropertyOptional({
    description: 'Page number for pagination. Defaults to 1.',
    example: 1,
    minimum: 1,
    default: 1,
    type: 'integer',
  })
  @IsOptional()
  @IsInt()
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of results per page. Defaults to 20.',
    example: 20,
    minimum: 1,
    maximum: 100,
    default: 20,
    type: 'integer',
  })
  @IsOptional()
  @IsInt()
  limit?: number = 20;

  @ApiPropertyOptional({
    description:
      'Filter alerts by status. Only returns alerts matching the specified status.',
    example: 'pending',
    enum: ['pending', 'acknowledged', 'dismissed', 'escalated', 'resolved'],
    type: 'string',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description:
      'Filter alerts by client ID. Returns only alerts associated with the specified client.',
    example: '42',
    type: 'string',
  })
  @IsOptional()
  @IsString()
  clientId?: string;

  @ApiPropertyOptional({
    description:
      'Filter alerts by severity level. Use to prioritize review of high-severity compliance issues.',
    example: 'high',
    enum: ['low', 'medium', 'high', 'critical'],
    type: 'string',
  })
  @IsOptional()
  @IsString()
  severity?: string;
}

export class UpdateAlertDto {
  @ApiPropertyOptional({
    description:
      'New status for the alert. "acknowledged" marks it as seen. "dismissed" closes it as a false positive. "escalated" flags it for senior review. "resolved" marks it as handled.',
    example: 'acknowledged',
    enum: ['acknowledged', 'dismissed', 'escalated', 'resolved'],
    type: 'string',
  })
  @IsOptional()
  @IsEnum(['acknowledged', 'dismissed', 'escalated', 'resolved'])
  status?: string;

  @ApiPropertyOptional({
    description:
      'Free-text notes about the alert disposition. Use to document investigation findings, false positive rationale, or escalation reason.',
    example: 'Verified as legitimate transaction from known counterparty. No further action required.',
    type: 'string',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description:
      'User ID or email of the person this alert is assigned to for review. Used for workload distribution and audit trail.',
    example: 'compliance-officer@acme.com',
    type: 'string',
  })
  @IsOptional()
  @IsString()
  assignedTo?: string;
}
