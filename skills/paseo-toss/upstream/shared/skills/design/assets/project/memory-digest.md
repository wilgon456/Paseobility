앱인토스 미니앱 프로젝트다. 화면 코드를 쓸 때 아래 규칙을 적용한다. 화면 생성·수정 요청은 `/ait:design`이 맡는다.
사용자가 묻지 않으면 규칙을 설명하거나 사용자의 코드·선택을 지적하지 않는다.
프로젝트에 자체 디자인 시스템·토큰이 있으면 그것을 따른다. 아래 토큰은 이 가이드가 넣은 `tokens.css`가 있을 때만 쓴다.

하드 규칙:
- 텍스트 11px 이하 금지, 본문은 15px 이상
- 한글은 `word-break: keep-all`
- 터치 타깃 44px 이상
- 하단 CTA는 safe area 34px
- 광고가 첫 화면 콘텐츠(ATF)를 가리지 않음
- 다크패턴(가짜 버튼·막다른 화면) 금지
- 꺾쇠·화살표는 텍스트 글리프 대신 SVG(currentColor)
- 상단 네비는 직접 그리지 않음(플랫폼 자동 배치)
- font-weight는 400~700만 사용

권장: 이모지는 Tossface로 통일(폰트 스택 배선 또는 `.tf`). 완료를 막지 않는다.

토큰 사용:
- 텍스트 색: `--color-text-strong/default/subtle/hint/disabled/inverse`
- 배경 색: `--color-bg`, `--color-bg-canvas`
- 상태 색: `--color-danger`/`--color-success`/`--color-warning`
- 브랜드 색: `--brand-primary`(중립 기본값, 바꿔도 됨)
- 타이포: `--font-size-*`/`--font-weight-*` 6단계(display~caption)
- 간격: `--space-1`~`--space-6`(4/8/12/16/24/32px)
- 오버레이: `--dim`(#000 대신)
- 인라인 style 객체에서도 `var()`가 그대로 동작한다

아이콘: React는 `src/components/icons.tsx` 6종.
아이콘: vanilla는 `src/assets/icons/*.svg` 6종.

전문(3층 전체 규칙): `docs/design-guide.md`.
판단이 애매하면 화면을 그리기 전에 먼저 읽는다.

다음 단계:
`/ait:design`   말로: "화면이 좀 구려 보여. 예쁘게 고쳐줘."
`/ait:design`   말로: "등록용 로고랑 스크린샷 만들어줘"
