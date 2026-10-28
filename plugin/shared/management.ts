import {
  defineRpc,
  defineAttachmentSource,
  PluginAttachmentSearchPayloadSchema,
} from "@getpaseo/plugin";
import type { PluginText } from "@getpaseo/plugin";
import { z } from "zod";
export const PLUGIN_VERSION = "2.12.7";
const release = z.object({
  version: z.string(),
  sha: z.string(),
  url: z.string(),
});
const job = z.object({
  phase: z.string(),
  message: z.string(),
  backup: z.string().optional(),
});
export const versionRpc = defineRpc({
  name: "package.status",
  input: z.object({ hostId: z.string() }),
  output: z.object({
    plugin: z.string(),
    installed: z.string().nullable(),
    latest: release.nullable(),
    error: z.string().nullable(),
    job: job.nullable(),
  }),
});
export const updateRpc = defineRpc({
  name: "package.update",
  input: z.object({ hostId: z.string(), version: z.string(), sha: z.string() }),
  output: z.object({ started: z.boolean() }),
});
export const skillsSearchRpc = defineRpc({
  name: "skills.search",
  input: z.object({ query: z.string() }),
  output: PluginAttachmentSearchPayloadSchema,
});
export function createSkillsSource(labels: {
  title: PluginText;
  pickerTitle: PluginText;
  searchPlaceholder: PluginText;
}) {
  return defineAttachmentSource({
    id: "paseobility-skills",
    title: labels.title,
    icon: "Sparkles",
    pickerTitle: labels.pickerTitle,
    searchPlaceholder: labels.searchPlaceholder,
    search: skillsSearchRpc,
  });
}
