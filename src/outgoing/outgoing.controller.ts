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
import { OutgoingService } from './outgoing.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { IsEnum, IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { DeliveryMethod } from '@prisma/client';

// ✅ DTO يستخدم Enum بدلاً من نصوص حرة
class CreateOutgoingDto {
  @IsString()
  @MinLength(2)
  externalPartyName: string;

  @IsOptional()
  @IsString()
  externalPartyType?: string;

  // القيم المسموحة هي قيم enum من Prisma: Hand | Email | OfficialEmail | Courier | Fax | ElectronicSystem
  @IsEnum(DeliveryMethod)
  sendMethod: DeliveryMethod;

  @IsString()
  @MinLength(3)
  subject: string;

  @Type(() => Number)
  @IsInt()
  departmentId: number;

  @IsOptional()
  @IsString()
  summary?: string;
}

@UseGuards(JwtAuthGuard) // يجب أن يملأ req.user
@Controller('outgoing')
export class OutgoingController {
  constructor(private outgoingService: OutgoingService) {}

  // GET /outgoing
  @Get()
  async listLatest(@Req() req: any) {
    const userPayload = req.user || {};

    const departmentId =
      userPayload.departmentId ??
      userPayload.deptId ??
      null;

    const roles =
      userPayload.roles ??
      userPayload.roleNames ??
      [];

    return this.outgoingService.listLatestForUser({ departmentId, roles }, 20);
  }

  // GET /outgoing/:id
  @Get(':id')
  async getOne(@Param('id') id: string, @Req() req: any) {
    const userPayload = req.user || {};

    const departmentId =
      userPayload.departmentId ??
      userPayload.deptId ??
      null;

    const roles =
      userPayload.roles ??
      userPayload.roleNames ??
      [];

    return this.outgoingService.getOneForUser(id, { departmentId, roles });
  }

  // POST /outgoing
  @Post()
  async create(@Body() body: CreateOutgoingDto, @Req() req: any) {
    const userPayload = req.user || {};

    const userId =
      userPayload.userId ??
      userPayload.id ??
      userPayload.sub ??
      null;

    if (!userId) {
      throw new BadRequestException('لا يمكن تحديد المستخدم الحالي من التوكن');
    }

    return this.outgoingService.createOutgoing({
      externalPartyName: body.externalPartyName,
      externalPartyType: body.externalPartyType,
      sendMethod: body.sendMethod,      // ✅ Enum
      subject: body.subject,
      summary: body.summary,
      departmentId: body.departmentId,
      signedByUserId: userId,
    });
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
// import { OutgoingService } from './outgoing.service';
// import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
// import { IsInt, IsOptional, IsString, IsIn, MinLength } from 'class-validator';
// import { Type } from 'class-transformer';

// // DTO يبقى كما هو
// class CreateOutgoingDto {
//   @IsString()
//   @MinLength(2)
//   externalPartyName: string;

//   @IsOptional()
//   @IsString()
//   externalPartyType?: string;

//   @IsString()
//   @IsIn(['Hand', 'OfficialEmail', 'Courier', 'Fax', 'RegisteredMail'])
//   sendMethod: string;

//   @IsString()
//   @MinLength(3)
//   subject: string;

//   @Type(() => Number)
//   @IsInt()
//   departmentId: number;
// }

// @UseGuards(JwtAuthGuard) // ✨ هذا الحارس يضمن وجود req.user
// @Controller('outgoing')
// export class OutgoingController {
//   constructor(private outgoingService: OutgoingService) {} // ✨ تم حذف JwtService لأنه لم يعد مطلوباً هنا

//   // GET /outgoing
//   @Get()
//   async listLatest(@Req() req: any) {
//     // ✨ نقرأ بيانات المستخدم مباشرة من req.user
//     const { departmentId, roles } = req.user;
//     return this.outgoingService.listLatestForUser(
//       { departmentId, roles },
//       20,
//     );
//   }

//   // GET /outgoing/:id
//   @Get(':id')
//   async getOne(@Param('id') id: string, @Req() req: any) {
//     // ✨ نقرأ بيانات المستخدم مباشرة من req.user
//     const { departmentId, roles } = req.user;
//     return this.outgoingService.getOneForUser(id, { departmentId, roles });
//   }

//   // POST /outgoing
//   @Post()
//   async create(@Body() body: CreateOutgoingDto, @Req() req: any) {
//     // ✨ نقرأ userId مباشرة من req.user
//     const { userId } = req.user;

//     if (!userId) {
//       throw new BadRequestException('لا يمكن تحديد المستخدم الحالي من التوكن');
//     }

//     return this.outgoingService.createOutgoing({
//       externalPartyName: body.externalPartyName,
//       externalPartyType: body.externalPartyType,
//       sendMethod: body.sendMethod,
//       subject: body.subject,
//       departmentId: body.departmentId,
//       signedByUserId: userId, // ✨ نستخدم userId من req.user
//     });
//   }
// }
