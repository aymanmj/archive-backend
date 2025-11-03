// src/common/storage.ts

import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export const UPLOAD_ROOT = join(process.cwd(), 'uploads');

export function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

