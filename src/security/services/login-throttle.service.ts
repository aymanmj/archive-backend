// src/security/services/login-throttle.service.ts

import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';

type Verdict = { allowed: boolean; retryAfterSec?: number };
type FailureResult = {
  locked: boolean;
  retryAfterSec: number; // alias (للتوافق)
  ttl: number; // كم ثانية متبقية للحظر
  remaining: number; // كم محاولة متبقية قبل الحظر (0 لو محظور)
};

@Injectable()
export class LoginThrottleService {
  private readonly logger = new Logger(LoginThrottleService.name);
  private redis: Redis | null = null;

  private MAX_ATTEMPTS_PER_IP = Number(process.env.LOGIN_IP_MAX ?? 20);
  private MAX_ATTEMPTS_PER_USER = Number(process.env.LOGIN_USER_MAX ?? 7);
  private WINDOW_SEC = Number(process.env.LOGIN_WINDOW_SEC ?? 600);

  // 👇 جديد: whitelist + معرفة هل نحن في production
  private WHITELIST: Set<string> = new Set();
  private IS_PROD = (process.env.NODE_ENV || 'development') === 'production';

  constructor() {
    const url = process.env.REDIS_URL;
    if (!url) {
      this.logger.warn('REDIS_URL not set — login throttling will be NO-OP.');
      return;
    }

    // تحميل قائمة المستخدمين المستثناة (للـ dev فقط)
    const wlRaw = process.env.LOGIN_WHITELIST_USERS || '';
    this.WHITELIST = new Set(
      wlRaw
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    );

    try {
      this.redis = new Redis(url, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      });
      this.redis
        .connect()
        .then(() => this.logger.log('Connected to Redis for login throttling.'))
        .catch((err) => {
          this.logger.warn(
            'Failed to connect Redis — throttling disabled.',
            err,
          );
          this.redis = null;
        });
    } catch (err) {
      this.logger.warn('Redis init error — throttling disabled.', err as any);
      this.redis = null;
    }
  }

  // ---------------- helpers ----------------
  private ipKey(ip: string) {
    return `login:ip:${ip}`;
  }
  private userKey(username: string) {
    return `login:user:${username.toLowerCase()}`;
  }

  private isWhitelisted(username: string): boolean {
    if (!username) return false;
    if (this.IS_PROD) return false; // في الإنتاج لا نستخدم whitelist من الـ ENV
    return this.WHITELIST.has(username.toLowerCase());
  }

  private async bumpKey(key: string): Promise<number> {
    if (!this.redis) return 0;
    const tx = this.redis.multi();
    tx.incr(key);
    tx.expire(key, this.WINDOW_SEC, 'NX'); // ضع TTL فقط لو المفتاح جديد
    const res = await tx.exec();
    const incr = res?.[0]?.[1];
    return Number(incr) || 0;
  }

  private async ttl(key: string): Promise<number> {
    if (!this.redis) return 0;
    try {
      const t = await this.redis.ttl(key);
      return t < 0 ? 0 : t;
    } catch {
      return 0;
    }
  }

  private async getCount(key: string): Promise<number> {
    if (!this.redis) return 0;
    try {
      const raw = await this.redis.get(key);
      return Number(raw || 0);
    } catch {
      return 0;
    }
  }

  // ---------------- واجهة قديمة متوافقة ----------------
  async checkAndConsume(username: string, ip: string): Promise<Verdict> {
    if (!this.redis) return { allowed: true };
    if (this.isWhitelisted(username)) return { allowed: true };

    const ipK = this.ipKey(ip);
    const userK = this.userKey(username);

    const [ipCount, userCount] = await Promise.all([
      this.bumpKey(ipK),
      this.bumpKey(userK),
    ]);

    if (ipCount > this.MAX_ATTEMPTS_PER_IP) {
      const t = await this.ttl(ipK);
      return { allowed: false, retryAfterSec: t || 60 };
    }
    if (userCount > this.MAX_ATTEMPTS_PER_USER) {
      const t = await this.ttl(userK);
      return { allowed: false, retryAfterSec: t || 60 };
    }
    return { allowed: true };
  }

  // ---------------- الدوال التي يستدعيها الكنترولر ----------------

  /** يعيد TTL إن كان محجوباً، وإلا 0 */
  async isLocked(ip: string, username: string): Promise<number> {
    if (!this.redis) return 0;
    if (this.isWhitelisted(username)) return 0;

    const ipK = this.ipKey(ip);
    const userK = this.userKey(username);

    const [ipCount, userCount] = await Promise.all([
      this.getCount(ipK),
      this.getCount(userK),
    ]);

    if (ipCount > this.MAX_ATTEMPTS_PER_IP) {
      return (await this.ttl(ipK)) || 60;
    }
    if (userCount > this.MAX_ATTEMPTS_PER_USER) {
      return (await this.ttl(userK)) || 60;
    }
    return 0;
  }

  /** عند نجاح الدخول: صفّر العدّادات */
  async onSuccess(ip: string, username: string): Promise<void> {
    if (!this.redis) return;
    if (this.isWhitelisted(username)) return;
    try {
      const ipK = this.ipKey(ip);
      const userK = this.userKey(username);
      await this.redis.del(ipK, userK);
    } catch {
      /* ignore */
    }
  }

  /**
   * عند فشل الدخول: زد العدّادات وأخبرنا هل أصبح محجوباً،
   * وكم ثانية متبقية، وكم محاولة متبقية قبل الحظر.
   */
  async onFailure(ip: string, username: string): Promise<FailureResult> {
    if (!this.redis) {
      return {
        locked: false,
        retryAfterSec: 0,
        ttl: 0,
        remaining: Math.max(
          this.MAX_ATTEMPTS_PER_USER,
          this.MAX_ATTEMPTS_PER_IP,
        ),
      };
    }

    if (this.isWhitelisted(username)) {
      return {
        locked: false,
        retryAfterSec: 0,
        ttl: 0,
        remaining: Math.max(
          this.MAX_ATTEMPTS_PER_USER,
          this.MAX_ATTEMPTS_PER_IP,
        ),
      };
    }

    const ipK = this.ipKey(ip);
    const userK = this.userKey(username);

    const [ipCount, userCount] = await Promise.all([
      this.bumpKey(ipK),
      this.bumpKey(userK),
    ]);

    const ipExceeded = ipCount > this.MAX_ATTEMPTS_PER_IP;
    const userExceeded = userCount > this.MAX_ATTEMPTS_PER_USER;
    const locked = ipExceeded || userExceeded;

    let ttl = 0;
    if (ipExceeded) ttl = Math.max(ttl, await this.ttl(ipK));
    if (userExceeded) ttl = Math.max(ttl, await this.ttl(userK));
    if (!ttl) ttl = 60;

    const remainingIp = Math.max(this.MAX_ATTEMPTS_PER_IP - ipCount, 0);
    const remainingUser = Math.max(this.MAX_ATTEMPTS_PER_USER - userCount, 0);
    const remaining = locked ? 0 : Math.max(remainingIp, remainingUser);

    return {
      locked,
      retryAfterSec: ttl,
      ttl,
      remaining,
    };
  }

  // 👇 جديد: يُستخدم من طرف الأدمن لفك الحظر عن مستخدم معيّن
  async clearForUsername(username: string): Promise<void> {
    if (!this.redis) return;
    if (!username) return;
    const userK = this.userKey(username);
    try {
      await this.redis.del(userK);
    } catch {
      /* ignore */
    }
  }
}

