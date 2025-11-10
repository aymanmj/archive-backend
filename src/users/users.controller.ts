// src/users/users.controller.ts


import {
  Controller, Body, Get, Post, Param, Req, UseGuards, ParseIntPipe,
  BadRequestException, Query, Patch,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuthorizationService } from 'src/auth/authorization.service';
import { RequirePermissions } from 'src/auth/permissions.decorator';
import { PERMISSIONS } from 'src/auth/permissions.constants';
import { CreateUserDto } from './dto/create-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private usersService: UsersService,
    private prisma: PrismaService,
    private authz: AuthorizationService,
  ) {}

  // ---------------- Me ----------------
  @Get('me')
  async me(@Req() req: any) {
    const userId = req?.user?.sub;
    if (!userId) {
      throw new BadRequestException('معرف المستخدم غير موجود في التوكن');
    }
    const me = await this.usersService.getMe(userId);
    const perms = await this.authz.list(userId);
    return { ...me, permissions: perms };
  }

  // ---------------- CRUD ----------------
  @RequirePermissions([PERMISSIONS.USERS_MANAGE])
  @Post()
  async create(@Req() req: any, @Body() dto: CreateUserDto) {
    const actorId = Number(req?.user?.sub) || null;
    return this.usersService.createUser(dto, actorId);
  }

  @RequirePermissions([PERMISSIONS.USERS_MANAGE])
  @Post(':id/reset-password')
  async resetPassword(@Param('id', ParseIntPipe) id: number, @Body() body: ResetPasswordDto, @Req() req: any) {
    const actorId = Number(req?.user?.sub) || null;
    return this.usersService.resetPassword(id, body.newPassword, actorId);
  }

  // إعادة تعيين إلى كلمة مؤقتة + إلزام تغييرها
  @RequirePermissions([PERMISSIONS.USERS_MANAGE])
  @Post(':id/reset-to-temporary')
  async resetToTemporary(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const actorId = Number(req?.user?.sub) || null;
    return this.usersService.adminResetToTemporary(id, actorId);
  }

  // يغيّر المستخدم كلمته بنفسه
  @Patch('change-password')
  async changeOwn(@Req() req: any, @Body() body: ChangePasswordDto) {
    const userId = Number(req?.user?.sub);
    return this.usersService.changeOwnPassword(userId, body.currentPassword, body.newPassword);
  }

  // ---------------- List (رسمي) ----------------
  @RequirePermissions(PERMISSIONS.USERS_READ)
  @Get()
  async list(
    @Query('search') search?: string,
    @Query('page') page: string = '1',
    @Query('pageSize') pageSize: string = '30',
  ) {
    const p = Math.max(1, Number(page) || 1);
    const ps = Math.min(100, Math.max(1, Number(pageSize) || 30));
    const data = await this.usersService.list({ search, page: p, pageSize: ps });
    return { success: true, data: { items: data.items, total: data.total, page: p, pageSize: ps } };
  }

  // ---------------- Basic ----------------
  @RequirePermissions(PERMISSIONS.USERS_READ)
  @Get('list-basic')
  async listBasic(@Query('search') search?: string) {
    const data = await this.usersService.list({ search, page: 1, pageSize: 500 });
    return data.items.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      username: u.username,
      department: u.department,
    }));
  }

  // ---------------- By Department ----------------
  @RequirePermissions(PERMISSIONS.USERS_READ)
  @Get('by-department/:depId')
  async listByDepartment(@Param('depId', ParseIntPipe) depId: number) {
    const users = await this.prisma.user.findMany({
      where: { isActive: true, departmentId: depId },
      select: {
        id: true, fullName: true, username: true,
        department: { select: { id: true, name: true } },
      },
      orderBy: { fullName: 'asc' },
    });
    return users.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      username: u.username,
      department: u.department ? { id: u.department.id, name: u.department.name } : null,
    }));
  }

  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @Get('roles-basic')
  async rolesBasic() {
    const roles = await this.prisma.role.findMany({
      orderBy: { roleName: 'asc' },
      select: { id: true, roleName: true, isSystem: true },
    });
    return roles.map(r => ({ id: r.id, name: r.roleName, isSystem: r.isSystem }));
  }

  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @Post(':id/roles')
  async setUserRoles(@Param('id', ParseIntPipe) id: number, @Body() body: { roleIds: number[] }) {
    const roleIds = Array.isArray(body?.roleIds) ? body.roleIds : [];
    await this.prisma.userRole.deleteMany({ where: { userId: id } });
    if (!roleIds.length) return { ok: true, updated: 0 };

    const roles = await this.prisma.role.findMany({
      where: { id: { in: roleIds } },
      select: { id: true },
    });
    const created = await this.prisma.$transaction(
      roles.map(r => this.prisma.userRole.create({ data: { userId: id, roleId: r.id } }))
    );
    return { ok: true, updated: created.length };
  }
}





