import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class StatesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.client.state.findMany();
  }

  findOne(id: string) {
    return this.prisma.client.state.findUnique({ where: { id } });
  }
}
