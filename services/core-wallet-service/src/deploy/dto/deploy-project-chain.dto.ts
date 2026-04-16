import {
  IsInt,
  IsPositive,
  IsArray,
  ArrayMinSize,
  IsString,
  Matches,
} from 'class-validator';

export class DeployProjectChainDto {
  @IsInt()
  @IsPositive()
  clientId: number;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @Matches(/^0x[a-fA-F0-9]{40}$/, { each: true, message: 'Each signer must be a valid Ethereum address' })
  signers: string[];
}
