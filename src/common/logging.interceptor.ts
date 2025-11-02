import {
  CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const req = ctx.switchToHttp().getRequest();
    const { method, originalUrl } = req;
    const user = req.user?.username ?? 'anon';
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;

    const started = Date.now();
    return next.handle().pipe(
      tap(() => this.logger.log(`${ip} ${user} ${method} ${originalUrl} +${Date.now() - started}ms`)),
    );
  }
}
