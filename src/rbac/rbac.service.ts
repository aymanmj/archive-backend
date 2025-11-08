// src/rbac/rbac.service.ts

import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class RbacService {
  constructor(private prisma: PrismaService) {}

  // ===== Helpers (داخل الخدمة) =====
  private async userHasPermission(userId: number, code: string) {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        UserRole: {
          select: {
            Role: {
              select: {
                RolePermission: {
                  select: { Permission: { select: { code: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (!row) return false;
    return row.UserRole.some((ur) =>
      ur.Role.RolePermission.some((rp) => rp.Permission.code === code),
    );
  }

  private async countUsersWithPermission(code: string) {
    return this.prisma.user.count({
      where: {
        UserRole: {
          some: {
            Role: { RolePermission: { some: { Permission: { code } } } },
          },
        },
      },
    });
  }

  private async assertActorCanModifyTarget(actorId: number | undefined, targetUserId: number) {
    if (!actorId) return; // للحفاظ على التوافق الخلفي إذا لم نمرر actorId من الكنترولر
    const [actor, target] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: actorId } }),
      this.prisma.user.findUnique({ where: { id: targetUserId } }),
    ]);
    if (!target) throw new NotFoundException('User not found');

    // لا تعدّل نفسك
    if (actorId === targetUserId) {
      throw new ForbiddenException('You cannot modify your own roles/permissions.');
    }
    // لا تعديل على مستخدم نظامي إلا من نظامي
    if (target.isSystem && !actor?.isSystem) {
      throw new ForbiddenException('Cannot modify a system user unless you are system-level admin.');
    }
  }

  private async assertRoleNotSystem(roleId: number) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem) throw new ForbiddenException('Cannot modify a system role.');
  }

  private async assertNotDroppingLastAdminRbac(targetUserId: number, nextRoleIds: number[]) {
    // هل سيتم الاحتفاظ بصلاحية admin.rbac بعد التغيير؟
    // (نحسبها عبر الدور/الأدوار الجديدة فقط)
    const nextHasAdmin = await this.prisma.role.count({
      where: {
        id: { in: nextRoleIds.length ? nextRoleIds : [-1] },
        RolePermission: { some: { Permission: { code: 'admin.rbac' } } },
      },
    });

    if (nextHasAdmin > 0) return; // ممتاز، لن نفقدها لهذا المستخدم

    // إن لم يعد يمتلكها، هل هو آخر حامل لها؟
    const targetCurrentlyHas = await this.userHasPermission(targetUserId, 'admin.rbac');
    if (!targetCurrentlyHas) return; // أصلاً لا يملكها الآن

    const holders = await this.countUsersWithPermission('admin.rbac');
    if (holders <= 1) {
      throw new ForbiddenException('Cannot remove admin.rbac from the last remaining admin.');
    }
  }

  // ===== Permissions =====
  listPermissions() {
    return this.prisma.permission.findMany({ orderBy: { code: 'asc' } });
  }

  // ===== Roles =====
  listRoles() {
    return this.prisma.role.findMany({
      orderBy: { roleName: 'asc' },
      include: { RolePermission: { include: { Permission: true } } },
    });
  }

  async createRole(roleName: string, description?: string) {
    if (!roleName?.trim()) throw new BadRequestException('roleName required');
    return this.prisma.role.create({ data: { roleName: roleName.trim(), description } });
  }

  async updateRole(id: number, data: { roleName?: string; description?: string }) {
    const r = await this.prisma.role.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Role not found');
    if (r.isSystem) throw new ForbiddenException('Cannot modify a system role.');
    return this.prisma.role.update({
      where: { id },
      data: {
        roleName: data.roleName?.trim() || r.roleName,
        description: data.description ?? r.description,
      },
    });
  }

  async deleteRole(id: number) {
    await this.assertRoleNotSystem(id);
    await this.prisma.rolePermission.deleteMany({ where: { roleId: id } });
    await this.prisma.userRole.deleteMany({ where: { roleId: id } });
    return this.prisma.role.delete({ where: { id } });
  }

  /**
   * setRolePermissions
   * @param roleId
   * @param permCodes
   * @param actorId (اختياري) لتفعيل الحماية
   */
  async setRolePermissions(roleId: number, permCodes: string[], actorId?: number) {
    await this.assertRoleNotSystem(roleId);

    const perms = await this.prisma.permission.findMany({
      where: { code: { in: permCodes } },
      select: { id: true, code: true },
    });

    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId } }),
      ...perms.map((p) => this.prisma.rolePermission.create({ data: { roleId, permissionId: p.id } })),
    ]);

    return { ok: true, count: perms.length };
  }

  // ===== Users <-> Roles =====
  async listUserRoles(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found');
    const rows = await this.prisma.userRole.findMany({
      where: { userId },
      include: { Role: true },
      orderBy: { Role: { roleName: 'asc' } },
    });
    return rows.map((r) => r.Role);
  }

  /**
   * setUserRoles
   * @param userId (المستهدَف)
   * @param roleIds
   * @param actorId (اختياري) لو مُمرّر: تُفعّل الحماية
   */
  async setUserRoles(userId: number, roleIds: number[], actorId?: number) {
    await this.assertActorCanModifyTarget(actorId, userId);

    const roles = await this.prisma.role.findMany({
      where: { id: { in: roleIds } },
      select: { id: true, isSystem: true },
    });

    // منع ربط دور نظامي بمستخدم عادي عبر هذا المسار (اختياري)
    // هنا سنكتفي بمنع التعديل على الأدوار النظامية نفسها في updateRole/deleteRole
    // لكن سنحمي فقدان admin.rbac من آخر أدمن:
    await this.assertNotDroppingLastAdminRbac(userId, roles.map((r) => r.id));

    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { userId } }),
      ...roles.map((r) => this.prisma.userRole.create({ data: { userId, roleId: r.id } })),
    ]);

    return { ok: true, count: roles.length };
  }
}





