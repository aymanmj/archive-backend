// src/rbac/rbac.controller.ts

import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { RbacService } from './rbac.service';
import { RequirePermissions } from 'src/auth/permissions.decorator';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { SetUserRolesDto, CreateRoleDto, UpdateRoleDto, SetRolePermissionsDto } from './dto/rbac-dto';

@UseGuards(JwtAuthGuard)
@RequirePermissions('admin.rbac')
@Controller('rbac')
export class RbacController {
  constructor(private rbac: RbacService) {}

  // Permissions
  @Get('permissions')
  listPermissions() { return this.rbac.listPermissions(); }

  // Roles
  @Get('roles')
  listRoles() { return this.rbac.listRoles(); }

  @Post('roles')
  createRole(@Body() b: CreateRoleDto) { return this.rbac.createRole(b.roleName, b.description); }

  @Patch('roles/:id')
  updateRole(@Param('id', ParseIntPipe) id: number, @Body() b: UpdateRoleDto) {
    return this.rbac.updateRole(id, b);
  }

  @Delete('roles/:id')
  deleteRole(@Param('id', ParseIntPipe) id: number) { return this.rbac.deleteRole(id); }

  @Post('roles/:id/permissions')
  setRolePerms(@Param('id', ParseIntPipe) id: number, @Body() b: SetRolePermissionsDto) {
    return this.rbac.setRolePermissions(id, b.permissions || []);
  }

  // Users <-> Roles
  @Get('users/:userId/roles')
  listUserRoles(@Param('userId', ParseIntPipe) userId: number) {
    return this.rbac.listUserRoles(userId);
  }

  @Post('users/:userId/roles')
  setUserRoles(@Param('userId', ParseIntPipe) userId: number, @Body() b: SetUserRolesDto) {
    return this.rbac.setUserRoles(userId, b.roleIds || []);
  }
}
