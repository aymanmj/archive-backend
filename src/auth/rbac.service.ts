// src/auth/rbac.service.ts

import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import type { PermissionCode } from './permissions.constants';

@Injectable()
export class RbacService {
  constructor(private prisma: PrismaService) {}

  async getUserPermissions(userId: number): Promise<Set<string>> {
    const roles = await this.prisma.userRole.findMany({
      where: { userId },
      include: {
        Role: {
          include: { RolePermission: { include: { Permission: true } } },
        },
      },
    });
    const set = new Set<string>();
    for (const ur of roles) {
      for (const rp of ur.Role.RolePermission) {
        if (rp.Permission?.code) set.add(rp.Permission.code);
      }
    }
    return set;
  }

  async userHasAll(userId: number, perms: PermissionCode[]): Promise<boolean> {
    if (!perms?.length) return true;
    const userPerms = await this.getUserPermissions(userId);
    return perms.every((p) => userPerms.has(p));
  }
}




// // src/auth/rbac.service.ts

// import { Injectable } from '@nestjs/common';
// import { PrismaService } from 'src/prisma/prisma.service';
// import type { PermissionCode } from './permissions.constants';

// @Injectable()
// export class RbacService {
//   constructor(private prisma: PrismaService) {}

//   /**
//    * يجلب أكواد الصلاحيات الفعلية للمستخدم من DB عبر RolePermission
//    */
//   async getUserPermissions(userId: number): Promise<Set<string>> {
//     const roles = await this.prisma.userRole.findMany({
//       where: { userId },
//       include: {
//         Role: { include: { RolePermission: { include: { Permission: true } } } },
//       },
//     });

//     const set = new Set<string>();
//     for (const ur of roles) {
//       for (const rp of ur.Role.RolePermission) {
//         if (rp.Permission?.code) set.add(rp.Permission.code);
//       }
//     }
//     return set;
//   }

//   /**
//    * يتحقق أنّ المستخدم يمتلك كل الصلاحيات المطلوبة
//    */
//   async userHasAll(userId: number, perms: PermissionCode[]): Promise<boolean> {
//     if (!perms?.length) return true;
//     const userPerms = await this.getUserPermissions(userId);
//     return perms.every((p) => userPerms.has(p));
//   }
// }
