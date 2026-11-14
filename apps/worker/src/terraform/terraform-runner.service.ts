import { spawn } from "node:child_process";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env.js";

/** Keep at most this much Terraform output per run (stored in the DB). */
const MAX_LOG_CHARS = 200_000;

export interface Workspace {
  /** Root of this run's private copy of the Terraform tree. */
  root: string;
  /** The stack directory Terraform runs in. */
  stackDir: string;
}

export interface CommandResult {
  exitCode: number;
  /** stdout + stderr interleaved, as a human would see it. */
  output: string;
  /** stdout only (for machine-readable output like -json). */
  stdout: string;
}

/**
 * Runs Terraform for infrastructure jobs.
 *
 * Each run gets its own copy of the Terraform tree, so concurrent runs and
 * platform-team edits never interfere. Cloud credentials are passed only to
 * the terraform child process, never written to disk.
 */
@Injectable()
export class TerraformRunner {
  private readonly bin: string;
  private readonly sourceDir: string;
  private readonly workDir: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigService<Env, true>) {
    this.bin = config.get("TERRAFORM_BIN", { infer: true });
    this.sourceDir = config.get("TERRAFORM_DIR", { infer: true });
    this.workDir = config.get("WORKER_WORK_DIR", { infer: true });
    this.timeoutMs = config.get("TERRAFORM_TIMEOUT_MS", { infer: true });
  }

  async createWorkspace(runId: string, stack: string): Promise<Workspace> {
    const root = join(this.workDir, "runs", runId);
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
    await cp(this.sourceDir, root, {
      recursive: true,
      // Never copy a developer's local .terraform/ state into a run.
      filter: (source) => !/[\\/]\.terraform([\\/]|$)/.test(source)
    });
    return { root, stackDir: join(root, "stacks", stack) };
  }

  async removeWorkspace(workspace: Workspace): Promise<void> {
    await rm(workspace.root, { recursive: true, force: true });
  }

  async writeBackendConfig(
    workspace: Workspace,
    backend: { bucket: string; key: string; region: string }
  ): Promise<void> {
    const hcl = [
      `bucket       = ${JSON.stringify(backend.bucket)}`,
      `key          = ${JSON.stringify(backend.key)}`,
      `region       = ${JSON.stringify(backend.region)}`,
      `encrypt      = true`,
      // S3-native locking (Terraform >= 1.10): no DynamoDB table needed.
      `use_lockfile = true`
    ].join("\n");
    await writeFile(join(workspace.stackDir, "backend.hcl"), `${hcl}\n`);
  }

  async writeVariables(workspace: Workspace, variables: Record<string, unknown>): Promise<void> {
    await writeFile(
      join(workspace.stackDir, "launchpad.auto.tfvars.json"),
      JSON.stringify(variables, null, 2)
    );
  }

  /**
   * Runs `terraform <args>` in the workspace. Resolves with the exit code and
   * combined output; never rejects for a non-zero exit (callers decide).
   */
  run(
    workspace: Workspace,
    args: string[],
    credentialEnv: Record<string, string>,
    signal: AbortSignal
  ): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.bin, args, {
        cwd: workspace.stackDir,
        env: this.childEnv(credentialEnv),
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true
      });

      let output = "";
      let stdout = "";
      const append = (chunk: Buffer) => {
        output += chunk.toString("utf8");
        if (output.length > MAX_LOG_CHARS * 2) output = output.slice(-MAX_LOG_CHARS);
      };
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
        append(chunk);
      });
      child.stderr.on("data", append);

      // Terraform handles SIGINT gracefully (releases locks, writes state).
      const stop = () => child.kill("SIGINT");
      const timer = setTimeout(stop, this.timeoutMs);
      signal.addEventListener("abort", stop, { once: true });

      child.on("error", (error) => {
        clearTimeout(timer);
        reject(new Error(`Could not run "${this.bin}": ${error.message}. Is Terraform installed?`));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", stop);
        resolve({ exitCode: code ?? 1, output: tail(output), stdout });
      });
    });
  }

  /**
   * The child gets the worker's environment minus any AWS settings (so it
   * can't fall back to Launchpad's own identity), plus the run's credentials.
   */
  private childEnv(credentialEnv: Record<string, string>): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (!key.startsWith("AWS_")) env[key] = value;
    }
    return {
      ...env,
      ...credentialEnv,
      TF_IN_AUTOMATION: "1",
      TF_INPUT: "0",
      CHECKPOINT_DISABLE: "1",
      // Shared provider cache: download the AWS provider once, not per run.
      TF_PLUGIN_CACHE_DIR: join(this.workDir, "plugin-cache"),
      // Never read the operator's ~/.aws config files.
      AWS_CONFIG_FILE: join(this.workDir, "no-aws-config"),
      AWS_SHARED_CREDENTIALS_FILE: join(this.workDir, "no-aws-credentials")
    };
  }

  async ensurePluginCache(): Promise<void> {
    await mkdir(join(this.workDir, "plugin-cache"), { recursive: true });
  }
}

export function tail(text: string, max = MAX_LOG_CHARS): string {
  return text.length > max ? `…(truncated)\n${text.slice(-max)}` : text;
}
