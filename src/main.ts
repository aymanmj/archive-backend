// src/main.ts

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { LoggingInterceptor } from './common/logging.interceptor';
import { json, urlencoded, Request, Response, NextFunction } from 'express';

import { join } from 'path';
import { NestExpressApplication } from '@nestjs/platform-express';
import { UPLOAD_ROOT, ensureDir } from './common/storage';

// ✅ حل JSON.stringify(BigInt) عالمي (قبل bootstrap)
declare global {
  interface BigInt { toJSON: () => string; }
}
if (!(BigInt.prototype as any).toJSON) {
  (BigInt.prototype as any).toJSON = function () {
    return this.toString();
  };
}

// helper: تحويل IPv6/loopback إلى IPv4 عند الإمكان
function toIPv4(ip?: string | string[]) {
  if (!ip) return undefined;
  const val = Array.isArray(ip) ? ip[0] : ip;
  if (val === '::1') return '127.0.0.1';
  const m = val.match(/::ffff:(\d+\.\d+\.\d+\.\d+)/);
  return m ? m[1] : val;
}

// لحقول مخصّصة نضيفها على الطلب
type ReqWithClientInfo = Request & {
  clientIp?: string;
  workstationName?: string;
  clientTimezone?: string;
};

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // logger: ['error','warn','log','debug','verbose'],
  });

  app.use(
    helmet({
      frameguard: process.env.NODE_ENV !== 'production' ? false : { action: 'sameorigin' },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy:
        process.env.NODE_ENV !== 'production'
          ? false
          : {
              useDefaults: true,
              directives: { 'frame-ancestors': ["'self'"] },
            },
    })
  );

  const envAllowed = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const devFallback =
    process.env.NODE_ENV !== 'production' ? ['http://localhost:5173', 'http://localhost:8080'] : [];

  const allowedOrigins = envAllowed.length > 0 ? envAllowed : devFallback;

  app.enableCors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.length === 0) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-Workstation',
      'X-Client-Timezone',
      'X-Forwarded-For',
      'X-Real-IP',
    ],
    exposedHeaders: ['Content-Type', 'Content-Length'],
  });

  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ limit: '50mb', extended: true }));

  // ✅ trust proxy على الـ Express الداخلي
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // 🌐 ميدلوير لالتقاط IP/Workstation/Timezone + تحويل IPv6 إلى IPv4
  app.use((req: ReqWithClientInfo, _res: Response, next: NextFunction) => {
    const fwd = (req.headers['x-forwarded-for'] as string) || '';
    const firstFwd = fwd
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)[0];

    const ipRaw =
      firstFwd ||
      (req.headers['x-real-ip'] as string) ||
      (req.socket?.remoteAddress as string) ||
      (req.ip as string);

    req.clientIp = toIPv4(ipRaw);
    req.workstationName = (req.headers['x-workstation'] as string) || undefined;
    req.clientTimezone = (req.headers['x-client-timezone'] as string) || undefined;

    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: process.env.NODE_ENV === 'production',
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalInterceptors(new LoggingInterceptor());
  app.enableShutdownHooks();

  process.on('unhandledRejection', (reason: any) => {
    logger.error(`Unhandled Rejection: ${reason?.stack || reason}`);
  });
  process.on('uncaughtException', (err: any) => {
    logger.error(`Uncaught Exception: ${err?.stack || err}`);
  });

  ensureDir(UPLOAD_ROOT);
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/files/' });

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);

  const hostShown =
    process.env.NODE_ENV !== 'production' ? 'http://localhost' : '0.0.0.0';
  logger.log(`✅ API listening on ${hostShown}:${port}`);
  logger.log(`📂 Serving uploads from ${UPLOAD_ROOT} at /files/`);
}

console.log('DATABASE_URL =>', process.env.DATABASE_URL);
bootstrap();




// // src/main.ts

// import { NestFactory } from '@nestjs/core';
// import { AppModule } from './app.module';
// import { Logger, ValidationPipe } from '@nestjs/common';
// import helmet from 'helmet';
// import { LoggingInterceptor } from './common/logging.interceptor';
// import { json, urlencoded } from 'express';

// // ⬇️ إضافات لتقديم الستاتيك من مجلد الرفع
// import { join } from 'path';
// import { NestExpressApplication } from '@nestjs/platform-express';
// import { UPLOAD_ROOT, ensureDir } from './common/storage';

