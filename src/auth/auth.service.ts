// src/auth/auth.service.ts

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

type PublicUser = {
  id: number;
  fullName: string;
  username: string;
  department: { id: number; name: string } | null;
  roles: string[];
  isActive: boolean;
};

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwtService: JwtService) {}

  private async findUserByUsername(username: string) {
    return this.prisma.user.findUnique({
      where: { username },
      include: {
        department: { select: { id: true, name: true } },
        UserRole: { include: { Role: { select: { roleName: true } } } },
      },
    });
  }

  private toPublicUser(dbUser: any): PublicUser {
    const roles = (dbUser?.UserRole ?? [])
      .map((ur: any) => ur.Role?.roleName)
      .filter(Boolean);
    return {
      id: dbUser.id,
      fullName: dbUser.fullName,
      username: dbUser.username,
      department: dbUser.departmentId
        ? { id: dbUser.departmentId, name: dbUser.department?.name ?? '' }
        : null,
      roles,
      isActive: !!dbUser.isActive,
    };
  }

  private buildJwtPayload(u: PublicUser) {
    return {
      sub: u.id,
      username: u.username,
      departmentId: u.department?.id ?? null,
      roles: u.roles,
    };
  }

  async login(username: string, password: string) {
    const user = await this.findUserByUsername(username.trim());
    if (!user || !!user.isDeleted || !user.isActive) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    const ok = await bcrypt.compare(password, user.passwordHash || '');
    if (!ok) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    const pub = this.toPublicUser(user);
    const payload = this.buildJwtPayload(pub);

    const expiresSeconds = Number(process.env.JWT_EXPIRES_SECONDS ?? 8 * 60 * 60);
    const token = await this.jwtService.signAsync(payload, {
      expiresIn: expiresSeconds,
      secret: process.env.JWT_SECRET || 'change_me',
    });

    return { token, user: pub };
  }
}




// import { Injectable } from '@nestjs/common';
// import { PrismaService } from 'src/prisma/prisma.service';

// // كاش بسيط بالذاكرة لمدة قصيرة لتقليل الضغط على DB
// type CacheEntry = { at: number; perms: Set<string> };
// const USER_PERMS_CACHE = new Map<number, CacheEntry>();
// const TTL_MS = 60_000; // 60 ثانية

// @Injectable()
// export class AuthorizationService {
//   constructor(private prisma: PrismaService) {}

//   private async fetchFromDb(userId: number): Promise<Set<string>> {
//     const rows = await this.prisma.userRole.findMany({
//       where: { userId },
//       select: {
//         Role: {
//           select: {
//             RolePermission: { select: { Permission: { select: { code: true } } } },
//           },
//         },
//       },
//     });

//     const set = new Set<string>();
//     for (const r of rows) {
//       for (const rp of r.Role.RolePermission) {
//         if (rp.Permission?.code) set.add(rp.Permission.code);
//       }
//     }
//     return set;
//   }

//   async getUserPermissions(userId: number): Promise<Set<string>> {
//     const now = Date.now();
//     const entry = USER_PERMS_CACHE.get(userId);
//     if (entry && now - entry.at < TTL_MS) return entry.perms;

//     const perms = await this.fetchFromDb(userId);
//     USER_PERMS_CACHE.set(userId, { at: now, perms });
//     return perms;
//   }

//   async hasAll(userId: number, required: string[]): Promise<boolean> {
//     if (!required?.length) return true; // لا توجد شروط
//     const userPerms = await this.getUserPermissions(userId);
//     return required.every((p) => userPerms.has(p));
//   }

//   // مفيد للـ UI
//   async list(userId: number): Promise<string[]> {
//     return Array.from(await this.getUserPermissions(userId)).sort();
//   }

//   // لمسح الكاش اختياريًا بعد أي تغيير أدوار/صلاحيات
//   invalidate(userId: number) {
//     USER_PERMS_CACHE.delete(userId);
//   }
// }




// // src/auth/auth.service.ts

// import { Injectable, UnauthorizedException } from '@nestjs/common';
// import { PrismaService } from 'src/prisma/prisma.service';
// import { JwtService } from '@nestjs/jwt';
// import * as bcrypt from 'bcrypt';
// import { RolePermissions } from './permissions';

// type PublicUser = {
//   id: number;
//   fullName: string;
//   username: string;
//   department: { id: number; name: string } | null;
//   roles: string[];
//   isActive: boolean;
//   permissions?: string[]; // NEW
// };

// @Injectable()
// export class AuthService {
//   constructor(private prisma: PrismaService, private jwtService: JwtService) {}

//   private async findUserByUsername(username: string) {
//     return this.prisma.user.findUnique({
//       where: { username },
//       include: {
//         department: { select: { id: true, name: true } },
//         UserRole: { include: { Role: { select: { roleName: true } } } },
//       },
//     });
//   }

//   private toPublicUser(dbUser: any): PublicUser {
//     const roles = (dbUser?.UserRole ?? [])
//       .map((ur: any) => ur.Role?.roleName)
//       .filter(Boolean);

//     return {
//       id: dbUser.id,
//       fullName: dbUser.fullName,
//       username: dbUser.username,
//       department: dbUser.departmentId
//         ? { id: dbUser.departmentId, name: dbUser.department?.name ?? '' }
//         : null,
//       roles,
//       isActive: !!dbUser.isActive,
//     };
//   }

//   private buildJwtPayload(u: PublicUser, permissions: string[]) {
//     return {
//       sub: u.id,
//       username: u.username,
//       departmentId: u.department?.id ?? null,
//       roles: u.roles,
//       permissions, // NEW
//     };
//   }

//   async login(username: string, password: string) {
//     const user = await this.findUserByUsername(username.trim());
//     if (!user || !!user.isDeleted || !user.isActive) {
//       throw new UnauthorizedException('بيانات الدخول غير صحيحة');
//     }

//     const ok = await bcrypt.compare(password, user.passwordHash || '');
//     if (!ok) {
//       throw new UnauthorizedException('بيانات الدخول غير صحيحة');
//     }

//     // نبني المستخدم العام + الأدوار
//     const pub = this.toPublicUser(user);

//     // نحسب الأذونات من الأدوار (بدون تكرار)
//     const permissionsSet = new Set<string>();
//     for (const r of pub.roles) {
//       (RolePermissions[r] ?? []).forEach((p) => permissionsSet.add(p));
//     }
//     const permissions = Array.from(permissionsSet);

//     // الـ payload الآن يحوي permissions
//     const payload = this.buildJwtPayload(pub, permissions);

//     const expiresSeconds = Number(process.env.JWT_EXPIRES_SECONDS ?? 8 * 60 * 60);
//     const token = await this.jwtService.signAsync(payload, {
//       expiresIn: expiresSeconds,
//       secret: process.env.JWT_SECRET || 'change_me',
//     });

//     return {
//       token,
//       user: { ...pub, permissions }, // نعيد الأذونات للواجهة أيضاً
//     };
//   }
// }


