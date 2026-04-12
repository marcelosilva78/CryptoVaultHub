import {
  IsInt,
  IsString,
  IsPositive,
  IsEmail,
  IsUrl,
} from 'class-validator';

export class SendEmailDto {
  @IsInt()
  @IsPositive()
  clientId: number;

  @IsEmail()
  to: string;

  @IsString()
  subject: string;

  @IsString()
  body: string;
}

export class SendInviteEmailDto {
  @IsEmail()
  to!: string;

  @IsInt()
  @IsPositive()
  clientId!: number;

  @IsUrl({ require_protocol: true })
  inviteUrl!: string;

  @IsString()
  orgName!: string;
}
