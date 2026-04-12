import {
  Controller,
  Post,
  Param,
  Body,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { RegistrationService } from './registration.service';
import { AcceptInviteDto } from './invite.dto';

@Controller('auth')
export class RegistrationController {
  constructor(private readonly registrationService: RegistrationService) {}

  @Post('invite/:token/accept')
  @HttpCode(HttpStatus.CREATED)
  async accept(
    @Param('token') token: string,
    @Body() dto: AcceptInviteDto,
    @Req() req: Request,
  ) {
    return this.registrationService.acceptInvite(
      token,
      dto.password,
      dto.name,
      req.ip,
      req.headers['user-agent'] as string | undefined,
    );
  }
}
