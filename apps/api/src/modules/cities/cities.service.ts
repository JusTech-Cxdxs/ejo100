import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CitiesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.client.city.findMany();
  }

  findOne(id: string) {
    return this.prisma.client.city.findUnique({ where: { id } });
  }
}
