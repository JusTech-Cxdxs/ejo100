import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.client.team.findMany();
  }

  findOne(id: string) {
    return this.prisma.client.team.findUnique({ where: { id } });
  }
}
