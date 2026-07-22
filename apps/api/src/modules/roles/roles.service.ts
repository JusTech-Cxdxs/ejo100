import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.client.role.findMany();
  }

  findOne(id: string) {
    return this.prisma.client.role.findUnique({ where: { id } });
  }
}
