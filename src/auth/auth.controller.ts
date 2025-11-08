// src/auth/auth.controller.ts
import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthorizationService } from './authorization.service';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly authz: AuthorizationService,
  ) {}

  @Public()
  @Post('login')
  async login(@Body() body: LoginDto) {
    return this.authService.login(body.username, body.password);
  }

  // الشكل القياسي
  @UseGuards(JwtAuthGuard)
  @Get('permissions')
  async myPermissions(@Req() req: any) {
    const userId: number | undefined = req?.user?.userId;
    const codes = userId ? await this.authz.list(userId) : [];
    return { permissions: codes };
  }

  // alias للتوافق مع الواجهة القديمة: /auth/me/permissions
  @UseGuards(JwtAuthGuard)
  @Get('me/permissions')
  async myPermissionsAlias(@Req() req: any) {
    const userId: number | undefined = req?.user?.userId;
    const codes = userId ? await this.authz.list(userId) : [];
    return { permissions: codes };
  }

  @Public()
  @Get('health')
  ok() { return { ok: true }; }
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
//     private authService: AuthService,
//     private authz: AuthorizationService,
//   ) {}

//   @Public()
//   @Post('login')
//   async login(@Body() body: LoginDto) {
//     return this.authService.login(body.username, body.password);
//   }

//   // يعيد قائمة صلاحيات المستخدم الحالي
//   @UseGuards(JwtAuthGuard)
//   @Get('me/permissions')
//   async myPermissions(@Req() req: any) {
//     const { userId } = req.user;
//     const perms = await this.authz.list(userId);
//     return { permissions: perms };
//   }
// }




// // src/auth/auth.controller.ts

// import { Body, Controller, Post } from '@nestjs/common';
// import { AuthService } from './auth.service';
// import { LoginDto } from './dto/login.dto';

// @Controller('auth')
// export class AuthController {
//   constructor(private authService: AuthService) {}

//   @Post('login')
//   async login(@Body() body: LoginDto) {
//     return this.authService.login(body.username, body.password);
//   }
// }





// // src/auth/auth.controller.ts


// import { Body, Controller, Post } from '@nestjs/common';
// import { AuthService } from './auth.service';
// import { LoginDto } from './dto/login.dto';
// import { Public } from './public.decorator';

// @Controller('auth')
// export class AuthController {
//   constructor(private authService: AuthService) {}

//   @Public() // ✅ مهم جدًا كي لا يطلب JWT
//   @Post('login')
//   async login(@Body() body: LoginDto) {
//     return this.authService.login(body.username, body.password);
//   }
// }




// // src/auth/auth.controller.ts

// import { Body, Controller, Post } from '@nestjs/common';
// import { AuthService } from './auth.service';
// import { LoginDto } from './dto/login.dto';
// import { Public } from './public.decorator';

// @Controller('auth')
// export class AuthController {
//   constructor(private authService: AuthService) {}

//   @Post('login')
//   async login(@Body() body: LoginDto) {
//     return this.authService.login(body.username, body.password);
//   }
// }
