import { useEffect, useState } from "react";
import { GITHUB_SIGN_IN_URL, getAuthConfig } from "../api/auth.js";

/** Messages for the `?authError=` codes the API redirects back with. */
const AUTH_ERRORS: Record<string, string> = {
  github_denied: "GitHub sign-in was cancelled.",
  invalid_state: "Sign-in link expired or was tampered with. Please try again.",
  signin_failed: "GitHub sign-in failed. Check the API logs for details."
};

export function SignInScreen() {
  const [githubConfigured, setGithubConfigured] = useState<boolean | null>(null);
  const [authError] = useState(() => readAndClearAuthError());

  useEffect(() => {
    getAuthConfig()
      .then((config) => setGithubConfigured(config.githubConfigured))
      .catch(() => setGithubConfigured(false));
  }, []);

  return (
    <main className="app">
      <section className="panel sign-in">
        <h1>Launchpad</h1>
        <p className="muted">Sign in to manage your team's projects.</p>

        {authError && <p className="error">{authError}</p>}

        {githubConfigured === false ? (
          <p className="error">
            GitHub sign-in isn't configured yet. Set <code>GITHUB_CLIENT_ID</code> and{" "}
            <code>GITHUB_CLIENT_SECRET</code> in <code>.env</code> and restart the API.
          </p>
        ) : (
          // A plain link, not fetch: the browser has to navigate to GitHub.
          <a className="button" href={GITHUB_SIGN_IN_URL} aria-disabled={githubConfigured === null}>
            Sign in with GitHub
          </a>
        )}
      </section>
    </main>
  );
}

/** Reads `?authError=` once and removes it so a refresh doesn't re-show it. */
function readAndClearAuthError(): string | null {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("authError");
  if (!code) return null;

  url.searchParams.delete("authError");
  window.history.replaceState(null, "", url.toString());
  return AUTH_ERRORS[code] ?? "Sign-in failed. Please try again.";
}
