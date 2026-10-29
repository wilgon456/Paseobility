// UI text in English and Korean. Paseo 0.13 picks by app language through
// PluginText/useTranslation; Paseo 0.12 has no translation runtime, so the
// device language decides (Korean for ko, English otherwise).
// "{name}" placeholders are filled by the caller with fill(); they are not i18n syntax.
export const MESSAGES = {
  en: {
    attachmentTitle: "Paseobility",
    attachmentPickerTitle: "Paseobility skills",
    attachmentSearchPlaceholder: "Search skills",
    commandCenterTitle: "Open Paseobility",
    statusLatest: "Up to date",
    statusUpdate: "Update available",
    statusUnknown: "Not checked",
    statusUpdating: "Updating",
    statusOffline: "Offline",
    sectionVersion: "Version",
    rowPlugin: "Plugin",
    rowPluginHint: "Running in Paseo",
    rowSkills: "Installed skills",
    rowSkillsHint: "Skill files on this computer",
    rowLatest: "Latest release",
    rowLatestHint: "Official GitHub release",
    notDetected: "Version unknown",
    unavailable: "Unavailable",
    actionUpdate: "Update",
    actionUpdateTo: "Update to v{version}",
    actionUpdating: "Updating…",
    actionLatest: "Up to date",
    updateHint: "Existing skills are backed up. Paseo keeps running.",
    refresh: "Refresh",
    checking: "Checking versions…",
    offline: "Can't reach this computer. Check the connection.",
    updateStarted: "Update started. This screen may reconnect.",
    updateUnconfirmed: "Couldn't confirm the update. Refresh to check.",
    backup: "Backup",
    sectionSkills: "Skills",
    installedCount: "{installed} of {total} installed",
    notInstalled: "Not installed",
    howTo: "Add a skill from Paseobility above the composer or from the + menu.",
    releaseNotes: "Release notes",
    pickerSearch: "Search skills…",
    pickerCount: "{count} skills",
    pickerEmpty: "No matching skills",
    pickerEmptyHint: "Try a skill name or a task.",
    pickerLoading: "Checking installed skills…",
    pickerLoadError: "Couldn't load installed skills. Reopen to retry.",
    pickerMobile: "Add skills from the + menu in the composer.",
    pickerAddHint: "Adds to the message draft.",
    editorUnavailable:
      "This window's composer can't be edited directly. Use + → Paseobility instead.",
    addFailed: "Couldn't add the skill.",
    // Server and update-worker text. The server sends the English text; the
    // screen swaps it for the app language with localizeServerText().
    errHostUnreachable: "Couldn't confirm Paseo on the selected computer.",
    errLatestFetch: "Couldn't check the latest version on GitHub.",
    errReleaseInfo: "Couldn't verify the official release.",
    errReleaseCommit: "Couldn't verify the release commit.",
    errVersionCheck: "Version check failed.",
    errReleaseChanged: "The latest release changed. Refresh the versions.",
    errNotNewer: "Updates never go to the current or an older version.",
    errPluginPath: "Couldn't find the installed plugin's folder.",
    errUpdateLocked:
      "An update is running or an earlier one was interrupted. Check its status.",
    errEditorMissing:
      "Can't find the composer. Reopen the conversation or use + → Paseobility.",
    errEditorUnsupported: "This Paseo version can't add text to the composer.",
    jobStarting: "Starting the update.",
    jobStartFailed: "Couldn't start the update.",
    jobStalled: "The update stopped. Check the backup before recovering.",
    jobDownloading: "Downloading and verifying v{version}…",
    jobInstalling: "Backing up the current skills and installing the new version…",
    jobReconnecting: "Switching the plugin to the new version…",
    jobComplete: "Updated to v{version}. New conversations use the updated skills.",
    jobUncertain:
      "Couldn't confirm the plugin switch. Nothing is retried automatically; check the backup and installation.",
    jobFailed: "Update failed. Check the backup and installation. {detail}",
    jobUnrecovered:
      "The update stopped and couldn't roll back automatically. Check the backup folder.",
  },
  ko: {
    attachmentTitle: "Paseobility",
    attachmentPickerTitle: "Paseobility 스킬",
    attachmentSearchPlaceholder: "스킬 검색",
    commandCenterTitle: "Paseobility 열기",
    statusLatest: "최신 버전",
    statusUpdate: "업데이트 있음",
    statusUnknown: "확인 필요",
    statusUpdating: "업데이트 중",
    statusOffline: "연결 안 됨",
    sectionVersion: "버전",
    rowPlugin: "플러그인",
    rowPluginHint: "Paseo에서 실행 중",
    rowSkills: "설치된 스킬",
    rowSkillsHint: "이 컴퓨터의 스킬 파일",
    rowLatest: "최신 정식 버전",
    rowLatestHint: "GitHub 공식 릴리스",
    notDetected: "버전 미확인",
    unavailable: "확인하지 못함",
    actionUpdate: "업데이트",
    actionUpdateTo: "v{version}로 업데이트",
    actionUpdating: "업데이트 중…",
    actionLatest: "최신 버전",
    updateHint: "기존 스킬은 백업되고 Paseo는 재시작하지 않습니다.",
    refresh: "새로고침",
    checking: "버전을 확인하고 있습니다…",
    offline: "이 컴퓨터에 연결하지 못했습니다. 연결 상태를 확인해주세요.",
    updateStarted: "업데이트를 시작했습니다. 화면이 잠시 다시 연결될 수 있습니다.",
    updateUnconfirmed: "업데이트 요청을 확인하지 못했습니다. 새로고침해주세요.",
    backup: "백업",
    sectionSkills: "스킬",
    installedCount: "{total}개 중 {installed}개 설치됨",
    notInstalled: "미설치",
    howTo: "대화 입력창 위 Paseobility나 + 메뉴에서 스킬을 추가하세요.",
    releaseNotes: "릴리스 노트",
    pickerSearch: "스킬 검색…",
    pickerCount: "{count}개",
    pickerEmpty: "일치하는 스킬이 없습니다",
    pickerEmptyHint: "스킬명이나 작업 내용으로 검색해보세요.",
    pickerLoading: "설치 정보를 확인하고 있습니다…",
    pickerLoadError: "설치 정보를 불러오지 못했습니다. 다시 열어주세요.",
    pickerMobile: "입력창 + 메뉴에서 스킬을 추가해주세요.",
    pickerAddHint: "작성 중인 메시지에 추가합니다.",
    editorUnavailable:
      "이 창의 입력창을 직접 편집할 수 없습니다. + → Paseobility를 이용해주세요.",
    addFailed: "스킬을 추가하지 못했습니다.",
    errHostUnreachable: "선택한 컴퓨터의 Paseo 연결을 확인하지 못했습니다.",
    errLatestFetch: "GitHub에서 최신 버전을 확인하지 못했습니다.",
    errReleaseInfo: "정식 릴리스 정보를 확인하지 못했습니다.",
    errReleaseCommit: "릴리스 커밋을 확인하지 못했습니다.",
    errVersionCheck: "버전을 확인하지 못했습니다.",
    errReleaseChanged: "최신 릴리스가 바뀌었습니다. 버전을 새로고침해주세요.",
    errNotNewer: "현재 버전 이하로는 업데이트하지 않습니다.",
    errPluginPath: "설치된 플러그인 폴더를 찾지 못했습니다.",
    errUpdateLocked:
      "업데이트가 진행 중이거나 이전 업데이트가 중단되었습니다. 상태를 확인해주세요.",
    errEditorMissing:
      "입력창을 찾지 못했습니다. 대화를 다시 열거나 + → Paseobility를 이용해주세요.",
    errEditorUnsupported: "이 Paseo 버전에서는 입력창에 내용을 추가할 수 없습니다.",
    jobStarting: "업데이트를 시작하고 있습니다.",
    jobStartFailed: "업데이트를 시작하지 못했습니다.",
    jobStalled: "업데이트가 중단되었습니다. 복구하기 전에 백업을 확인해주세요.",
    jobDownloading: "v{version}을 내려받아 검증하고 있습니다…",
    jobInstalling: "기존 스킬을 백업하고 새 버전을 설치하고 있습니다…",
    jobReconnecting: "플러그인을 새 버전으로 바꾸고 있습니다…",
    jobComplete: "v{version}으로 업데이트했습니다. 새 대화부터 갱신된 스킬을 사용합니다.",
    jobUncertain:
      "플러그인 교체 결과를 확인하지 못했습니다. 자동으로 다시 시도하지 않으니 백업과 설치 상태를 확인해주세요.",
    jobFailed: "업데이트하지 못했습니다. 백업과 설치 상태를 확인해주세요. {detail}",
    jobUnrecovered:
      "업데이트가 중단되었고 자동으로 되돌리지 못했습니다. 백업 폴더를 확인해주세요.",
  },
} as const;

