import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtAuthService } from './jwt-auth.service';
import { JwtStrategy } from './jwt-strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: parseInt(
            configService.get<string>('JWT_EXPIRES_IN_SECONDS', '900'),
            10,
          ),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [JwtAuthService, JwtStrategy],
  exports: [JwtAuthService, JwtModule, PassportModule],
})
export class JwtAuthModule {}
