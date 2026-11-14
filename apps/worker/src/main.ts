import { NestFactory } from "@nestjs/core";
import { WorkerModule } from "./app.module.js";

async function bootstrap(): Promise<void> {
  // No HTTP server: the worker only pulls jobs from the database queue.
  const app = await NestFactory.createApplicationContext(WorkerModule);

  // Lets SIGTERM/SIGINT finish the current job and close DB connections.
  app.enableShutdownHooks();
}

void bootstrap();
