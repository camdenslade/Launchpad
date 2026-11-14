import { useEffect, useState, type FormEvent } from "react";
import {
  CreateCloudAccountSchema,
  type CloudAccount,
  type CloudAccountSetup
} from "@launchpad/contracts";
import { createCloudAccount, getCloudAccountSetup, verifyCloudAccount } from "../../api/cloud.js";
import { BRAND } from "../../brand.js";
import { CopyBlock } from "../CopyBlock.js";

const REGIONS = [
  "us-east-1", "us-east-2", "us-west-1", "us-west-2",
  "ca-central-1", "eu-west-1", "eu-west-2", "eu-central-1",
  "ap-southeast-1", "ap-southeast-2", "ap-northeast-1", "ap-south-1", "sa-east-1"
];

/** While the user creates the role in AWS, check this often... */
const POLL_INTERVAL_MS = 5_000;
/** ...for at most this long (CloudFormation usually takes under a minute). */
const POLL_TIMEOUT_MS = 15 * 60_000;

interface ConnectAwsPanelProps {
  /** Resume setup for an existing pending/errored account instead of starting fresh. */
  resume?: CloudAccount;
  onChanged: (account: CloudAccount) => void;
  onClose: () => void;
}

/**
 * Connect flow: details -> create the role in AWS (one click when possible)
 * -> Launchpad notices the role automatically and marks the account connected.
 */
