import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ExportKeystoreDto {
  @ApiProperty({ description: 'Project mnemonic (12 or 24 words)' })
  @IsString()
  @MinLength(20)
  mnemonic!: string;

  @ApiProperty({ description: 'Password to encrypt the keystore' })
  @IsString()
  @MinLength(8)
  password!: string;
}
