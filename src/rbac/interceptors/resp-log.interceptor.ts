// src/rbac/interceptors/resp-log.interceptor.ts

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { tap } from 'rxjs/operators';

@Injectable()
export class RespLogInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler) {
    const req = ctx.switchToHttp().getRequest();
    return next.handle().pipe(
      tap((data) => {
        const res = ctx.switchToHttp().getResponse();
        // احذر من طباعة بيانات حساسة في الإنتاج
        console.log(
          '[RBAC RESP]',
          req.method,
          req.url,
          'status=',
          res.statusCode,
          'payload=',
          JSON.stringify(data),
        );
      }),
    );
  }
}
