import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { SendInviteEmailDto } from '../common/dto/email.dto';
import { EmailService } from './email.service';

@Controller('email')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Post('invite')
  @HttpCode(HttpStatus.OK)
  async sendInvite(@Body() dto: SendInviteEmailDto) {
    return this.emailService.sendInviteEmail(dto);
  }
}
