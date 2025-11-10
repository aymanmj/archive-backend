// src/rbac/rbac.controller.ts

import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
  HttpCode,
  Req,
} from '@nestjs/common';
import { RbacService } from './rbac.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { RequirePermissions } from 'src/auth/permissions.decorator';
import { PERMISSIONS } from 'src/auth/permissions.constants';

type ApiOk<T> = { success: true; data: T };
type ApiErr = { success: false; error: { code: string; message: string } };
type ApiResponse<T> = ApiOk<T> | ApiErr;

@UseGuards(JwtAuthGuard)
@RequirePermissions(PERMISSIONS.RBAC_MANAGE)
@Controller('rbac')
export class RbacController {
  constructor(private readonly rbac: RbacService) {}

  // ------- Lists -------
  @Get('roles')
  @HttpCode(200)
  async listRoles(): Promise<ApiResponse<any>> {
    const roles = await this.rbac.listRoles();
    return { success: true, data: roles };
  }

  @Get('permissions')
  @HttpCode(200)
  async listPermissions(): Promise<ApiResponse<any>> {
    const perms = await this.rbac.listPermissions();
    return { success: true, data: perms };
  }

  // ------- User ↔ Roles (GET) -------
  @Get('users/:userId/roles')
  @HttpCode(200)
  async getUserRoles(
    @Param('userId', ParseIntPipe) userId: number,
  ): Promise<ApiResponse<{
    userId: number;
    roleIds: number[];
    roles: Array<{ id: number; roleName: string; description?: string | null; isSystem?: boolean }>;
    count: number;
  }>> {
    const dto = await this.rbac.getUserRoles(userId);
    return { success: true, data: dto };
  }

  // alias للتوافق
  @Get('user/:userId/roles')
  @HttpCode(200)
  async getUserRolesCompat(
    @Param('userId', ParseIntPipe) userId: number,
  ): Promise<ApiResponse<any>> {
    const dto = await this.rbac.getUserRoles(userId);
    return { success: true, data: dto };
  }

  // ------- User ↔ Roles (SET) -------
  @Patch('users/:userId/roles')
  @HttpCode(200)
  async setUserRolesPatch(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: any,
    @Req() req: any,
  ): Promise<ApiResponse<{ ok: true; userId: number; count: number; roleIds: number[] }>> {
    const roleIds: number[] = Array.isArray(body?.roleIds)
      ? body.roleIds
      : Array.isArray(body?.roles)
      ? body.roles
      : [];
    const actorId = req?.user?.sub ?? null;
    const result = await this.rbac.setUserRoles(userId, roleIds, actorId);
    return { success: true, data: result };
  }

  @Post('users/:userId/roles')
  @HttpCode(200)
  async setUserRolesPost(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: any,
    @Req() req: any,
  ): Promise<ApiResponse<{ ok: true; userId: number; count: number; roleIds: number[] }>> {
    const roleIds: number[] = Array.isArray(body?.roleIds)
      ? body.roleIds
      : Array.isArray(body?.roles)
      ? body.roles
      : [];
    const actorId = req?.user?.sub ?? null;
    const result = await this.rbac.setUserRoles(userId, roleIds, actorId);
    return { success: true, data: result };
  }

  // ------- Role ↔ Permissions -------
  @Get('roles/:roleId/permissions')
  @HttpCode(200)
  async getRolePermissions(
    @Param('roleId', ParseIntPipe) roleId: number,
  ): Promise<ApiResponse<{ roleId: number; roleName: string; permissionCodes: string[] }>> {
    const dto = await this.rbac.getRolePermissions(roleId);
    return { success: true, data: dto };
  }

  @Patch('roles/:roleId/permissions')
  @HttpCode(200)
  async setRolePermissions(
    @Param('roleId', ParseIntPipe) roleId: number,
    @Body() body: any,
    @Req() req: any,
  ): Promise<ApiResponse<{ ok: true; roleId: number; permissionCodes: string[]; count: number }>> {
    const permissionCodes: string[] = Array.isArray(body?.permissionCodes)
      ? body.permissionCodes
      : Array.isArray(body?.permissions)
      ? body.permissions
      : [];
    const actorId = req?.user?.sub ?? null;
    const dto = await this.rbac.setRolePermissions(roleId, permissionCodes, actorId);
    return { success: true, data: dto };
  }
}




// // src/rbac/rbac.controller.ts

