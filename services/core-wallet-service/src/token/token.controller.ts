import { Controller, Post, Get, Body, Query, ParseIntPipe } from '@nestjs/common';
import { TokenService } from './token.service';
import { CreateTokenDto } from '../common/dto/token.dto';

@Controller('tokens')
export class TokenController {
  constructor(private readonly tokenService: TokenService) {}

  @Post()
  async createToken(@Body() dto: CreateTokenDto) {
    const token = await this.tokenService.createToken(dto);
    return { success: true, token };
  }

  @Get()
  async listTokens(@Query('chainId') chainId?: string) {
    const tokens = await this.tokenService.listTokens(
      chainId ? parseInt(chainId, 10) : undefined,
    );
    return { success: true, tokens };
  }
}
