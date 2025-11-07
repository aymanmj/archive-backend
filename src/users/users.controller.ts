import {
  Controller,
  Get,
  Param,
  Req,
  UseGuards,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { RequirePermissions } from 'src/auth/permissions.decorator';
import { PERMISSIONS } from 'src/auth/permissions.constants';
import { UsersService } from './users.service';
import { PrismaService } from 'src/prisma/prisma.service';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private usersService: UsersService,
    private prisma: PrismaService,
  ) {}

  @Get('me')
  @RequirePermissions(PERMISSIONS.USERS_READ)
  async me(@Req() req: any) {
    const { userId } = req.user;
    if (!userId) throw new BadRequestException('معرف المستخدم غير موجود في التوكن');
    return this.usersService.getMe(userId);
  }

  @Get('list-basic')
  @RequirePermissions(PERMISSIONS.USERS_READ)
  async listBasic() {
    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, fullName: true, departmentId: true },
      orderBy: { fullName: 'asc' },
    });

    return users.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      departmentId: u.departmentId ?? null,
    }));
  }

  @Get('by-department/:depId')
  @RequirePermissions(PERMISSIONS.USERS_READ)
  async listByDepartment(@Param('depId', ParseIntPipe) depId: number) {
    const users = await this.prisma.user.findMany({
      where: { isActive: true, departmentId: depId },
      select: { id: true, fullName: true, departmentId: true },
      orderBy: { fullName: 'asc' },
    });

    return users.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      departmentId: u.departmentId ?? null,
    }));
  }
}





// import {
//   Controller,
//   Get,
//   Param,
//   Req,
//   UseGuards,
//   ParseIntPipe,
//   BadRequestException,
// } from '@nestjs/common';
// import { UsersService } from './users.service';
// import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
// import { PrismaService } from 'src/prisma/prisma.service';
// import { RolesGuard } from 'src/auth/roles.guard';

// @UseGuards(JwtAuthGuard, RolesGuard)
// @Controller('users')
// export class UsersController {
//   constructor(
//     private usersService: UsersService,
//     private prisma: PrismaService,
//   ) {}

//   // USER: البيانات الشخصية
//   @Get('me')
//   async me(@Req() req: any) {
//     const { userId } = req.user;
//     if (!userId) {
//       throw new BadRequestException('معرف المستخدم غير موجود في التوكن');
//     }
//     return this.usersService.getMe(userId);
//   }

//   // USER: قوائم مبسطة
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


