import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class DepartmentsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    // نجيب الإدارات (سواء Active أو Inactive)
    return this.prisma.department.findMany({
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            users: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async create(name: string) {
    if (!name || !name.trim()) {
      throw new BadRequestException('اسم الإدارة مطلوب');
    }

    // بإمكانك تضيف check للتكرار لاحقاً

    return this.prisma.department.create({
      data: {
        name: name.trim(),
        status: 'Active',
        // createdAt عنده default(now()) في الـ schema
        updatedAt: new Date(), // <-- مهم لأن updatedAt مطلوب
      },
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async updateStatus(id: number, status: string) {
    if (!['Active', 'Inactive'].includes(status)) {
      throw new BadRequestException('قيمة status غير صالحة');
    }

    return this.prisma.department.update({
      where: { id },
      data: {
        status,
        updatedAt: new Date(), // مهم حتى يكون عندنا تاريخ آخر تعديل
      },
      select: {
        id: true,
        name: true,
        status: true,
        updatedAt: true,
      },
    });
  }
}
