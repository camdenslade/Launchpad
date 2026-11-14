import { z } from "zod";

export const JobStatusSchema = z.enum(["queued", "running", "succeeded", "failed", "cancelled"]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

/** A background job as returned by `GET /api/jobs/:id`. */
export const JobSchema = z.object({
  id: z.uuid(),
  type: z.string(),
  status: JobStatusSchema,
  attempts: z.number().int(),
  maxAttempts: z.number().int(),
  runAt: z.iso.datetime(),
  lastError: z.string().nullable(),
  result: z.unknown().nullable(),
  createdAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable()
});
export type Job = z.infer<typeof JobSchema>;
