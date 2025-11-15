// src/auth/auth.controller.ts

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthorizationService } from './authorization.service';
import { Public } from './public.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { InitiateResetDto } from './dto/initiate-reset.dto';
import { CompleteResetDto } from './dto/complete-reset.dto';
import { RequirePermissions } from './permissions.decorator';
import { PERMISSIONS } from './permissions.constants';
import { LoginThrottleService } from 'src/security/services/login-throttle.service';
import { getClientIp } from 'src/common/http/ip.util';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly authz: AuthorizationService,
    private readonly throttle: LoginThrottleService,
  ) {}

  // ====== Auth ======
  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Req() req: any, @Body() body: LoginDto) {
    const username = String(body?.username ?? '')
      .trim()
      .toLowerCase();
    const ip = getClientIp(req);

    // تحقق من الحظر الحالي
    // const lockTtl = await this.throttle.isLocked(ip, username);
    // if (lockTtl > 0) {
    //   throw new UnauthorizedException(
    //     `تم حظر تسجيل الدخول مؤقتًا. حاول بعد ${lockTtl} ثانية.`,
    //   );
    // }

    const lockTtl = await this.throttle.isLocked(ip, username);
    if (lockTtl > 0) {
      throw new UnauthorizedException({
        code: 'LOCKED_UNTIL',
        message: 'تم حظر تسجيل الدخول مؤقتًا بسبب عدد كبير من المحاولات.',
        retryAfterSec: lockTtl,
      });
    }

    try {
      const result = await this.authService.login(body.username, body.password);
      // نجاح → صفّر العداد
      await this.throttle.onSuccess(ip, username);
      return result;
    } catch (err) {
      // فشل → زدّ المحاولات وقد تفعّل الحظر
      // const f = await this.throttle.onFailure(ip, username);
      // if (f.locked) {
      //   throw new UnauthorizedException(
      //     `تم تجاوز عدد المحاولات. تم الحظر لمدة ${f.ttl} ثانية.`,
      //   );
      // }
      // throw new UnauthorizedException(
      //   `بيانات الدخول غير صحيحة. متبقّي محاولات: ${f.remaining} خلال ${f.ttl} ثانية.`,
      // );

      const f = await this.throttle.onFailure(ip, username);
      if (f.locked) {
        throw new UnauthorizedException({
          code: 'LOCKED_AFTER_FAILURE',
          message: `تم تجاوز عدد المحاولات. تم الحظر لمدة ${f.ttl} ثانية.`,
          retryAfterSec: f.ttl,
        });
      }

      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'بيانات الدخول غير صحيحة.',
        remaining: f.remaining,
        retryAfterSec: f.ttl,
      });
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  @HttpCode(200)
  async changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    const userId: number | null =
      typeof req?.user?.sub === 'number'
        ? req.user.sub
        : typeof req?.user?.userId === 'number'
          ? req.user.userId
          : null;

    if (!userId)
      throw new BadRequestException('معرّف المستخدم غير متوفر في التوكن');

    return this.authService.changePassword(
      userId,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  // ====== إصدار رابط إعادة التعيين (يتطلب USERS_MANAGE) ======
  @UseGuards(JwtAuthGuard)
  @RequirePermissions([PERMISSIONS.USERS_MANAGE])
  @Post('reset/initiate')
  async initiate(@Req() req: any, @Body() dto: InitiateResetDto) {
    const adminId = Number(req?.user?.sub) || undefined;
    const { url, expiresAt } = await this.authService.initiatePasswordReset(
      dto.userId,
      adminId,
      dto.ttlMinutes ?? 30,
    );
    return { url, expiresAt };
  }

  // ====== إكمال إعادة التعيين (عام/Public) ======
  @Public()
  @Post('reset/complete')
  async complete(@Body() dto: CompleteResetDto) {
    return this.authService.completePasswordReset(dto.token, dto.newPassword);
  }

  // ====== Permissions ======
  @UseGuards(JwtAuthGuard)
  @Get('permissions')
  async myPermissions(@Req() req: any) {
    const userId: number | undefined =
      (typeof req?.user?.sub === 'number' && req.user.sub) ||
      (typeof req?.user?.userId === 'number' && req.user.userId) ||
      undefined;

    const codes = userId ? await this.authz.list(userId) : [];
    return { permissions: codes };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/permissions')
  async myPermissionsAlias(@Req() req: any) {
    const userId: number | undefined =
      (typeof req?.user?.sub === 'number' && req.user.sub) ||
      (typeof req?.user?.userId === 'number' && req.user.userId) ||
      undefined;

    const codes = userId ? await this.authz.list(userId) : [];
    return { permissions: codes };
  }

  // ====== Health ======
  @Public()
  @Get('health')
  ok() {
    return { ok: true };
  }
}

// // src/auth/auth.controller.ts

// import {
//   BadRequestException,
//   Body,
//   Controller,
//   Get,
//   HttpCode,
//   Post,
//   Req,
//   UseGuards,
// } from '@nestjs/common';
// import { AuthService } from './auth.service';
// import { LoginDto } from './dto/login.dto';
// import { JwtAuthGuard } from './jwt-auth.guard';
// import { AuthorizationService } from './authorization.service';
// import { Public } from './public.decorator';
// import { ChangePasswordDto } from './dto/change-password.dto'; // ⬅ إضافة
// import { InitiateResetDto } from './dto/initiate-reset.dto';
// import { CompleteResetDto } from './dto/complete-reset.dto';
// import { RequirePermissions } from './permissions.decorator';
// import { PERMISSIONS } from './permissions.constants';

// @Controller('auth')
// export class AuthController {
//   constructor(
//     private readonly authService: AuthService,
//     private readonly authz: AuthorizationService,
//   ) {}

//   // ====== Auth ======
//   @Public()
//   @Post('login')
//   @HttpCode(200)
//   async login(@Body() body: LoginDto) {
//     return this.authService.login(body.username, body.password);
//   }

//   // تغيير كلمة المرور للحساب الحالي
//   @UseGuards(JwtAuthGuard)
//   @Post('change-password')
//   @HttpCode(200)
//   async changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
//     const userId: number | null =
//       typeof req?.user?.sub === 'number'
//         ? req.user.sub
//         : typeof req?.user?.userId === 'number'
//         ? req.user.userId
//         : null;

//     if (!userId) throw new BadRequestException('معرّف المستخدم غير متوفر في التوكن');

//     return this.authService.changePassword(userId, dto.currentPassword, dto.newPassword);
//   }

//   // ====== إصدار رابط إعادة التعيين (يتطلب USERS_MANAGE) ======
//   @UseGuards(JwtAuthGuard)
//   @RequirePermissions([PERMISSIONS.USERS_MANAGE])
//   @Post('reset/initiate')
//   async initiate(@Req() req: any, @Body() dto: InitiateResetDto) {
//     const adminId = Number(req?.user?.sub) || undefined;
//     const { url, expiresAt } = await this.authService.initiatePasswordReset(
//       dto.userId,
//       adminId,
//       dto.ttlMinutes ?? 30,
//     );
//     return { url, expiresAt };
//   }

//   // ====== إكمال إعادة التعيين (عام/Public) ======
//   @Public()
//   @Post('reset/complete')
//   async complete(@Body() dto: CompleteResetDto) {
//     return this.authService.completePasswordReset(dto.token, dto.newPassword);
//   }

//   // ====== Permissions ======
//   // الشكل القياسي
//   @UseGuards(JwtAuthGuard)
//   @Get('permissions')
//   async myPermissions(@Req() req: any) {
//     const userId: number | undefined =
//       (typeof req?.user?.sub === 'number' && req.user.sub) ||
//       (typeof req?.user?.userId === 'number' && req.user.userId) ||
//       undefined;

//     const codes = userId ? await this.authz.list(userId) : [];
//     return { permissions: codes };
//   }

//   // alias للتوافق مع الواجهة القديمة: /auth/me/permissions
//   @UseGuards(JwtAuthGuard)
//   @Get('me/permissions')
//   async myPermissionsAlias(@Req() req: any) {
//     const userId: number | undefined =
//       (typeof req?.user?.sub === 'number' && req.user.sub) ||
//       (typeof req?.user?.userId === 'number' && req.user.userId) ||
//       undefined;

//     const codes = userId ? await this.authz.list(userId) : [];
//     return { permissions: codes };
//   }

//   // ====== Health ======
//   @Public()
//   @Get('health')
//   ok() {
//     return { ok: true };
//   }
// }
