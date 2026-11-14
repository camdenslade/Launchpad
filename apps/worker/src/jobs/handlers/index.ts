import { DeploymentRollbackHandler } from "./deployment-rollback.handler.js";
import { InfrastructureApplyHandler } from "./infrastructure-apply.handler.js";
import { InfrastructurePlanHandler } from "./infrastructure-plan.handler.js";
import { SystemSelfTestHandler } from "./system-self-test.handler.js";

/** Every job handler the worker can run. Register new handlers here. */
export const JOB_HANDLER_CLASSES = [
  SystemSelfTestHandler,
  InfrastructurePlanHandler,
  InfrastructureApplyHandler,
  DeploymentRollbackHandler
];
