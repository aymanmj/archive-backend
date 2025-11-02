// src/departments/departments.service.ts
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateDepartmentDto } from './dto/create-department.dto';

type FindAllParams = { status?: string };

@Injectable()
export class DepartmentsService {
  constructor(private prisma: PrismaService) {}

  async findAll(params: FindAllParams = {}) {
    const where: any = {};
    if (params.status) where.status = params.status;

    return this.prisma.department.findMany({
      where,
      orderBy: { name: 'asc' },
      select: { id: true, name: true, status: true, parentDepartmentId: true },
    });
  }

  async create(dto: CreateDepartmentDto) {
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('Department name is required');

    // منع التكرار بحساسية غير مميزة لحالة الأحرف
    const exists = await this.prisma.department.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } as any },
      select: { id: true },
    });
    if (exists) throw new BadRequestException('Department name already exists');

    // التحقق من القسم الأب (إن وُجد)
    let parentId: number | undefined;
    if (dto.parentDepartmentId) {
      const parent = await this.prisma.department.findUnique({
        where: { id: dto.parentDepartmentId },
        select: { id: true },
      });
      if (!parent) throw new BadRequestException('Parent department not found');
      parentId = parent.id;
    }

    const created = await this.prisma.department.create({
      data: {
        name,
        status: dto.status ?? 'Active',
        parentDepartmentId: parentId,
      },
      select: { id: true, name: true, status: true, parentDepartmentId: true },
    });

    return created;
  }

  async updateStatus(id: number, status: 'Active' | 'Inactive') {
    const exists = await this.prisma.department.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Department not found');

    return this.prisma.department.update({
      where: { id },
      data: { status },
      select: { id: true, name: true, status: true },
    });
  }

  async toggleStatus(id: number) {
    const d = await this.prisma.department.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!d) throw new NotFoundException('Department not found');

    const next: 'Active' | 'Inactive' = d.status === 'Active' ? 'Inactive' : 'Active';
    return this.updateStatus(id, next);
  }
}



// // src/departments/departments.service.ts
// import { Injectable, NotFoundException } from '@nestjs/common';
// import { PrismaService } from 'src/prisma/prisma.service';

// type FindAllParams = {
//   status?: string;
// };

// @Injectable()
// export class DepartmentsService {
//   constructor(private prisma: PrismaService) {}

//   async findAll(params: FindAllParams = {}) {
//     const where: any = {};
//     if (params.status) where.status = params.status;

//     return this.prisma.department.findMany({
//       where,
//       orderBy: { name: 'asc' },
//       select: { id: true, name: true, status: true },
//     });
//   }

//   async updateStatus(id: number, status: 'Active' | 'Inactive') {
//     const exists = await this.prisma.department.findUnique({ where: { id } });
//     if (!exists) throw new NotFoundException('Department not found');

//     const updated = await this.prisma.department.update({
//       where: { id },
//       data: { status },
//       select: { id: true, name: true, status: true },
//     });

//     return updated;
//   }

//   // (اختياري) تبديل الحالة مباشرة عبر زر واحد
//   async toggleStatus(id: number) {
//     const d = await this.prisma.department.findUnique({
//       where: { id },
//       select: { id: true, status: true },
//     });
//     if (!d) throw new NotFoundException('Department not found');

//     const next: 'Active' | 'Inactive' = d.status === 'Active' ? 'Inactive' : 'Active';
//     return this.updateStatus(id, next);
//   }
// }

