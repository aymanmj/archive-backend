// src/auth/permissions.guard.ts

import {
  CanActivate, ExecutionContext, Injectable,
  ForbiddenException, UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { AuthorizationService } from './authorization.service';

type JwtUser = {
  userId: number;
  permissions?: string[];
};

const DEBUG = process.env.DEBUG_PERMISSIONS === '1';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authz: AuthorizationService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const requiredRaw = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!requiredRaw || requiredRaw.length === 0) return true;

    const required = requiredRaw.map((r) => String(r).toLowerCase().trim());

    const req = ctx.switchToHttp().getRequest();
    const user = req.user as JwtUser | undefined;
    if (!user || !user.userId) throw new UnauthorizedException('غير مصرح');

    // 1) من التوكن
    let have = new Set((user.permissions ?? []).map((p) => String(p).toLowerCase().trim()));

    // 2) لو فاضية أو تحب تفرض جلب حي دومًا، خذها من الـDB
    if (!have.size) {
      const live = await this.authz.list(user.userId);
      have = new Set(live);
      (req.user as any).permissions = Array.from(have); // caching في الطلب
    }

    const ok = required.every((code) => have.has(code));

    if (DEBUG) {
      // LOG غير مزعج: يظهر فقط في الـ dev عند تفعيل DEBUG_PERMISSIONS
      // eslint-disable-next-line no-console
      console.log('[PermissionsGuard]',
        { userId: user.userId, required, have: Array.from(have), ok });
    }

    if (!ok) throw new ForbiddenException('ليست لديك صلاحية للوصول إلى هذا المورد');
    return true;
  }
}





// // src/auth/permissions.guard.ts

// import {
//   CanActivate, ExecutionContext, Injectable,
//   ForbiddenException, UnauthorizedException,
// } from '@nestjs/common';
// import { Reflector } from '@nestjs/core';
// import { PERMISSIONS_KEY } from './permissions.decorator';
// import { AuthorizationService } from './authorization.service'; // موجود عندك

// type JwtUser = {
//   userId: number;
//   permissions?: string[];
// };

// @Injectable()
// export class PermissionsGuard implements CanActivate {
//   constructor(
//     private readonly reflector: Reflector,
//     private readonly authz: AuthorizationService, // ⬅️ inject
//   ) {}

//   async canActivate(ctx: ExecutionContext): Promise<boolean> {
//     const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
//       ctx.getHandler(),
//       ctx.getClass(),
//     ]);
//     if (!required || required.length === 0) return true;

//     const req = ctx.switchToHttp().getRequest();
//     const user = req.user as JwtUser | undefined;
//     if (!user) throw new UnauthorizedException('غير مصرح');

//     // 1) خذ من التوكن إن وُجد
//     let have = new Set((user.permissions ?? []).map(p => p.toLowerCase().trim()));

//     // 2) لو فاضية (أو تحب تعتبر التوكن غير موثوق)، حمّل من الـDB
//     if (!have.size) {
//       const live = await this.authz.list(user.userId);
//       have = new Set(live.map(p => p.toLowerCase().trim()));
//       // (اختياري) خزّنها في req.user لتستفيد لاحقًا
//       (req.user as any).permissions = Array.from(have);
//     }

//     const ok = required.every(r => have.has(String(r).toLowerCase().trim()));
//     if (!ok) throw new ForbiddenException('ليست لديك صلاحية للوصول إلى هذا المورد');
//     return true;
//   }
// }

