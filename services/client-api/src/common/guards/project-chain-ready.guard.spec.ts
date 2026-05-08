import { Test } from '@nestjs/testing';
import { ExecutionContext, UnprocessableEntityException } from '@nestjs/common';
import { ProjectChainReadyGuard } from './project-chain-ready.guard';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

jest.mock('axios');

describe('ProjectChainReadyGuard', () => {
  let guard: ProjectChainReadyGuard;
  const mockedAxios = axios as jest.Mocked<typeof axios>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ProjectChainReadyGuard,
        {
          provide: ConfigService,
          useValue: { get: () => 'http://core-wallet:3004' },
        },
      ],
    }).compile();
    guard = moduleRef.get(ProjectChainReadyGuard);
  });

  function ctxWith(projectId: number, chainId: number): ExecutionContext {
    const req = { projectId, body: { chainId }, params: {} } as any;
    return {
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
  }

  it('allows when deploy_status === ready', async () => {
    mockedAxios.get.mockResolvedValue({ data: { deployStatus: 'ready' } });
    await expect(guard.canActivate(ctxWith(6998, 56))).resolves.toBe(true);
  });

  it('rejects with 422 when deploy_status !== ready', async () => {
    mockedAxios.get.mockResolvedValue({ data: { deployStatus: 'pending' } });
    await expect(guard.canActivate(ctxWith(6998, 56))).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('rejects with 422 when project_chain not found', async () => {
    mockedAxios.get.mockRejectedValue({ response: { status: 404 } });
    await expect(guard.canActivate(ctxWith(6998, 56))).rejects.toThrow(
      UnprocessableEntityException,
    );
  });
});
