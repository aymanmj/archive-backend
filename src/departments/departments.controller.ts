// src/departments/departments.controller.ts
import {
  Body, Controller, Get, Patch, Param, ParseIntPipe, Query, Post,
} from '@nestjs/common';
import { DepartmentsService } from './departments.service';
import { UpdateStatusDto } from './dto/update-status.dto';
import { CreateDepartmentDto } from './dto/create-department.dto';

@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  // GET /departments?status=Active
  @Get()
  async findAll(@Query('status') status?: string) {
    return this.departmentsService.findAll({ status });
  }

  // POST /departments
  @Post()
  async create(@Body() body: CreateDepartmentDto) {
    return this.departmentsService.create(body);
  }

  // PATCH /departments/:id/status
  @Patch(':id/status')
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateStatusDto,
  ) {
    return this.departmentsService.updateStatus(id, body.status);
  }

  // PATCH /departments/:id/toggle-status
  @Patch(':id/toggle-status')
  async toggleStatus(@Param('id', ParseIntPipe) id: number) {
    return this.departmentsService.toggleStatus(id);
  }
}




// // src/departments/departments.controller.ts
// import { Body, Controller, Get, Patch, Param, ParseIntPipe, Query, Post } from '@nestjs/common';
// import { DepartmentsService } from './departments.service';
// import { UpdateStatusDto } from './dto/update-status.dto';

// @Controller('departments')
// export class DepartmentsController {
//   constructor(private readonly departmentsService: DepartmentsService) {}

//   /**
//    * GET /departments?status=Active
//    */
//   @Get()
//   async findAll(@Query('status') status?: string) {
//     return this.departmentsService.findAll({ status });
//   }

//   /**
//    * PATCH /departments/:id/status
//    * body: { status: "Active" | "Inactive" }
//    */
//   @Patch(':id/status')
//   async updateStatus(
//     @Param('id', ParseIntPipe) id: number,
//     @Body() body: UpdateStatusDto,
//   ) {
//     return this.departmentsService.updateStatus(id, body.status);
//   }

//   /**
//    * (اختياري) PATCH /departments/:id/toggle-status
//    * لا يحتاج Body — يقلب الحالة مباشرة
//    */
//   @Patch(':id/toggle-status')
//   async toggleStatus(@Param('id', ParseIntPipe) id: number) {
//     return this.departmentsService.toggleStatus(id);
//   }
// }


