import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // ✅ لو المسار @Public() نتخطى التوثيق بالكامل
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    return super.canActivate(context) as any;
  }

  handleRequest(err: any, user: any) {
    // المسارات غير العامة تتطلب user صحيح
    if (err || !user) {
      throw err || new UnauthorizedException('Unauthorized');
    }
    return user;
  }
}




// import { Injectable } from '@nestjs/common';
// import { AuthGuard } from '@nestjs/passport';

// // نستخدمه مع أي مسار نبيه يكون "يتطلب تسجيل دخول"
// @Injectable()
// export class JwtAuthGuard extends AuthGuard('jwt') {}
