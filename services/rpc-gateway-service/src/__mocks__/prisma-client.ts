export class PrismaClient {
  $connect = jest.fn();
  $disconnect = jest.fn();
  rpcNode = {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  };
  rpcProvider = {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  };
  rpcProviderHealth = {
    create: jest.fn(),
    deleteMany: jest.fn(),
  };
  providerSwitchLog = {
    create: jest.fn(),
  };
}