// // src/security/services/login-throttle.service.ts

// import { Injectable, Logger } from '@nestjs/common';
// import Redis from 'ioredis';

// type Verdict = { allowed: boolean; retryAfterSec?: number };
// type FailureResult = {
//   locked: boolean;
//   retryAfterSec: number; // alias (للتوافق)
//   ttl: number;           // كم ثانية متبقية للحظر
//   remaining: number;     // كم محاولة متبقية قبل الحظر (0 لو محظور)
// };

// @Injectable()
// export class LoginThrottleService {
//   private readonly logger = new Logger(LoginThrottleService.name);
//   private redis: Redis | null = null;

//   private MAX_ATTEMPTS_PER_IP = Number(process.env.LOGIN_IP_MAX ?? 20);
//   private MAX_ATTEMPTS_PER_USER = Number(process.env.LOGIN_USER_MAX ?? 7);
//   private WINDOW_SEC = Number(process.env.LOGIN_WINDOW_SEC ?? 600);

//   constructor() {
//     const url = process.env.REDIS_URL;
//     if (!url) {
//       this.logger.warn('REDIS_URL not set — login throttling will be NO-OP.');
//       return;
//     }
//     try {
//       this.redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
//       this.redis
//         .connect()
//         .then(() => this.logger.log('Connected to Redis for login throttling.'))
//         .catch((err) => {
//           this.logger.warn('Failed to connect Redis — throttling disabled.', err as any);
//           this.redis = null;
//         });
//     } catch (err) {
//       this.logger.warn('Redis init error — throttling disabled.', err as any);
//       this.redis = null;
//     }
//   }

//   // ---------------- helpers ----------------
//   private ipKey(ip: string) {
//     return `login:ip:${ip}`;
//   }
//   private userKey(username: string) {
//     return `login:user:${username}`;
//   }