// import {
//   Controller,
//   Body,
//   Get,
//   Post,
//   Param,
//   Req,
//   UseGuards,
//   ParseIntPipe,
//   BadRequestException,
//   Query,
// } from '@nestjs/common';
// import { UsersService } from './users.service';
// import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
// import { PrismaService } from 'src/prisma/prisma.service';
// import { AuthorizationService } from 'src/auth/authorization.service';
// import { RequirePermissions } from 'src/auth/permissions.decorator';
// import { PERMISSIONS } from 'src/auth/permissions.constants';
// import { CreateUserDto } from './dto/create-user.dto';
// import { ResetPasswordDto } from './dto/reset-password.dto';

// @UseGuards(JwtAuthGuard)
// @Controller('users')
// export class UsersController {
//   constructor(
//     private usersService: UsersService,
//     private prisma: PrismaService,
//     private authz: AuthorizationService,
//   ) {}

//   // ---------------- Me ----------------
//   @Get('me')
//   async me(@Req() req: any) {
//     const userId = req?.user?.sub;
//     if (!userId) {
//       throw new BadRequestException('معرف المستخدم غير موجود في التوكن');
//     }
//     const me = await this.usersService.getMe(userId);
//     const perms = await this.authz.list(userId);
//     return { ...me, permissions: perms };
//   }

//   // ---------------- CRUD ----------------
//   @RequirePermissions([PERMISSIONS.USERS_MANAGE])
//   @Post()
//   async create(@Req() req: any,@Body() dto: CreateUserDto) {
//     const actorId = Number(req?.user?.sub) || null;
//     return this.usersService.createUser(dto);
//   }

//   @RequirePermissions([PERMISSIONS.USERS_MANAGE])
//   @Post(':id/reset-password')
//   async resetPassword(@Param('id', ParseIntPipe) id: number, @Body() body: ResetPasswordDto) {
//     return this.usersService.resetPassword(id, body.newPassword);
//   }

//   // ---------------- List (رسمي) ----------------
//   // واجهة موحّدة للواجهة الأمامية: /users?search=&page=&pageSize=
//   @RequirePermissions(PERMISSIONS.USERS_READ)
//   @Get()
//   async list(
//     @Query('search') search?: string,
//     @Query('page') page: string = '1',
//     @Query('pageSize') pageSize: string = '30',
//   ) {
//     const p = Math.max(1, Number(page) || 1);
//     const ps = Math.min(100, Math.max(1, Number(pageSize) || 30));
//     const data = await this.usersService.list({ search, page: p, pageSize: ps });
//     // شكل موحّد يسهل على الواجهة
//     return { success: true, data: { items: data.items, total: data.total, page: p, pageSize: ps } };
//   }

//   // ---------------- List Basic (توافق قديم) ----------------
//   @RequirePermissions(PERMISSIONS.USERS_READ)
//   @Get('list-basic')
//   async listBasic(@Query('search') search?: string) {
//     // نعيد مصفوفة بسيطة، مع حقول أكثر فائدة
//     const data = await this.usersService.list({ search, page: 1, pageSize: 500 });
//     return data.items.map((u) => ({
//       id: u.id,
//       fullName: u.fullName,
//       username: u.username,
//       department: u.department, // {id,name} | null
//     }));
//   }

//   // ---------------- By Department (كما هو) ----------------
//   @RequirePermissions(PERMISSIONS.USERS_READ)
//   @Get('by-department/:depId')
//   async listByDepartment(@Param('depId', ParseIntPipe) depId: number) {
//     const users = await this.prisma.user.findMany({
//       where: { isActive: true, departmentId: depId },
//       select: {
//         id: true,
//         fullName: true,
//         username: true,
//         department: { select: { id: true, name: true } },
//       },
//       orderBy: { fullName: 'asc' },
//     });
//     return users.map((u) => ({
//       id: u.id,
//       fullName: u.fullName,
//       username: u.username,
//       department: u.department ? { id: u.department.id, name: u.department.name } : null,
//     }));
//   }

//   @RequirePermissions(PERMISSIONS.USERS_MANAGE)
//   @Get('roles-basic')
//   async rolesBasic() {
//     const roles = await this.prisma.role.findMany({
//       orderBy: { roleName: 'asc' },
//       select: { id: true, roleName: true, isSystem: true },
//     });
//     return roles.map(r => ({ id: r.id, name: r.roleName, isSystem: r.isSystem }));
//   }

//   @RequirePermissions(PERMISSIONS.USERS_MANAGE)
//   @Post(':id/roles')
//   async setUserRoles(
//     @Param('id', ParseIntPipe) id: number,
//     @Body() body: { roleIds: number[] }
//   ) {
//     const roleIds = Array.isArray(body?.roleIds) ? body.roleIds : [];
//     if (roleIds.length === 0) return { ok: true, updated: 0 };

//     // حذف القديم ثم إضافة الجديد (أبسط شيء)
//     await this.prisma.userRole.deleteMany({ where: { userId: id } });
//     const roles = await this.prisma.role.findMany({
//       where: { id: { in: roleIds } },
//       select: { id: true },
//     });
//     const created = await this.prisma.$transaction(
//       roles.map(r => this.prisma.userRole.create({ data: { userId: id, roleId: r.id } }))
//     );
//     return { ok: true, updated: created.length };
//   }

// }


