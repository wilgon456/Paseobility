# launch lookup map

상황별로 docs MCP에서 무엇을 찾을지 적은 표다. 문서 내용은 옮기지 않는다.
경로를 `https://developers-apps-in-toss.toss.im` 뒤에 붙여 `getPage`로 바로
읽는다. 경로가 바뀌어 getPage가 실패할 때만 검색어로 `searchDocumentation`을
부른다. 검색 결과는 조각이라 판정에 쓰지 않는다.

| 상황 | 확인할 것 | 검색어 | 경로 |
|---|---|---|---|
| 비게임 출시 전 점검 | 체크리스트 항목 전체 | 비게임 출시 체크리스트 | `/checklist/app-nongame` |
| 게임 출시 전 점검 | 체크리스트 항목 전체(공유·확대 항목이 비게임과 다르다) | 게임 출시 체크리스트 | `/checklist/app-game` |
| 이미지·폰트·음원·캐릭터 사용 | 저작권 기준 | 저작권 체크리스트 | `/checklist/copyright` |
| 반려 문의, 검수 기간 | 문의 경로와 기간 안내 | 검수 반려 문의 | `/guide/faq` |
| 앱 이름·카테고리·약관 동의, QR 테스트 조건 | 콘솔 등록 규칙, 대표관리자 동의 | 콘솔 워크스페이스 | `/guide/operation/console-workspace` |
| 생성형 AI, 외부 앱 설치 유도, 로그인 방식 | 운영 정책 해당 절 | 운영 정책 생성형 AI | `/intro/guide` |
| 서버가 있음(CORS, 파트너 API) | 허용 origin 표(SDK 버전별), mTLS | 서버 API 이용하기 | `/documentation/integration/server-api` |
| 사용자 식별(체크리스트 공통 절) | 식별키 발급 API와 저장, 서버에서 사용자 확인(인증 코드 교환) | 사용자 식별키 | `/guide/authentication/anon-key`, `/guide/authentication/anonymous-key-auth-code`, `/api/user-key` |
| 토스 로그인 | 로그인이 꼭 필요한지(식별키로 되는 기능인지) | 토스 로그인 | `/guide/authentication/intro` |
| 인앱 결제를 기기에서 시험 | 과금 여부, 샌드박스 제공 여부(SDK 버전별) | 인앱 결제 테스트 | `/guide/monetization/in-app-payment`, `/development/test/sandbox`, `/guide/operation/toss` |
| SDK 3.x 프로젝트 | 2.x와 달라진 설정·API | SDK 3.x | `/documentation/sdk/v3`, `/documentation/integration/sdk-3.x` |
| 출시 뒤 노출 | 노출 단계와 기준(시한 있는 공지가 있다) | 미니앱 노출 | `/guide/exposure` |
| 핵심 지표 | 전환 지표 등록(MCP 도구가 없어 사용자가 콘솔 웹에서 한다) | 핵심 지표 | `/guide/analytics/conversion-metrics` |
| SDK 버전별 변경 | 최근 변경 | 릴리즈 노트 | `/release-note` |

- 같은 내용이 여러 페이지에 다르게 적혀 있으면 더 구체적인 쪽(표, API 레퍼런스)을
  기준으로 삼고, 다른 서술이 있다는 사실을 함께 보고한다. CORS origin은
  서버 API 문서의 SDK 버전별 표가 기준이다.
- 문서에서 찾지 못한 것은 "문서에 없음, 확인 필요"로 적는다. 다른 페이지에서
  추측해 채우지 않는다.
