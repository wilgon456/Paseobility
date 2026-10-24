// UI text in English and Korean. Paseo 0.13 picks by app language through
// PluginText/useTranslation; Paseo 0.12 has no translation runtime and uses Korean.
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
