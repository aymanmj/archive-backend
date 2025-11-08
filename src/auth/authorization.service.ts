import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

type CacheEntry = { at: number; perms: Set<string> };
const USER_PERMS_CACHE = new Map<number, CacheEntry>();
const TTL_MS = 60_000;

@Injectable()
export class AuthorizationService {
  constructor(private prisma: PrismaService) {}

  private async fetchFromDb(userId: number): Promise<Set<string>> {
    const rows = await this.prisma.userRole.findMany({
      where: { userId },
      select: {
        Role: {
          select: {
            RolePermission: { select: { Permission: { select: { code: true } } } },
          },
        },
      },
    });
    const set = new Set<string>();
    for (const r of rows) {
      for (const rp of r.Role.RolePermission) {
        const code = rp.Permission?.code;
        if (code) set.add(code);
      }
    }
    return set;
  }

  async getUserPermissions(userId: number): Promise<Set<string>> {
    const now = Date.now();
    const entry = USER_PERMS_CACHE.get(userId);
    if (entry && now - entry.at < TTL_MS) return entry.perms;

    const perms = await this.fetchFromDb(userId);
    USER_PERMS_CACHE.set(userId, { at: now, perms });
    return perms;
  }

  // async hasAll(userId: number, required: string[]): Promise<boolean> {
  //   if (!required || required.length === 0) return true;
  //   const userPerms = await this.getUserPermissions(userId);
  //   return required.every((p) => userPerms.has(p));
  // }

  // async hasAll(userId: number, required: string[]): Promise<boolean> {
  //   // ✅ تطبيع دفاعي
  //   const norm = (s: string) => String(s).trim().toLowerCase();

  //   if (!required || required.length === 0) return true;

  //   // required ممكن تكون جاية [['incoming.read']] أو فيها مسافات
  //   const req = required.flat().map(norm).filter(Boolean);

  //   // جب صلاحياتي كـ string[] (أو Set) وطبّعها بنفس الطريقة
  //   const mineArr = await this.list(userId);               // <-- ترجع string[]
  //   const mine = new Set(mineArr.map(norm));               // <-- Set مطبَّع

  //   // ✅ لقطات تشخيصية مؤقتة (احذفها بعد ما تتأكد)
  //   // console.log('[AUTHZ] user:', userId, 'required:', req, 'have:', Array.from(mine));

  //   return req.every((p) => mine.has(p));
  // }

  async hasAll(userId: number, required: string[]): Promise<boolean> {
    if (!required || required.length === 0) return true;

    const norm = (s: string) => String(s).trim().toLowerCase();
    const req = required.flat().map(norm).filter(Boolean);

    const mineArr = await this.list(userId);   // تُرجع string[]
    const mine = new Set(mineArr.map(norm));

    return req.every((p) => mine.has(p));
  }

  async list(userId: number): Promise<string[]> {
    return Array.from(await this.getUserPermissions(userId)).sort();
  }

  invalidate(userId: number) {
    USER_PERMS_CACHE.delete(userId);
  }
}




// // src/auth/authorization.service.ts
// import { Injectable } from '@nestjs/common';
// import { Prisma } from '@prisma/client';

// // ✨ تعريف شكل موحد لبيانات المستخدم من التوكن لاستخدامه في كل مكان
// export type UserContext = {
//   userId: number;
//   departmentId: number | null;
//   roles: string[];
// };

// @Injectable()
// export class AuthorizationService {
//   /**
//    * يتحقق إذا كان المستخدم مدير نظام.
//    * ملاحظة: 'ADMIN' تطابق ما تم إعداده في ملف seed.ts
//    */
//   isAdmin(ctx: UserContext): boolean {
//     return Array.isArray(ctx.roles) && ctx.roles.includes('ADMIN');
//   }

