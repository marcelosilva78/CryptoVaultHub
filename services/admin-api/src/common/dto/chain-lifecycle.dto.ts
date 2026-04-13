import { IsString, IsIn, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChainLifecycleDto {
  @ApiProperty({
    description: 'Lifecycle action to perform',
    enum: ['drain', 'deactivate', 'archive', 'reactivate'],
  })
  @IsIn(['drain', 'deactivate', 'archive', 'reactivate'])
  action: string;

  @ApiProperty({
    description: 'Reason for the lifecycle transition (min 10 chars)',
    example: 'Scheduled maintenance on RPC infrastructure',
  })
  @IsString()
  @MinLength(10)
  reason: string;
}
