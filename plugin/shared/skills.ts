import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const SKILLS = [
  {
    id: "ps",
    summary: "Choose a local specialist skill and read its original instructions on demand.",
  },
  {
    id: "ps-agent-cleanup",
    summary: "Preview and archive disposable Paseo agents and test workspaces.",
  },
  {
    id: "ps-browser",
    summary:
      "Reuse an Ego Lite task space or selected Chrome tab, and verify cleanup.",
  },
  {
    id: "ps-cua",
    summary: "Operate native desktop apps through the Cua Driver.",
  },
  {
    id: "ps-design",
    summary:
      "Build and review interfaces, then verify them with screenshots and measured checks.",
  },
  {
    id: "ps-god",
    summary:
      "Explicit /ps-god mode: carry a bounded task to verified completion.",
  },
  {
    id: "ps-multi",
    summary: "Operate several computers connected through Paseo in parallel.",
  },
  {
    id: "ps-orchestration",
    summary:
      "Coordinate multiple agents, tournaments, or debates on explicit request.",
  },
  {
    id: "ps-plan",
    summary: "Explicit /ps-plan requests: ground a plan in evidence and testable criteria.",
  },
  {
    id: "ps-project",
    summary: "Summarize a repository or prepare its Paseo environment.",
  },
  {
    id: "ps-share",
    summary: "Share files through a private Git repository with preview links.",
  },
  {
    id: "ps-research",
    summary:
      "Answer how, why and compatibility questions from primary sources with a cited report.",
  },
  {
    id: "ps-spyware-check",
    summary:
      "Statically inspect a repository for spyware and supply-chain risks.",
  },
  {
    id: "ps-toss",
    summary:
      "Plan, build and review Apps in Toss mini-apps with the official Harness workflows.",
  },
  {
    id: "ps-write",
    summary: "Explicit /ps-write requests: draft documents and verify sources and reader clarity.",
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
