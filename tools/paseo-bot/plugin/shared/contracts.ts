import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const taskId = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/);
export const taskSchema = z.object({
  id: taskId, project: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(300), prompt: z.string().trim().min(1).max(40000),
  kind: z.enum(["gpt", "hard", "refactor", "sync"]),
  machine: z.string().trim().min(1).max(200).optional(),
}).strict();
export const snapshotSchema = z.object({
  host: z.string(), healthy: z.boolean(), lastTickAt: z.number(), acceptsTasks: z.boolean(),
  queue: z.record(z.string(), z.number()), total: z.number(), offset: z.number(),
  tasks: z.array(z.object({ id: taskId, state: z.string(), title: z.string(), project: z.string(), updatedAt: z.number() })),
  projects: z.array(z.object({ id: z.string(), enabled: z.boolean() })),
});
export const recordSchema = z.object({ id: taskId, state: z.string(), project: z.string() }).catchall(z.unknown());
export const statusRpc = defineRpc({ name: "bot.status", input: z.object({ offset: z.number().int().min(0).max(1000000).default(0) }).strict(), output: snapshotSchema });
export const resultRpc = defineRpc({ name: "bot.result", input: z.object({ id: taskId }).strict(), output: recordSchema });
export const submitRpc = defineRpc({ name: "bot.submit", input: taskSchema, output: recordSchema });
export type Snapshot = z.infer<typeof snapshotSchema>;
export type Task = z.infer<typeof taskSchema>;
