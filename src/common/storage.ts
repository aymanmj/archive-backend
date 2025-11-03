// src/common/storage.ts
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export const UPLOAD_ROOT =
  process.env.UPLOAD_ROOT && process.env.UPLOAD_ROOT.trim().length > 0
    ? process.env.UPLOAD_ROOT
    : join(process.cwd(), 'uploads');

export function ensureDir(dirPath: string) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}




// // src/common/storage.ts

// import { existsSync, mkdirSync } from 'fs';
// import { join } from 'path';

// export const UPLOAD_ROOT = join(process.cwd(), 'uploads');

// export function ensureDir(dir: string) {
//   if (!existsSync(dir)) {
//     mkdirSync(dir, { recursive: true });
//   }
// }

