import { useState, type FormEvent } from "react";
import {
  estimateMonthlyCost,
  SERVICE_SIZES,
  ServiceSettingsSchema,
  type Environment,
  type ServiceSettings,
  type ServiceSize
} from "@launchpad/contracts";
import { updateEnvironment } from "../../api/environments.js";

interface ServiceSettingsFormProps {
  environment: Environment;
  onSaved: (environment: Environment) => void;
  onCancel: () => void;
}

/**
 * Developer-facing inputs for the environment's web service. Saving only
 * records the settings; nothing changes in the cloud until a plan with them
 * is reviewed and approved.
 */
export function ServiceSettingsForm({ environment, onSaved, onCancel }: ServiceSettingsFormProps) {
  const [form, setForm] = useState<ServiceSettings>(environment.serviceSettings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cost = estimateMonthlyCost(form);
  const set = <K extends keyof ServiceSettings>(key: K, value: ServiceSettings[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = ServiceSettingsSchema.safeParse(form);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Invalid settings");

    setBusy(true);
    setError(null);
    try {
      onSaved(await updateEnvironment(environment.id, { serviceSettings: parsed.data }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="service-settings" onSubmit={handleSubmit}>
      <label className="toggle">
        <input type="checkbox" checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} />
        <span>
          <strong>Run as a web service</strong>
          <span className="muted">
            ECS Fargate behind a load balancer, with a public URL and logs in CloudWatch.
          </span>
        </span>
      </label>

      <fieldset className="form-grid form-grid--4" disabled={!form.enabled}>
        <label className="field">
          <span>Container port</span>
          <input
            type="number"
            min={1}
            max={65535}
            value={form.containerPort}
            onChange={(e) => set("containerPort", Number(e.target.value))}
          />
        </label>
        <label className="field">
          <span>Health check path</span>
          <input value={form.healthCheckPath} onChange={(e) => set("healthCheckPath", e.target.value)} placeholder="/health" />
        </label>
        <label className="field">
          <span>Size</span>
          <select value={form.size} onChange={(e) => set("size", e.target.value as ServiceSize)}>
            {Object.entries(SERVICE_SIZES).map(([key, size]) => (
              <option key={key} value={key}>{size.label}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Instances</span>
          <input
            type="number"
            min={0}
            max={10}
            value={form.desiredCount}
            onChange={(e) => set("desiredCount", Number(e.target.value))}
          />
        </label>
      </fieldset>

      <div className="form-actions">
        <p className="service-settings__cost">
          {form.enabled ? (
            <>
              Estimated <strong>~${cost}/month</strong> while running. Planning is free; charges start after an apply.
            </>
          ) : (
            <>No service: no compute or load balancer charges.</>
          )}
        </p>
        {error && <p className="error">{error}</p>}
        <button type="button" className="button button--secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="button" disabled={busy}>
          {busy ? "Saving…" : "Save settings"}
        </button>
      </div>
    </form>
  );
}
