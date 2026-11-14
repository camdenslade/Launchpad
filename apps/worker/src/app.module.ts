import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { validateEnv } from "./config/env.js";
import { DatabaseModule } from "./database.module.js";
import { JOB_HANDLER_CLASSES } from "./jobs/handlers/index.js";
import { JOB_HANDLERS, type JobHandler } from "./jobs/job-handler.js";
import { JobRunnerService } from "./processors/job-runner.service.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: "../../.env",
      validate: validateEnv
    }),
    DatabaseModule
  ],
  providers: [
    ...JOB_HANDLER_CLASSES,
    // Collect every handler into one injectable list for the runner.
    {
      provide: JOB_HANDLERS,
      inject: JOB_HANDLER_CLASSES,
      useFactory: (...handlers: JobHandler[]) => handlers
    },
    JobRunnerService
  ]
})
export class WorkerModule {}
