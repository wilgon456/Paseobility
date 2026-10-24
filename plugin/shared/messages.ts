// Labels rendered by Paseo 0.13 PluginText surfaces. Paseo 0.12 uses the Korean fallbacks.
export const MESSAGES = {
  en: {
    attachmentTitle: "Paseobility skills",
    attachmentPickerTitle: "Paseobility skills",
    attachmentSearchPlaceholder: "Search skills",
    commandCenterTitle: "Open Paseobility",
  },
  ko: {
    attachmentTitle: "Paseobility 스킬",
    attachmentPickerTitle: "Paseobility 스킬",
    attachmentSearchPlaceholder: "스킬 검색",
    commandCenterTitle: "Paseobility 열기",
  },
} as const;

export type MessageKey = keyof typeof MESSAGES.en;
