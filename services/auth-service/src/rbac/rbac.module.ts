import { Module } from '@nestjs/common';
import { RolesGuard } from './roles.guard';

@Module({
  // I7: RolesGuard removed from APP_GUARD to fix guard ordering.
  // Use the @AdminAuth() decorator instead, which applies AuthGuard('jwt')
  // before RolesGuard in the correct order.
  providers: [RolesGuard],
  exports: [RolesGuard],
})
export class RbacModule {}
