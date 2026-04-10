import { Test, TestingModule } from '@nestjs/testing';
import { DryRunService } from './dry-run.service';
import { ContractService } from '../blockchain/contract.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';

describe('DryRunService', () => {
  let service: DryRunService;
  let contractService: any;
  let evmProvider: any;
  let mockProvider: any;

  beforeEach(async () => {
    mockProvider = {
      getFeeData: jest.fn().mockResolvedValue({
        gasPrice: 20000000000n, // 20 Gwei
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DryRunService,
        {
          provide: ContractService,
          useValue: {
            getNativeBalance: jest.fn(),
          },
        },
        {
          provide: EvmProviderService,
          useValue: {
            getProvider: jest.fn().mockResolvedValue(mockProvider),
          },
        },
      ],
    }).compile();

    service = module.get<DryRunService>(DryRunService);
    contractService = module.get(ContractService);
    evmProvider = module.get(EvmProviderService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should estimate gas cost correctly', async () => {
    contractService.getNativeBalance.mockResolvedValue(
      1000000000000000000n, // 1 ETH
    );

    const result = await service.dryRun(1, ['0xAddr1']);

    // Gas cost = 21000 * 20 Gwei = 420000 Gwei = 420000000000000 wei
    const expectedGasCost = (21000n * 20000000000n).toString();

    expect(result.estimates).toHaveLength(1);
    expect(result.estimates[0].estimatedGasCost).toBe(expectedGasCost);
    expect(result.estimates[0].estimatedGas).toBe('21000');
    expect(result.totalGasCost).toBe(expectedGasCost);
  });

  it('should return balance for each address', async () => {
    contractService.getNativeBalance
      .mockResolvedValueOnce(2000000000000000000n) // 2 ETH
      .mockResolvedValueOnce(500000000000000000n); // 0.5 ETH

    const result = await service.dryRun(1, ['0xAddr1', '0xAddr2']);

    expect(result.estimates).toHaveLength(2);
    expect(result.estimates[0].address).toBe('0xAddr1');
    expect(result.estimates[0].balance).toBe('2000000000000000000');
    expect(result.estimates[1].address).toBe('0xAddr2');
    expect(result.estimates[1].balance).toBe('500000000000000000');
  });

  it('should return total estimated flush amount', async () => {
    contractService.getNativeBalance
      .mockResolvedValueOnce(1000000000000000000n) // 1 ETH
      .mockResolvedValueOnce(2000000000000000000n); // 2 ETH

    const result = await service.dryRun(1, ['0xAddr1', '0xAddr2']);

    // Total balance = 3 ETH
    expect(result.totalBalance).toBe('3000000000000000000');

    // Total gas = 2 * 21000 * 20Gwei = 840000 Gwei = 840000000000000 wei
    const totalGas = (2n * 21000n * 20000000000n).toString();
    expect(result.totalGasCost).toBe(totalGas);

    // Net = 3 ETH - gas
    const expectedNet = (3000000000000000000n - 2n * 21000n * 20000000000n).toString();
    expect(result.netAmount).toBe(expectedNet);
  });

  it('should use custom gas price when provided', async () => {
    contractService.getNativeBalance.mockResolvedValue(
      1000000000000000000n,
    );

    const customGasPrice = 50000000000n; // 50 Gwei
    const result = await service.dryRun(1, ['0xAddr1'], customGasPrice);

    const expectedGasCost = (21000n * customGasPrice).toString();
    expect(result.estimates[0].estimatedGasCost).toBe(expectedGasCost);
  });

  it('should return net amount of 0 when gas cost exceeds balance', async () => {
    // Very small balance: 100 wei
    contractService.getNativeBalance.mockResolvedValue(100n);

    const result = await service.dryRun(1, ['0xAddr1']);

    expect(result.netAmount).toBe('0');
  });

  it('should handle empty address list', async () => {
    const result = await service.dryRun(1, []);

    expect(result.estimates).toHaveLength(0);
    expect(result.totalBalance).toBe('0');
    expect(result.totalGasCost).toBe('0');
    expect(result.netAmount).toBe('0');
  });
});
