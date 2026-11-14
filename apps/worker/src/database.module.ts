import {
  Global,
  Inject,
  Injectable,
  Module,
  type OnApplicationShutdown,
  type OnModuleInit
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createDatabaseClient, type PrismaClient } from "@launchpad/database";

export const DATABASE_CLIENT = Symbol("DATABASE_CLIENT");

/** Injects the shared Prisma client: `constructor(@InjectDatabase() db: PrismaClient)` */
export const InjectDatabase = (): ParameterDecorator => Inject(DATABASE_CLIENT);

@Injectable()
class DatabaseLifecycle implements OnModuleInit, OnApplicationShutdown {
  constructor(@InjectDatabase() private readonly db: PrismaClient) {}

  async onModuleInit(): Promise<void> {
    await this.db.$connect();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.db.$disconnect();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): PrismaClient =>
        createDatabaseClient({ connectionString: config.getOrThrow<string>("DATABASE_URL") })
    },
    DatabaseLifecycle
  ],
  exports: [DATABASE_CLIENT]
})
export class DatabaseModule {}
