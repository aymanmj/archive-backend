// src/common/guards/incoming-clearance.guard.ts
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

/**
 * يتحقق من صلاحية المستخدم لعرض تفاصيل وارد معين
 * يعتمد على: user.securityClearanceRank >= document.securityLevel.rankOrder
 *
 * يفترض أن JwtAuthGuard سبق وعبّى req.user بالقيم:
 * { id: number; securityClearanceRank: number; ... }
 */
@Injectable()
export class IncomingClearanceGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user as
      | { id: number; securityClearanceRank: number }
      | undefined;

    if (!user) {
      throw new ForbiddenException('مصادقة مطلوبة');
    }

    const idParam = req.params?.id;
    if (!idParam) {
      throw new BadRequestException('معرّف الوارد مفقود');
    }

    let incomingId: bigint;
    try {
      // يمنع مشاكل مثل "my-dept" لأنه ليس رقم
      incomingId = BigInt(idParam);
    } catch {
      throw new BadRequestException('معرّف الوارد غير صالح');
    }

    // جلب رتبة سرّية المستند المرتبط بالوارد
    const incoming = await this.prisma.incomingRecord.findUnique({
      where: { id: incomingId },
      select: {
        id: true,
        document: {
          select: {
            id: true,
            securityLevel: {
              select: { rankOrder: true, levelName: true },
            },
          },
        },
      },
    });

    if (!incoming || !incoming.document) {
      throw new NotFoundException('الوارد غير موجود أو بلا مستند مرتبط');
    }

    const docRank = incoming.document.securityLevel.rankOrder;
    if (user.securityClearanceRank < docRank) {
      throw new ForbiddenException('مستوى السرّية أعلى من تصنيفك');
    }

    return true;
  }
}
