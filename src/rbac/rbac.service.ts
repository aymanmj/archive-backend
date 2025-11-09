// src/rbac/rbac.service.ts

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuthorizationService } from 'src/auth/authorization.service';

@Injectable()
export class RbacService {
  constructor(
    private prisma: PrismaService,
    private authz: AuthorizationService,
  ) {}

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

  // ---- User ↔ Roles (قراءة) ----
  async getUserRoles(userId: number): Promise<{
    userId: number;
    roleIds: number[];
    roles: Array<{ id: number; roleName: string; description: string | null; isSystem?: boolean }>;
    count: number;
  }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found');

    const rows = await this.prisma.userRole.findMany({
      where: { userId },
      include: { Role: true },
      orderBy: { Role: { roleName: 'asc' } },
    });

    const roles = rows.map((r) => ({
      id: r.Role.id,
      roleName: r.Role.roleName,
      description: r.Role.description ?? null,
      isSystem: r.Role.isSystem,
    }));

    const roleIds = roles.map((r) => r.id);

    return {
      userId,
      roleIds,
      roles,
      count: roleIds.length,
    };
  }

  // ---- User ↔ Roles (حفظ) ----
  async setUserRoles(
    userId: number,
    roleIds: number[],
    actorId?: number,
  ): Promise<{ ok: true; userId: number; count: number; roleIds: number[] }> {
    const roles = await this.prisma.role.findMany({
      where: { id: { in: roleIds } },
      select: { id: true },
    });

    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { userId } }),
      ...roles.map((r) => this.prisma.userRole.create({ data: { userId, roleId: r.id } })),
    ]);

    // invalidate كاش صلاحيات المستخدم
    this.authz.invalidate(userId);

    // اجعل ok literal true لا boolean
    return {
      ok: true as const,
      userId,
      count: roles.length,
      roleIds: roles.map((r) => r.id),
    };
  }

  // ---- Role ↔ Permissions ----
  async getRolePermissions(roleId: number): Promise<{
    roleId: number;
    roleName: string;
    permissionCodes: string[];
  }> {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: { RolePermission: { include: { Permission: true } } },
    });
    if (!role) throw new NotFoundException('Role not found');

    const permissionCodes = role.RolePermission.map((rp) => rp.Permission.code);
    return { roleId: role.id, roleName: role.roleName, permissionCodes };
  }

  async setRolePermissions(
    roleId: number,
    permissionCodes: string[],
  ): Promise<{ ok: true; roleId: number; permissionCodes: string[]; count: number }> {
    const perms = await this.prisma.permission.findMany({
      where: { code: { in: permissionCodes } },
      select: { id: true, code: true },
    });

    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId } }),
      ...perms.map((p) =>
        this.prisma.rolePermission.create({ data: { roleId, permissionId: p.id } }),
      ),
    ]);

    // invalidate كل من يملك الدور
    const holders = await this.prisma.userRole.findMany({
      where: { roleId },
      select: { userId: true },
    });
    for (const h of holders) this.authz.invalidate(h.userId);

    return {
      ok: true as const,
      roleId,
      permissionCodes: perms.map((p) => p.code),
      count: perms.length,
    };
  }
}



// // src/rbac/rbac.service.ts

// import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
// import { PrismaService } from 'src/prisma/prisma.service';
// import { AuthorizationService } from 'src/auth/authorization.service';

// @Injectable()
// export class RbacService {
//   constructor(
//     private prisma: PrismaService,
//     private authz: AuthorizationService,
//   ) {}

//   // ===== Permissions =====
//   listPermissions() {
//     return this.prisma.permission.findMany({ orderBy: { code: 'asc' } });
//   }

//   // ===== Roles =====
//   listRoles() {
//     return this.prisma.role.findMany({
//       orderBy: { roleName: 'asc' },
//       include: { RolePermission: { include: { Permission: true } } },
//     });
//   }

//   // ---- User ↔ Roles (قراءة) ----
//   async getUserRoles(userId: number) {
//     const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
//     if (!user) throw new NotFoundException('User not found');

//     const rows = await this.prisma.userRole.findMany({
//       where: { userId },
//       include: { Role: true },
//       orderBy: { Role: { roleName: 'asc' } },
//     });

//     const roles = rows.map(r => ({
//       id: r.Role.id,
//       roleName: r.Role.roleName,
//       description: r.Role.description ?? null,
//       isSystem: r.Role.isSystem,
//     }));

//     const roleIds = roles.map(r => r.id);

//     // ✅ شكل مرن ومتوافق مع الواجهات
//     return {
//       userId,
//       roleIds,       // مصفوفة أرقام
//       roles,         // مصفوفة كائنات أدوار
//       count: roleIds.length,
//     };
//   }

//   // ---- User ↔ Roles (حفظ) ----
//   async setUserRoles(userId: number, roleIds: number[], actorId?: number) {
//     // (يمكن إبقاء فحوصاتك السابقة هنا إن وُجدت: منع التلاعب بالمستخدم النظامي إلخ)
//     const roles = await this.prisma.role.findMany({
//       where: { id: { in: roleIds } },
//       select: { id: true },
//     });

//     await this.prisma.$transaction([
//       this.prisma.userRole.deleteMany({ where: { userId } }),
//       ...roles.map((r) => this.prisma.userRole.create({ data: { userId, roleId: r.id } })),
//     ]);

//     // invalidate كاش صلاحيات المستخدم
//     this.authz.invalidate(userId);

//     return { ok: true, userId, count: roles.length, roleIds: roles.map(r => r.id) };
//   }

//   // ---- Role ↔ Permissions (اختياري/للاستكمال) ----
//   async getRolePermissions(roleId: number) {
//     const role = await this.prisma.role.findUnique({
//       where: { id: roleId },
//       include: { RolePermission: { include: { Permission: true } } },
//     });
//     if (!role) throw new NotFoundException('Role not found');

//     const permissionCodes = role.RolePermission.map(rp => rp.Permission.code);
//     return { roleId: role.id, roleName: role.roleName, permissionCodes };
//   }

//   async setRolePermissions(roleId: number, permissionCodes: string[]) {
//     const perms = await this.prisma.permission.findMany({
//       where: { code: { in: permissionCodes } },
//       select: { id: true, code: true },
//     });

//     await this.prisma.$transaction([
//       this.prisma.rolePermission.deleteMany({ where: { roleId } }),
//       ...perms.map((p) =>
//         this.prisma.rolePermission.create({ data: { roleId, permissionId: p.id } }),
//       ),
//     ]);

//     // invalidate كل من يملك الدور
//     const holders = await this.prisma.userRole.findMany({ where: { roleId }, select: { userId: true } });
//     for (const h of holders) this.authz.invalidate(h.userId);

//     return { ok: true, roleId, permissionCodes: perms.map(p => p.code), count: perms.length };
//   }
// }



