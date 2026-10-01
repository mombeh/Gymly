import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AccessController } from './access.controller';

/**
 * Demonstrates role-based access control. Replace or delete alongside the
 * business modules once they are implemented.
 */
@Module({
  imports: [AuthModule],
  controllers: [AccessController],
})
export class AccessModule {}