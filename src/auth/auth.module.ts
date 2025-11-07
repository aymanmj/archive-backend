import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { PassportModule } from '@nestjs/passport';
import { AuthorizationService } from './authorization.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ThrottlerModule.forRoot([{ ttl: 60, limit: 10 }]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.get<string>('JWT_SECRET', 'change_me'),
        signOptions: { expiresIn: cfg.get<number>('JWT_EXPIRES_SECONDS', 8 * 60 * 60) },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [AuthService, JwtStrategy, AuthorizationService],
  controllers: [AuthController],
  exports: [AuthService, PassportModule, AuthorizationService, JwtModule],
})
export class AuthModule {}





// import { Module } from '@nestjs/common';
// import { JwtModule } from '@nestjs/jwt';
// import { PrismaModule } from 'src/prisma/prisma.module';
// import { AuthService } from './auth.service';
// import { AuthController } from './auth.controller';
// import { JwtStrategy } from './jwt.strategy';
// import { PassportModule } from '@nestjs/passport';
// import { AuthorizationService } from './authorization.service';
// import { ConfigModule, ConfigService } from '@nestjs/config';
// import { ThrottlerModule } from '@nestjs/throttler';
// import { RbacService } from './rbac.service';

// @Module({
//   imports: [
//     ConfigModule.forRoot({ isGlobal: true }),
//     PrismaModule,
//     PassportModule.register({ defaultStrategy: 'jwt' }),
//     ThrottlerModule.forRoot([{ ttl: 60, limit: 10 }]),
//     JwtModule.registerAsync({
//       imports: [ConfigModule],
//       useFactory: (cfg: ConfigService) => ({
//         secret: cfg.get<string>('JWT_SECRET', 'change_me'),
//         // seconds (number) for type-safety
//         signOptions: {
//           expiresIn: cfg.get<number>('JWT_EXPIRES_SECONDS', 8 * 60 * 60),
//         },
//       }),
//       inject: [ConfigService],
//     }),
//   ],
//   providers: [AuthService, JwtStrategy, AuthorizationService, RbacService],
//   controllers: [AuthController],
//   exports: [AuthService, PassportModule, AuthorizationService, JwtModule, RbacService],
// })
// export class AuthModule {}




// import { Module } from '@nestjs/common';
// import { JwtModule } from '@nestjs/jwt';
// import { PrismaModule } from 'src/prisma/prisma.module';
// import { AuthService } from './auth.service';
// import { AuthController } from './auth.controller';
// import { JwtStrategy } from './jwt.strategy';
// import { PassportModule } from '@nestjs/passport';
// import { AuthorizationService } from './authorization.service';
// import { ConfigModule, ConfigService } from '@nestjs/config';
// import { ThrottlerModule } from '@nestjs/throttler';

// @Module({
//   imports: [
//     ConfigModule.forRoot({ isGlobal: true }),
//     PrismaModule,
//     PassportModule.register({ defaultStrategy: 'jwt' }),
//     ThrottlerModule.forRoot([{ ttl: 60, limit: 10 }]),
//     JwtModule.registerAsync({
//       imports: [ConfigModule],
//       useFactory: (cfg: ConfigService) => ({
//         secret: cfg.get<string>('JWT_SECRET', 'change_me'),
//         // استخدم ثواني بدل "8h" لتوافق النوع
//         signOptions: { expiresIn: cfg.get<number>('JWT_EXPIRES_SECONDS', 8 * 60 * 60) },
//       }),
//       inject: [ConfigService],
//     }),
//   ],
//   providers: [AuthService, JwtStrategy, AuthorizationService],
//   controllers: [AuthController],
//   exports: [AuthService, PassportModule, AuthorizationService, JwtModule],
// })
// export class AuthModule {}
