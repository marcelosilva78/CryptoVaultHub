import {
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ProjectScopeGuard, ProjectRow } from './project-scope.guard';
import { AdminDatabaseService } from '../../prisma/admin-database.service';

describe('ProjectScopeGuard', () => {
  let guard: ProjectScopeGuard;
  let adminDb: jest.Mocked<Pick<AdminDatabaseService, 'query'>>;

  const mockRequest = (
    clientId: number,
    headers: Record<string, string> = {},
  ) => ({
    clientId,
    headers,
  });

  const mockExecutionContext = (request: any): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    }) as unknown as ExecutionContext;

  const mockProjectRow = (overrides: Partial<ProjectRow> = {}): ProjectRow => ({
    id: 1n,
    client_id: 10n,
    name: 'Main Project',
    slug: 'main-project',
    description: null,
    is_default: false,
    status: 'active',
    settings: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    adminDb = {
      query: jest.fn(),
    };

    guard = new ProjectScopeGuard(adminDb as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should allow request with valid X-Project-Id header', async () => {
    const project = mockProjectRow({ id: 5n, client_id: 10n, status: 'active' });
    adminDb.query.mockResolvedValue([project]);

    const request = mockRequest(10, { 'x-project-id': '5' });
    const context = mockExecutionContext(request);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(request).toHaveProperty('projectId', 5);
    expect(adminDb.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE id = ?'),
      [5, 10],
    );
  });

  it('should reject request with invalid (non-numeric) project ID', async () => {
    const request = mockRequest(10, { 'x-project-id': 'abc' });
    const context = mockExecutionContext(request);

    await expect(guard.canActivate(context)).rejects.toThrow(
      BadRequestException,
    );
    await expect(guard.canActivate(context)).rejects.toThrow(
      'X-Project-Id must be a numeric project ID',
    );
  });

  it('should reject request with project ID that does not exist', async () => {
    adminDb.query.mockResolvedValue([]);

    const request = mockRequest(10, { 'x-project-id': '999' });
    const context = mockExecutionContext(request);

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(guard.canActivate(context)).rejects.toThrow(
      'not found or does not belong',
    );
  });

  it('should auto-select project when no header and client has single project', async () => {
    const project = mockProjectRow({ id: 7n, client_id: 10n });
    adminDb.query.mockResolvedValue([project]);

    const request = mockRequest(10);
    const context = mockExecutionContext(request);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(request).toHaveProperty('projectId', 7);
  });

  it('should return 400 with project list when no header and client has multiple projects', async () => {
    const projects = [
      mockProjectRow({ id: 1n, name: 'Proj A', slug: 'proj-a' }),
      mockProjectRow({ id: 2n, name: 'Proj B', slug: 'proj-b' }),
    ];
    adminDb.query.mockResolvedValue(projects);

    const request = mockRequest(10);
    const context = mockExecutionContext(request);

    try {
      await guard.canActivate(context);
      fail('Expected BadRequestException');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      const response = (err as any).response;
      expect(response.message).toContain('Multiple');
      expect(response.projects).toHaveLength(2);
    }
  });

  it('should reject project belonging to different client', async () => {
    // Return a project that belongs to client 99 but the request is from client 10
    // The guard queries WHERE id = ? AND client_id = ?, so an empty result means wrong client
    adminDb.query.mockResolvedValue([]);

    const request = mockRequest(10, { 'x-project-id': '5' });
    const context = mockExecutionContext(request);

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(guard.canActivate(context)).rejects.toThrow(
      'not found or does not belong',
    );
  });
});
