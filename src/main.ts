// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ✅ فعّل CORS
  app.enableCors({
    origin: true,
    credentials: true,
    methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
    allowedHeaders: ['Content-Type','Authorization'],
  });

  // ✅ ValidationPipe عام
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // ❗️اختَر أحد الخيارين:
  // (أ) بدون بادئة عامة (الأبسط الآن مع واجهتك الأمامية الحالية)
  //  -> تترفع الملفات على: http://localhost:3000/files/upload/:documentId
  // app.setGlobalPrefix(''); // لا شيء

  // (ب) إن حبيت توحّد كل شيء تحت /api، فعّل السطر التالي
  //  -> وتعدّل الواجهة لتطلب: http://localhost:3000/api/files/upload/:documentId
  // app.setGlobalPrefix('api');

  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3000);
}
bootstrap();




// import { NestFactory } from '@nestjs/core';
// import { AppModule } from './app.module';
// import { ValidationPipe } from '@nestjs/common';
// import { join } from 'path';
// import * as express from 'express';

// async function bootstrap() {
//   const app = await NestFactory.create(AppModule);

//   // السماح للواجهة تطلب من الباك إند
//   app.enableCors({
//     origin: 'http://localhost:5173',
//     credentials: false,
//   });

//   // تفعيل الفالديشن على DTOs
//   app.useGlobalPipes(
//     new ValidationPipe({
//       whitelist: true,           // يحذف أي حقول زيادة مش معرّفة في الـ DTO
//       forbidNonWhitelisted: true, // يرمي خطأ لو فيه حقل غير متوقع
//       transform: true,           // يحوّل الأنواع (string -> number مثلاً)
//     }),
//   );

//   // السيرفر يقدّم الملفات المرفوعة كروابط مباشرة:
//   // أي شيء في مجلد /uploads/ يطلع على http://localhost:3000/uploads/...
//   app.use(
//     '/uploads',
//     express.static(join(process.cwd(), 'uploads')),
//   );

//   await app.listen(3000);
// }
// bootstrap();
