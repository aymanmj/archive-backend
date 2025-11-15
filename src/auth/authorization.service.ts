// src/auth/authorization.service.ts

import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AuthorizationService {
  private cache = new Map<number, { perms: string[]; at: number }>();
  private TTL_MS = 15_000;

  constructor(private prisma: PrismaService) {}

  async list(userId: number): Promise<string[]> {
    // كاش خفيف
    const hit = this.cache.get(userId);
    const now = Date.now();
    if (hit && now - hit.at < this.TTL_MS) return hit.perms;

    // ✅ نجلب الأدوار التي يملكها المستخدم، مع صلاحيات كل دور
    const roles = await this.prisma.role.findMany({
      where: { UserRole: { some: { userId } } }, // <-- تأكد اسم العلاقة UserRole مطابق للـ Prisma عندك
      include: {
        RolePermission: {
          include: { Permission: { select: { code: true } } }, // <-- RolePermission & Permission
        },
      },
    });

    const perms = Array.from(
      new Set(
        roles
          .flatMap((r) => r.RolePermission ?? [])
          .map((rp) => rp.Permission?.code)
          .filter(Boolean)
          .map((c) => c.toLowerCase().trim()),
      ),
    );

    this.cache.set(userId, { perms, at: now });

    // Debug اختياري
    if (process.env.DEBUG_PERMISSIONS === '1') {
      console.log('[AuthorizationService.list]', {
        userId,
        roles: roles.map((r) => r.roleName),
        perms,
      });
    }

    return perms;
  }

  invalidate(userId: number) {
    this.cache.delete(userId);
  }
}

// // src/auth/authorization.service.ts

// import { Injectable } from '@nestjs/common';
// import { PrismaService } from 'src/prisma/prisma.service';

// @Injectable()
// export class AuthorizationService {
//   // كاش خفيف لكل مستخدم (اختياري)
//   private cache = new Map<number, { perms: string[]; at: number }>();
//   private TTL_MS = 30_000; // 30 ثانية

//   constructor(private prisma: PrismaService) {}

//   async list(userId: number): Promise<string[]> {
//     const now = Date.now();
//     const hit = this.cache.get(userId);
//     if (hit && now - hit.at < this.TTL_MS) return hit.perms;

//     const rows = await this.prisma.user.findUnique({
//       where: { id: userId },
//       select: {
//         UserRole: {
//           select: {
//             Role: {
//               select: {
//                 RolePermission: {
//                   select: { Permission: { select: { code: true } } },
//                 },
//               },
//             },
//           },
//         },
//       },
//     });

//     const perms = (rows?.UserRole ?? [])
//       .flatMap((ur) => ur.Role?.RolePermission ?? [])
//       .map((rp) => rp.Permission?.code)
//       .filter(Boolean)
//       .map((c) => c!.toLowerCase().trim());

//     this.cache.set(userId, { perms, at: now });
//     return perms;
//   }

//   invalidate(userId: number) {
//     this.cache.delete(userId);
//   }
// }
