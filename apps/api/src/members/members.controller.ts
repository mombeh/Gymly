import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Auth } from '../auth/decorators/auth.decorator';
import { RoleCapability, rolesFor } from '../auth/role-capabilities';
import { CreateMemberDto, UpdateMemberDto } from './dto/member.dto';
import { ListMembersQueryDto } from './dto/list-members-query.dto';
import { MembersService } from './members.service';
import type { MemberListResponse, MemberResponse } from './member.types';

/**
 * Every route declares RoleCapability.MEMBER_MANAGEMENT rather than a role list,
 * so the policy for who may manage members lives in one table
 * (auth/role-capabilities.ts) instead of being restated per route.
 *
 * TRAINER is not in that capability. A trainer may only reach the members
 * assigned to them, and that is a resource-level check rather than a role-level
 * one: it needs the trainer-assignment module, which does not exist yet. Rather
 * than granting trainers the whole member list or inventing the assignment rule
 * here, they are refused with 403 until that module lands.
 */
@Controller('members')
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  /** POST /api/members */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Auth(...rolesFor(RoleCapability.MEMBER_MANAGEMENT))
  create(@Body() dto: CreateMemberDto): Promise<MemberResponse> {
    return this.membersService.create(dto);
  }

  /** GET /api/members?q=&status=&page=&limit= */
  @Get()
  @Auth(...rolesFor(RoleCapability.MEMBER_MANAGEMENT))
  list(@Query() query: ListMembersQueryDto): Promise<MemberListResponse> {
    return this.membersService.list(query);
  }

  /** GET /api/members/:id */
  @Get(':id')
  @Auth(...rolesFor(RoleCapability.MEMBER_MANAGEMENT))
  findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<MemberResponse> {
    return this.membersService.findOne(id);
  }

  /**
   * PATCH /api/members/:id
   *
   * PATCH rather than PUT because the body is partial: only the supplied fields
   * change. A PUT here would imply a full replacement and make an omitted field
   * ambiguous between "unchanged" and "cleared".
   */
  @Patch(':id')
  @Auth(...rolesFor(RoleCapability.MEMBER_MANAGEMENT))
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateMemberDto,
  ): Promise<MemberResponse> {
    return this.membersService.update(id, dto);
  }

  /**
   * PATCH /api/members/:id/deactivate
   *
   * A status change rather than a DELETE, and it is not reversible from this
   * module: reactivating a member is a separate decision with its own rules, so
   * inventing it here would be scope the task did not ask for.
   */
  @Patch(':id/deactivate')
  @Auth(...rolesFor(RoleCapability.MEMBER_MANAGEMENT))
  deactivate(@Param('id', new ParseUUIDPipe()) id: string): Promise<MemberResponse> {
    return this.membersService.deactivate(id);
  }
}