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

// Pure draft operation: never trim or replace existing user text.
export function appendSkill(draft: string, skill: string): string {
  if (!WORKFLOWS.some((item) => item.id === skill))
    throw new Error("알 수 없는 스킬입니다.");
  if (new RegExp(`(^|\\s)/${skill}(?=\\s|$)`).test(draft)) return draft;
  return draft + (draft && !draft.endsWith("\n") ? "\n" : "") + `/${skill} `;
}
