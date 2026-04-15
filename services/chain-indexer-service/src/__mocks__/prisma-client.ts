// Jest mock for generated Prisma client
// Prevents tests from requiring the real generated client
export const PrismaClient = jest.fn().mockImplementation(() => ({
  $connect: jest.fn(),
  $disconnect: jest.fn(),
  $transaction: jest.fn(),
}));
