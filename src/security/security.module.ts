// src/security/security.module.ts


import { Module } from '@nestjs/common';
import { LoginThrottleService } from './services/login-throttle.service';

@Module({
  providers: [LoginThrottleService],
  exports: [LoginThrottleService],
})
export class SecurityModule {}
