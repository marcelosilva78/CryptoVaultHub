import { Module } from '@nestjs/common';
import { JwtAuthModule } from '../jwt/jwt-auth.module';
import { InviteService } from './invite.service';
import { InviteController } from './invite.controller';
import { RegistrationService } from './registration.service';
import { RegistrationController } from './registration.controller';

// PrismaModule is @Global(), no need to import it here.
@Module({
  imports: [JwtAuthModule],
  controllers: [InviteController, RegistrationController],
  providers: [InviteService, RegistrationService],
})
export class InviteModule {}
