// src/auth/permissions.decorator.ts

import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions_required';

/**
 * يقبل:
 *   - قيم مفردة:  @RequirePermissions('incoming.read')
 *   - قيم متعددة: @RequirePermissions('incoming.read','incoming.create')
 *   - مصفوفة:     @RequirePermissions(['incoming.read','incoming.create'])
 * وسيُرجع دائمًا مصفوفة مسطّحة string[]
 */
export function RequirePermissions(
  ...perms: Array<string | string[]>
): MethodDecorator & ClassDecorator {
  // فلترة القيم الفارغة + تسطيح المصفوفات المتداخلة + تحويل كل شيء لسلاسل
  const flat = perms
    .flat()
    .filter(Boolean)
    .map((p) => String(p));

  return SetMetadata(PERMISSIONS_KEY, flat);
}
