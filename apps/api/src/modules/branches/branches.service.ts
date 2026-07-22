import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.client.branch.findMany();
  }

  findOne(id: string) {
    return this.prisma.client.branch.findUnique({ where: { id } });
  }
}
