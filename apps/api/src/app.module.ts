import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { validateEnv } from "./config/env.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { DatabaseModule } from "./modules/database/database.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { ProjectsModule } from "./modules/projects/projects.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: "../../.env",
      validate: validateEnv
    }),
    DatabaseModule,
    AuthModule,
    HealthModule,
    ProjectsModule
  ]
})
export class AppModule {}
