// src/auth/auth.controller.ts

import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  async login(@Body() body: LoginDto) {
    return this.authService.login(body.username, body.password);
  }
}





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
