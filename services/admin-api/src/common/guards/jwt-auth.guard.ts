import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export interface AdminJwtPayload {
  sub: string;
  email: string;
  role: string;
  clientId?: string;
  clientRole?: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);
  private readonly jwtSecret: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
  ) {
    this.jwtSecret = this.configService.getOrThrow<string>('JWT_SECRET');
  }

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid authorization header');
    }

    const token = authHeader.slice(7);

    try {
      const payload = jwt.verify(token, this.jwtSecret) as AdminJwtPayload;

      if (!payload.sub) {
        throw new UnauthorizedException('Invalid token payload');
      }

      request.user = {
        userId: payload.sub,
        email: payload.email,
        role: payload.role,
        clientId: payload.clientId,
        clientRole: payload.clientRole,
      };

      return true;
    } catch (err) {
      this.logger.warn(`JWT validation failed: ${(err as Error).message}`);
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
