import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MemberCodeService } from './member-code.service';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';

/**
 * Member records and their lifecycle.
 *
 * AuthModule is imported so the guards the controller composes through @Auth
 * resolve, and PrismaService comes from the global PrismaModule.
 */
@Module({
  imports: [AuthModule],
  controllers: [MembersController],
  providers: [MembersService, MemberCodeService],
  // Exported so a later module (a membership or payment module will need to
  // resolve a member) can reuse the service rather than duplicate the queries.
  exports: [MembersService],
})
export class MembersModule {}