import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // ✅ تخطّي المسارات العامة
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // يمكنك لاحقًا إضافة منطق الصلاحيات هنا
    const req = context.switchToHttp().getRequest();
    return !!req.user; // مؤقتًا: يكفي وجود مستخدم موثّق
  }
}




// import {
//   CanActivate,
//   ExecutionContext,
//   Injectable,
//   ForbiddenException,
// } from '@nestjs/common';
// import { Reflector } from '@nestjs/core';
// import { IS_PUBLIC_KEY } from './public.decorator';

// @Injectable()
// export class PermissionsGuard implements CanActivate {
//   constructor(private reflector: Reflector) {}

//   canActivate(context: ExecutionContext): boolean {
//     // ✅ إذا المسار موسوم @Public() نتجاوزه بدون تحقق
//     const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
//       context.getHandler(),
//       context.getClass(),
//     ]);
//     if (isPublic) return true;

//     // هنا يمكنك وضع فحص الصلاحيات (إن وُجد)
//     // مبدئيًا نسمح بالمرور إن وُجد user فقط (بعد JwtAuthGuard)
//     const req = context.switchToHttp().getRequest();
//     const user = req.user;
//     if (!user) {
//       // إن لم يُحقَّق JWT بعد، سيحدث 401 من JwtAuthGuard قبل هذا الجارد
//       return false;
//     }

//     // مثال بسيط: لا تفشل، اسمح بكل شيء الآن
//     return true;

//     // ملاحظة: يمكنك لاحقًا إدراج فحص granular على permissions إن رغبت:
//     // const requiredPerms = this.reflector.getAllAndOverride<string[]>(PERMS_KEY, ...);
//     // ...الخ
//   }
// }





// // // src/auth/permissions.guard.ts


// // import {
// //   CanActivate,
// //   ExecutionContext,
// //   Injectable,
// //   ForbiddenException,
// //   UnauthorizedException,
// // } from '@nestjs/common';
// // import { Reflector } from '@nestjs/core';
// // import { PERMISSIONS_KEY } from './permissions.decorator';
// // import type { PermissionCode } from './permissions.constants';
// // import { RbacService } from './rbac.service';

// // @Injectable()
// // export class PermissionsGuard implements CanActivate {
// //   constructor(private reflector: Reflector, private rbac: RbacService) {}

// //   async canActivate(ctx: ExecutionContext): Promise<boolean> {
// //     const required = this.reflector.getAllAndOverride<PermissionCode[]>(
// //       PERMISSIONS_KEY,
// //       [ctx.getHandler(), ctx.getClass()],
// //     );

// //     // لا توجد صلاحيات مطلوبة => مرّر (مع افتراض أن JwtAuthGuard سبقنا كجارد عام)
// //     if (!required || required.length === 0) return true;

// //     const req = ctx.switchToHttp().getRequest();
// //     const user = req.user as { userId?: number } | undefined;

// //     if (!user?.userId) throw new UnauthorizedException('Unauthorized');

// //     const ok = await this.rbac.userHasAll(user.userId, required);
// //     if (!ok) throw new ForbiddenException('Insufficient permissions');

// //     return true;
// //     }
// // }


