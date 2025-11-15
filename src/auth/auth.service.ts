// src/auth/auth.service.ts

import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

type PublicUser = {
  id: number;
  fullName: string;
  username: string;
  department: { id: number; name: string } | null;
  roles: string[];
  isActive: boolean;
};

// 🔐 إعدادات قفل الحساب (من env أو قيم افتراضية)
const MAX_FAILED_LOGIN_ATTEMPTS = Number(
  process.env.LOGIN_MAX_FAILED_ATTEMPTS ?? 5,
);
const ACCOUNT_LOCK_MINUTES = Number(
  process.env.LOGIN_LOCKOUT_MINUTES ?? 15,
);

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  private async findUserByUsername(username: string) {
    return this.prisma.user.findUnique({
      where: { username },
      include: {
        department: { select: { id: true, name: true } },
        UserRole: {
          include: {
            Role: {
              select: {
                roleName: true,
                RolePermission: {
                  select: { Permission: { select: { code: true } } },
                },
              },
            },
          },
        },
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

  private extractPermissions(dbUser: any): string[] {
    const perms = new Set<string>();
    for (const ur of dbUser?.UserRole ?? []) {
      for (const rp of ur?.Role?.RolePermission ?? []) {
        const code = rp?.Permission?.code;
        if (code) perms.add(String(code));
      }
    }
    return Array.from(perms);
  }

  private buildJwtPayload(u: PublicUser, permissions: string[]) {
    return {
      sub: u.id,
      username: u.username,
      departmentId: u.department?.id ?? null,
      roles: u.roles,
      permissions,
    };
  }

  /**
   * تسجيل الدخول + قفل الحساب على مستوى المستخدم (DB)
   * بالإضافة إلى mustChangePassword (الفرونت يستعملها).
   *
   * @param username اسم المستخدم (سيتم توحيده lowercase)
   * @param password كلمة المرور
   * @param ip عنوان الـ IP إن توفر (لـ AuditTrail)
   */
  async login(username: string, password: string, ip?: string | null) {
    const normalizedUsername = String(username ?? '').trim().toLowerCase();
    const now = new Date();

    // نحاول جلب المستخدم
    const user = await this.findUserByUsername(normalizedUsername);

    // لو المستخدم غير موجود أو محذوف أو غير مفعل
    if (!user || !!user.isDeleted || !user.isActive) {
      // AuditTrail لمحاولة دخول فاشلة بدون ربط بمستخدم
      await this.prisma.auditTrail.create({
        data: {
          actionType: 'LOGIN_FAILED',
          actionDescription:
            'محاولة تسجيل دخول فاشلة (اسم مستخدم غير معروف أو حساب غير مفعل)',
          fromIP: ip || null,
        },
      });

      // لا نذكر إن المستخدم موجود أو لا
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    // 🔐 فحص قفل الحساب من الـ DB
    if (user.lockoutUntil && user.lockoutUntil > now) {
      const retryAfterSec = Math.ceil(
        (user.lockoutUntil.getTime() - now.getTime()) / 1000,
      );

      await this.prisma.auditTrail.create({
        data: {
          userId: user.id,
          actionType: 'LOGIN_BLOCKED',
          actionDescription: 'محاولة تسجيل دخول أثناء قفل الحساب',
          actionAt: now,
          fromIP: ip || null,
        },
      });

      // نرسل كود خاص ليفهمه الفرونت
      throw new UnauthorizedException({
        code: 'ACCOUNT_LOCKED',
        message:
          'تم قفل الحساب مؤقتًا بسبب عدد كبير من المحاولات الفاشلة. يرجى المحاولة لاحقًا.',
        retryAfterSec,
        lockedUntil: user.lockoutUntil.toISOString(),
      });
    }

    // ✅ التحقق من كلمة المرور
    const ok = await bcrypt.compare(password ?? '', user.passwordHash || '');

    // ❌ كلمة مرور خاطئة
    if (!ok) {
      const currentFails = user.failedLoginAttempts ?? 0;
      const newFailed = currentFails + 1;

      let lockoutUntil: Date | null = user.lockoutUntil ?? null;
      let lockedNow = false;

      if (newFailed >= MAX_FAILED_LOGIN_ATTEMPTS) {
        lockedNow = true;
        lockoutUntil = new Date(
          now.getTime() + ACCOUNT_LOCK_MINUTES * 60 * 1000,
        );
      }

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: newFailed,
          lockoutUntil,
        },
      });

      await this.prisma.auditTrail.create({
        data: {
          userId: user.id,
          actionType: lockedNow ? 'LOGIN_LOCKED' : 'LOGIN_FAILED',
          actionDescription: lockedNow
            ? `تم قفل الحساب بعد ${newFailed} محاولات فاشلة`
            : 'محاولة تسجيل دخول فاشلة (كلمة مرور خاطئة)',
          actionAt: now,
          fromIP: ip || null,
        },
      });

      if (lockedNow && lockoutUntil) {
        const retryAfterSec = Math.ceil(
          (lockoutUntil.getTime() - now.getTime()) / 1000,
        );
        throw new UnauthorizedException({
          code: 'ACCOUNT_LOCKED',
          message:
            'تم قفل الحساب مؤقتًا بعد عدد كبير من المحاولات الفاشلة.',
          retryAfterSec,
          lockedUntil: lockoutUntil.toISOString(),
        });
      }

      const remaining = Math.max(
        MAX_FAILED_LOGIN_ATTEMPTS - newFailed,
        0,
      );

      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'بيانات الدخول غير صحيحة.',
        remainingAttempts: remaining,
      });
    }

    // ✅ كلمة المرور صحيحة → تصفير العداد، إزالة القفل، تسجيل آخر دخول
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockoutUntil: null,
        lastLoginAt: now,
      },
    });

    await this.prisma.auditTrail.create({
      data: {
        userId: user.id,
        actionType: 'LOGIN_SUCCESS',
        actionDescription: 'تسجيل دخول ناجح',
        actionAt: now,
        fromIP: ip || null,
      },
    });

    const pub = this.toPublicUser(user);
    const permissions = this.extractPermissions(user);
    const payload = this.buildJwtPayload(pub, permissions);

    const expiresSeconds = Number(
      process.env.JWT_EXPIRES_SECONDS ?? 8 * 60 * 60,
    );
    const token = await this.jwtService.signAsync(payload, {
      expiresIn: expiresSeconds,
      secret: process.env.JWT_SECRET || 'change_me',
    });

    return { token, user: pub, mustChangePassword: !!user.mustChangePassword };
  }

  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.isDeleted === true || user.isActive === false) {
      throw new UnauthorizedException('المستخدم غير متاح');
    }

    const ok = await bcrypt.compare(
      currentPassword ?? '',
      user.passwordHash || '',
    );
    if (!ok) {
      throw new UnauthorizedException('كلمة المرور الحالية غير صحيحة');
    }

    if (!newPassword || newPassword.length < 6) {
      throw new UnauthorizedException('كلمة المرور الجديدة قصيرة جدًا');
    }

    const same = await bcrypt.compare(newPassword, user.passwordHash || '');
    if (same) {
      throw new UnauthorizedException(
        'كلمة المرور الجديدة لا يجب أن تطابق الحالية',
      );
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: hash,
        mustChangePassword: false,
        failedLoginAttempts: 0,
        lockoutUntil: null,
      },
    });

    return { ok: true, message: 'تم تغيير كلمة المرور بنجاح' };
  }

  // توليد توكن قوي (32 بايت)
  private generateResetToken(): string {
    return crypto.randomBytes(32).toString('hex'); // 64 char
  }

  private hashToken(token: string): string {
    // hash ثابت وسريع (sha256) كفاية للتوكنات (ليس كلمات مرور)
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * يطلق طلب إعادة تعيين كلمة مرور لمستخدم محدد (يحتاج صلاحية أدمن من الكونترولر).
   * يعيد لك الرابط الجاهز للاستخدام (نسلمه للمستخدم بأي قناة).
   */
  async initiatePasswordReset(
    forUserId: number,
    createdByAdminId?: number,
    ttlMinutes = 30,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: forUserId },
    });
    if (!user || user.isDeleted)
      throw new NotFoundException('المستخدم غير موجود');

    const token = this.generateResetToken();
    const tokenHash = this.hashToken(token);

    const expiresAt = new Date(Date.now() + (ttlMinutes || 30) * 60 * 1000);

    await this.prisma.passwordReset.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        createdBy: createdByAdminId ?? null,
      },
    });

    // الرابط النهائي (سيستهلك من الواجهة الأمامية)
    const base = process.env.PUBLIC_APP_ORIGIN || 'http://localhost:8080';
    const url = `${base}/reset?token=${token}`;

    return { url, expiresAt };
  }

  /**
   * إكمال إعادة التعيين: التحقق من التوكن، تعيين كلمة جديدة، تعليم الطلب "مستخدم".
   */
  async completePasswordReset(token: string, newPassword: string) {
    const tokenHash = this.hashToken(token);

    const req = await this.prisma.passwordReset.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { User: true },
    });

    if (!req) throw new BadRequestException('رابط غير صالح أو منتهي الصلاحية');

    if (!req.User || req.User.isDeleted || !req.User.isActive) {
      throw new ForbiddenException('المستخدم غير صالح');
    }

    const hash = await bcrypt.hash(newPassword, 12);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: req.userId },
        data: {
          passwordHash: hash,
          mustChangePassword: false,
          failedLoginAttempts: 0,
          lockoutUntil: null,
        },
      }),
      this.prisma.passwordReset.update({
        where: { id: req.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return { ok: true };
  }


  /**
   * فك حظر تسجيل الدخول عن مستخدم معيّن بواسطة أدمن
   * - تصفير failedLoginAttempts
   * - إلغاء lockoutUntil
   * - تسجيل العملية في AuditTrail
   */
  async adminUnlockUserLogin(targetUserId: number, adminId?: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!user || user.isDeleted) {
      throw new NotFoundException('المستخدم غير موجود');
    }

    // لو أصلاً مش مقفول، نرجّع ok برضه (idempotent)
    await this.prisma.user.update({
      where: { id: targetUserId },
      data: {
        failedLoginAttempts: 0,
        lockoutUntil: null,
      },
    });

    // نسجّل أن الأدمن فلان فك الحظر عن المستخدم فلان
    await this.prisma.auditTrail.create({
      data: {
        userId: adminId ?? null, // الفاعل = الأدمن
        actionType: 'LOGIN_UNLOCK_ADMIN',
        actionDescription: `فك حظر تسجيل الدخول للمستخدم #${user.id} (${user.username})`,
        fromIP: null,
      },
    });

    return { ok: true };
  }
}