//   /**
//    * يبني جملة `where` لـ Prisma لفلترة سجلات الصادر بناءً على صلاحيات المستخدم.
//    * - مدير النظام يرى كل شيء.
//    * - المستخدم العادي يرى فقط ما يخص إدارته.
//    */
//   buildOutgoingWhereClause(ctx: UserContext): Prisma.OutgoingRecordWhereInput {
//     if (this.isAdmin(ctx)) {
//       return {}; // لا توجد قيود
//     }

//     if (!ctx.departmentId) {
//       // إذا لم يكن المستخدم في إدارة، لا يمكنه رؤية أي شيء
//       return { Document: { owningDepartmentId: -1 } }; // -1 ID مستحيل
//     }

//     return {
//       Document: {
//         owningDepartmentId: ctx.departmentId,
//       },
//     };
//   }

//   /**
//    * يبني جملة `where` لـ Prisma لفلترة سجلات الوارد.
//    * - مدير النظام يرى كل شيء.
//    * - المستخدم العادي يرى فقط الوارد الموجه لإدارته.
//    */
//   buildIncomingWhereClause(ctx: UserContext): Prisma.IncomingRecordWhereInput {
//     if (this.isAdmin(ctx)) {
//       return {}; // لا توجد قيود
//     }

//     if (!ctx.departmentId) {
//       // إذا لم يكن المستخدم في إدارة، لا يمكنه رؤية أي شيء
//       return { id: { equals: BigInt(-1) } }; // ارجع لا شيء
//     }

//     // أرجع الوارد الذي تم توزيعه (distribution) إلى إدارة المستخدم
//     return {
//       distributions: {
//         some: {
//           targetDepartmentId: ctx.departmentId,
//         },
//       },
//     };
//   }
// }




// // src/auth/authorization.service.ts
// import { Injectable } from '@nestjs/common';
// import { Prisma } from '@prisma/client';

// // تعريف شكل بيانات المستخدم التي نتوقعها من التوكن
// export type UserContext = {
//   userId: number;
//   departmentId: number | null;
//   roles: string[];
// };

// @Injectable()
// export class AuthorizationService {
//   /**
//    * يتحقق إذا كان المستخدم مدير نظام.
//    */
//   isAdmin(ctx: UserContext): boolean {
//     // يمكنك تغيير 'ADMIN' إلى 'SystemAdmin' لتطابق ما لديك
//     return Array.isArray(ctx.roles) && ctx.roles.includes('ADMIN');
//   }

//   /**
//    * يبني جملة `where` لـ Prisma لفلترة سجلات الصادر بناءً على صلاحيات المستخدم.
//    * - مدير النظام يرى كل شيء.
//    * - المستخدم العادي يرى فقط ما يخص إدارته.
//    */
//   buildOutgoingWhereClause(ctx: UserContext): Prisma.OutgoingRecordWhereInput {
//     if (this.isAdmin(ctx)) {
//       return {}; // لا توجد قيود
//     }

//     if (!ctx.departmentId) {
//       // إذا لم يكن المستخدم في إدارة، لا يمكنه رؤية أي شيء
//       return { Document: { owningDepartmentId: -1 } }; // -1 ID مستحيل
//     }

//     return {
//       Document: {
//         owningDepartmentId: ctx.departmentId,
//       },
//     };
//   }

//   /**
//    * يبني جملة `where` لـ Prisma لفلترة سجلات الوارد.
//    * - مدير النظام يرى كل شيء.
//    * - المستخدم العادي يرى فقط الوارد الموجه لإدارته.
//    */
//   buildIncomingWhereClause(ctx: UserContext): Prisma.IncomingRecordWhereInput {
//     if (this.isAdmin(ctx)) {
//       return {}; // لا توجد قيود
//     }

//     if (!ctx.departmentId) {
//       return { id: { equals: BigInt(-1) } }; // ارجع لا شيء
//     }

//     // أرجع الوارد الذي تم توزيعه (distribution) إلى إدارة المستخدم
//     return {
//       distributions: {
//         some: {
//           targetDepartmentId: ctx.departmentId,
//         },
//       },
//     };
//   }
// }

