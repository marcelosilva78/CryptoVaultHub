import { IsEmail, IsNumber, IsString, MinLength, MaxLength } from 'class-validator';

export class GenerateInviteDto {
  @IsEmail()
  email!: string;

  @IsNumber()
  clientId!: number;
}

export class AcceptInviteDto {
  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;
}
