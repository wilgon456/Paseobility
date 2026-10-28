import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const SKILLS = [
  {
    id: "paseo-agent-cleanup",
    summary: "Preview and archive disposable Paseo agents and test workspaces.",
  },
  {
    id: "paseo-browser",
    summary:
      "Reuse an Ego Lite task space or selected Chrome tab, and verify cleanup.",
  },
  {
    id: "paseo-cua",
    summary: "Operate native desktop apps through the Cua Driver.",
  },
  {
    id: "paseo-design",
    summary:
      "Build and review interfaces, then verify them with screenshots and measured checks.",
  },
  {
    id: "paseo-god",
    summary:
      "Explicit /paseo-god mode: carry a bounded task to verified completion.",
  },
  {
    id: "paseo-multi",
    summary: "Operate several computers connected through Paseo in parallel.",
  },
  {
    id: "paseo-orchestration",
    summary:
      "Coordinate multiple agents, tournaments, or debates on explicit request.",
  },
  {
    id: "paseo-project",
    summary: "Summarize a repository or prepare its Paseo environment.",
  },
  {
    id: "paseo-share",
    summary: "Share files through a private Git repository with preview links.",
  },
  {
    id: "paseo-research",
    summary:
      "Answer how, why and compatibility questions from primary sources with a cited report.",
  },
  {
    id: "paseo-spyware-check",
    summary:
      "Statically inspect a repository for spyware and supply-chain risks.",
  },
  {
    id: "paseo-toss",
    summary:
      "Plan, build and review Apps in Toss mini-apps with the official Harness workflows.",
  },
] as const;

export const skillStatusRpc = defineRpc({
  name: "skills.status",
  input: z.object({}),
  output: z.object({
    platform: z.string(),
    tools: z.array(
      z.object({ id: z.string(), label: z.string(), detected: z.boolean() }),
    ),
    skills: z.array(
      z.object({ id: z.string(), paseo: z.boolean(), claude: z.boolean() }),
    ),
  }),
});
