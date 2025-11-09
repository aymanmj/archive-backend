import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

    async getMe(userId: number) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          department: { select: { id: true, name: true } },
          UserRole: { include: { Role: { select: { roleName: true } } } },
        },
      });

      if (!user) return null;

      return {
        id: user.id,
        fullName: user.fullName,
        username: user.username,
        isActive: user.isActive,
        // 👇 مهم للواجهة لعرض عناصر الإدارة حتى بعد refresh
        isSystem: user.isSystem,
        department: user.department ? { id: user.department.id, name: user.department.name } : null,
        roles: user.UserRole.map((ur) => ur.Role.roleName),
        jobTitle: user.jobTitle,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
      };
    }

  async createUser(dto: {
    fullName: string;
    username: string;
    email?: string;
    password?: string;
    departmentId?: number;
    isActive?: boolean;
    roleIds?: number[];
  }) {
    const exists = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (exists) throw new BadRequestException('Username already exists');

    const pwd = dto.password ?? Math.random().toString(36).slice(-10);
    const hash = await bcrypt.hash(pwd, 12);

    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        username: dto.username,
        email: dto.email,
        passwordHash: hash,
        departmentId: dto.departmentId ?? null,
        isActive: dto.isActive ?? true,
        securityClearanceRank: 0,
      },
    });

    if (dto.roleIds?.length) {
      const roles = await this.prisma.role.findMany({
        where: { id: { in: dto.roleIds } },
        select: { id: true },
      });
      await this.prisma.$transaction(
        roles.map((r) => this.prisma.userRole.create({ data: { userId: user.id, roleId: r.id } })),
      );
    }

    // ارجع كلمة المرور (المؤقتة) لمرة واحدة فقط في الاستجابة (أظهرها في الواجهة لنسخها)
    return { userId: user.id, tempPassword: dto.password ? undefined : pwd };
  }

  async resetPassword(userId: number, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (user.isSystem) throw new BadRequestException('لا يمكن تعديل كلمة مرور السوبر أدمن من هنا');

    const hash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: hash } });
    return { ok: true };
  }
}




// // src/users/users.service.ts

// import { Injectable } from '@nestjs/common';
// import { PrismaService } from 'src/prisma/prisma.service';

// @Injectable()
// export class UsersService {
//   constructor(private prisma: PrismaService) {}

  // async getMe(userId: number) {
  //   const user = await this.prisma.user.findUnique({
  //     where: { id: userId },
  //     include: {
  //       department: { select: { id: true, name: true } },
  //       UserRole: { include: { Role: { select: { roleName: true } } } },
  //     },
  //   });

  //   if (!user) return null;

  //   return {
  //     id: user.id,
  //     fullName: user.fullName,
  //     username: user.username,
  //     isActive: user.isActive,
  //     // 👇 مهم للواجهة لعرض عناصر الإدارة حتى بعد refresh
  //     isSystem: user.isSystem,
  //     department: user.department ? { id: user.department.id, name: user.department.name } : null,
  //     roles: user.UserRole.map((ur) => ur.Role.roleName),
  //     jobTitle: user.jobTitle,
  //     lastLoginAt: user.lastLoginAt,
  //     createdAt: user.createdAt,
  //   };
  // }
// }