// import {
//   Body,
//   Controller,
//   Get,
//   Param,
//   ParseIntPipe,
//   Patch,
//   Post,
//   UseGuards,
//   HttpCode,
// } from '@nestjs/common';
// import { RbacService } from './rbac.service';
// import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
// import { RequirePermissions } from 'src/auth/permissions.decorator';
// import { PERMISSIONS } from 'src/auth/permissions.constants';

// type ApiOk<T> = { success: true; data: T };
// type ApiErr = { success: false; error: { code: string; message: string } };
// type ApiResponse<T> = ApiOk<T> | ApiErr;

// @UseGuards(JwtAuthGuard)
// @RequirePermissions(PERMISSIONS.RBAC_MANAGE)
// @Controller('rbac')
// export class RbacController {
//   constructor(private readonly rbac: RbacService) {}

//   // ------- Lists -------
//   @Get('roles')
//   @HttpCode(200)
//   async listRoles(): Promise<ApiResponse<any>> {
//     const roles = await this.rbac.listRoles();
//     return { success: true, data: roles };
//   }

//   @Get('permissions')
//   @HttpCode(200)
//   async listPermissions(): Promise<ApiResponse<any>> {
//     const perms = await this.rbac.listPermissions();
//     return { success: true, data: perms };
//   }

//   // ------- User ↔ Roles (GET) -------
//   @Get('users/:userId/roles')
//   @HttpCode(200)
//   async getUserRoles(
//     @Param('userId', ParseIntPipe) userId: number,
//   ): Promise<ApiResponse<{
//     userId: number;
//     roleIds: number[];
//     roles: Array<{ id: number; roleName: string; description?: string | null; isSystem?: boolean }>;
//     count: number;
//   }>> {
//     const dto = await this.rbac.getUserRoles(userId);
//     return { success: true, data: dto };
//   }

//   // ✅ alias بصيغة singular لو كانت الواجهة القديمة تستخدمه
//   @Get('user/:userId/roles')
//   @HttpCode(200)
//   async getUserRolesCompat(
//     @Param('userId', ParseIntPipe) userId: number,
//   ): Promise<ApiResponse<any>> {
//     const dto = await this.rbac.getUserRoles(userId);
//     return { success: true, data: dto };
//   }

//   // ------- User ↔ Roles (SET) -------
//   // ندعم PATCH (حديث) و POST (توافق)
//   @Patch('users/:userId/roles')
//   @HttpCode(200)
//   async setUserRolesPatch(
//     @Param('userId', ParseIntPipe) userId: number,
//     @Body() body: any,
//   ): Promise<ApiResponse<{ ok: true; userId: number; count: number; roleIds: number[] }>> {
//     const roleIds: number[] = Array.isArray(body?.roleIds)
//       ? body.roleIds
//       : Array.isArray(body?.roles)
//       ? body.roles
//       : [];
//     const result = await this.rbac.setUserRoles(userId, roleIds);
//     return { success: true, data: result };
//   }

//   @Post('users/:userId/roles')
//   @HttpCode(200)
//   async setUserRolesPost(
//     @Param('userId', ParseIntPipe) userId: number,
//     @Body() body: any,
//   ): Promise<ApiResponse<{ ok: true; userId: number; count: number; roleIds: number[] }>> {
//     const roleIds: number[] = Array.isArray(body?.roleIds)
//       ? body.roleIds
//       : Array.isArray(body?.roles)
//       ? body.roles
//       : [];
//     const result = await this.rbac.setUserRoles(userId, roleIds);
//     return { success: true, data: result };
//   }

//   // ------- Role ↔ Permissions -------
//   @Get('roles/:roleId/permissions')
//   @HttpCode(200)
//   async getRolePermissions(
//     @Param('roleId', ParseIntPipe) roleId: number,
//   ): Promise<ApiResponse<{ roleId: number; roleName: string; permissionCodes: string[] }>> {
//     const dto = await this.rbac.getRolePermissions(roleId);
//     return { success: true, data: dto };
//   }

//   @Patch('roles/:roleId/permissions')
//   @HttpCode(200)
//   async setRolePermissions(
//     @Param('roleId', ParseIntPipe) roleId: number,
//     @Body() body: any,
//   ): Promise<ApiResponse<{ ok: true; roleId: number; permissionCodes: string[]; count: number }>> {
//     const permissionCodes: string[] = Array.isArray(body?.permissionCodes)
//       ? body.permissionCodes
//       : Array.isArray(body?.permissions)
//       ? body.permissions
//       : [];
//     const dto = await this.rbac.setRolePermissions(roleId, permissionCodes);
//     return { success: true, data: dto };
//   }
// }

