// src/common/guards/auth.guard.ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    // هنا يفترض فحص JWT وإسناد req.user
    if (!req.user) throw new UnauthorizedException('Authentication required');
    return true;
  }
}
