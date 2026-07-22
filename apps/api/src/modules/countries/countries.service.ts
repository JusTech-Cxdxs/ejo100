import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CountriesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.client.country.findMany();
  }

  findOne(id: string) {
    return this.prisma.client.country.findUnique({ where: { id } });
  }
}
