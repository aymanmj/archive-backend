// src/common/guards/clearance.guard.ts
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class ClearanceGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user as { id: number; securityClearanceRank: number };
    const documentId = BigInt(req.params.documentId ?? req.params.id); // يدعم /documents/:documentId أو /incoming/:id

    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { securityLevel: { select: { rankOrder: true } } },
    });

    if (!doc) throw new ForbiddenException('Document not found');
    if (user.securityClearanceRank < doc.securityLevel.rankOrder) {
      throw new ForbiddenException('Insufficient clearance to access this document');
    }
    return true;
  }
}
