import type { Selection, Workflow } from "../shared/contracts";
import { stages } from "../shared/model";

// Caps and agent counts are enforced by the service; this copy must not claim
// token counts, cost or model ability.
export const workflows: Record<
  Workflow,
  { label: string; icon: string; tone: string; note: string; detail: string }
> = {
  daily: {
    label: "일상",
    icon: "Zap",
    tone: "gray",
    note: "글·답변은 대화에서, 코드는 접수 후 자체 검증",
    detail:
      "글과 답변은 대화에서 바로 답해요. 코드는 작업으로 접수해 준비·작업 단계에서 스스로 검증해요 (한 번에 최대 3개).",
  },
  verified: {
    label: "정밀 검증",
    icon: "ShieldCheck",
    tone: "cyan",
    note: "코드 작업에 독립 검토를 더함",
    detail:
      "코드 작업마다 독립 검토 단계를 더해 결과를 다시 확인해요 (한 번에 최대 12개).",
  },
};
export const defaultWorkflow: Workflow = "daily";
export const workflowLabel = (workflow: string | undefined) =>
  workflows[(workflow ?? defaultWorkflow) as Workflow]?.label ?? workflow ?? "";
// Results recorded before workflows existed ran the four-stage pipeline.
export const recordedWorkflow = (value: unknown): Workflow => (value === "daily" ? "daily" : "verified");
export const stagesOf = (workflow: Workflow | undefined): readonly string[] =>
  workflow === "daily" ? ["preflight", "work"] : stages;
export const verificationLabel = (value: unknown, workflow: Workflow) =>
  value === "independent-review" || (value === undefined && workflow === "verified")
    ? "독립 검토"
    : value === "self-checked" || value === undefined
      ? "자체 검증"
      : String(value);
export const defaultSelection: Selection = {
  project: "auto",
  model: "auto",
  effort: "auto",
  workflow: defaultWorkflow,
};

export const starters: { id: string; icon: string; title: string; note: string; template: string }[] = [
  {
    id: "write",
    icon: "PenLine",
    title: "글 다듬기",
    note: "초안·메일·문서를 대화에서 바로",
    template: "다음 글을 뜻은 그대로 두고 자연스럽게 다듬어 줘.\n\n",
  },
  {
    id: "summarize",
    icon: "TextQuote",
    title: "요약하기",
    note: "긴 글을 핵심만 추려서",
    template: "다음 내용을 핵심만 추려 요약해 줘. 결정 사항과 할 일을 따로 적어 줘.\n\n",
  },
  {
    id: "code",
    icon: "Code",
    title: "코드 고치기",
    note: "작업으로 접수해 검증한 뒤 결과 보고",
    template: "다음 문제를 고쳐 줘. 재현 조건:\n\n기대 동작:\n\n",
  },
];
