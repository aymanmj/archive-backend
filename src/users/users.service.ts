import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async getMe(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
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
      return null;
    }

    return {
      id: user.id,
      fullName: user.fullName,
      username: user.username,
      isActive: user.isActive,
      department: user.department
        ? { id: user.department.id, name: user.department.name }
        : null,
      roles: user.UserRole.map((ur) => ur.Role.roleName),
      jobTitle: user.jobTitle,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    };
  }
}
