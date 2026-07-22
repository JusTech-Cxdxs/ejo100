import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.client.permission.findMany();
  }

  findOne(id: string) {
    return this.prisma.client.permission.findUnique({ where: { id } });
  }
}
