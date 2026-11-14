import { z } from "zod";

const name = z.string().trim().min(1).max(100);
const description = z.string().trim().max(2000);
const owner = z.string().trim().min(1).max(100);
const repositoryUrl = z.url({ protocol: /^https?$/ });

/** A project as returned by the API (dates are ISO-8601 strings over JSON). */
export const ProjectSchema = z.object({
  id: z.uuid(),
  name,
  description: description.nullable(),
  owner: owner.nullable(),
  repositoryUrl,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime()
});

/** Body of `POST /api/projects`. */
export const CreateProjectSchema = z
  .object({
    name,
    description: description.optional(),
    owner: owner.optional(),
    repositoryUrl
  })
  .strict();

/**
 * Body of `PATCH /api/projects/:id`. Every field is optional; `null`
 * clears an optional field. An empty body is rejected.
 */
export const UpdateProjectSchema = z
  .object({
    name: name.optional(),
    description: description.nullable().optional(),
    owner: owner.nullable().optional(),
    repositoryUrl: repositoryUrl.optional()
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one field must be provided"
  });

export type Project = z.infer<typeof ProjectSchema>;
export type CreateProject = z.infer<typeof CreateProjectSchema>;
export type UpdateProject = z.infer<typeof UpdateProjectSchema>;
