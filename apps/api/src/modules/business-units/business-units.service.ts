import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BusinessUnitsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.client.businessUnit.findMany();
  }

  findOne(id: string) {
    return this.prisma.client.businessUnit.findUnique({ where: { id } });
  }
}
