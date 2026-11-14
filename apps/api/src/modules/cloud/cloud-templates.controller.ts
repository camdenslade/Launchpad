import { Controller, Get, Header } from "@nestjs/common";
import { ACCESS_ROLE_TEMPLATE } from "./aws/access-role.template.js";

/**
 *   GET /api/cloud/aws/access-role.yaml
 * The CloudFormation template for the access role, downloadable so it can be
 * uploaded in the AWS console (or copied to S3 for one-click setup).
 */
@Controller("cloud/aws")
export class CloudTemplatesController {
  @Get("access-role.yaml")
  @Header("Content-Type", "application/x-yaml; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="launchpad-access-role.yaml"')
  accessRoleTemplate(): string {
    return ACCESS_ROLE_TEMPLATE;
  }
}
