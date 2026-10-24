export const WORKFLOWS = [
  {
    id: "paseo-browser",
    title: "브라우저 작업",
    hint: "사이트 확인, 폼 입력, 화면 검증",
    placeholder: "예: https://example.com에서 요금제를 비교해줘…",
  },
  {
    id: "paseo-cua",
    title: "데스크톱 앱 조작",
    hint: "Mac·Windows 앱의 화면 조작",
    placeholder: "예: 열려 있는 앱에서 설정 상태를 확인해줘…",
  },
  {
    id: "paseo-project",
    title: "프로젝트 파악",
    hint: "구조, 실행 방법, 개발 환경",
    placeholder: "예: 현재 프로젝트 구조와 실행 방법을 정리해줘…",
  },
  {
    id: "paseo-design",
    title: "UI 제작·검수",
    hint: "화면 구현과 크기별 디자인 검증",
    placeholder: "예: 설정 화면을 모바일에서도 편하게 바꿔줘…",
  },
  {
    id: "paseo-share",
    title: "파일 공유",
    hint: "내 비공개 저장소로 파일 공유",
    placeholder: "예: /경로/보고서.pdf를 공유해줘…",
  },
  {
    id: "paseo-spyware-check",
    title: "저장소 안전성 검사",
    hint: "실행 전 코드와 의존성 점검",
    placeholder: "예: https://github.com/owner/repo를 검사해줘…",
  },
  {
    id: "paseo-toss",
    title: "Toss 미니앱",
    hint: "기획부터 개발·기기 테스트까지",
    placeholder: "예: 만들고 싶은 미니앱의 기획을 도와줘…",
  },
  {
    id: "paseo-multi",
    title: "여러 PC 관리",
    hint: "지정한 컴퓨터의 상태와 작업",
    placeholder: "예: 맥미니와 윈도우 PC의 상태를 확인해줘…",
  },
  {
    id: "paseo-agent-cleanup",
    title: "에이전트 정리",
    hint: "정리 후보 확인과 선택적 보관",
    placeholder: "예: 완료된 테스트 에이전트의 정리 후보를 보여줘…",
  },
  {
    id: "paseo-god",
    title: "완료까지 실행",
    hint: "명확한 범위와 완료 조건으로 작업",
    placeholder: "목표, 작업 범위, 완료 조건을 적어주세요…",
  },
  {
    id: "paseo-orchestration",
    title: "여러 에이전트 협업",
    hint: "역할 분담, 비교, 토론",
    placeholder: "예: 두 에이전트가 이 설계의 장단점을 비교해줘…",
  },
] as const;

export type BrowserChoice = "auto" | "ego" | "chrome";
export function buildPrompt(
  skill: string,
  task: string,
  browser: BrowserChoice = "auto",
): string {
  if (!WORKFLOWS.some((item) => item.id === skill))
    throw new Error("알 수 없는 작업입니다.");
  const body = task.trim();
  if (!body) throw new Error("할 일을 입력해주세요.");
  if (body.length > 12000)
    throw new Error("작업 내용은 12,000자 이내로 입력해주세요.");
  const backend =
    skill === "paseo-browser"
      ? {
          auto: "",
          ego: "\n브라우저는 Ego Lite를 사용해주세요.",
          chrome:
            "\n이미 실행 중인 Google Chrome 창의 작업 탭 하나를 재사용하고, 완료 후 그 탭만 닫아주세요.",
        }[browser]
      : "";
  return `/${skill}\n${body}${backend}`;
}

export interface LaunchAgent {
  id: string;
  status: string;
  workspaceId?: string;
  archivedAt?: string | null;
  activeTurn?: unknown;
  pendingPermissions: readonly unknown[];
}

export function canLaunch(
  agent: LaunchAgent | null | undefined,
  workspaceId?: string,
): boolean {
  return (
    !!agent &&
    agent.status === "idle" &&
    !agent.archivedAt &&
    !agent.activeTurn &&
    Array.isArray(agent.pendingPermissions) &&
    agent.pendingPermissions.length === 0 &&
    (!workspaceId || agent.workspaceId === workspaceId)
  );
}

// Keep the in-flight lock outside React state so same-tick double clicks cannot send twice.
// A send failure is ambiguous: lock this attempt until the user checks its target.
export function createLauncher() {
  let state: "ready" | "checking" | "sending" | "sent" | "uncertain" = "ready";
  return {
    state: () => state,
    async launch(
      handle: {
        refresh(): Promise<{ agent: LaunchAgent } | null>;
        send(
          text: string,
          options: { activeTurnBehavior: "steer" },
        ): Promise<void>;
      },
      prompt: string,
      workspaceId?: string,
    ) {
      if (state !== "ready")
        throw new Error(
          "이미 전송을 시도했습니다. 대상 대화에서 결과를 확인해주세요.",
        );
      state = "checking";
      try {
        const latest = await handle.refresh();
        if (!canLaunch(latest?.agent, workspaceId))
          throw new Error(
            "대상이 실행 중이거나 승인 대기 중입니다. 대기 중인 다른 에이전트를 선택해주세요.",
          );
      } catch (error) {
        state = "ready";
        throw error;
      }
      state = "sending";
      try {
        // Request steering if a turn starts after refresh. The daemon can fall back
        // to interruption for providers without steering; this is not an atomic
        // idle-only send. The UI requires explicit target selection and refresh.
        await handle.send(prompt, { activeTurnBehavior: "steer" });
        state = "sent";
      } catch {
        state = "uncertain";
        throw new Error(
          "전송 결과를 확인하지 못했습니다. 중복 전송을 피하려면 대상 대화를 먼저 확인해주세요.",
        );
      }
    },
  };
}
