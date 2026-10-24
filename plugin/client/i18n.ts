import * as clientSdk from "@getpaseo/plugin/client";
import type {
  PluginClientContext,
  PluginMessage,
  PluginText,
} from "@getpaseo/plugin/client";
import { MESSAGES, type MessageKey } from "../shared/messages";

// Paseo 0.12 has no client.i18n and no defineTranslations. Both are checked before use.
const defineTranslations = (clientSdk as Partial<typeof clientSdk>)
  .defineTranslations;
interface Messages {
  message(key: MessageKey): PluginMessage;
}

export interface PaseoLabels {
  attachmentTitle: PluginText;
  attachmentPickerTitle: PluginText;
  attachmentSearchPlaceholder: PluginText;
  commandCenterTitle: PluginText;
}

export function paseoLabels(client: PluginClientContext): PaseoLabels {
  let messages: Messages | null = null;
  try {
    if (
      typeof client.i18n?.t === "function" &&
      typeof defineTranslations === "function"
    )
      messages = defineTranslations({ resources: MESSAGES });
  } catch (error) {
    console.warn("[Paseobility] Plugin translations unavailable", error);
  }
  const text = (key: MessageKey): PluginText =>
    messages ? messages.message(key) : MESSAGES.ko[key];
  return {
    attachmentTitle: text("attachmentTitle"),
    attachmentPickerTitle: text("attachmentPickerTitle"),
    attachmentSearchPlaceholder: text("attachmentSearchPlaceholder"),
    commandCenterTitle: text("commandCenterTitle"),
  };
}
