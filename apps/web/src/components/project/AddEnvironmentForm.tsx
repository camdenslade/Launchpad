import { useEffect, useState, type FormEvent } from "react";
import { CreateEnvironmentSchema, type CloudAccount, type Environment } from "@launchpad/contracts";
import { listCloudAccounts } from "../../api/cloud.js";
import { createEnvironment } from "../../api/environments.js";
import { linkProps } from "../../lib/router.js";

const KINDS = [
  { value: "development", label: "Development" },
  { value: "staging", label: "Staging" },
  { value: "production", label: "Production" }
] as const;

interface AddEnvironmentFormProps {
  projectId: string;
  onCreated: (environment: Environment) => void;
  onCancel: () => void;
}

export function AddEnvironmentForm({ projectId, onCreated, onCancel }: AddEnvironmentFormProps) {
  const [accounts, setAccounts] = useState<CloudAccount[] | null>(null);
  const [form, setForm] = useState({ name: "staging", kind: "staging" as Environment["kind"], cloudAccountId: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listCloudAccounts()
      .then((all) => {
        const connected = all.filter((a) => a.status === "connected");
        setAccounts(connected);
        if (connected[0]) setForm((f) => ({ ...f, cloudAccountId: f.cloudAccountId || connected[0]!.id }));
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = CreateEnvironmentSchema.safeParse(form);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Invalid input");

    setBusy(true);
    setError(null);
    try {
      onCreated(await createEnvironment(projectId, parsed.data));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (accounts && accounts.length === 0) {
    return (
      <section className="panel">
        <p className="muted" style={{ margin: 0 }}>
          Environments run in a connected cloud account.{" "}
          <a {...linkProps("/cloud")} className="text-link">Connect an AWS account</a> first.
        </p>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <h2>Add an environment</h2>
          <p>Each environment gets its own infrastructure from the standard service stack.</p>
        </div>
      </div>
      <form onSubmit={handleSubmit}>
        <div className="form-grid form-grid--3">
          <label className="field">
            <span>Name</span>
            <input
              autoFocus
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase() })}
              placeholder="staging"
            />
          </label>
          <label className="field">
            <span>Type</span>
            <select
              value={form.kind}
              onChange={(e) => {
                const kind = e.target.value as Environment["kind"];
                // Suggest the matching name while it's still a default.
                setForm((f) => ({ ...f, kind, name: KINDS.some((k) => k.value === f.name) ? kind : f.name }));
              }}
            >
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Cloud account</span>
            <select value={form.cloudAccountId} onChange={(e) => setForm({ ...form, cloudAccountId: e.target.value })}>
              {(accounts ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.region})
                </option>
              ))}
            </select>
          </label>
        </div>
        {form.kind === "production" && (
          <p className="step__hint">Production plans need approval from a second person by default. You can change this later.</p>
        )}
        <div className="form-actions">
          {error && <p className="error">{error}</p>}
          <button type="button" className="button button--secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" className="button" disabled={busy || !accounts}>
            {busy ? "Creating…" : "Create environment"}
          </button>
        </div>
      </form>
    </section>
  );
}
