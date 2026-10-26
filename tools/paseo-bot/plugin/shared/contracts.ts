import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const taskId = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/);
export const taskSchema = z
  .object({
    id: taskId,
    project: z.string().trim().min(1).max(200),
    title: z.string().trim().min(1).max(300),
    prompt: z.string().trim().min(1).max(40000),
    kind: z.enum(["gpt", "hard", "refactor", "sync"]),
    machine: z.string().trim().min(1).max(200).optional(),
  })
  .strict();
export const rowSchema = z.object({
  id: taskId,
  state: z.string(),
  title: z.string(),
  project: z.string(),
  updatedAt: z.number(),
  createdAt: z.number().default(0),
  machine: z.string().default(""),
  profile: z.string().default(""),
  stage: z.string().default(""),
  requester: z.string().default("legacy"),
  conversationId: z.string().default(""),
  retryOf: z.string().default(""),
  prUrl: z.string().default(""),
});
export const planSchema = z.object({
  id: taskId,
  digest: z.string(),
  state: z.string(),
  messageId: z.string(),
  retryOf: z.string().nullable().optional(),
  tasks: z.array(
    taskSchema
      .omit({ id: true })
      .extend({ dependsOn: z.array(z.number()).optional() }),
  ),
});
export const snapshotSchema = z.object({
  host: z.string(),
  healthy: z.boolean(),
  lastTickAt: z.number(),
  acceptsTasks: z.boolean(),
  queue: z.record(z.string(), z.number()),
  total: z.number(),
  offset: z.number(),
  tasks: z.array(rowSchema),
  projects: z.array(
    z.object({
      id: z.string(),
      enabled: z.boolean(),
      machines: z.array(z.string()).default([]),
    }),
  ),
  filtered: z.number().default(0),
  configured: z.boolean().default(false),
  managerHealthy: z.boolean().default(false),
  lastSyncAt: z.number().default(0),
  deliveryState: z.string().default(""),
  conversations: z
    .array(
      z.object({
        id: taskId,
        title: z.string(),
        agentId: z.string().nullable(),
        status: z.string(),
        createdAt: z.number(),
      }),
    )
    .default([]),
  messages: z
    .array(
      z.object({
        id: z.string(),
        role: z.string(),
        text: z.string(),
        time: z.number(),
        payload: z
          .object({ taskIds: z.array(z.string()).optional() })
          .catchall(z.unknown()),
      }),
    )
    .default([]),
  plans: z.array(planSchema).default([]),
});
export const syncInput = z
  .object({
    offset: z.number().int().min(0).max(1000000).default(0),
    conversationId: z.string().default(""),
    before: z.number().optional(),
    query: z.string().max(200).default(""),
    project: z.string().max(200).default(""),
    machine: z.string().max(200).default(""),
    requester: z.string().max(200).default(""),
    scope: z.string().max(80).default(""),
    group: z
      .enum(["", "waiting", "running", "attention", "success", "failed"])
      .default(""),
    sort: z.enum(["newest", "oldest", "updated", "title"]).default("newest"),
  })
  .strict();
export const syncRpc = defineRpc({
  name: "bot.sync",
  input: syncInput,
  output: snapshotSchema,
});
export const actionInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), requestId: taskId }).strict(),
  z
    .object({
      action: z.literal("send"),
      conversationId: taskId,
      messageId: taskId,
      text: z.string().trim().min(1).max(12000),
      retryOf: taskId.optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("approve"),
      conversationId: taskId,
      planId: taskId,
      digest: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
  z
    .object({
      action: z.literal("reject"),
      conversationId: taskId,
      planId: taskId,
    })
    .strict(),
  z
    .object({
      action: z.literal("remember"),
      conversationId: taskId,
      messageId: taskId,
      project: z.string().min(1).max(200),
    })
    .strict(),
]);
export const actionRpc = defineRpc({
  name: "bot.action",
  input: actionInput,
  output: z.object({
    accepted: z.boolean().optional(),
    conversationId: z.string().optional(),
    messageId: z.string().optional(),
    taskIds: z.array(z.string()).optional(),
  }),
});
export const recordSchema = z
  .object({ id: taskId, state: z.string(), project: z.string() })
  .catchall(z.unknown());
export const statusRpc = defineRpc({
  name: "bot.status",
  input: z
    .object({ offset: z.number().int().min(0).max(1000000).default(0) })
    .strict(),
  output: snapshotSchema,
});
export const resultRpc = defineRpc({
  name: "bot.result",
  input: z.object({ id: taskId }).strict(),
  output: recordSchema,
});
export const submitRpc = defineRpc({
  name: "bot.submit",
  input: taskSchema,
  output: recordSchema,
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export type Task = z.infer<typeof taskSchema>;
export type TaskRow = z.infer<typeof rowSchema>;
export type Plan = z.infer<typeof planSchema>;
export type Filters = z.infer<typeof syncInput>;
export type Action = z.infer<typeof actionInput>;
