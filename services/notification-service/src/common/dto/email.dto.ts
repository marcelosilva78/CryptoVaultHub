import {
  IsInt,
  IsString,
  IsPositive,
  IsEmail,
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
