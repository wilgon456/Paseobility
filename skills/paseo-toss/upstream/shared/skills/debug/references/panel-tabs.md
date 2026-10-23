# devtools floating panel — 탭별 관찰 지점 (환경 1)

`/ait:debug`가 환경 1(로컬 브라우저)에서 devtools floating panel을 안내할 때, 증상별로 어느 탭을 봐야 하는지의 상세 매핑이다.

| 증상 | 탭 | 확인할 것 |
|---|---|---|
| 권한 dialog/거부 동작 | Permissions | 권한 grant/deny 토글, 거부 시 앱 분기 |
| 위치 관련 | Location | mock 좌표 주입 후 앱 반응 |
| 결제 / 인앱구매 | IAP | 상품 mock, 구매 성공/실패 시뮬 |
| 광고 | Ads | 로드/노출/보상 콜백 |
| 뒤로가기 / 홈 / lifecycle | Events | Trigger Back/Home → 앱이 이벤트를 받는지 |
| 분석 이벤트 | Analytics | `logEvent` 호출 로그 |
| 스토리지 | Storage | setItem/getItem 왕복 (`__ait_storage:` prefix) |
| device API 모드 | Device / Environment | mock / web / prompt 모드 전환 |
| 모바일 뷰포트 | Viewport | iPhone/Galaxy 프리셋 + orientation |

패널이 안 보이면 진입점(`main.ts`/`index.ts`)에 아래가 있는지 확인:

```ts
import '@apps-in-toss/devtools/panel';
```

(unplugin이 자동 주입하지만, rolldown/Vite 8 환경에서는 명시 import이 안전.)
