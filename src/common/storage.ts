import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

export const UPLOAD_ROOT = join(process.cwd(), 'uploads');

export function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}
