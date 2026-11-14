import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { validateEnv } from "./config/env.js";
import { AuditModule } from "./modules/audit/audit.service.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { CloudModule } from "./modules/cloud/cloud.module.js";
import { DatabaseModule } from "./modules/database/database.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { JobsModule } from "./modules/jobs/jobs.module.js";
import { ProjectsModule } from "./modules/projects/projects.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: "../../.env",
      validate: validateEnv
    }),
    DatabaseModule,
    AuditModule,
    AuthModule,
    CloudModule,
    HealthModule,
    JobsModule,
    ProjectsModule
  ]
})
export class AppModule {}
