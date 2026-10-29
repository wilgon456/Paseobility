import * as clientSdk from "@getpaseo/plugin/client";
import type {
  PluginClientContext,
  PluginMessage,
  PluginText,
} from "@getpaseo/plugin/client";
import {
  MESSAGES,
  fill,
  jobText,
  localizeServerText,
  pickLocale,
  type JobState,
  type Locale,
  type MessageKey,
} from "../shared/messages";

// Paseo 0.12 has no client.i18n, defineTranslations or useTranslation.
// Every 0.13-only export is checked before use, so one bundle runs on both.
const sdk = clientSdk as Partial<typeof clientSdk>;
interface Messages {
  message(key: MessageKey): PluginMessage;
}
let translations: Messages | null = null;
try {
  if (typeof sdk.defineTranslations === "function")
    translations = sdk.defineTranslations({ resources: MESSAGES });
} catch (error) {
  console.warn("[Paseobility] Plugin translations unavailable", error);
}
const useTranslation =
  translations && typeof sdk.useTranslation === "function"
    ? (sdk.useTranslation as unknown as (messages: Messages) => {
        locale: string;
        t(key: MessageKey): string;
      })
    : null;

/** Paseo 0.12 has no app language for plugins; use the device language. */
function deviceLocale(): Locale {
  try {
    const nav = (globalThis as { navigator?: { language?: string } }).navigator;
    return pickLocale(
      nav?.language || Intl.DateTimeFormat().resolvedOptions().locale,
    );
  } catch {
    return "en";
  }
}
const DEVICE_LOCALE = deviceLocale();

export interface PaseoLabels {
  attachmentTitle: PluginText;
  attachmentPickerTitle: PluginText;
  attachmentSearchPlaceholder: PluginText;
  commandCenterTitle: PluginText;
}

/** Registration labels: translation messages on 0.13, device language on 0.12. */
export function paseoLabels(client: PluginClientContext): PaseoLabels {
  const live = translations && typeof client.i18n?.t === "function";
  const text = (key: MessageKey): PluginText =>
    live ? translations!.message(key) : MESSAGES[DEVICE_LOCALE][key];
  return {
    attachmentTitle: text("attachmentTitle"),
    attachmentPickerTitle: text("attachmentPickerTitle"),
    attachmentSearchPlaceholder: text("attachmentSearchPlaceholder"),
    commandCenterTitle: text("commandCenterTitle"),
  };
}

export interface UiText {
  locale: Locale;
  t(key: MessageKey, values?: Readonly<Record<string, string | number>>): string;
  /** Server error text in this language when it is a known message. */
  server(text: string): string;
  job(job: JobState): string;
}

function staticText(locale: Locale): UiText {
  return {
    locale,
    t: (key, values) => fill(MESSAGES[locale][key], values ?? {}),
    server: (text) => localizeServerText(text, locale),
    job: (job) => jobText(job, locale),
  };
}
const TEXT: Record<Locale, UiText> = {
  en: staticText("en"),
  ko: staticText("ko"),
};

/**
 * Component text that follows the app language on Paseo 0.13 and the device
 * language on 0.12. The branch is fixed per bundle load, so hook order never
 * changes.
 */
export function useText(): UiText {
  if (!useTranslation || !translations) return TEXT[DEVICE_LOCALE];
  const { locale } = useTranslation(translations);
  // Resolve from the same table so every key has a value in both languages.
  return TEXT[pickLocale(locale)];
}
