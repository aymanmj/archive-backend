import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

type CacheEntry = { at: number; perms: Set<string> };
const USER_PERMS_CACHE = new Map<number, CacheEntry>();
const TTL_MS = 60_000;

@Injectable()
export class AuthorizationService {
  constructor(private prisma: PrismaService) {}

  private async isSystemUser(userId: number): Promise<boolean> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isSystem: true },
    });
    return !!u?.isSystem;
  }

  private async fetchFromDb(userId: number): Promise<Set<string>> {
    const rows = await this.prisma.userRole.findMany({
      where: { userId },
      select: {
        Role: {
          select: {
            RolePermission: {
              select: { Permission: { select: { code: true } } },
            },
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

  async list(userId: number): Promise<string[]> {
    // المستخدم النظامي “كل شيء مسموح” نظريًا — نرجّع قائمة كبيرة؟ لا داعي.
    // يكفي أن نعيد قائمة الحقوق الفعلية من الـ DB؛ التجاوز يتم في hasAll.
    return Array.from(await this.getUserPermissions(userId)).sort();
  }

  async hasAll(userId: number, required: string[]): Promise<boolean> {
    if (!required || required.length === 0) return true;

    // ✅ تجاوز كامل للسوبر أدمن (isSystem)
    if (await this.isSystemUser(userId)) return true;

    const norm = (s: string) => String(s).trim().toLowerCase();
    const req = required.flat().map(norm).filter(Boolean);

    const mineArr = await this.list(userId);
    const mine = new Set(mineArr.map(norm));

    return req.every((p) => mine.has(p));
  }

  invalidate(userId: number) {
    USER_PERMS_CACHE.delete(userId);
  }
}



// import { Injectable } from '@nestjs/common';
// import { PrismaService } from 'src/prisma/prisma.service';

// type CacheEntry = { at: number; perms: Set<string> };
// const USER_PERMS_CACHE = new Map<number, CacheEntry>();
// const TTL_MS = 60_000;

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
//         const code = rp.Permission?.code;
//         if (code) set.add(code);
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

//   // async hasAll(userId: number, required: string[]): Promise<boolean> {
//   //   if (!required || required.length === 0) return true;
//   //   const userPerms = await this.getUserPermissions(userId);
//   //   return required.every((p) => userPerms.has(p));
//   // }

//   // async hasAll(userId: number, required: string[]): Promise<boolean> {
//   //   // ✅ تطبيع دفاعي
//   //   const norm = (s: string) => String(s).trim().toLowerCase();

//   //   if (!required || required.length === 0) return true;

//   //   // required ممكن تكون جاية [['incoming.read']] أو فيها مسافات
//   //   const req = required.flat().map(norm).filter(Boolean);

//   //   // جب صلاحياتي كـ string[] (أو Set) وطبّعها بنفس الطريقة
//   //   const mineArr = await this.list(userId);               // <-- ترجع string[]
//   //   const mine = new Set(mineArr.map(norm));               // <-- Set مطبَّع

//   //   // ✅ لقطات تشخيصية مؤقتة (احذفها بعد ما تتأكد)
//   //   // console.log('[AUTHZ] user:', userId, 'required:', req, 'have:', Array.from(mine));

//   //   return req.every((p) => mine.has(p));
//   // }

//   async hasAll(userId: number, required: string[]): Promise<boolean> {
//     if (!required || required.length === 0) return true;

//     const norm = (s: string) => String(s).trim().toLowerCase();
//     const req = required.flat().map(norm).filter(Boolean);

//     const mineArr = await this.list(userId);   // تُرجع string[]
//     const mine = new Set(mineArr.map(norm));

//     return req.every((p) => mine.has(p));
//   }

//   async list(userId: number): Promise<string[]> {
//     return Array.from(await this.getUserPermissions(userId)).sort();
//   }

//   invalidate(userId: number) {
//     USER_PERMS_CACHE.delete(userId);
//   }
// }


