// src/users/users.service.ts

import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { AuditService } from 'src/audit/audit.service';

type ListParams = { search?: string; page: number; pageSize: number };

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

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
      isSystem: user.isSystem,
      department: user.department
        ? { id: user.department.id, name: user.department.name }
        : null,
      roles: user.UserRole.map((ur) => ur.Role.roleName),
      jobTitle: user.jobTitle,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      mustChangePassword: user.mustChangePassword,
    };
  }

  private generateTempPassword() {
    const s =
      'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
    return Array.from(
      { length: 12 },
      () => s[Math.floor(Math.random() * s.length)],
    ).join('');
  }

  async createUser(
    dto: {
      fullName: string;
      username: string;
      email?: string;
      password?: string;
      departmentId?: number;
      isActive?: boolean;
      roleIds?: number[];
    },
    actorUserId?: number | null,
  ) {
    const exists = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });
    if (exists) throw new BadRequestException('Username already exists');

    const pwd = dto.password?.trim() || this.generateTempPassword();
    const hash = await bcrypt.hash(pwd, 12);

    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName.trim(),
        username: dto.username.trim(),
        email: dto.email?.trim() || null,
        passwordHash: hash,
        departmentId: dto.departmentId ?? null,
        isActive: dto.isActive ?? true,
        securityClearanceRank: 0,
        mustChangePassword: !dto.password, // لو كلمة المرور مولّدة → إجبار تغييرها
      },
    });

    await this.audit.add({
      actionType: 'CREATE_USER',
      actionDescription: `إنشاء مستخدم: ${user.username} (${user.fullName})`,
      userId: actorUserId ?? null,
      fromIP: null,
      workstationName: null,
    });

    if (dto.roleIds?.length) {
      const roles = await this.prisma.role.findMany({
        where: { id: { in: dto.roleIds } },
        select: { id: true },
      });
      await this.prisma.$transaction(
        roles.map((r) =>
          this.prisma.userRole.create({
            data: { userId: user.id, roleId: r.id },
          }),
        ),
      );
    }

    // نرجّع الـ id + إن كانت كلمة مؤقتة نرجّعها حتى تظهر في UI
    return { userId: user.id, tempPassword: dto.password ? undefined : pwd };
  }

  async resetPassword(
    userId: number,
    newPassword: string,
    actorUserId?: number | null,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.isSystem)
      throw new BadRequestException(
        'لا يمكن تعديل كلمة مرور السوبر أدمن من هنا',
      );

    const hash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hash, mustChangePassword: false },
    });

    await this.audit.add({
      actionType: 'RESET_PASSWORD',
      actionDescription: `إعادة تعيين كلمة مرور للمستخدم ID=${userId}`,
      userId: actorUserId ?? null,
    });

    return { ok: true };
  }

  // إعادة تعيين بواسطة الأدمن بكلمة مؤقتة
  async adminResetToTemporary(userId: number, actorUserId?: number | null) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.isSystem)
      throw new BadRequestException(
        'لا يمكن تعديل كلمة مرور السوبر أدمن من هنا',
      );

    const temp = this.generateTempPassword();
    const hash = await bcrypt.hash(temp, 12);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hash, mustChangePassword: true },
    });

    await this.audit.add({
      actionType: 'RESET_PASSWORD',
      actionDescription: `تعيين كلمة مؤقتة وإجبار تغييرها للمستخدم ID=${userId}`,
      userId: actorUserId ?? null,
    });

    return { ok: true, tempPassword: temp };
  }

  // يغيّر المستخدم كلمته بنفسه
  async changeOwnPassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const ok = await bcrypt.compare(currentPassword, user.passwordHash || '');
    if (!ok) throw new UnauthorizedException('كلمة المرور الحالية غير صحيحة');

    const hash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hash, mustChangePassword: false },
    });

    return { ok: true };
  }

  // --------- List with search + pagination ---------
  async list({ search, page, pageSize }: ListParams) {
    const where: Prisma.UserWhereInput =
      search && search.trim().length > 0
        ? {
            isActive: true,
            OR: [
              {
                fullName: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                username: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                department: {
                  is: {
                    name: {
                      contains: search,
                      mode: Prisma.QueryMode.insensitive,
                    },
                  },
                },
              },
            ],
          }
        : { isActive: true };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: [{ fullName: 'asc' }, { username: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          fullName: true,
          username: true,
          isActive: true,
          department: { select: { id: true, name: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    const normalized = items.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      username: u.username,
      isActive: u.isActive,
      department: u.department
        ? { id: u.department.id, name: u.department.name }
        : null,
    }));

    return { items: normalized, total };
  }
}

// // src/users/users.service.ts

// import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
// import { PrismaService } from 'src/prisma/prisma.service';
// import * as bcrypt from 'bcrypt';
// import { Prisma } from '@prisma/client'; // ⬅️ مهم لاستخدام الأنواع و QueryMode
// import { AuditService } from 'src/audit/audit.service';

// type ListParams = { search?: string; page: number; pageSize: number };

// @Injectable()
// export class UsersService {
//   constructor(private prisma: PrismaService, private audit: AuditService,) {}

