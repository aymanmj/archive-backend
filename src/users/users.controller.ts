import {
  Controller,
  Body,
  Get,
  Post,
  Param,
  Req,
  UseGuards,
  ParseIntPipe,
  BadRequestException,
  Query,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuthorizationService } from 'src/auth/authorization.service';
import { RequirePermissions } from 'src/auth/permissions.decorator';
import { PERMISSIONS } from 'src/auth/permissions.constants';
import { CreateUserDto } from './dto/create-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

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
  async create(@Body() dto: CreateUserDto) {
    return this.usersService.createUser(dto);
  }

  @RequirePermissions([PERMISSIONS.USERS_MANAGE])
  @Post(':id/reset-password')
  async resetPassword(@Param('id', ParseIntPipe) id: number, @Body() body: ResetPasswordDto) {
    return this.usersService.resetPassword(id, body.newPassword);
  }

  // ---------------- List (رسمي) ----------------
  // واجهة موحّدة للواجهة الأمامية: /users?search=&page=&pageSize=
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
    // شكل موحّد يسهل على الواجهة
    return { success: true, data: { items: data.items, total: data.total, page: p, pageSize: ps } };
  }

  // ---------------- List Basic (توافق قديم) ----------------
  @RequirePermissions(PERMISSIONS.USERS_READ)
  @Get('list-basic')
  async listBasic(@Query('search') search?: string) {
    // نعيد مصفوفة بسيطة، مع حقول أكثر فائدة
    const data = await this.usersService.list({ search, page: 1, pageSize: 500 });
    return data.items.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      username: u.username,
      department: u.department, // {id,name} | null
    }));
  }

  // ---------------- By Department (كما هو) ----------------
  @RequirePermissions(PERMISSIONS.USERS_READ)
  @Get('by-department/:depId')
  async listByDepartment(@Param('depId', ParseIntPipe) depId: number) {
    const users = await this.prisma.user.findMany({
      where: { isActive: true, departmentId: depId },
      select: {
        id: true,
        fullName: true,
        username: true,
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
// } from '@nestjs/common';
// import { UsersService } from './users.service';
// import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
// import { PrismaService } from 'src/prisma/prisma.service';
// import { AuthorizationService } from 'src/auth/authorization.service';
// import { RequirePermissions  } from 'src/auth/permissions.decorator';
// import { PERMISSIONS } from 'src/auth/permissions.constants';
// import { CreateUserDto } from './dto/create-user.dto';
// import { ResetPasswordDto } from './dto/reset-password.dto';

// @UseGuards(JwtAuthGuard)
// @Controller('users')
// export class UsersController {
//   constructor(
//     private usersService: UsersService,
//     private prisma: PrismaService,
//     private authz: AuthorizationService, // ⬅️ إضافة الحقل
//   ) {}

//   // @RequirePermissions(PERMISSIONS.USERS_READ)
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

//   @RequirePermissions([PERMISSIONS.USERS_MANAGE]) // أو [PERMISSIONS.USERS_MANAGE, PERMISSIONS.USERS_READ]
//   @Post()
//   async create(@Body() dto: CreateUserDto) {
//     return this.usersService.createUser(dto);
//   }

//   @RequirePermissions([PERMISSIONS.USERS_MANAGE])
//   @Post(':id/reset-password')
//   async resetPassword(@Param('id', ParseIntPipe) id: number, @Body() body: ResetPasswordDto) {
//     return this.usersService.resetPassword(id, body.newPassword);
//   }

//   @RequirePermissions(PERMISSIONS.USERS_READ)
//   @Get('list-basic')
//   async listBasic() {
//     const users = await this.prisma.user.findMany({
//       where: { isActive: true },
//       select: { id: true, fullName: true, departmentId: true },
//       orderBy: { fullName: 'asc' },
//     });
//     return users.map((u) => ({
//       id: u.id,
//       fullName: u.fullName,
//       departmentId: u.departmentId ?? null,
//     }));
//   }

//   @RequirePermissions(PERMISSIONS.USERS_READ)
//   @Get('by-department/:depId')
//   async listByDepartment(@Param('depId', ParseIntPipe) depId: number) {
//     const users = await this.prisma.user.findMany({
//       where: { isActive: true, departmentId: depId },
//       select: { id: true, fullName: true, departmentId: true },
//       orderBy: { fullName: 'asc' },
//     });
//     return users.map((u) => ({
//       id: u.id,
//       fullName: u.fullName,
//       departmentId: u.departmentId ?? null,
//     }));
//   }
// }