// // src/auth/auth.service.ts

// import * as crypto from 'crypto';
// import * as bcrypt from 'bcrypt';
// import {
//   Injectable,
//   UnauthorizedException,
//   BadRequestException,
//   ForbiddenException,
//   NotFoundException,
// } from '@nestjs/common';
// import { PrismaService } from 'src/prisma/prisma.service';
// import { JwtService } from '@nestjs/jwt';

// type PublicUser = {
//   id: number;
//   fullName: string;
//   username: string;
//   department: { id: number; name: string } | null;
//   roles: string[];
//   isActive: boolean;
// };

// @Injectable()
// export class AuthService {
//   constructor(
//     private prisma: PrismaService,
//     private jwtService: JwtService,
//   ) {}

//   private async findUserByUsername(username: string) {
//     return this.prisma.user.findUnique({
//       where: { username },
//       include: {
//         department: { select: { id: true, name: true } },
//         UserRole: {
//           include: {
//             Role: {
//               select: {
//                 roleName: true,
//                 RolePermission: {
//                   select: { Permission: { select: { code: true } } },
//                 },
//               },
//             },
//           },
//         },
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

//   private extractPermissions(dbUser: any): string[] {
//     const perms = new Set<string>();
//     for (const ur of dbUser?.UserRole ?? []) {
//       for (const rp of ur?.Role?.RolePermission ?? []) {
//         const code = rp?.Permission?.code;
//         if (code) perms.add(String(code));
//       }
//     }
//     return Array.from(perms);
//   }

