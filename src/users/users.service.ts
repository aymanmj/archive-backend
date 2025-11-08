// src/users/users.service.ts

import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async getMe(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        department: { select: { id: true, name: true } },
        UserRole: { include: { Role: { select: { roleName: true } } } },
      },
    });

    if (!user) return null;

    return {
      id: user.id,
      fullName: user.fullName,
      username: user.username,
      isActive: user.isActive,
      // 👇 مهم للواجهة لعرض عناصر الإدارة حتى بعد refresh
      isSystem: user.isSystem,
      department: user.department ? { id: user.department.id, name: user.department.name } : null,
      roles: user.UserRole.map((ur) => ur.Role.roleName),
      jobTitle: user.jobTitle,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    };
  }
}




// import { Injectable } from '@nestjs/common';
// import { PrismaService } from 'src/prisma/prisma.service';

// @Injectable()
// export class UsersService {
//   constructor(private prisma: PrismaService) {}

//   async getMe(userId: number) {
//     const user = await this.prisma.user.findUnique({
//       where: { id: userId },
//       include: {
//         department: {
//           select: {
//             id: true,
//             name: true,
//           },
//         },
//         UserRole: {
//           include: {
//             Role: {
//               select: {
//                 roleName: true,
//               },
//             },
//           },
//         },
//       },
//     });

//     if (!user) {
//       return null;
//     }

//     return {
//       id: user.id,
//       fullName: user.fullName,
//       username: user.username,
//       isActive: user.isActive,
//       department: user.department
//         ? { id: user.department.id, name: user.department.name }
//         : null,
//       roles: user.UserRole.map((ur) => ur.Role.roleName),
//       jobTitle: user.jobTitle,
//       lastLoginAt: user.lastLoginAt,
//       createdAt: user.createdAt,
//     };
//   }
// }
