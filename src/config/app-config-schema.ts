import { z } from "zod";

export const AppConfigSchema = z.object({
  linear: z
    .object({
      teamId: z.string().optional(),
      projectId: z.string().optional(),
      pollIntervalMs: z.number().optional(),
      pollLookbackMs: z.number().optional(),
      includeStatuses: z.array(z.string()).optional(),
      excludeStatuses: z.array(z.string()).optional(),
    })
    .optional(),
  repository: z
    .object({
      url: z.string(),
      cloneDir: z.string().optional(),
      baseBranch: z.string().default("main"),
      branchPrefix: z.string().default("issue-"),
    })
    .optional(),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