//   private buildJwtPayload(u: PublicUser, permissions: string[]) {
//     return {
//       sub: u.id,
//       username: u.username,
//       departmentId: u.department?.id ?? null,
//       roles: u.roles,
//       permissions,
//     };
//   }

//   async login(username: string, password: string) {
//     const user = await this.findUserByUsername(username.trim());
//     if (!user || !!user.isDeleted || !user.isActive) {
//       throw new UnauthorizedException('بيانات الدخول غير صحيحة');
//     }

//     const ok = await bcrypt.compare(password, user.passwordHash || '');
//     if (!ok) throw new UnauthorizedException('بيانات الدخول غير صحيحة');

//     const pub = this.toPublicUser(user);
//     const permissions = this.extractPermissions(user);
//     const payload = this.buildJwtPayload(pub, permissions);

//     const expiresSeconds = Number(
//       process.env.JWT_EXPIRES_SECONDS ?? 8 * 60 * 60,
//     );
//     const token = await this.jwtService.signAsync(payload, {
//       expiresIn: expiresSeconds,
//       secret: process.env.JWT_SECRET || 'change_me',
//     });

//     // 👈 نضيف mustChangePassword ليستعملها الفرونت لإجبار تغيير كلمة المرور
//     return { token, user: pub, mustChangePassword: !!user.mustChangePassword };
//   }