export function ConnectAwsPanel({ resume, onChanged, onClose }: ConnectAwsPanelProps) {
  const [account, setAccount] = useState<CloudAccount | null>(resume ?? null);
  const [setup, setSetup] = useState<CloudAccountSetup | null>(null);
  const [form, setForm] = useState({ name: "", accountId: "", region: "us-east-1" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connected = account?.status === "connected";
  const canCreateRole = Boolean(setup?.launchpadPrincipalArn);

  // Load step-2 instructions once the account exists.
  useEffect(() => {
    if (!account) return;
    getCloudAccountSetup(account.id)
      .then(setSetup)
      .catch((err: Error) => setError(err.message));
  }, [account?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll quietly while the user is off in the AWS console creating the role.
  useEffect(() => {
    if (!account || connected || !canCreateRole) return;
    const startedAt = Date.now();
    const timer = setInterval(async () => {
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) return clearInterval(timer);
      try {
        const result = await verifyCloudAccount(account.id, { quiet: true });
        if (result.status === "connected") {
          setAccount(result);
          onChanged(result);
          setError(null);
        }
      } catch {
        // Network blips during polling are fine; the next tick retries.
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [account?.id, connected, canCreateRole]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    const parsed = CreateCloudAccountSchema.safeParse({ provider: "aws", ...form });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Invalid input");

    setBusy(true);
    setError(null);
    try {
      const created = await createCloudAccount(parsed.data);
      setAccount(created);
      onChanged(created);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** Explicit check: unlike polling, this reports why it failed. */
  async function handleCheckNow() {
    if (!account) return;
    setBusy(true);
    setError(null);
    try {
      const result = await verifyCloudAccount(account.id);
      setAccount(result);
      onChanged(result);
      if (result.status === "error") setError(result.lastError);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <h2>{resume ? `Finish connecting ${resume.name}` : "Connect an AWS account"}</h2>
          <p>{BRAND.name} assumes a role you create, with short-lived credentials. No AWS keys are stored.</p>
        </div>
        <button type="button" className="button button--ghost" onClick={onClose}>
          {connected ? "Done" : "Cancel"}
        </button>
      </div>

      <ol className="steps">
        {/* Step 1: details */}
        <li className={`step ${account ? "step--done" : "step--active"}`}>
          <div className="step__title">Account details</div>
          {account ? (
            <p className="step__summary">
              {account.name} · {account.accountId} · {account.region}
            </p>
          ) : (
            <form className="form-grid form-grid--3" onSubmit={handleCreate}>
              <label className="field">
                <span>Display name</span>
                <input
                  autoFocus
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Production"
                />
              </label>
              <label className="field">
                <span>AWS account ID</span>
                <input
                  value={form.accountId}
                  onChange={(e) => setForm({ ...form, accountId: e.target.value.replace(/[\s-]/g, "") })}
                  placeholder="123456789012"
                  inputMode="numeric"
                  maxLength={14}
                />
              </label>
              <label className="field">
                <span>Default region</span>
                <select value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })}>
                  {REGIONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </label>
              <p className="field--full step__hint" style={{ marginTop: 0 }}>
                Your account ID is in the AWS console's top-right account menu.
              </p>
              <div className="field--full form-actions" style={{ marginTop: 0 }}>
                <button type="submit" className="button" disabled={busy}>
                  {busy ? "Saving…" : "Continue"}
                </button>
              </div>
            </form>
          )}
        </li>

        {/* Step 2: create the role */}
        <li className={`step ${!account ? "" : connected ? "step--done" : "step--active"}`}>
          <div className="step__title">Create the access role in AWS</div>
          {connected && <p className="step__summary">Role created</p>}
          {account && !connected && !setup && <p className="muted">Loading…</p>}
          {account && !connected && setup && !canCreateRole && (
            <div className="banner">
              {BRAND.name} has no working AWS credentials of its own, so it can't prepare the role yet. Configure
              them on the server (locally: a working AWS CLI profile, set as <code>AWS_PROFILE</code> in{" "}
              <code>.env</code>), restart the API, then reopen this panel.
            </div>
          )}
          {account && !connected && setup && canCreateRole && (
            <RoleSetupInstructions setup={setup} />
          )}
        </li>

        {/* Step 3: automatic verification */}
        <li className={`step ${connected ? "step--done" : account && canCreateRole ? "step--active" : ""}`}>
          <div className="step__title">Connect</div>
          {connected && account ? (
            <p className="step__summary step__summary--ok">Connected to AWS account {account.accountId}</p>
          ) : account && canCreateRole ? (
            <div className="waiting">
              <span className="waiting__dot" aria-hidden="true" />
              <span>Waiting for the role. This updates automatically once AWS finishes.</span>
              <button type="button" className="button button--ghost button--sm" onClick={handleCheckNow} disabled={busy}>
                {busy ? "Checking…" : "Check now"}
              </button>
            </div>
          ) : null}
        </li>
      </ol>

      {error && <div className="banner">{error}</div>}
    </section>
  );
}

/** Step 2 body: one-click launch when available, otherwise a guided upload. */
function RoleSetupInstructions({ setup }: { setup: CloudAccountSetup }) {
  return (
    <>
      {setup.launchStackUrl ? (
        <>
          <p className="step__text">
            Opens AWS CloudFormation with everything filled in. Tick the IAM acknowledgement at the bottom and click{" "}
            <strong>Create stack</strong>, then come back here.
          </p>
          <a className="button" href={setup.launchStackUrl} target="_blank" rel="noreferrer">
            Launch in AWS ↗
          </a>
        </>
      ) : (
        <>
          <p className="step__text">
            Download the template, then create a stack from it in CloudFormation. When asked for parameters, paste
            the two values below. Tick the IAM acknowledgement and click <strong>Submit</strong>.
          </p>
          <div className="button-row">
            <a className="button" href={setup.templatePath} download>
              Download template
            </a>
            <a className="button button--secondary" href={setup.createStackConsoleUrl} target="_blank" rel="noreferrer">
              Open CloudFormation ↗
            </a>
          </div>
          {setup.launchpadPrincipalArn && (
            <CopyBlock label="LaunchpadPrincipalArn" text={setup.launchpadPrincipalArn} />
          )}
          <CopyBlock label="ExternalId" text={setup.externalId} />
        </>
      )}

      <details className="disclosure">
        <summary>Advanced: create the role with the AWS CLI instead</summary>
        {setup.cliCommand && <CopyBlock label="AWS CLI (Bash / CloudShell)" text={setup.cliCommand} />}
        {setup.trustPolicy && <CopyBlock label="Trust policy" text={setup.trustPolicy} />}
      </details>

      <p className="step__hint">
        The role starts with no permissions. They're added per module when you provision infrastructure.
      </p>
    </>
  );
}
