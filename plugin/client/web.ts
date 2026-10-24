import { Platform } from "react-native";
import { appendSkill } from "../shared/workflows";
// Paseo 0.12 web adapter. No React internals; use the browser's textarea input event.
// The marker belongs to this exact host/agent pill, including in split panes.
interface Element {
  parentElement: Element | null;
  isConnected: boolean;
  getClientRects(): { length: number };
  getAttribute(name: string): string | null;
  querySelectorAll(selector: string): ArrayLike<Element>;
}
interface Editor extends Element {
  value: string;
  readOnly: boolean;
  disabled: boolean;
  focus(): void;
  setSelectionRange(start: number, end: number): void;
  dispatchEvent(event: unknown): boolean;
}
declare const document: {
  querySelectorAll(selector: string): ArrayLike<Element>;
};
declare const window: {
  HTMLTextAreaElement: { prototype: object };
  Event: new (name: string, options: { bubbles: boolean }) => unknown;
};
export function markerId(host: string, agent: string) {
  return `paseobility-composer-${encodeURIComponent(host)}-${encodeURIComponent(agent)}`;
}
export function resolveEditor(marker: string): Editor | null {
  if (Platform.OS !== "web") return null;
  const marks = Array.from(
    document.querySelectorAll(`[data-testid="${marker}"]`),
  ).filter((el) => el.isConnected && el.getClientRects().length);
  if (marks.length !== 1) return null;
  // Stop at the first common ancestor; never search the whole document for a textarea.
  let node: Element | null = marks[0].parentElement;
  for (let depth = 0; node && depth < 18; depth++, node = node.parentElement) {
    if (
      node.getAttribute("data-testid") === "workspace-root" ||
      node.getAttribute("id") === "root"
    )
      return null;
    const roots = Array.from(
      node.querySelectorAll('[data-testid="message-input-root"]'),
    );
    if (!roots.length) continue;
    if (roots.length !== 1) return null;
    const inputs = Array.from(
      roots[0].querySelectorAll("textarea"),
    ) as Editor[];
    if (inputs.length !== 1) return null;
    const input = inputs[0];
    return input.isConnected &&
      input.getClientRects().length &&
      !input.disabled &&
      !input.readOnly
      ? input
      : null;
  }
  return null;
}
export const EDITOR_UNAVAILABLE =
  "입력창을 확인할 수 없습니다. 대화를 다시 열거나 + 메뉴의 Paseobility 스킬을 이용해주세요.";
export function attachSkill(
  marker: string,
  expected: Editor | null,
  skill: string,
): void {
  if (Platform.OS !== "web" || !expected || resolveEditor(marker) !== expected)
    throw new Error(EDITOR_UNAVAILABLE);
  const next = appendSkill(expected.value, skill);
  if (next === expected.value) return;
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  if (!setter)
    throw new Error("이 Paseo 버전에서는 입력 연결을 사용할 수 없습니다.");
  setter.call(expected, next);
  expected.dispatchEvent(new window.Event("input", { bubbles: true }));
  expected.focus();
  expected.setSelectionRange(next.length, next.length);
}
