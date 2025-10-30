import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IncomingService } from './incoming.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { IsInt, IsOptional, IsString, MinLength, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateFollowupDto } from './dto/create-followup.dto';
import { DeliveryMethod, UrgencyLevel } from '@prisma/client';

// ===== تطبيع قيم طريقة الاستلام =====
const DELIVERY_ALIASES: Record<string, DeliveryMethod> = {
  // EN exact
  Hand: 'Hand',
  Mail: 'Mail',
  Email: 'Email',
  Courier: 'Courier',
  Fax: 'Fax',
  ElectronicSystem: 'ElectronicSystem',

  // EN variants
  RegisteredMail: 'Mail',
  OfficialMail: 'Mail',
  OfficialEmail: 'Email',
  ByHand: 'Hand',
  by_hand: 'Hand',

  // AR
  'تسليم باليد': 'Hand',
  'بريد رسمي': 'Mail',
  'بريد': 'Mail',
  'بريد الكتروني': 'Email',
  'بريد إلكتروني': 'Email',
  'فاكس': 'Fax',
  'ساعي': 'Courier',
  'مندوب': 'Courier',
  'منظومة إلكترونية': 'ElectronicSystem',
  'عن طريق المنظومة': 'ElectronicSystem',
};

function normalizeDeliveryMethod(input: string): DeliveryMethod {
  const key = (input ?? '').trim();
  const hit =
    DELIVERY_ALIASES[key] ||
    DELIVERY_ALIASES[key.toLowerCase()] ||
    DELIVERY_ALIASES[
      key
        .replace(/\s+/g, '')
        .toLowerCase()
    ];

  if (!hit) {
    throw new BadRequestException(
      'deliveryMethod must be one of: Hand, Mail, Email, Courier, Fax, ElectronicSystem',
    );
  }
  return hit;
}

// ===== DTOs =====

// إنشاء وارد جديد (نقبله كنص ثم نطبّعه للـ Enum داخل الكنترولر)
class CreateIncomingDto {
  @IsString()
  @MinLength(2)
  externalPartyName: string;

  @IsOptional()
  @IsString()
  externalPartyType?: string;

  // نسمح بأي نص ثم نطبّعه (بدل IsEnum) لتفادي مشاكل التسميات من الواجهة
  @IsString()
  @MinLength(2)
  deliveryMethod: string;

  @IsEnum(UrgencyLevel)
  urgencyLevel: UrgencyLevel; // Low | Normal | High | Urgent

  @IsString()
  @MinLength(3)
  requiredAction: string;

  @IsString()
  @MinLength(3)
  summary: string;

  @Type(() => Number)
  @IsInt()
  departmentId: number;
}

@UseGuards(JwtAuthGuard)
@Controller('incoming')
export class IncomingController {
  constructor(private readonly incomingService: IncomingService) {}

  // GET /incoming
  @Get()
  async listLatest() {
    return this.incomingService.listLatestForUser(20);
  }

  // GET /incoming/my-dept
  @Get('my-dept')
  async listForMyDepartment(@Req() req: any) {
    const userPayload = req.user || {};
    const departmentId =
      userPayload.departmentId ?? userPayload.deptId ?? null;

    if (!departmentId) {
      throw new BadRequestException(
        'لا يمكن تحديد إدارتك. تأكد أن حسابك مرتبط بإدارة.',
      );
    }

    return this.incomingService.listForDepartment(departmentId);
  }

  // GET /incoming/:id
  @Get(':id')
  async getOne(@Param('id') id: string) {
    return this.incomingService.getOneForUser(id);
  }

  // POST /incoming
  @Post()
  async create(@Body() body: CreateIncomingDto, @Req() req: any) {
    const userPayload = req.user || {};

    const userId =
      userPayload.userId ??
      userPayload.id ??
      userPayload.sub ??
      null;

    if (!userId) {
      throw new BadRequestException(
        'لا يمكن تحديد المستخدم الحالي من التوكن (userId/sub مفقود)',
      );
    }

    // 🔁 تطبيع طريقة الاستلام إلى Enum مدعوم
    const normalizedMethod = normalizeDeliveryMethod(body.deliveryMethod);

    return this.incomingService.createIncoming({
      externalPartyName: body.externalPartyName,
      externalPartyType: body.externalPartyType,
      deliveryMethod: normalizedMethod, // ✅ صار Enum مضبوط
      urgencyLevel: body.urgencyLevel,
      requiredAction: body.requiredAction,
      summary: body.summary,
      departmentId: body.departmentId,
      userId,
    });
  }

