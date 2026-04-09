import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class AddressBookService {
  private readonly logger = new Logger(AddressBookService.name);
  private readonly coreWalletUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.coreWalletUrl = this.configService.get<string>(
      'CORE_WALLET_SERVICE_URL',
      'http://localhost:3004',
    );
  }

  async addAddress(
    clientId: number,
    data: {
      address: string;
      chainId: number;
      label: string;
      notes?: string;
    },
  ) {
    const response = await axios.post(
      `${this.coreWalletUrl}/address-book`,
      { clientId, ...data },
      { timeout: 10000 },
    );
    return response.data;
  }

  async listAddresses(
    clientId: number,
    params: { page?: number; limit?: number; chainId?: number },
  ) {
    const response = await axios.get(
      `${this.coreWalletUrl}/address-book`,
      {
        params: { clientId, ...params },
        timeout: 10000,
      },
    );
    return response.data;
  }

  async updateAddress(
    clientId: number,
    addressId: string,
    data: { label?: string; notes?: string },
  ) {
    const response = await axios.patch(
      `${this.coreWalletUrl}/address-book/${addressId}`,
      { clientId, ...data },
      { timeout: 10000 },
    );
    return response.data;
  }

  async disableAddress(clientId: number, addressId: string) {
    const response = await axios.delete(
      `${this.coreWalletUrl}/address-book/${addressId}`,
      {
        data: { clientId },
        timeout: 10000,
      },
    );
    return response.data;
  }
}
