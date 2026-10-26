import { Platform } from "react-native";
type Event = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  isComposing?: boolean;
  target?: {
    tagName?: string;
    isContentEditable?: boolean;
    getAttribute?: (s: string) => string;
    closest?: (s: string) => unknown;
  };
  preventDefault: () => void;
};
const web = globalThis as unknown as {
  document?: {
    addEventListener: (
      name: string,
      cb: (e: Event) => void,
      capture?: boolean,
    ) => void;
    removeEventListener: (
      name: string,
      cb: (e: Event) => void,
      capture?: boolean,
    ) => void;
    querySelectorAll: (s: string) => { focus: () => void }[];
  };
};
export function shortcuts(search: () => void, compose: () => void) {
  if (Platform.OS !== "web" || !web.document) return () => {};
  const fn = (e: Event) => {
    if (
      e.isComposing ||
      e.target?.isContentEditable ||
      ["INPUT", "TEXTAREA"].includes(e.target?.tagName ?? "")
    )
      return;
    if (e.key === "/") {
      e.preventDefault();
      search();
    }
    if (e.key.toLowerCase() === "n" && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      compose();
    }
    const card = e.target?.closest?.('[data-testid="task-open"]');
    if (
      card &&
      [
        "ArrowDown",
        "ArrowUp",
        "ArrowLeft",
        "ArrowRight",
        "Home",
        "End",
      ].includes(e.key)
    ) {
      const rows = Array.from(
        web.document!.querySelectorAll('[data-testid="task-open"]'),
      );
      const i = rows.indexOf(card as { focus: () => void });
      const next =
        e.key === "Home"
          ? 0
          : e.key === "End"
            ? rows.length - 1
            : Math.max(
                0,
                Math.min(
                  rows.length - 1,
                  i + (["ArrowUp", "ArrowLeft"].includes(e.key) ? -1 : 1),
                ),
              );
      e.preventDefault();
      rows[next]?.focus();
    }
  };
  web.document.addEventListener("keydown", fn);
  return () => web.document?.removeEventListener("keydown", fn);
}
export function composerKeys(send: () => void) {
  if (Platform.OS !== "web" || !web.document) return () => {};
  const fn = (e: Event) => {
    if (
      e.target?.getAttribute?.("data-testid") === "bot-composer" &&
      e.key === "Enter" &&
      !e.shiftKey &&
      !e.isComposing
    ) {
      e.preventDefault();
      send();
    }
  };
  web.document.addEventListener("keydown", fn, true);
  return () => web.document?.removeEventListener("keydown", fn, true);
}
