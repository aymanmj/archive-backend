import { Body, Controller, Get, Patch, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { DepartmentsService } from './departments.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateStatusDto } from './dto/update-status.dto';

@UseGuards(JwtAuthGuard)
@Controller('departments')
export class DepartmentsController {
  constructor(private departmentsService: DepartmentsService) {}

  @Get()
  async list() {
    return this.departmentsService.findAll();
  }

  @Post()
  async create(@Body() body: CreateDepartmentDto) {
    return this.departmentsService.create(body.name);
  }

  @Patch(':id/status')
  async changeStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateStatusDto,
  ) {
    return this.departmentsService.updateStatus(id, body.status);
  }
}