export type MessageKey = keyof typeof MESSAGES.en;
export type Locale = keyof typeof MESSAGES;

/** "ko*" is Korean; every other app language falls back to English, as Paseo does. */
export function pickLocale(locale: string | null | undefined): Locale {
  return /^ko\b/i.test(locale ?? "") ? "ko" : "en";
}

export function fill(
  text: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in values ? String(values[name]) : whole,
  );
}

/** Keys whose English text the server sends verbatim (no placeholders). */
const SERVER_KEYS = (Object.keys(MESSAGES.en) as MessageKey[]).filter(
  (key) => /^(err|job)/.test(key) && !/\{\w+\}/.test(MESSAGES.en[key]),
);

/**
 * Server errors arrive as English text, possibly wrapped by the RPC layer.
 * Swap each known sentence for the chosen language and keep the rest as is.
 */
export function localizeServerText(text: string, locale: Locale): string {
  if (locale === "en") return text;
  let out = text;
  for (const key of SERVER_KEYS)
    out = out.split(MESSAGES.en[key]).join(MESSAGES[locale][key]);
  return out;
}

export interface JobState {
  message: string;
  code?: string;
  values?: Readonly<Record<string, string | number>>;
}

/** Update progress: the worker's message code when known, else its text. */
export function jobText(job: JobState, locale: Locale): string {
  const code = job.code;
  if (code && code in MESSAGES.en)
    return fill(MESSAGES[locale][code as MessageKey], job.values ?? {});
  return localizeServerText(job.message, locale);
}
