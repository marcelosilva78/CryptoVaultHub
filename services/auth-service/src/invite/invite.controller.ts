import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { InviteService } from './invite.service';
import { GenerateInviteDto } from './invite.dto';
import { InternalServiceGuard } from '../common/guards/internal-service.guard';

@Controller('auth')
export class InviteController {
  constructor(private readonly inviteService: InviteService) {}

  @Post('invite/generate')
  @UseGuards(InternalServiceGuard)
  @HttpCode(HttpStatus.CREATED)
  async generate(@Body() dto: GenerateInviteDto) {
    return this.inviteService.generateInvite(dto.email, dto.clientId);
  }

  @Get('invite/:token/validate')
  async validate(@Param('token') token: string) {
    const invite = await this.inviteService.validateToken(token);
    return { email: invite.email, valid: true };
  }
}
