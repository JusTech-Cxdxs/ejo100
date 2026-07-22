import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.client.company.findMany();
  }

  findOne(id: string) {
    return this.prisma.client.company.findUnique({ where: { id } });
  }
}
