// src/common/decorators/current-user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
export const CurrentUser = createParamDecorator((_, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest();
  return req.user as {
    id: number;
    departmentId?: number | null;
    securityClearanceRank: number;
    roles?: string[];
    username: string;
  };
});
