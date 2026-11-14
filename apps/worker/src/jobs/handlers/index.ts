import { SystemSelfTestHandler } from "./system-self-test.handler.js";

/** Every job handler the worker can run. Register new handlers here. */
export const JOB_HANDLER_CLASSES = [SystemSelfTestHandler];
