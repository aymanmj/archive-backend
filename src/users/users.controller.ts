import {
  Controller,
  Get,
  Param,
  Req,
  UseGuards,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { PrismaService } from 'src/prisma/prisma.service';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private usersService: UsersService,
    private prisma: PrismaService,
  ) {}

  /**
   * إرجاع بيانات المستخدم الحالي (للودجيت حق "مرحباً فلان")
   * GET /users/me
   */
  @Get('me')
  async me(@Req() req: any) {
    // ✨ نقرأ userId من req.user الذي يوفره الحارس
    const { userId } = req.user;

    if (!userId) {
      throw new BadRequestException('معرف المستخدم غير موجود في التوكن');
    }

    return this.usersService.getMe(userId);
  }

  /**
   * قائمة مبسطة بكل المستخدمين الفعّالين.
   * GET /users/list-basic
   */
  @Get('list-basic')
  async listBasic() {
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
      },
      select: {
        id: true,
        fullName: true,
        departmentId: true,
      },
      orderBy: {
        fullName: 'asc',
      },
    });

    return users.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      departmentId: u.departmentId ?? null,
    }));
  }

  /**
   * قائمة مبسطة لموظفي إدارة معيّنة فقط.
   * GET /users/by-department/:depId
   */
  @Get('by-department/:depId')
  async listByDepartment(@Param('depId', ParseIntPipe) depId: number) {
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        departmentId: depId,
      },
      select: {
        id: true,
        fullName: true,
        departmentId: true,
      },
      orderBy: {
        fullName: 'asc',
      },
    });

    return users.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      departmentId: u.departmentId ?? null,
    }));
  }
}