//   async getMe(userId: number) {
//     const user = await this.prisma.user.findUnique({
//       where: { id: userId },
//       include: {
//         // تأكد أن اسم العلاقة "department" كما في سكيمتك (هو المستخدم لديك في أماكن أخرى)
//         department: { select: { id: true, name: true } },
//         UserRole: { include: { Role: { select: { roleName: true } } } },
//       },
//     });

//     if (!user) return null;

//     return {
//       id: user.id,
//       fullName: user.fullName,
//       username: user.username,
//       isActive: user.isActive,
//       isSystem: user.isSystem,
//       department: user.department ? { id: user.department.id, name: user.department.name } : null,
//       roles: user.UserRole.map((ur) => ur.Role.roleName),
//       jobTitle: user.jobTitle,
//       lastLoginAt: user.lastLoginAt,
//       createdAt: user.createdAt,
//     };
//   }

//   async createUser(dto: {
//     fullName: string;
//     username: string;
//     email?: string;
//     password?: string;
//     departmentId?: number;
//     isActive?: boolean;
//     roleIds?: number[];
//   }, actorUserId?: number | null) {
//     const exists = await this.prisma.user.findUnique({ where: { username: dto.username } });
//     if (exists) throw new BadRequestException('Username already exists');

//     const pwd = dto.password ?? Math.random().toString(36).slice(-10);
//     const hash = await bcrypt.hash(pwd, 12);

//     const user = await this.prisma.user.create({
//       data: {
//         fullName: dto.fullName,
//         username: dto.username,
//         email: dto.email,
//         passwordHash: hash,
//         departmentId: dto.departmentId ?? null,
//         isActive: dto.isActive ?? true,
//         securityClearanceRank: 0,
//       },
//     });

//     await this.audit.add({
//       actionType: 'CREATE_USER',
//       actionDescription: `إنشاء مستخدم: ${user.username} (${user.fullName})`,
//       userId: actorUserId ?? null,           // ممكن تمرّر رقم منشئ المستخدم لو عندك من الـ controller
//       fromIP: null,           // أو استخرجه من req في الـ controller ومرّره
//       workstationName: null,         // نفس الشيء
//     });

//     if (dto.roleIds?.length) {
//       const roles = await this.prisma.role.findMany({
//         where: { id: { in: dto.roleIds } },
//         select: { id: true },
//       });
//       await this.prisma.$transaction(
//         roles.map((r) => this.prisma.userRole.create({ data: { userId: user.id, roleId: r.id } })),
//       );
//     }

//     return { userId: user.id, tempPassword: dto.password ? undefined : pwd };
//   }

//   async resetPassword(userId: number, newPassword: string, actorUserId?: number | null) {
//     const user = await this.prisma.user.findUnique({ where: { id: userId } });
//     if (!user) throw new NotFoundException('User not found');
//     if (user.isSystem) throw new BadRequestException('لا يمكن تعديل كلمة مرور السوبر أدمن من هنا');

//     const hash = await bcrypt.hash(newPassword, 12);
//     await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: hash } });

//     await this.audit.add({
//       actionType: 'RESET_PASSWORD',
//       actionDescription: `إعادة تعيين كلمة مرور للمستخدم ID=${userId}`,
//       userId: actorUserId ?? null,  // مرّر من الـ controller لو متاح
//     });

//     return { ok: true };
//   }

//   // --------- List with search + pagination ---------
//   async list({ search, page, pageSize }: ListParams) {
//     // ✅ صرّح بالنوع صراحة وتجنب مشاكل الاتحاد
//     const where: Prisma.UserWhereInput =
//       search && search.trim().length > 0
//         ? {
//             isActive: true,
//             OR: [
//               {
//                 fullName: {
//                   contains: search,
//                   mode: Prisma.QueryMode.insensitive, // ⬅️ ثابت النوع
//                 },
//               },
//               {
//                 username: {
//                   contains: search,
//                   mode: Prisma.QueryMode.insensitive,
//                 },
//               },
//               // بحث داخل علاقة القسم (تأكد أن العلاقة اسمها "department")
//               {
//                 department: {
//                   is: {
//                     name: {
//                       contains: search,
//                       mode: Prisma.QueryMode.insensitive,
//                     },
//                   },
//                 },
//               },
//             ],
//           }
//         : { isActive: true };

//     const [items, total] = await this.prisma.$transaction([
//       this.prisma.user.findMany({
//         where,
//         orderBy: [{ fullName: 'asc' }, { username: 'asc' }],
//         skip: (page - 1) * pageSize,
//         take: pageSize,
//         select: {
//           id: true,
//           fullName: true,
//           username: true,
//           isActive: true,
//           // ✅ ضمّن العلاقة حتى يصبح النوع صحيحًا في TS
//           department: { select: { id: true, name: true } },
//         },
//       }),
//       this.prisma.user.count({ where }),
//     ]);

//     const normalized = items.map((u) => ({
//       id: u.id,
//       fullName: u.fullName,
//       username: u.username,
//       isActive: u.isActive,
//       department: u.department ? { id: u.department.id, name: u.department.name } : null,
//     }));

//     return { items: normalized, total };
//   }
// }