//   private async bumpKey(key: string): Promise<number> {
//     if (!this.redis) return 0;
//     const tx = this.redis.multi();
//     tx.incr(key);
//     tx.expire(key, this.WINDOW_SEC, 'NX'); // ضع TTL فقط لو المفتاح جديد
//     const res = await tx.exec();
//     const incr = res?.[0]?.[1];
//     return Number(incr) || 0;
//   }

//   private async ttl(key: string): Promise<number> {
//     if (!this.redis) return 0;
//     try {
//       const t = await this.redis.ttl(key);
//       return t < 0 ? 0 : t;
//     } catch {
//       return 0;
//     }
//   }

//   private async getCount(key: string): Promise<number> {
//     if (!this.redis) return 0;
//     try {
//       const raw = await this.redis.get(key);
//       return Number(raw || 0);
//     } catch {
//       return 0;
//     }
//   }

//   // ---------------- واجهة قديمة متوافقة ----------------
//   async checkAndConsume(username: string, ip: string): Promise<Verdict> {
//     if (!this.redis) return { allowed: true };
//     const ipK = this.ipKey(ip);
//     const userK = this.userKey(username);

//     const [ipCount, userCount] = await Promise.all([
//       this.bumpKey(ipK),
//       this.bumpKey(userK),
//     ]);

//     if (ipCount > this.MAX_ATTEMPTS_PER_IP) {
//       const t = await this.ttl(ipK);
//       return { allowed: false, retryAfterSec: t || 60 };
//     }
//     if (userCount > this.MAX_ATTEMPTS_PER_USER) {
//       const t = await this.ttl(userK);
//       return { allowed: false, retryAfterSec: t || 60 };
//     }
//     return { allowed: true };
//   }

//   // ---------------- الدوال التي يستدعيها الكنترولر ----------------
//   /** يعيد TTL إن كان محجوباً، وإلا 0 */
//   async isLocked(ip: string, username: string): Promise<number> {
//     if (!this.redis) return 0;

//     const ipK = this.ipKey(ip);
//     const userK = this.userKey(username);

//     const [ipCount, userCount] = await Promise.all([
//       this.getCount(ipK),
//       this.getCount(userK),
//     ]);

//     if (ipCount > this.MAX_ATTEMPTS_PER_IP) {
//       return (await this.ttl(ipK)) || 60;
//     }
//     if (userCount > this.MAX_ATTEMPTS_PER_USER) {
//       return (await this.ttl(userK)) || 60;
//     }
//     return 0;
//   }

//   /** عند نجاح الدخول: صفّر العدّادات */
//   async onSuccess(ip: string, username: string): Promise<void> {
//     if (!this.redis) return;
//     try {
//       const ipK = this.ipKey(ip);
//       const userK = this.userKey(username);
//       await this.redis.del(ipK, userK);
//     } catch {
//       /* ignore */
//     }
//   }

//   /**
//    * عند فشل الدخول: زد العدّادات وأخبرنا هل أصبح محجوباً،
//    * وكم ثانية متبقية، وكم محاولة متبقية قبل الحظر.
//    */
//   async onFailure(ip: string, username: string): Promise<FailureResult> {
//     if (!this.redis) return { locked: false, retryAfterSec: 0, ttl: 0, remaining: Math.max(this.MAX_ATTEMPTS_PER_USER, this.MAX_ATTEMPTS_PER_IP) };

//     const ipK = this.ipKey(ip);
//     const userK = this.userKey(username);

//     const [ipCount, userCount] = await Promise.all([
//       this.bumpKey(ipK),
//       this.bumpKey(userK),
//     ]);

//     const ipExceeded = ipCount > this.MAX_ATTEMPTS_PER_IP;
//     const userExceeded = userCount > this.MAX_ATTEMPTS_PER_USER;
//     const locked = ipExceeded || userExceeded;

//     let ttl = 0;
//     if (ipExceeded) ttl = Math.max(ttl, await this.ttl(ipK));
//     if (userExceeded) ttl = Math.max(ttl, await this.ttl(userK));
//     if (!ttl) ttl = 60;

//     const remainingIp = Math.max(this.MAX_ATTEMPTS_PER_IP - ipCount, 0);
//     const remainingUser = Math.max(this.MAX_ATTEMPTS_PER_USER - userCount, 0);
//     // نُظهر أكبر رقم متبقٍ بين المسارين (للمعلومة)
//     const remaining = locked ? 0 : Math.max(remainingIp, remainingUser);

//     return {
//       locked,
//       retryAfterSec: ttl,
//       ttl,
//       remaining,
//     };
//   }
// }
