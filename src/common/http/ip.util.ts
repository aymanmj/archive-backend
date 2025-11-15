// src/common/http/ip.util.ts

export function getClientIp(req: any): string {
  const xf = String(req?.headers?.['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();
  const xr = String(req?.headers?.['x-real-ip'] || '').trim();
  const ip =
    xf || xr || String(req?.ip || req?.connection?.remoteAddress || '').trim();
  return ip || '0.0.0.0';
}
