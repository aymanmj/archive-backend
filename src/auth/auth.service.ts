// src/auth/auth.service.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

type PublicUser = {
  id: number;
  fullName: string;
  username: string;
  department: { id: number; name: string } | null;
  roles: string[];
  isActive: boolean;
};

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwtService: JwtService) {}

  private async findUserByUsername(username: string) {
    return this.prisma.user.findUnique({
      where: { username },
      include: {
        department: { select: { id: true, name: true } },
        UserRole: { include: { Role: { select: { roleName: true } } } },
      },
    });
  }

  private toPublicUser(dbUser: any): PublicUser {
    const roles = (dbUser?.UserRole ?? []).map((ur: any) => ur.Role?.roleName).filter(Boolean);
    return {
      id: dbUser.id,
      fullName: dbUser.fullName,
      username: dbUser.username,
      department: dbUser.departmentId
        ? { id: dbUser.departmentId, name: dbUser.department?.name ?? '' }
        : null,
      roles,
      isActive: !!dbUser.isActive,
    };
  }

  private buildJwtPayload(u: PublicUser) {
    return {
      sub: u.id,
      username: u.username,
      departmentId: u.department?.id ?? null,
      roles: u.roles,
    };
  }

  async login(username: string, password: string) {
    const user = await this.findUserByUsername(username.trim());
    if (!user || !!user.isDeleted || !user.isActive) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    const ok = await bcrypt.compare(password, user.passwordHash || '');
    if (!ok) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    const pub = this.toPublicUser(user);
    const payload = this.buildJwtPayload(pub);

    const expiresSeconds = Number(process.env.JWT_EXPIRES_SECONDS ?? 8 * 60 * 60);
    const token = await this.jwtService.signAsync(payload, {
      expiresIn: expiresSeconds,
      secret: process.env.JWT_SECRET || 'change_me',
    });

    return {
      token,
      user: pub,
    };
  }
}
