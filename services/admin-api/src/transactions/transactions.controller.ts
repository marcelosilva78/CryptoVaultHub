import { Controller, Get, Query } from '@nestjs/common';
import { TransactionsService } from './transactions.service';

@Controller('admin/transactions')
export class TransactionsController {
  constructor(private readonly service: TransactionsService) {}

  @Get('recent')
  async getRecent(@Query('limit') limit?: string) {
    const parsed = parseInt(limit ?? '10', 10);
    const n = Math.min(isNaN(parsed) ? 10 : parsed, 50);
    return this.service.getRecentTransactions(n);
  }
}
