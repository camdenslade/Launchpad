import { z } from "zod";

/** The signed-in user, as returned by `GET /api/auth/me`. */
export const CurrentUserSchema = z.object({
  id: z.uuid(),
  login: z.string(),
  name: z.string().nullable(),
  avatarUrl: z.url().nullable()
});

export type CurrentUser = z.infer<typeof CurrentUserSchema>;
