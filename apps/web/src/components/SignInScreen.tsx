import { useEffect, useState } from "react";
import { GITHUB_SIGN_IN_URL, getAuthConfig } from "../api/auth.js";
import { BRAND } from "../brand.js";
import { LogoMark } from "./brand/Logo.js";
import { GitHubIcon } from "./icons.js";

/** Messages for the `?authError=` codes the API redirects back with. */
const AUTH_ERRORS: Record<string, string> = {
  github_denied: "GitHub sign-in was cancelled.",
  invalid_state: "That sign-in link expired. Please try again.",
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
    <main className="sign-in">
      <section className="sign-in__card">
        <LogoMark size={56} className="sign-in__mark" title={BRAND.name} />
        <h1>Welcome to {BRAND.name}</h1>
        <p>{BRAND.tagline}</p>

        {authError && <div className="banner">{authError}</div>}

        {githubConfigured === false ? (
          <div className="banner">
            GitHub sign-in isn't configured. Set <code>GITHUB_CLIENT_ID</code> and{" "}
            <code>GITHUB_CLIENT_SECRET</code> in <code>.env</code>, then restart the API.
          </div>
        ) : (
          // A plain link, not fetch: the browser has to navigate to GitHub.
          <a
            className="button button--lg"
            href={GITHUB_SIGN_IN_URL}
            aria-disabled={githubConfigured === null}
          >
            <GitHubIcon size={18} />
            Continue with GitHub
          </a>
        )}

        <p className="sign-in__footnote">Self-hosted. Your code and credentials stay on your infrastructure.</p>
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
