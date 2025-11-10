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
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthorizationService } from './authorization.service';
import { Public } from './public.decorator';
import { ChangePasswordDto } from './dto/change-password.dto'; // ⬅ إضافة

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly authz: AuthorizationService,
  ) {}

  // ====== Auth ======
  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: LoginDto) {
    return this.authService.login(body.username, body.password);
  }

  // تغيير كلمة المرور للحساب الحالي
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

    if (!userId) throw new BadRequestException('معرّف المستخدم غير متوفر في التوكن');

    return this.authService.changePassword(userId, dto.currentPassword, dto.newPassword);
  }

  // ====== Permissions ======
  // الشكل القياسي
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

  // alias للتوافق مع الواجهة القديمة: /auth/me/permissions
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

// import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
// import { AuthService } from './auth.service';
// import { LoginDto } from './dto/login.dto';
// import { JwtAuthGuard } from './jwt-auth.guard';
// import { AuthorizationService } from './authorization.service';
// import { Public } from './public.decorator';

// @Controller('auth')
// export class AuthController {
//   constructor(
//     private readonly authService: AuthService,
//     private readonly authz: AuthorizationService,
//   ) {}

//   @Public()
//   @Post('login')
//   async login(@Body() body: LoginDto) {
//     return this.authService.login(body.username, body.password);
//   }

//   // الشكل القياسي
//   @UseGuards(JwtAuthGuard)
//   @Get('permissions')
//   async myPermissions(@Req() req: any) {
//     const userId: number | undefined = req?.user?.userId;
//     const codes = userId ? await this.authz.list(userId) : [];
//     return { permissions: codes };
//   }

//   // alias للتوافق مع الواجهة القديمة: /auth/me/permissions
//   @UseGuards(JwtAuthGuard)
//   @Get('me/permissions')
//   async myPermissionsAlias(@Req() req: any) {
//     const userId: number | undefined = req?.user?.userId;
//     const codes = userId ? await this.authz.list(userId) : [];
//     return { permissions: codes };
//   }

//   @Public()
//   @Get('health')
//   ok() { return { ok: true }; }
// }

