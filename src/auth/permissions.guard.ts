// src/auth/permissions.guard.ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, ForbiddenException} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';
import { AuthorizationService } from './authorization.service';
import { PERMISSIONS_KEY } from './permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector, private authz: AuthorizationService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;
    
    const req = ctx.switchToHttp().getRequest();
    const required = (this.reflector.getAllAndOverride<string[] | string>(PERMISSIONS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]) ?? []) as any;

    // لا توجد صلاحيات مطلوبة -> السماح
    const requiredList = (Array.isArray(required) ? required.flat() : [required])
      .map((s) => String(s).trim().toLowerCase())
      .filter(Boolean);
    if (requiredList.length === 0) return true;

    // لازم يكون req.user موجود (محقون من JwtAuthGuard)
    const userId: number | undefined = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Missing user in request');
    }

    // فحص الصلاحيات
    const ok = await this.authz.hasAll(userId, requiredList);
    if (!ok) throw new ForbiddenException('Insufficient permissions');
    return true;
  }
}







// // src/auth/permissions.guard.ts

// import {
//   CanActivate,
//   ExecutionContext,
//   ForbiddenException,
//   Injectable,
// } from '@nestjs/common';
// import { Reflector } from '@nestjs/core';
// import { PERMISSIONS_KEY } from './permissions.decorator';
// import { AuthorizationService } from './authorization.service';

// @Injectable()
// export class PermissionsGuard implements CanActivate {
//   constructor(
//     private reflector: Reflector,
//     private authz: AuthorizationService,
//   ) {}

//   async canActivate(ctx: ExecutionContext): Promise<boolean> {
//     // قد تأتي كمصفوفة داخل مصفوفة أو حتى قيمة منفردة (بسبب اختلاف استخدام الديكوريتر)
//     const meta = this.reflector.getAllAndOverride<any>(PERMISSIONS_KEY, [
//       ctx.getHandler(),
//       ctx.getClass(),
//     ]);

//     // ✅ طبّعها إلى string[] مسطّحة
//     const required: string[] = !meta
//       ? []
//       : Array.isArray(meta)
//       ? meta.flat().map((x) => String(x))
//       : [String(meta)];

//     if (required.length === 0) return true; // لا توجد قيود على هذا المسار

//     const req = ctx.switchToHttp().getRequest();
//     const userId: number | undefined = req.user?.userId;
//     if (!userId) throw new ForbiddenException('Missing user in request');

//     const ok = await this.authz.hasAll(userId, required);
//     if (!ok) throw new ForbiddenException('Insufficient permissions');

//     return true;
//   }
// }





// // src/auth/permissions.guard.ts

// import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
// import { Reflector } from '@nestjs/core';
// import { PERMISSIONS_KEY } from './permissions.decorator';
// import { AuthorizationService } from './authorization.service';

// @Injectable()
// export class PermissionsGuard implements CanActivate {
//   constructor(
//     private reflector: Reflector,
//     private authz: AuthorizationService,
//   ) {}

//   async canActivate(ctx: ExecutionContext): Promise<boolean> {
//     const required = this.reflector.getAllAndOverride<string[]>(
//       PERMISSIONS_KEY,
//       [ctx.getHandler(), ctx.getClass()],
//     );

//     // ✅ لو ما فيه شروط صلاحيات على هذا المسار → اسمح بالمرور
//     if (!required || required.length === 0) return true;

//     const req = ctx.switchToHttp().getRequest();
//     const userId: number | undefined = req.user?.userId;

//     if (!userId) throw new ForbiddenException('Missing user in request');

//     const ok = await this.authz.hasAll(userId, required);
//     if (!ok) throw new ForbiddenException('Insufficient permissions');

//     return true;
//   }
// }


