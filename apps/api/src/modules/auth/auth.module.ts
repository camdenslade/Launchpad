import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { EncryptionService } from "../../common/encryption.service.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { GitHubOAuthClient } from "./github-oauth.client.js";
import { SessionGuard } from "./session.guard.js";

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    GitHubOAuthClient,
    EncryptionService,
    // Applies SessionGuard to every route in the app.
    { provide: APP_GUARD, useClass: SessionGuard }
  ],
  exports: [AuthService, EncryptionService]
})
export class AuthModule {}
