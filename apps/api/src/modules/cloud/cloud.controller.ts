import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post
} from "@nestjs/common";
import {
  CreateCloudAccountSchema,
  VerifyCloudAccountSchema,
  type CloudAccount,
  type CloudAccountSetup,
  type CreateCloudAccount,
  type CurrentUser as CurrentUserDto,
  type VerifyCloudAccount
} from "@launchpad/contracts";
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js";
import { CurrentUser } from "../auth/auth.decorators.js";
import { CloudService } from "./cloud.service.js";

/**
 * Routes (global prefix `api`):
 *   GET    /api/cloud/accounts
 *   POST   /api/cloud/accounts              step 1: start connecting
 *   GET    /api/cloud/accounts/:id/setup    step 2: role setup instructions
 *   POST   /api/cloud/accounts/:id/verify   step 3: test the role
 *   DELETE /api/cloud/accounts/:id
 */
@Controller("cloud/accounts")
export class CloudController {
  constructor(private readonly cloud: CloudService) {}

  @Get()
  list(): Promise<CloudAccount[]> {
    return this.cloud.list();
  }

  @Post()
  create(
    @CurrentUser() user: CurrentUserDto,
    @Body(new ZodValidationPipe(CreateCloudAccountSchema)) body: CreateCloudAccount
  ): Promise<CloudAccount> {
    return this.cloud.create(user, body);
  }

  @Get(":id/setup")
  setup(@Param("id", ParseUUIDPipe) id: string): Promise<CloudAccountSetup> {
    return this.cloud.setup(id);
  }

  @Post(":id/verify")
  @HttpCode(HttpStatus.OK)
  verify(
    @CurrentUser() user: CurrentUserDto,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(VerifyCloudAccountSchema)) body: VerifyCloudAccount
  ): Promise<CloudAccount> {
    return this.cloud.verify(user, id, body);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: CurrentUserDto,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<void> {
    return this.cloud.remove(user, id);
  }
}
