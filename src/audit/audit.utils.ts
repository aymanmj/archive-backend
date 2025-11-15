// src/audit/audit.utils.ts

export function extractClientMeta(req: any) {
  // 1) workstation
  const workstation =
    (req.headers['x-workstation'] as string) ||
    (req.headers['x-client-hostname'] as string) ||
    null;

  // 2) raw IP candidates
  const hdr = (req.headers['x-forwarded-for'] as string) || '';
  const list = hdr
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const cand = [
    ...list,
    req.ip,
    req.connection?.remoteAddress,
    req.socket?.remoteAddress,
    req.info?.remoteAddress, // أحيانًا مع بعض الـadapters
  ].filter(Boolean) as string[];

  // 3) حاول التقاط IPv4 أولًا
  const ipv4Re =
    /(?:(?:25[0-5]|2[0-4]\d|1?\d{1,2})\.){3}(?:25[0-5]|2[0-4]\d|1?\d{1,2})/;
  let ip: string | null = null;

  for (const c of cand) {
    const m4 = c.match(ipv4Re);
    if (m4) {
      ip = m4[0];
      break;
    }
  }
  // لو ما لقيناش IPv4 خذ أول عنوان متاح (قد يكون ::1)
  if (!ip) ip = cand.find(Boolean) ?? null;

  // نظّف ::ffff:192.168.x.x
  if (ip && ip.startsWith('::ffff:')) ip = ip.replace('::ffff:', '');

  return { ip, workstation };
}

// // src/audit/audit.utils.ts

// export function extractClientMeta(req: any) {
//   const ip =
//     req?.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
//     req?.ip ||
//     req?.socket?.remoteAddress ||
//     null;
//   const workstation =
//     (req?.headers['x-workstation-name'] as string) ||
//     (req?.headers['x-client-host'] as string) ||
//     null;
//   return { ip, workstation };
// }
