import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OrganisationsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.client.organisation.findMany();
  }

  findOne(id: string) {
    return this.prisma.client.organisation.findUnique({ where: { id } });
  }
}
