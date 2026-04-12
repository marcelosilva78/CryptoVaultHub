import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { IsEmail, IsNumber, IsString } from 'class-validator';
import { EmailService } from './email.service';

class SendInviteEmailDto {
  @IsEmail()
  to!: string;

  @IsNumber()
  clientId!: number;

  @IsString()
  inviteUrl!: string;

  @IsString()
  orgName!: string;
}

@Controller('email')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Post('invite')
  @HttpCode(HttpStatus.OK)
  async sendInvite(@Body() dto: SendInviteEmailDto) {
    return this.emailService.sendInviteEmail(dto);
  }
}
