import { z } from "zod";

/** Source-control providers Launchpad can import from. GitLab etc. later. */
export const SourceProviderSchema = z.enum(["github"]);
export type SourceProvider = z.infer<typeof SourceProviderSchema>;

/** A repository the signed-in user can import (from `GET /api/source/repositories`). */
export const SourceRepositorySchema = z.object({
  provider: SourceProviderSchema,
  /** Provider's stable id, as a string (GitHub ids can exceed 2^31). */
  id: z.string(),
  name: z.string(),
  /** "owner/name" */
  fullName: z.string(),
  description: z.string().nullable(),
  url: z.url(),
  private: z.boolean(),
  defaultBranch: z.string(),
  ownerAvatarUrl: z.url().nullable(),
  language: z.string().nullable(),
  updatedAt: z.iso.datetime().nullable(),
  /** Set when this repository is already registered as a project. */
  importedProjectId: z.uuid().nullable()
});
export type SourceRepository = z.infer<typeof SourceRepositorySchema>;

export const RepositoryListSchema = z.object({
  repositories: z.array(SourceRepositorySchema),
  /** Where to install/configure the GitHub App to grant access to more repos. */
  installUrl: z.url().nullable()
});
export type RepositoryList = z.infer<typeof RepositoryListSchema>;

/** Body of `POST /api/projects/import`. Details are fetched server-side. */
export const ImportProjectSchema = z
  .object({
    provider: SourceProviderSchema,
    repositoryId: z.string().regex(/^\d+$/, "Repository id must be numeric"),
    owner: z.string().trim().min(1).max(100).optional()
  })
  .strict();
export type ImportProject = z.infer<typeof ImportProjectSchema>;

/** Error code returned (HTTP 403) when the user's GitHub authorization must be renewed. */
export const SOURCE_REAUTH_REQUIRED = "source_reauth_required";
