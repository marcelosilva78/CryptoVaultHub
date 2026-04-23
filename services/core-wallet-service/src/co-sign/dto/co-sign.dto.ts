import { IsString, IsNumber, IsOptional, Matches } from 'class-validator';

export class SubmitCoSignatureDto {
  @IsNumber()
  clientId: number;

  @IsString()
  @Matches(/^0x[0-9a-fA-F]{130}$/, {
    message: 'Signature must be a 65-byte hex string (0x-prefixed, 130 hex chars)',
  })
  signature: string;

  @IsOptional()
  @IsString()
  publicKey?: string;
}

export class GetPendingDto {
  @IsNumber()
  clientId: number;

  @IsNumber()
  projectId: number;
}
