import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
  import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  /**
   * التحقق من بيانات الدخول وإرجاع بيانات المستخدم
   * لو كلمة المرور صحيحة
   */
  private async validateUser(username: string, password: string) {
    // نجيب المستخدم من الداتابيس
    const user = await this.prisma.user.findUnique({
      where: { username },
      include: {
        department: {
          select: {
            id: true,
            name: true,
          },
        },
        UserRole: {
          include: {
            Role: {
              select: {
                roleName: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('المستخدم موقوف');
    }

    // نتحقق من كلمة المرور
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    // نبني مصفوفة الأدوار بشكل بسيط ["SystemAdmin", "DepartmentManager", ...]
    const roleNames = user.UserRole.map((ur) => ur.Role.roleName);

    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      departmentId: user.departmentId ?? null,
      departmentName: user.department?.name ?? null,
      roles: roleNames,
      isActive: user.isActive,
    };
  }

  /**
   * إنشاء الـ JWT Payload
   * هذا ما سيدخل داخل التوكن
   */
  private buildJwtPayload(user: {
    id: number;
    username: string;
    departmentId: number | null;
    roles: string[];
  }) {
    return {
      sub: user.id, // هذا مهم جداً لأنه لاحقاً نستخدمه كـ userId
      username: user.username,
      departmentId: user.departmentId,
      roles: user.roles,
    };
  }

  /**
   * تسجيل الدخول
   * يرجع:
   *  - accessToken
   *  - معلومات المستخدم
   * الواجهة الأمامية تخزن الـ token وتعرض بيانات المستخدم.
   */
  async login(username: string, password: string) {
    const userData = await this.validateUser(username, password);

    const payload = this.buildJwtPayload({
      id: userData.id,
      username: userData.username,
      departmentId: userData.departmentId,
      roles: userData.roles,
    });

    const token = await this.jwtService.signAsync(payload);

    return {
      accessToken: token,
      user: {
        id: userData.id,
        fullName: userData.fullName,
        username: userData.username,
        department: userData.departmentId
          ? {
              id: userData.departmentId,
              name: userData.departmentName,
            }
          : null,
        roles: userData.roles,
        isActive: userData.isActive,
      },
    };
  }

  /**
   * إرجاع بيانات المستخدم الحالي من خلال التوكن (مثل /auth/me)
   * هذا مفيد للواجهة الأمامية بعد الريفريش حتى تعيد بناء الـ context
   */
  async meFromToken(tokenHeader: string | undefined) {
    if (!tokenHeader || typeof tokenHeader !== 'string') {
      throw new BadRequestException('مفقود التوكن');
    }

    const parts = tokenHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new BadRequestException('رمز الجلسة غير صالح');
    }

    const token = parts[1];
    let payload: any;
    try {
      payload = this.jwtService.verify(token);
    } catch (e) {
      throw new UnauthorizedException(
        'انتهت الصلاحية، يرجى تسجيل الدخول مجدداً',
      );
    }

    // نجيب معلومات المستخدم من جديد عشان نرجع نفس شكل الـ login
    const dbUser = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        department: {
          select: {
            id: true,
            name: true,
          },
        },
        UserRole: {
          include: {
            Role: {
              select: {
                roleName: true,
              },
            },
          },
        },
      },
    });

    if (!dbUser) {
      throw new UnauthorizedException('المستخدم لم يعد موجوداً');
    }

    const roles = dbUser.UserRole.map((ur) => ur.Role.roleName);

    return {
      id: dbUser.id,
      fullName: dbUser.fullName,
      username: dbUser.username,
      department: dbUser.departmentId
        ? {
            id: dbUser.departmentId,
            name: dbUser.department?.name ?? null,
          }
        : null,
      roles,
      isActive: dbUser.isActive,
    };
  }
}