// // src/rbac/rbac.service.ts

// import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
// import { PrismaService } from 'src/prisma/prisma.service';

// @Injectable()
// export class RbacService {
//   constructor(private prisma: PrismaService) {}

//   // Permissions
//   listPermissions() {
//     return this.prisma.permission.findMany({ orderBy: { code: 'asc' } });
//   }

//   // Roles
//   listRoles() {
//     return this.prisma.role.findMany({
//       orderBy: { roleName: 'asc' },
//       include: { RolePermission: { include: { Permission: true } } },
//     });
//   }

//   async createRole(roleName: string, description?: string) {
//     if (!roleName?.trim()) throw new BadRequestException('roleName required');
//     return this.prisma.role.create({ data: { roleName: roleName.trim(), description } });
//   }

//   async updateRole(id: number, data: { roleName?: string; description?: string }) {
//     const r = await this.prisma.role.findUnique({ where: { id } });
//     if (!r) throw new NotFoundException('Role not found');
//     return this.prisma.role.update({ where: { id }, data: {
//       roleName: data.roleName?.trim() || r.roleName,
//       description: data.description ?? r.description,
//     }});
//   }

//   async deleteRole(id: number) {
//     await this.prisma.rolePermission.deleteMany({ where: { roleId: id } });
//     await this.prisma.userRole.deleteMany({ where: { roleId: id } });
//     return this.prisma.role.delete({ where: { id } });
//   }

//   async setRolePermissions(roleId: number, permCodes: string[]) {
//     const role = await this.prisma.role.findUnique({ where: { id: roleId } });
//     if (!role) throw new NotFoundException('Role not found');

//     const perms = await this.prisma.permission.findMany({
//       where: { code: { in: permCodes } },
//       select: { id: true, code: true },
//     });

//     // نظّف القديم وثبّت الجديد
//     await this.prisma.$transaction([
//       this.prisma.rolePermission.deleteMany({ where: { roleId } }),
//       ...perms.map(p => this.prisma.rolePermission.create({ data: { roleId, permissionId: p.id } })),
//     ]);

//     return { ok: true, count: perms.length };
//   }

//   // Users <-> Roles
//   async listUserRoles(userId: number) {
//     const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true }});
//     if (!user) throw new NotFoundException('User not found');
//     const rows = await this.prisma.userRole.findMany({
//       where: { userId },
//       include: { Role: true },
//       orderBy: { Role: { roleName: 'asc' } },
//     });
//     return rows.map(r => r.Role);
//   }

//   async setUserRoles(userId: number, roleIds: number[]) {
//     const user = await this.prisma.user.findUnique({ where: { id: userId }});
//     if (!user) throw new NotFoundException('User not found');

//     const roles = await this.prisma.role.findMany({ where: { id: { in: roleIds } }, select: { id: true }});
//     await this.prisma.$transaction([
//       this.prisma.userRole.deleteMany({ where: { userId } }),
//       ...roles.map(r => this.prisma.userRole.create({ data: { userId, roleId: r.id } })),
//     ]);

//     return { ok: true, count: roles.length };
//   }
// }