//   async changePassword(
//     userId: number,
//     currentPassword: string,
//     newPassword: string,
//   ) {
//     const user = await this.prisma.user.findUnique({ where: { id: userId } });
//     if (!user || user.isDeleted === true || user.isActive === false) {
//       throw new UnauthorizedException('المستخدم غير متاح');
//     }

//     const ok = await bcrypt.compare(
//       currentPassword ?? '',
//       user.passwordHash || '',
//     );
//     if (!ok) {
//       throw new UnauthorizedException('كلمة المرور الحالية غير صحيحة');
//     }

//     if (!newPassword || newPassword.length < 6) {
//       throw new UnauthorizedException('كلمة المرور الجديدة قصيرة جدًا');
//     }

//     const same = await bcrypt.compare(newPassword, user.passwordHash || '');
//     if (same) {
//       throw new UnauthorizedException(
//         'كلمة المرور الجديدة لا يجب أن تطابق الحالية',
//       );
//     }

//     const hash = await bcrypt.hash(newPassword, 12);
//     await this.prisma.user.update({
//       where: { id: userId },
//       data: { passwordHash: hash },
//     });

//     return { ok: true, message: 'تم تغيير كلمة المرور بنجاح' };
//   }

//   // توليد توكن قوي (32 بايت)
//   private generateResetToken(): string {
//     return crypto.randomBytes(32).toString('hex'); // 64 char
//   }

//   private hashToken(token: string): string {
//     // hash ثابت وسريع (sha256) كفاية للتوكنات (ليس كلمات مرور)
//     return crypto.createHash('sha256').update(token).digest('hex');
//   }

//   /**
//    * يطلق طلب إعادة تعيين كلمة مرور لمستخدم محدد (يحتاج صلاحية أدمن من الكونترولر).
//    * يعيد لك الرابط الجاهز للاستخدام (نسلمه للمستخدم بأي قناة).
//    */
//   async initiatePasswordReset(
//     forUserId: number,
//     createdByAdminId?: number,
//     ttlMinutes = 30,
//   ) {
//     const user = await this.prisma.user.findUnique({
//       where: { id: forUserId },
//     });
//     if (!user || user.isDeleted)
//       throw new NotFoundException('المستخدم غير موجود');

//     const token = this.generateResetToken();
//     const tokenHash = this.hashToken(token);

//     const expiresAt = new Date(Date.now() + (ttlMinutes || 30) * 60 * 1000);

//     await this.prisma.passwordReset.create({
//       data: {
//         userId: user.id,
//         tokenHash,
//         expiresAt,
//         createdBy: createdByAdminId ?? null,
//       },
//     });

//     // الرابط النهائي (سيستهلك من الواجهة الأمامية)
//     // لاحظ أننا لا نرسل الـ hash، بل الـ token العادي (لكن نتحقق منه كـ hash)
//     const base = process.env.PUBLIC_APP_ORIGIN || 'http://localhost:8080';
//     const url = `${base}/reset?token=${token}`;

//     return { url, expiresAt };
//   }

//   /**
//    * إكمال إعادة التعيين: التحقق من التوكن، تعيين كلمة جديدة، تعليم الطلب "مستخدم".
//    */
//   async completePasswordReset(token: string, newPassword: string) {
//     const tokenHash = this.hashToken(token);

//     const req = await this.prisma.passwordReset.findFirst({
//       where: {
//         tokenHash,
//         usedAt: null,
//         expiresAt: { gt: new Date() },
//       },
//       include: { User: true },
//     });

//     if (!req) throw new BadRequestException('رابط غير صالح أو منتهي الصلاحية');

//     if (!req.User || req.User.isDeleted || !req.User.isActive) {
//       throw new ForbiddenException('المستخدم غير صالح');
//     }

//     const hash = await bcrypt.hash(newPassword, 12);

//     await this.prisma.$transaction([
//       this.prisma.user.update({
//         where: { id: req.userId },
//         data: { passwordHash: hash },
//       }),
//       this.prisma.passwordReset.update({
//         where: { id: req.id },
//         data: { usedAt: new Date() },
//       }),
//     ]);

//     return { ok: true };
//   }
// }

