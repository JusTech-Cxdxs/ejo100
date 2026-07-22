import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.client.department.findMany();
  }

  findOne(id: string) {
    return this.prisma.client.department.findUnique({ where: { id } });
  }
}
