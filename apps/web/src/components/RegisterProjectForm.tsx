import { useState, type FormEvent } from "react";
import { CreateProjectSchema, type Project } from "@launchpad/contracts";
import { createProject } from "../api/projects.js";
import { ApiError } from "../api/client.js";

interface RegisterProjectFormProps {
  /** Called with the saved project so the parent can add it to its list. */
  onCreated: (project: Project) => void;
}

const EMPTY_FORM = { name: "", repositoryUrl: "", owner: "", description: "" };
type FormValues = typeof EMPTY_FORM;
/** Error messages keyed by field name ("" = not tied to one field). */
type FieldErrors = Partial<Record<keyof FormValues | "", string>>;

/**
 * "Controlled" form: every input's value lives in React state (`values`) and
 * each keystroke updates it via `onChange`. React re-renders on each change,
 * so what's on screen always matches state.
 */
export function RegisterProjectForm({ onCreated }: RegisterProjectFormProps) {
  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  // One change handler for every input, keyed by the input's `name` attribute.
  function handleChange(field: keyof FormValues, value: string) {
    setValues((previous) => ({ ...previous, [field]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault(); // stop the browser's default full-page form POST

    // Blank optional fields are left out rather than sent as "".
    const input = {
      name: values.name,
      repositoryUrl: values.repositoryUrl,
      ...(values.owner.trim() && { owner: values.owner }),
      ...(values.description.trim() && { description: values.description })
    };

    // Same schema the API validates with, so we catch mistakes before sending.
    const parsed = CreateProjectSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(
        toFieldErrors(
          parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }))
        )
      );
      return;
    }

    setSubmitting(true);
    setErrors({});
    try {
      const project = await createProject(parsed.data);
      onCreated(project);
      setValues(EMPTY_FORM);
    } catch (error) {
      if (error instanceof ApiError && error.issues.length > 0) {
        setErrors(toFieldErrors(error.issues)); // 400 from the server
      } else if (error instanceof ApiError && error.status === 409) {
        setErrors({ repositoryUrl: error.message }); // duplicate repository
      } else {
        setErrors({ "": error instanceof Error ? error.message : "Something went wrong" });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="register-form" onSubmit={handleSubmit} noValidate>
      <Field label="Name" error={errors.name}>
        <input
          value={values.name}
          onChange={(e) => handleChange("name", e.target.value)}
          placeholder="payments-service"
        />
      </Field>
      <Field label="Repository URL" error={errors.repositoryUrl}>
        <input
          type="url"
          value={values.repositoryUrl}
          onChange={(e) => handleChange("repositoryUrl", e.target.value)}
          placeholder="https://github.com/acme/payments-service"
        />
      </Field>
      <Field label="Owner (optional)" error={errors.owner}>
        <input
          value={values.owner}
          onChange={(e) => handleChange("owner", e.target.value)}
          placeholder="platform-team"
        />
      </Field>
      <Field label="Description (optional)" error={errors.description}>
        <textarea
          rows={2}
          value={values.description}
          onChange={(e) => handleChange("description", e.target.value)}
        />
      </Field>

      {errors[""] && <p className="error">{errors[""]}</p>}

      <button type="submit" className="button" disabled={submitting}>
        {submitting ? "Registering…" : "Register project"}
      </button>
    </form>
  );
}

/** Label + input + error message. `children` is whatever is nested inside. */
function Field(props: { label: string; error?: string | undefined; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{props.label}</span>
      {props.children}
      {props.error && <span className="error">{props.error}</span>}
    </label>
  );
}

function toFieldErrors(issues: { path: string; message: string }[]): FieldErrors {
  const result: FieldErrors = {};
  for (const issue of issues) {
    const key = (issue.path in EMPTY_FORM ? issue.path : "") as keyof FieldErrors;
    result[key] ??= issue.message; // keep the first message per field
  }
  return result;
}
