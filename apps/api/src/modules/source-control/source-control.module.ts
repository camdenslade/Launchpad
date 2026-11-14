import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { GitHubSourceControlProvider } from "./github/github-source-control.provider.js";
import { GitHubTokenService } from "./github/github-token.service.js";
import { SourceControlController } from "./source-control.controller.js";
import { SourceControlService } from "./source-control.service.js";

@Module({
  imports: [AuthModule],
  controllers: [SourceControlController],
  providers: [GitHubTokenService, GitHubSourceControlProvider, SourceControlService],
  exports: [SourceControlService]
})
export class SourceControlModule {}
