import {
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ProjectScopeGuard, ProjectRepository } from './project-scope.guard';

describe('ProjectScopeGuard', () => {
  let guard: ProjectScopeGuard;
  let projectRepo: jest.Mocked<ProjectRepository>;

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

  const mockProject = (overrides: Partial<any> = {}) => ({
    id: 1n,
    clientId: 10n,
    name: 'Main Project',
    slug: 'main-project',
    status: 'active',
    isDefault: false,
    ...overrides,
  });

  beforeEach(() => {
    projectRepo = {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    };

    guard = new ProjectScopeGuard(projectRepo);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should allow request with valid X-Project-Id header', async () => {
    const project = mockProject({ id: 5n, clientId: 10n });
    projectRepo.findUnique.mockResolvedValue(project);

    const request = mockRequest(10, { 'x-project-id': '5' });
    const context = mockExecutionContext(request);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(request).toHaveProperty('projectId', 5);
    expect(projectRepo.findUnique).toHaveBeenCalledWith({
      where: { id: 5n },
    });
  });

  it('should reject request with invalid (non-numeric) project ID', async () => {
    const request = mockRequest(10, { 'x-project-id': 'abc' });
    const context = mockExecutionContext(request);

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(guard.canActivate(context)).rejects.toThrow(
      'Invalid X-Project-Id header',
    );
  });

  it('should reject request with project ID that does not exist', async () => {
    projectRepo.findUnique.mockResolvedValue(null);

    const request = mockRequest(10, { 'x-project-id': '999' });
    const context = mockExecutionContext(request);

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(guard.canActivate(context)).rejects.toThrow(
      'Invalid project ID',
    );
  });

  it('should auto-select project when no header and client has single project', async () => {
    const project = mockProject({ id: 7n, clientId: 10n });
    projectRepo.findMany.mockResolvedValue([project]);

    const request = mockRequest(10);
    const context = mockExecutionContext(request);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(request).toHaveProperty('projectId', 7);
  });

  it('should return 400 with project list when no header and client has multiple projects', async () => {
    const projects = [
      mockProject({ id: 1n, name: 'Proj A', slug: 'proj-a' }),
      mockProject({ id: 2n, name: 'Proj B', slug: 'proj-b' }),
    ];
    projectRepo.findMany.mockResolvedValue(projects);

    const request = mockRequest(10);
    const context = mockExecutionContext(request);

    try {
      await guard.canActivate(context);
      fail('Expected BadRequestException');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      const response = (err as any).response;
      expect(response.message).toContain('Multiple projects found');
      expect(response.projects).toHaveLength(2);
      expect(response.projects[0]).toHaveProperty('id', 1);
      expect(response.projects[1]).toHaveProperty('id', 2);
    }
  });

  it('should reject project belonging to different client', async () => {
    const project = mockProject({ id: 5n, clientId: 99n });
    projectRepo.findUnique.mockResolvedValue(project);

    const request = mockRequest(10, { 'x-project-id': '5' });
    const context = mockExecutionContext(request);

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(guard.canActivate(context)).rejects.toThrow(
      'Project does not belong to the authenticated client',
    );
  });
});
