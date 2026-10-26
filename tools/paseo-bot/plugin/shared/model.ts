export const stateLabels: Record<string, string> = {
  queued: "대기", ready: "준비", dispatching: "배정 중", running: "실행 중", repairing: "응답 확인 중",
  passed: "검증 통과", failed: "실패", blocked: "차단", unknown: "확인 필요",
};
export const stateLabel = (state: string) => stateLabels[state] ?? state;
export const makeTaskId = () => `gui-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
