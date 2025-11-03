// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { LoggingInterceptor } from './common/logging.interceptor';
import { json, urlencoded } from 'express';

// ✅ هام: لتقديم الملفات الساكنة من /uploads على /files/
import { join } from 'path';
import { NestExpressApplication } from '@nestjs/platform-express';

// ✅ حل JSON.stringify(BigInt) عالمي (قبل bootstrap)
declare global {
  interface BigInt { toJSON: () => string; }
}
if (!(BigInt.prototype as any).toJSON) {
  (BigInt.prototype as any).toJSON = function () {
    return this.toString();
  };
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // logger: ['error','warn','log','debug','verbose'],
  });

  // 🔒 Helmet — ترويسات أمان أساسية
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      // contentSecurityPolicy: false,
    }),
  );

  // 🛡️ CORS عملي للتطوير والإنتاج
  const envAllowed = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const devFallback =
    process.env.NODE_ENV !== 'production' ? ['http://localhost:5173'] : [];

  const allowedOrigins = envAllowed.length > 0 ? envAllowed : devFallback;

  app.enableCors({
    origin: (
      origin: string | undefined,
      cb: (err: Error | null, allow?: boolean) => void
    ) => {
      if (!origin) return cb(null, true); // أدوات مثل Postman
      if (allowedOrigins.length === 0) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Type', 'Content-Length'],
  });

  // 📦 حدود حجم الجسم
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ limit: '10mb', extended: true }));

  // 🧭 لو خلف Proxy/Nginx
  (app as any).set('trust proxy', 1);

  // ✅ ValidationPipe عام
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: process.env.NODE_ENV === 'production',
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // 📝 Interceptor لتسجيل الطلبات
  app.useGlobalInterceptors(new LoggingInterceptor());

  // ✅ تقديم الملفات الساكنة من مجلد /uploads على المسار /files
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/files/',
  });

  // 🛑 إيقاف سلس
  app.enableShutdownHooks();

  // 🧯 أخطاء غير ملتقطة
  process.on('unhandledRejection', (reason: any) => {
    logger.error(`Unhandled Rejection: ${reason?.stack || reason}`);
  });
  process.on('uncaughtException', (err: any) => {
    logger.error(`Uncaught Exception: ${err?.stack || err}`);
  });

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);

  const hostShown =
    process.env.NODE_ENV !== 'production' ? 'http://localhost' : '0.0.0.0';
  logger.log(`✅ API listening on ${hostShown}:${port}`);
}

bootstrap();




// import { NestFactory } from '@nestjs/core';
// import { AppModule } from './app.module';
// import { Logger, ValidationPipe } from '@nestjs/common';
// import helmet from 'helmet';
// import { LoggingInterceptor } from './common/logging.interceptor';
// import { json, urlencoded } from 'express';

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
//   const app = await NestFactory.create(AppModule, {
//     // logger: ['error','warn','log','debug','verbose'],
//   });

//   // 🔒 Helmet — ترويسات أمان أساسية
//   app.use(
//     helmet({
//       crossOriginResourcePolicy: { policy: 'cross-origin' },
//       // contentSecurityPolicy: false,
//     }),
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
//     origin: (
//       origin: string | undefined,
//       cb: (err: Error | null, allow?: boolean) => void
//     ) => {
//       if (!origin) return cb(null, true); // أدوات مثل Postman
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
//   app.use(json({ limit: '10mb' }));
//   app.use(urlencoded({ limit: '10mb', extended: true }));

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

//   const port = process.env.PORT ? Number(process.env.PORT) : 3000;
//   await app.listen(port);

//   const hostShown =
//     process.env.NODE_ENV !== 'production' ? 'http://localhost' : '0.0.0.0';
//   logger.log(`✅ API listening on ${hostShown}:${port}`);
// }

// bootstrap();




// // src/main.ts
// import { NestFactory } from '@nestjs/core';
// import { AppModule } from './app.module';
// import { Logger, ValidationPipe } from '@nestjs/common';
// import helmet from 'helmet';
// import { LoggingInterceptor } from './common/logging.interceptor';
// import { json, urlencoded } from 'express';

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
//   const app = await NestFactory.create(AppModule, {
//     // logger: ['error','warn','log','debug','verbose'],
//   });

//   // 🔒 Helmet — ترويسات أمان أساسية
//   app.use(
//     helmet({
//       crossOriginResourcePolicy: { policy: 'cross-origin' },
//       // contentSecurityPolicy: false,
//     }),
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
//     origin: (
//       origin: string | undefined,
//       cb: (err: Error | null, allow?: boolean) => void
//     ) => {
//       if (!origin) return cb(null, true); // أدوات مثل Postman
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
//   app.use(json({ limit: '10mb' }));
//   app.use(urlencoded({ limit: '10mb', extended: true }));

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

//   const port = process.env.PORT ? Number(process.env.PORT) : 3000;
//   await app.listen(port);

//   const hostShown =
//     process.env.NODE_ENV !== 'production' ? 'http://localhost' : '0.0.0.0';
//   logger.log(`✅ API listening on ${hostShown}:${port}`);
// }

// bootstrap();




// import { NestFactory } from '@nestjs/core';
// import { AppModule } from './app.module';
// import { ValidationPipe } from '@nestjs/common';
// import helmet from 'helmet';
// import { LoggingInterceptor } from './common/logging.interceptor';

// // ✅ حل عام: BigInt -> string
// declare global { interface BigInt { toJSON: () => string; } }
// (BigInt.prototype as any).toJSON = function () { return this.toString(); };

// async function bootstrap() {
//   const app = await NestFactory.create(AppModule);

//   app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

//   const allowed = (process.env.CORS_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean);
//   app.enableCors({
//     origin: (origin: string | undefined, cb: (e: Error | null, ok?: boolean) => void) => {
//       if (!origin || allowed.length === 0 || allowed.includes(origin)) return cb(null, true);
//       cb(new Error('Not allowed by CORS'));
//     },
//     credentials: true,
//     methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
//     allowedHeaders: ['Content-Type','Authorization'],
//   });

//   app.useGlobalPipes(new ValidationPipe({
//     whitelist: true,
//     forbidNonWhitelisted: process.env.NODE_ENV === 'production',
//     transform: true,
//   }));

//   app.useGlobalInterceptors(new LoggingInterceptor());
//   app.enableShutdownHooks();

//   const port = process.env.PORT ? Number(process.env.PORT) : 3000;
//   await app.listen(port);
//   console.log(`✅ API listening on http://localhost:${port}`);
// }
// bootstrap();
