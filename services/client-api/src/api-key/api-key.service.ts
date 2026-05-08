import {
  Injectable,
  Logger,
  ForbiddenException,
  BadRequestException,
  HttpException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { isKnownScope } from '../common/scopes/scope-catalog';
import { ProjectService } from '../project/project.service';

export interface CreateApiKeyInput {
  projectId: number;
  scopes: string[];
  label?: string;
  ipAllowlist?: string[];
  allowedChains?: number[];
  expiresAt?: string;
}

@Injectable()
export class ApiKeyService {
  private readonly logger = new Logger(ApiKeyService.name);
  private readonly authServiceUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly projectService: ProjectService,
  ) {
    this.authServiceUrl = this.configService.get<string>(
      'AUTH_SERVICE_URL',
      'http://localhost:3003',
    );
  }

  private get internalHeaders() {
    return { 'X-Internal-Service-Key': process.env.INTERNAL_SERVICE_KEY || '' };
  }

  async list(clientId: number) {
    try {
      const { data } = await axios.get(
        `${this.authServiceUrl}/auth/internal/api-keys/by-client/${clientId}`,
        { headers: this.internalHeaders, timeout: 10_000 },
      );
      const projects = await this.projectService.listProjects(clientId);
      const projectNameById = new Map(
        projects.map((p: any) => [Number(p.id), p.name]),
      );
      const keys = (data?.keys ?? []).map((k: any) => ({
        ...k,
        projectName: k.projectId
          ? projectNameById.get(Number(k.projectId)) ?? null
          : null,
      }));
      return { keys };
    } catch (err: any) {
      if (err.response) {
        throw new HttpException(
          err.response.data?.message ?? 'auth-service error',
          err.response.status,
        );
      }
      this.logger.error(`Failed to list API keys: ${err.message}`);
      throw new InternalServerErrorException('Auth service unavailable');
    }
  }

  async create(clientId: number, input: CreateApiKeyInput) {
    for (const s of input.scopes) {
      if (!isKnownScope(s)) {
        throw new BadRequestException(`Unknown scope: ${s}`);
      }
    }
    const projects = await this.projectService.listProjects(clientId);
    const owned = projects.some((p: any) => Number(p.id) === input.projectId);
    if (!owned) {
      throw new ForbiddenException(
        `Project ${input.projectId} does not belong to client ${clientId}`,
      );
    }
    try {
      const { data } = await axios.post(
        `${this.authServiceUrl}/auth/internal/api-keys`,
        {
          clientId,
          projectId: input.projectId,
          scopes: input.scopes,
          label: input.label,
          ipAllowlist: input.ipAllowlist,
          allowedChains: input.allowedChains,
          expiresAt: input.expiresAt,
        },
        { headers: this.internalHeaders, timeout: 10_000 },
      );
      return data;
    } catch (err: any) {
      if (err.response) {
        throw new HttpException(
          err.response.data?.message ?? 'auth-service error',
          err.response.status,
        );
      }
      this.logger.error(`Failed to create API key: ${err.message}`);
      throw new InternalServerErrorException('Auth service unavailable');
    }
  }

  async revoke(clientId: number, keyId: number) {
    const { keys } = await this.list(clientId);
    const owned = keys.some((k: any) => Number(k.id) === keyId);
    if (!owned) {
      throw new ForbiddenException(
        `API key ${keyId} does not belong to client ${clientId}`,
      );
    }
    try {
      await axios.delete(
        `${this.authServiceUrl}/auth/internal/api-keys/${keyId}`,
        { headers: this.internalHeaders, timeout: 10_000 },
      );
      return { success: true };
    } catch (err: any) {
      if (err.response) {
        throw new HttpException(
          err.response.data?.message ?? 'auth-service error',
          err.response.status,
        );
      }
      this.logger.error(`Failed to revoke API key: ${err.message}`);
      throw new InternalServerErrorException('Auth service unavailable');
    }
  }
}
