import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ProjectManagementService } from './project-management.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ProjectManagementService', () => {
  let service: ProjectManagementService;
  let prisma: any;

  const mockProject = (overrides: Partial<any> = {}) => ({
    id: 1n,
    clientId: 10n,
    name: 'Main Project',
    slug: 'main-project',
    description: 'Primary project',
    status: 'active',
    isDefault: false,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectManagementService,
        {
          provide: PrismaService,
          useValue: {
            project: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<ProjectManagementService>(ProjectManagementService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createProject', () => {
    it('should create a project for a client successfully', async () => {
      const project = mockProject();
      prisma.project.findUnique.mockResolvedValue(null);
      prisma.project.create.mockResolvedValue(project);

      const result = await service.createProject({
        clientId: 10,
        name: 'Main Project',
        slug: 'main-project',
        description: 'Primary project',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe(1);
      expect(result.clientId).toBe(10);
      expect(result.name).toBe('Main Project');
      expect(result.slug).toBe('main-project');
      expect(result.status).toBe('active');
      expect(result.isDefault).toBe(false);

      expect(prisma.project.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          clientId: 10n,
          name: 'Main Project',
          slug: 'main-project',
          description: 'Primary project',
          status: 'active',
          isDefault: false,
        }),
      });
    });

    it('should fail when creating a project with duplicate slug', async () => {
      prisma.project.findUnique.mockResolvedValue(mockProject());

      await expect(
        service.createProject({
          clientId: 10,
          name: 'Another Project',
          slug: 'main-project',
        }),
      ).rejects.toThrow(ConflictException);

      await expect(
        service.createProject({
          clientId: 10,
          name: 'Another Project',
          slug: 'main-project',
        }),
      ).rejects.toThrow('Project with slug "main-project" already exists');

      expect(prisma.project.create).not.toHaveBeenCalled();
    });
  });

  describe('setDefaultProject', () => {
    it('should set a project as default and unset the previous default', async () => {
      const project = mockProject({ id: 2n });
      prisma.project.findUnique.mockResolvedValue(project);
      prisma.project.updateMany.mockResolvedValue({ count: 1 });
      prisma.project.update.mockResolvedValue({
        ...project,
        isDefault: true,
      });

      const result = await service.setDefaultProject(10, 2);

      expect(result.isDefault).toBe(true);

      // Verify previous default was unset
      expect(prisma.project.updateMany).toHaveBeenCalledWith({
        where: {
          clientId: 10n,
          isDefault: true,
        },
        data: { isDefault: false },
      });

      // Verify new default was set
      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id: 2n },
        data: { isDefault: true },
      });
    });

    it('should throw NotFoundException if project does not belong to client', async () => {
      prisma.project.findUnique.mockResolvedValue(
        mockProject({ clientId: 99n }),
      );

      await expect(service.setDefaultProject(10, 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('archiveProject', () => {
    it('should archive a non-default project', async () => {
      const project = mockProject({ isDefault: false });
      prisma.project.findUnique.mockResolvedValue(project);
      prisma.project.update.mockResolvedValue({
        ...project,
        status: 'archived',
      });

      const result = await service.archiveProject(10, 1);

      expect(result.status).toBe('archived');
      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id: 1n },
        data: { status: 'archived' },
      });
    });

    it('should not archive the default project', async () => {
      const project = mockProject({ isDefault: true });
      prisma.project.findUnique.mockResolvedValue(project);

      await expect(service.archiveProject(10, 1)).rejects.toThrow(
        BadRequestException,
      );

      await expect(service.archiveProject(10, 1)).rejects.toThrow(
        'Cannot archive the default project',
      );

      expect(prisma.project.update).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if project not found', async () => {
      prisma.project.findUnique.mockResolvedValue(null);

      await expect(service.archiveProject(10, 999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('listProjects', () => {
    it('should list projects filtered by client', async () => {
      const projects = [
        mockProject({ id: 1n, slug: 'proj-1' }),
        mockProject({ id: 2n, slug: 'proj-2' }),
      ];
      prisma.project.findMany.mockResolvedValue(projects);

      const result = await service.listProjects({ clientId: 10 });

      expect(result).toHaveLength(2);
      expect(prisma.project.findMany).toHaveBeenCalledWith({
        where: { clientId: 10n },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should list projects filtered by client and status', async () => {
      const projects = [
        mockProject({ id: 1n, status: 'active' }),
      ];
      prisma.project.findMany.mockResolvedValue(projects);

      const result = await service.listProjects({
        clientId: 10,
        status: 'active',
      });

      expect(result).toHaveLength(1);
      expect(prisma.project.findMany).toHaveBeenCalledWith({
        where: { clientId: 10n, status: 'active' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });
});
