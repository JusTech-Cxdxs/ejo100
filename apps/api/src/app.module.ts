import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { BusinessUnitsModule } from './modules/business-units/business-units.module';
import { CountriesModule } from './modules/countries/countries.module';
import { StatesModule } from './modules/states/states.module';
import { CitiesModule } from './modules/cities/cities.module';
import { BranchesModule } from './modules/branches/branches.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { TeamsModule } from './modules/teams/teams.module';
import { WorkshopModule } from './modules/workshop/workshop.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { WarehouseModule } from './modules/warehouse/warehouse.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { ReportsModule } from './modules/reports/reports.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { EmailModule } from './modules/email/email.module';
import { StorageModule } from './modules/storage/storage.module';
import { SettingsModule } from './modules/settings/settings.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,

    // Identity & Access
    AuthModule,
    UsersModule,
    RolesModule,
    PermissionsModule,

    // Organization hierarchy
    CompaniesModule,
    BusinessUnitsModule,
    CountriesModule,
    StatesModule,
    CitiesModule,
    BranchesModule,
    DepartmentsModule,
    TeamsModule,

    // Business modules (Workshop LIVE for Phase One; the rest scaffolded
    // and registered but without business logic yet)
    WorkshopModule,
    InventoryModule,
    WarehouseModule,
    SuppliersModule,

    // Platform services
    DocumentsModule,
    ReportsModule,
    NotificationsModule,
    AuditLogsModule,
    EmailModule,
    StorageModule,
    SettingsModule,
  ],
})
export class AppModule {}
