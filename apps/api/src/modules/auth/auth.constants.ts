/** httpOnly cookie holding the session token (JS in the page can't read it). */
export const SESSION_COOKIE = "launchpad_session";

/** Short-lived cookie holding the OAuth `state` value (CSRF protection). */
export const OAUTH_STATE_COOKIE = "launchpad_oauth_state";

export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
