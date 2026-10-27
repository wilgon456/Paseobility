export const stateLabels: Record<string, string> = {
  queued: "대기",
  ready: "준비",
  dispatching: "배정 중",
  running: "실행 중",
  repairing: "응답 확인 중",
  passed: "검증 통과",
  failed: "실패",
  blocked: "차단",
  unknown: "확인 필요",
  closed: "종료",
};
export const stateLabel = (state: string) => stateLabels[state] ?? state;
export const makeTaskId = () =>
  `gui-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
export const stageLabel = (stage: string) =>
  (
    ({
      preflight: "준비",
      work: "작업",
      review: "검토",
      postflight: "마무리",
    }) as Record<string, string>
  )[stage] ?? stage;
export const profileLabel = (kind: string) =>
  (
    ({
      gpt: "일반 작업",
      hard: "집중 개발",
      refactor: "구조 개선",
      sync: "상태 확인",
    }) as Record<string, string>
  )[kind] ?? kind;
export const lanes = [
  { id: "waiting", label: "대기" },
  { id: "running", label: "실행 중" },
  { id: "attention", label: "검토 필요" },
  { id: "success", label: "성공" },
  { id: "failed", label: "실패" },
] as const;
export function laneOf(state: string) {
  return (
    (
      {
        queued: "waiting",
        ready: "waiting",
        dispatching: "running",
        running: "running",
        repairing: "running",
        passed: "success",
        failed: "failed",
        closed: "closed",
      } as Record<string, string>
    )[state] ?? "attention"
  );
}
export function requesterLabel(source: string) {
  return (
    (
      {
        gui: "실장님 GUI",
        grok: "Grok 봇",
        cli: "CLI",
        legacy: "이전 작업",
      } as Record<string, string>
    )[source] ?? "출처 미확인"
  );
}
export function relativeTime(time: number, now = Date.now() / 1000) {
  const delta = Math.max(0, now - time);
  return !time
    ? "기록 없음"
    : delta < 60
      ? "방금"
      : delta < 3600
        ? `${Math.floor(delta / 60)}분 전`
        : delta < 86400
          ? `${Math.floor(delta / 3600)}시간 전`
          : `${Math.floor(delta / 86400)}일 전`;
}
export function duration(start: number, end: number) {
  const d = Math.max(0, Math.floor(end - start));
  return !start
    ? "시간 미정"
    : d < 60
      ? `${d}초`
      : d < 3600
        ? `${Math.floor(d / 60)}분 ${d % 60}초`
        : `${Math.floor(d / 3600)}시간 ${Math.floor((d % 3600) / 60)}분`;
}
export function safePr(url: unknown): string {
  return typeof url === "string" &&
    /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/[1-9]\d*$/.test(url)
    ? url
    : "";
}
export const models = {
  sol: { label: "GPT-6.1 Sol", short: "Sol", note: "기본 작업" },
  claude: { label: "Claude Opus 5.5", short: "Opus", note: "어려운 설계·버그" },
  go: { label: "DeepSeek V4.1 Flash", short: "Flash", note: "가벼운 작업" },
} as const;
export const modelAlias = (model: string) => (model === "terra" ? "sol" : model);
export function modelLabel(model: string, compact = false) {
  const info = (models as Record<string, { label: string; short: string }>)[modelAlias(model)];
  return info ? (compact ? info.short : info.label) : "";
}
export const stages = ["preflight", "work", "review", "postflight"] as const;
/** Completed stages (0-4); the current stage is the next one. */
export function stageProgress(state: string, stage: string) {
  if (state === "passed") return stages.length;
  if (laneOf(state) === "waiting") return 0;
  return Math.max(0, stages.indexOf(stage as (typeof stages)[number]));
}
