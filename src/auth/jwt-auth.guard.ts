import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// نستخدمه مع أي مسار نبيه يكون "يتطلب تسجيل دخول"
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
