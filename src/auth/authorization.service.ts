// src/auth/authorization.service.ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

// ✨ تعريف شكل موحد لبيانات المستخدم من التوكن لاستخدامه في كل مكان
export type UserContext = {
  userId: number;
  departmentId: number | null;
  roles: string[];
};

@Injectable()
export class AuthorizationService {
  /**
   * يتحقق إذا كان المستخدم مدير نظام.
   * ملاحظة: 'ADMIN' تطابق ما تم إعداده في ملف seed.ts
   */
  isAdmin(ctx: UserContext): boolean {
    return Array.isArray(ctx.roles) && ctx.roles.includes('ADMIN');
  }

  /**
   * يبني جملة `where` لـ Prisma لفلترة سجلات الصادر بناءً على صلاحيات المستخدم.
   * - مدير النظام يرى كل شيء.
   * - المستخدم العادي يرى فقط ما يخص إدارته.
   */
  buildOutgoingWhereClause(ctx: UserContext): Prisma.OutgoingRecordWhereInput {
    if (this.isAdmin(ctx)) {
      return {}; // لا توجد قيود
    }

    if (!ctx.departmentId) {
      // إذا لم يكن المستخدم في إدارة، لا يمكنه رؤية أي شيء
      return { Document: { owningDepartmentId: -1 } }; // -1 ID مستحيل
    }

    return {
      Document: {
        owningDepartmentId: ctx.departmentId,
      },
    };
  }

  /**
   * يبني جملة `where` لـ Prisma لفلترة سجلات الوارد.
   * - مدير النظام يرى كل شيء.
   * - المستخدم العادي يرى فقط الوارد الموجه لإدارته.
   */
  buildIncomingWhereClause(ctx: UserContext): Prisma.IncomingRecordWhereInput {
    if (this.isAdmin(ctx)) {
      return {}; // لا توجد قيود
    }

    if (!ctx.departmentId) {
      // إذا لم يكن المستخدم في إدارة، لا يمكنه رؤية أي شيء
      return { id: { equals: BigInt(-1) } }; // ارجع لا شيء
    }

    // أرجع الوارد الذي تم توزيعه (distribution) إلى إدارة المستخدم
    return {
      distributions: {
        some: {
          targetDepartmentId: ctx.departmentId,
        },
      },
    };
  }
}




// // src/auth/authorization.service.ts
// import { Injectable } from '@nestjs/common';
// import { Prisma } from '@prisma/client';

// // ✨ تعريف شكل موحد لبيانات المستخدم من التوكن لاستخدامه في كل مكان
// export type UserContext = {
//   userId: number;
//   departmentId: number | null;
//   roles: string[];
// };

// @Injectable()
// export class AuthorizationService {
//   /**
//    * يتحقق إذا كان المستخدم مدير نظام.
//    * ملاحظة: 'ADMIN' تطابق ما تم إعداده في ملف seed.ts
//    */
//   isAdmin(ctx: UserContext): boolean {
//     return Array.isArray(ctx.roles) && ctx.roles.includes('ADMIN');
//   }

//   /**
//    * يبني جملة `where` لـ Prisma لفلترة سجلات الصادر بناءً على صلاحيات المستخدم.
//    * - مدير النظام يرى كل شيء.
//    * - المستخدم العادي يرى فقط ما يخص إدارته.
//    */
//   buildOutgoingWhereClause(ctx: UserContext): Prisma.OutgoingRecordWhereInput {
//     if (this.isAdmin(ctx)) {
//       return {}; // لا توجد قيود
//     }

//     if (!ctx.departmentId) {
//       // إذا لم يكن المستخدم في إدارة، لا يمكنه رؤية أي شيء
//       return { Document: { owningDepartmentId: -1 } }; // -1 ID مستحيل
//     }

//     return {
//       Document: {
//         owningDepartmentId: ctx.departmentId,
//       },
//     };
//   }

//   /**
//    * يبني جملة `where` لـ Prisma لفلترة سجلات الوارد.
//    * - مدير النظام يرى كل شيء.
//    * - المستخدم العادي يرى فقط الوارد الموجه لإدارته.
//    */
//   buildIncomingWhereClause(ctx: UserContext): Prisma.IncomingRecordWhereInput {
//     if (this.isAdmin(ctx)) {
//       return {}; // لا توجد قيود
//     }

//     if (!ctx.departmentId) {
//       // إذا لم يكن المستخدم في إدارة، لا يمكنه رؤية أي شيء
//       return { id: { equals: BigInt(-1) } }; // ارجع لا شيء
//     }

//     // أرجع الوارد الذي تم توزيعه (distribution) إلى إدارة المستخدم
//     return {
//       distributions: {
//         some: {
//           targetDepartmentId: ctx.departmentId,
//         },
//       },
//     };
//   }
// }




// // src/auth/authorization.service.ts
// import { Injectable } from '@nestjs/common';
// import { Prisma } from '@prisma/client';

// // تعريف شكل بيانات المستخدم التي نتوقعها من التوكن
// export type UserContext = {
//   userId: number;
//   departmentId: number | null;
//   roles: string[];
// };

// @Injectable()
// export class AuthorizationService {
//   /**
//    * يتحقق إذا كان المستخدم مدير نظام.
//    */
//   isAdmin(ctx: UserContext): boolean {
//     // يمكنك تغيير 'ADMIN' إلى 'SystemAdmin' لتطابق ما لديك
//     return Array.isArray(ctx.roles) && ctx.roles.includes('ADMIN');
//   }

//   /**
//    * يبني جملة `where` لـ Prisma لفلترة سجلات الصادر بناءً على صلاحيات المستخدم.
//    * - مدير النظام يرى كل شيء.
//    * - المستخدم العادي يرى فقط ما يخص إدارته.
//    */
//   buildOutgoingWhereClause(ctx: UserContext): Prisma.OutgoingRecordWhereInput {
//     if (this.isAdmin(ctx)) {
//       return {}; // لا توجد قيود
//     }

//     if (!ctx.departmentId) {
//       // إذا لم يكن المستخدم في إدارة، لا يمكنه رؤية أي شيء
//       return { Document: { owningDepartmentId: -1 } }; // -1 ID مستحيل
//     }

//     return {
//       Document: {
//         owningDepartmentId: ctx.departmentId,
//       },
//     };
//   }

//   /**
//    * يبني جملة `where` لـ Prisma لفلترة سجلات الوارد.
//    * - مدير النظام يرى كل شيء.
//    * - المستخدم العادي يرى فقط الوارد الموجه لإدارته.
//    */
//   buildIncomingWhereClause(ctx: UserContext): Prisma.IncomingRecordWhereInput {
//     if (this.isAdmin(ctx)) {
//       return {}; // لا توجد قيود
//     }

//     if (!ctx.departmentId) {
//       return { id: { equals: BigInt(-1) } }; // ارجع لا شيء
//     }

//     // أرجع الوارد الذي تم توزيعه (distribution) إلى إدارة المستخدم
//     return {
//       distributions: {
//         some: {
//           targetDepartmentId: ctx.departmentId,
//         },
//       },
//     };
//   }
// }

