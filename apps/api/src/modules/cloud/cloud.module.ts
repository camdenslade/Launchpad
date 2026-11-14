import { Module } from "@nestjs/common";
import { AwsCloudProvider } from "./aws/aws-cloud.provider.js";
import { CloudController } from "./cloud.controller.js";
import { CloudTemplatesController } from "./cloud-templates.controller.js";
import { CloudService } from "./cloud.service.js";

@Module({
  controllers: [CloudController, CloudTemplatesController],
  providers: [AwsCloudProvider, CloudService],
  exports: [CloudService]
})
export class CloudModule {}
