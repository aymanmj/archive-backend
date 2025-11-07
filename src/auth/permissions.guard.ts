import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { AuthorizationService } from './authorization.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private authz: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // مسارات عامة
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // متطلبات الصلاحيات (إن وجدت)
    const required =
      this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) || [];

    if (!required.length) return true;

    const req = context.switchToHttp().getRequest();
    const userId = req?.user?.userId;
    if (!userId) return false;

    const ok = await this.authz.hasAll(userId, required);
    if (!ok) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
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
// import { PERMISSIONS_KEY } from './permissions.decorator';
// import { AuthorizationService } from './authorization.service';

// @Injectable()
// export class PermissionsGuard implements CanActivate {
//   constructor(
//     private reflector: Reflector,
//     private authz: AuthorizationService,
//   ) {}

//   async canActivate(context: ExecutionContext): Promise<boolean> {
//     // 1) مسارات عامة
//     const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
//       context.getHandler(),
//       context.getClass(),
//     ]);
//     if (isPublic) return true;

//     // 2) لو ما فيه متطلبات، نسمح
//     const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
//       context.getHandler(),
//       context.getClass(),
//     ]) || [];

//     if (!required.length) return true;

//     // 3) تحقق من المستخدم
//     const req = context.switchToHttp().getRequest();
//     const userId = req?.user?.userId;
//     if (!userId) return false;

//     // 4) تحقق الصلاحيات
//     const ok = await this.authz.hasAll(userId, required);
//     if (!ok) {
//       throw new ForbiddenException('Insufficient permissions');
//     }
//     return true;
//   }
// }
