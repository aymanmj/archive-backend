// src/security/services/login-throttle.service.ts

import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';

function envNum(name: string, def: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : def;
}

@Injectable()
export class LoginThrottleService {
  private readonly redis: Redis;
  private readonly MAX_ATTEMPTS = envNum('LOGIN_MAX_ATTEMPTS', 5);
  private readonly WINDOW_SEC  = envNum('LOGIN_WINDOW_SECONDS', 15 * 60);
  private readonly LOCK_SEC    = envNum('LOGIN_LOCK_SECONDS', 30 * 60);

  constructor() {
    const url = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
    this.redis = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 1 });
  }

  private keyAttempts(ip: string, uname?: string) {
    return uname
      ? `login:att:${ip}:${uname.toLowerCase()}`
      : `login:att:${ip}`;
  }

  private keyLock(ip: string, uname?: string) {
    return uname
      ? `login:lock:${ip}:${uname.toLowerCase()}`
      : `login:lock:${ip}`;
  }

  async isLocked(ip: string, uname?: string): Promise<number> {
    // ارجع ثواني متبقّية للحظر إن وُجد، وإلا 0
    const k1 = this.keyLock(ip);
    const k2 = uname ? this.keyLock(ip, uname) : null;

    const ttl1 = await this.redis.ttl(k1);
    if (ttl1 > 0) return ttl1;

    if (k2) {
      const ttl2 = await this.redis.ttl(k2);
      if (ttl2 > 0) return ttl2;
    }
    return 0;
  }

  async onSuccess(ip: string, uname?: string) {
    await this.redis.del(this.keyAttempts(ip));
    if (uname) await this.redis.del(this.keyAttempts(ip, uname));
  }

  async onFailure(ip: string, uname?: string): Promise<{ locked: boolean; ttl: number; remaining: number; }> {
    const keys = [this.keyAttempts(ip)];
    if (uname) keys.push(this.keyAttempts(ip, uname));

    // زدّ العداد واضبط TTL نافذة العدّ
    let maxCount = 0;
    for (const k of keys) {
      const c = await this.redis.incr(k);
      maxCount = Math.max(maxCount, c);
      if (c === 1) await this.redis.expire(k, this.WINDOW_SEC);
    }

    const remaining = Math.max(this.MAX_ATTEMPTS - maxCount, 0);
    if (maxCount >= this.MAX_ATTEMPTS) {
      // طبّق الحظر
      const lk1 = this.keyLock(ip);
      await this.redis.setex(lk1, this.LOCK_SEC, '1');
      if (uname) {
        const lk2 = this.keyLock(ip, uname);
        await this.redis.setex(lk2, this.LOCK_SEC, '1');
      }
      return { locked: true, ttl: this.LOCK_SEC, remaining: 0 };
    }

    // ليس محظورًا بعد — كم تبقّى من النافذة؟
    const ttl = await this.redis.ttl(this.keyAttempts(ip));
    return { locked: false, ttl: ttl > 0 ? ttl : this.WINDOW_SEC, remaining };
  }
}