// // ✅ حل JSON.stringify(BigInt) عالمي (قبل bootstrap)
// declare global {
//   interface BigInt { toJSON: () => string; }
// }
// if (!(BigInt.prototype as any).toJSON) {
//   (BigInt.prototype as any).toJSON = function () {
//     return this.toString();
//   };
// }

// async function bootstrap() {
//   const logger = new Logger('Bootstrap');
//   const app = await NestFactory.create<NestExpressApplication>(AppModule, {
//     // logger: ['error','warn','log','debug','verbose'],
//   });

//   // 🔒 Helmet — ترويسات أمان أساسية
//   // app.use(
//   //   helmet({
//   //     crossOriginResourcePolicy: { policy: 'cross-origin' },
//   //   }),
//   // );

//   app.use(
//     helmet({
//       // للسماح بالمعاينة عبر iframe أثناء التطوير (vite على 5173 والـ API على 3000)
//       frameguard: process.env.NODE_ENV !== 'production' ? false : { action: 'sameorigin' },

//       // نتركه cross-origin لأن الملفات تُقرأ من أصل مختلف أثناء التطوير
//       crossOriginResourcePolicy: { policy: 'cross-origin' },

//       // إن أردت تفعيل CSP في الإنتاج فقط
//       contentSecurityPolicy:
//         process.env.NODE_ENV !== 'production'
//           ? false
//           : {
//               useDefaults: true,
//               directives: {
//                 // في الإنتاج الصفحة والملف من نفس الأصل
//                 "frame-ancestors": ["'self'"],
//               },
//             },
//     })
//   );

//   // 🛡️ CORS عملي للتطوير والإنتاج
//   const envAllowed = (process.env.CORS_ORIGINS ?? '')
//     .split(',')
//     .map((s) => s.trim())
//     .filter(Boolean);

//   const devFallback =
//     process.env.NODE_ENV !== 'production' ? ['http://localhost:5173'] : [];

//   const allowedOrigins = envAllowed.length > 0 ? envAllowed : devFallback;

//   app.enableCors({
//     origin: (origin, cb) => {
//       if (!origin) return cb(null, true);
//       if (allowedOrigins.length === 0) return cb(null, true);
//       if (allowedOrigins.includes(origin)) return cb(null, true);
//       cb(new Error(`Not allowed by CORS: ${origin}`));
//     },
//     credentials: true,
//     methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
//     allowedHeaders: ['Content-Type', 'Authorization'],
//     exposedHeaders: ['Content-Type', 'Content-Length'],
//   });

//   // 📦 حدود حجم الجسم
//   app.use(json({ limit: '50mb' }));
//   app.use(urlencoded({ limit: '50mb', extended: true }));

//   // 🧭 لو خلف Proxy/Nginx
//   (app as any).set('trust proxy', 1);

//   // ✅ ValidationPipe عام
//   app.useGlobalPipes(
//     new ValidationPipe({
//       whitelist: true,
//       forbidNonWhitelisted: process.env.NODE_ENV === 'production',
//       transform: true,
//       transformOptions: { enableImplicitConversion: true },
//     }),
//   );

//   // 📝 Interceptor لتسجيل الطلبات
//   app.useGlobalInterceptors(new LoggingInterceptor());

//   // 🛑 إيقاف سلس
//   app.enableShutdownHooks();

//   // 🧯 أخطاء غير ملتقطة
//   process.on('unhandledRejection', (reason: any) => {
//     logger.error(`Unhandled Rejection: ${reason?.stack || reason}`);
//   });
//   process.on('uncaughtException', (err: any) => {
//     logger.error(`Uncaught Exception: ${err?.stack || err}`);
//   });

//   // ✅ تأكد من وجود مجلد الرفع ثم قدّمه على /files
//   ensureDir(UPLOAD_ROOT);
//   // app.useStaticAssets(join(UPLOAD_ROOT), {
//   //   prefix: '/files/',
//   // });
//   (app as any).useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/files/' });

//   const port = process.env.PORT ? Number(process.env.PORT) : 3000;
//   await app.listen(port);

//   const hostShown =
//     process.env.NODE_ENV !== 'production' ? 'http://localhost' : '0.0.0.0';
//   logger.log(`✅ API listening on ${hostShown}:${port}`);
//   logger.log(`📂 Serving uploads from ${UPLOAD_ROOT} at /files/`);
// }

// console.log('DATABASE_URL =>', process.env.DATABASE_URL);

// bootstrap();