  // POST /incoming/:id/followup
  @Post(':id/followup')
  async addFollowup(
    @Param('id') id: string,
    @Body() dto: CreateFollowupDto,
    @Req() req: any,
  ) {
    const userPayload = req.user || {};

    const userId =
      userPayload.userId ??
      userPayload.id ??
      userPayload.sub ??
      null;

    const departmentId =
      userPayload.departmentId ??
      userPayload.deptId ??
      null;

    const roles =
      userPayload.roles ??
      userPayload.roleNames ??
      [];

    if (!userId) {
      throw new BadRequestException(
        'لا يمكن تحديد المستخدم الحالي من التوكن لإضافة متابعة',
      );
    }

    const userCtx = { userId, departmentId, roles };
    return this.incomingService.addFollowupStep(id, userCtx, dto);
  }
}






// import {
//   BadRequestException,
//   Body,
//   Controller,
//   Get,
//   Param,
//   Post,
//   Req,
//   UseGuards,
// } from '@nestjs/common';
// import { IncomingService } from './incoming.service';
// import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
// import { IsInt, IsOptional, IsString, MinLength, IsEnum } from 'class-validator';
// import { Type } from 'class-transformer';
// import { CreateFollowupDto } from './dto/create-followup.dto';
// import { DeliveryMethod, UrgencyLevel } from '@prisma/client';
// import { IncomingClearanceGuard } from 'src/common/guards/incoming-clearance.guard';

// // DTO لإنشاء وارد جديد (محدّث لاستخدام Enums من Prisma)
// class CreateIncomingDto {
//   @IsString()
//   @MinLength(2)
//   externalPartyName: string;

//   @IsOptional()
//   @IsString()
//   externalPartyType?: string;

//   @IsEnum(DeliveryMethod)
//   deliveryMethod: DeliveryMethod; // Hand | Mail | Email | Courier | Fax | ElectronicSystem

//   @IsEnum(UrgencyLevel)
//   urgencyLevel: UrgencyLevel; // Low | Normal | High | Urgent

//   @IsString()
//   @MinLength(3)
//   requiredAction: string;

//   @IsString()
//   @MinLength(3)
//   summary: string;

//   @Type(() => Number)
//   @IsInt()
//   departmentId: number;
// }

// @UseGuards(JwtAuthGuard)
// @Controller('incoming')
// export class IncomingController {
//   constructor(private readonly incomingService: IncomingService) {}

//   // GET /incoming
//   @Get()
//   async listLatest() {
//     return this.incomingService.listLatestForUser(20);
//   }

//   // GET /incoming/my-dept (ثابت قبل :id)
//   @Get('my-dept')
//   async listForMyDepartment(@Req() req: any) {
//     const userPayload = req.user || {};

//     const departmentId =
//       userPayload.departmentId ??
//       userPayload.deptId ??
//       null;

//     if (!departmentId) {
//       throw new BadRequestException(
//         'لا يمكن تحديد إدارتك. تأكد أن حسابك مرتبط بإدارة.',
//       );
//     }

//     return this.incomingService.listForDepartment(departmentId);
//   }

//   // GET /incoming/:id
//   @Get(':id')
//   @UseGuards(IncomingClearanceGuard)
//   async getOne(@Param('id') id: string) {
//     return this.incomingService.getOneForUser(id);
//   }

//   // POST /incoming
//   @Post()
//   async create(@Body() body: CreateIncomingDto, @Req() req: any) {
//     const userPayload = req.user || {};

//     const userId =
//       userPayload.userId ??
//       userPayload.id ??
//       userPayload.sub ??
//       null;

//     if (!userId) {
//       throw new BadRequestException(
//         'لا يمكن تحديد المستخدم الحالي من التوكن (userId/sub مفقود)',
//       );
//     }

//     return this.incomingService.createIncoming({
//       externalPartyName: body.externalPartyName,
//       externalPartyType: body.externalPartyType,
//       deliveryMethod: body.deliveryMethod,
//       urgencyLevel: body.urgencyLevel,
//       requiredAction: body.requiredAction,
//       summary: body.summary,
//       departmentId: body.departmentId,
//       userId: userId,
//     });
//   }

//   // POST /incoming/:id/followup
//   @Post(':id/followup')
//   async addFollowup(
//     @Param('id') id: string,
//     @Body() dto: CreateFollowupDto,
//     @Req() req: any,
//   ) {
//     const userPayload = req.user || {};

//     const userId =
//       userPayload.userId ??
//       userPayload.id ??
//       userPayload.sub ??
//       null;

//     const departmentId =
//       userPayload.departmentId ??
//       userPayload.deptId ??
//       null;

//     const roles =
//       userPayload.roles ??
//       userPayload.roleNames ??
//       [];

//     if (!userId) {
//       throw new BadRequestException(
//         'لا يمكن تحديد المستخدم الحالي من التوكن لإضافة متابعة',
//       );
//     }

//     const userCtx = {
//       userId,
//       departmentId,
//       roles,
//     };

//     return this.incomingService.addFollowupStep(id, userCtx, dto);
//   }
// }
