// src/auth/jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

type JwtPayload = {
  sub: number;
  username: string;
  roles?: string[];
  departmentId?: number | null;
  iat?: number;
  exp?: number;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      // خطأ واضح مبكرًا بدل undefined type
      throw new Error('JWT_SECRET is not set in environment variables.');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret, // ✅ string مضمون
    });
  }

  // يُستدعى تلقائيًا إذا كان الـJWT صالحًا
  async validate(payload: JwtPayload) {
    if (!payload?.sub || !payload?.username) {
      throw new UnauthorizedException('Invalid token payload.');
    }

    // أي شيء ترجعْه هنا سيصبح متاحًا في req.user
    return {
      userId: payload.sub,
      username: payload.username,
      roles: payload.roles ?? [],
      departmentId: payload.departmentId ?? null,
    };
  }
}
