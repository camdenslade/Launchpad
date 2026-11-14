import type { CurrentUser } from "@launchpad/contracts";
import { request } from "./client.js";

/**
 * Sign-in is a full-page navigation (not fetch): the browser must actually
 * visit GitHub to approve. The API redirects back to the app afterwards.
 */
export const GITHUB_SIGN_IN_URL = "/api/auth/github/login";

/** The signed-in user. Throws ApiError(401) when nobody is signed in. */
export function getCurrentUser(): Promise<CurrentUser> {
  return request<CurrentUser>("/auth/me");
}

export function getAuthConfig(): Promise<{ githubConfigured: boolean }> {
  return request<{ githubConfigured: boolean }>("/auth/config");
}

export function signOut(): Promise<void> {
  return request<void>("/auth/logout", { method: "POST" });
}
