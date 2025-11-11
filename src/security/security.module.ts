// src/security/security.module.ts


import { Global, Module } from '@nestjs/common';
import { LoginThrottleService } from './services/login-throttle.service';

@Global()
@Module({
  providers: [LoginThrottleService],
  exports: [LoginThrottleService],
})
export class SecurityModule {}
