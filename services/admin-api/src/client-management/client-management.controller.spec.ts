import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ClientManagementController } from './client-management.controller';
import { ClientManagementService } from './client-management.service';

describe('ClientManagementController', () => {
  let controller: ClientManagementController;
  let service: ClientManagementService;

  const mockService = {
    createClient: jest.fn(),
    listClients: jest.fn(),
    getClient: jest.fn(),
    updateClient: jest.fn(),
    generateKeys: jest.fn(),
  };

  const mockReq = {
    user: { userId: 'admin-1', role: 'super_admin' },
    ip: '127.0.0.1',
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientManagementController],
      providers: [
        { provide: ClientManagementService, useValue: mockService },
        { provide: ConfigService, useValue: { get: jest.fn(), getOrThrow: jest.fn().mockReturnValue('test-secret') } },
      ],
    }).compile();

    controller = module.get<ClientManagementController>(
      ClientManagementController,
    );
    service = module.get<ClientManagementService>(ClientManagementService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createClient', () => {
    it('should create a client and return success', async () => {
      const dto = { name: 'Test Client', slug: 'test-client' };
      const mockClient = {
        id: '1',
        name: 'Test Client',
        slug: 'test-client',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockService.createClient.mockResolvedValueOnce(mockClient);

      const result = await controller.createClient(dto, mockReq);

      expect(result).toEqual({ success: true, client: mockClient });
      expect(mockService.createClient).toHaveBeenCalledWith(
        dto,
        'admin-1',
        '127.0.0.1',
      );
    });
  });

  describe('listClients', () => {
    it('should return paginated list of clients', async () => {
      const mockResult = {
        items: [
          { id: '1', name: 'Client A', slug: 'client-a' },
          { id: '2', name: 'Client B', slug: 'client-b' },
        ],
        total: 2,
        page: 1,
        limit: 20,
      };

      mockService.listClients.mockResolvedValueOnce(mockResult);

      const result = await controller.listClients({
        page: 1,
        limit: 20,
      });

      expect(result.success).toBe(true);
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should support filtering by status', async () => {
      mockService.listClients.mockResolvedValueOnce({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
      });

      await controller.listClients({
        page: 1,
        limit: 20,
        status: 'suspended',
      });

      expect(mockService.listClients).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        status: 'suspended',
        search: undefined,
      });
    });
  });

  describe('getClient', () => {
    it('should return a single client', async () => {
      const mockClient = {
        id: '1',
        name: 'Test Client',
        slug: 'test-client',
        status: 'active',
      };

      mockService.getClient.mockResolvedValueOnce(mockClient);

      const result = await controller.getClient(1);

      expect(result).toEqual({ success: true, client: mockClient });
      expect(mockService.getClient).toHaveBeenCalledWith(1);
    });
  });

  describe('updateClient', () => {
    it('should update a client', async () => {
      const dto = { name: 'Updated Client' };
      const mockClient = {
        id: '1',
        name: 'Updated Client',
        slug: 'test-client',
        status: 'active',
      };

      mockService.updateClient.mockResolvedValueOnce(mockClient);

      const result = await controller.updateClient(1, dto, mockReq);

      expect(result).toEqual({ success: true, client: mockClient });
      expect(mockService.updateClient).toHaveBeenCalledWith(
        1,
        dto,
        'admin-1',
        '127.0.0.1',
      );
    });
  });

  describe('generateKeys', () => {
    it('should trigger key generation', async () => {
      const mockResult = { status: 'keys_generated', publicKey: 'pk_...' };

      mockService.generateKeys.mockResolvedValueOnce(mockResult);

      const result = await controller.generateKeys(1, mockReq);

      expect(result.success).toBe(true);
      expect(mockService.generateKeys).toHaveBeenCalledWith(
        1,
        'admin-1',
        '127.0.0.1',
      );
    });
  });
});
