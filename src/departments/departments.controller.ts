import {
  Body,
  Controller,
  Get,
  Patch,
  Param,
  ParseIntPipe,
  Query,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { RequirePermissions } from 'src/auth/permissions.decorator';
import { PERMISSIONS } from 'src/auth/permissions.constants';
import { DepartmentsService } from './departments.service';
import { UpdateStatusDto } from './dto/update-status.dto';
import { CreateDepartmentDto } from './dto/create-department.dto';

@UseGuards(JwtAuthGuard)
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  //@RequirePermissions (PERMISSIONS.DEPARTMENTS_READ)
  @Get()
  async findAll(@Query('status') status?: string) {
    return this.departmentsService.findAll({ status });
  }

  //@RequirePermissions(PERMISSIONS.DEPARTMENTS_CREATE)
  @Post()
  async create(@Body() body: CreateDepartmentDto) {
    return this.departmentsService.create(body);
  }

  //@RequirePermissions(PERMISSIONS.DEPARTMENTS_UPDATE_STATUS)
  @Patch(':id/status')
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateStatusDto,
  ) {
    return this.departmentsService.updateStatus(id, body.status);
  }

  // @RequirePermissions(PERMISSIONS.DEPARTMENTS_UPDATE_STATUS)
  @Patch(':id/toggle-status')
  async toggleStatus(@Param('id', ParseIntPipe) id: number) {
    return this.departmentsService.toggleStatus(id);
  }
}

// // src/departments/departments.controller.ts

// import {
//   Body,
//   Controller,
//   Get,
//   Patch,
//   Param,
//   ParseIntPipe,
//   Query,
//   Post,
//   UseGuards,
// } from '@nestjs/common';
// import { DepartmentsService } from './departments.service';
// import { UpdateStatusDto } from './dto/update-status.dto';
// import { CreateDepartmentDto } from './dto/create-department.dto';
// import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
// import { RolesGuard } from 'src/auth/roles.guard';
// import { Roles } from 'src/auth/roles.decorator';

// @UseGuards(JwtAuthGuard, RolesGuard)
// @Controller('departments')
// export class DepartmentsController {
//   constructor(private readonly departmentsService: DepartmentsService) {}

//   // قراءة: متاح لأي USER
//   @Get()
//   async findAll(@Query('status') status?: string) {
//     return this.departmentsService.findAll({ status });
//   }

//   // إنشاء/تعديل: ADMIN فقط
//   @Roles('ADMIN')
//   @Post()
//   async create(@Body() body: CreateDepartmentDto) {
//     return this.departmentsService.create(body);
//   }

//   @Roles('ADMIN')
//   @Patch(':id/status')
//   async updateStatus(
//     @Param('id', ParseIntPipe) id: number,
//     @Body() body: UpdateStatusDto,
//   ) {
//     return this.departmentsService.updateStatus(id, body.status);
//   }

//   @Roles('ADMIN')
//   @Patch(':id/toggle-status')
//   async toggleStatus(@Param('id', ParseIntPipe) id: number) {
//     return this.departmentsService.toggleStatus(id);
//   }
// }
