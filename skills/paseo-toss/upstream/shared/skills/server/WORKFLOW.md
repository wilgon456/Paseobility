---
name: server
description: |
  Write or review the server side of an Apps in Toss mini-app: any backend
  that stores per-user data or calls the Apps in Toss partner API (Toss
  login token exchange, anonymous-key exchange, other partner calls), on
  Cloudflare Workers, Node, a BaaS (Supabase, Firebase) or any other hosting.
  Use it right away, before writing server code, for "서버에 저장해서 다른
  기기에서도 보이게 해줘", "서버 붙여줘", "Supabase·Firebase에 내 기록
  저장해줘", "Workers로 서버 만들어줘", "토스 로그인 붙여줘" (even
  client side only — login needs console setup and a server exchange),
  "서버에서 사용자 구분은 어떻게 해?", or "getAnonymousKey 값을 서버에서
  그대로 써도 돼?" — even when the user only names the feature. It decides how the server
  identifies users (anonymous-key exchange vs Toss login), wires mTLS for
  partner API calls, parses the resultType envelope and sets exact CORS
  origins, then writes or fixes the code. Keeps the user's chosen hosting.
  Deploys only when asked; no console calls. Client screens are `/ait:design`; phone
  testing is `/ait:test-on-device`. Triggered by `/ait:server [request]`.
argument-hint: '[request]'
---

# server skill

## 목적

미니앱이 쓰는 서버 코드를 쓰거나 고칠 때 앱인토스 고유의 판단과 연결부를 맡는다.
사용자별 저장, 파트너 API 호출(토스 로그인 토큰 교환, 익명 식별키 교환 등)이
대상이다. 프레임워크 템플릿을 새로 깔지 않고, 사용자가 고른 호스팅과 기존 코드를
따른다. 사실(경로, 스키마, 허용 origin)은 docs MCP로 읽는 개발자센터 문서가
정본이고, 이 skill은 판단 기준과 점검 순서를 더한다.

## 실행 순서

### 0. 범위 확인

작업 디렉터리부터 읽는다(클라이언트 `package.json`의 web-framework 버전, 서버
디렉터리, `wrangler.jsonc`·`wrangler.toml` 같은 호스팅 설정). 서버가 아직 없고
사용자가 호스팅을 정하지 않았으면 무엇으로 할지 한 번 묻는다. 사용자가 이미 고른
호스팅을 다른 것으로 바꾸자고 먼저 제안하지 않는다.

### 1. 기준 읽기

`../launch/references/server-runtime.md`를 처음부터 끝까지 `Read`로 읽는다.
서버 코드를 한 줄이라도 쓰기 전에 읽는다. 사용자 식별, mTLS 인증서, Workers 경로,
응답 봉투, CORS, 로컬 검증 기준이 모두 거기 있다. 경로와 스키마는 그 문서가
가리키는 docs 페이지를 getPage로 읽어 맞춘다.

### 2. 사용자 식별 정하기

- 개인정보가 필요 없는 사용자별 저장이면 익명 식별키 교환을 먼저 제안한다.
  클라이언트 `User.createAnonymousKeyAuthCode()` → 서버의 교환 API → `success.anonKey`.
- 사용자가 토스 로그인을 콕 집었으면 따르되, 콘솔에서 토스 로그인 등록과 약관
  설정이 먼저 돼 있어야 한다고 알린다(등록 전에는 토큰 발급이 errorCode 4050으로
  실패한다). 클라이언트 쪽만 요청받아도 이 선행 조건과, 받은 인가 코드를 서버가
  토큰으로 바꿔야 한다는 점을 함께 말한다.
- 클라이언트가 `getAnonymousKey()`로 얻은 값을 서버가 그대로 믿게 짜지 않는다.
  사용자가 그렇게 해 달라고 해도 이유(그 값은 요청자를 증명하지 않는다)를 말하고
  교환 방식으로 짠다.
- 사용자가 Supabase·Firebase를 골랐으면 사용자별 데이터는 서버를 거치게 하고, 클라이언트
  직결은 공용 데이터에만 쓴다. secret key는 서버에만 두고 `supabase.auth` 같은 자체
  로그인은 붙이지 않는다. 자세한 경계는 server-runtime.md의 BaaS 절.

### 3. 코드 쓰기·고치기

server-runtime.md의 기준대로 쓴다. 최소한 다음을 지킨다.

- 파트너 API 호출에는 mTLS 클라이언트 인증서를 싣는다. Workers는
  `mtls_certificates` 바인딩과 `env.<BINDING>.fetch`.
- 성공 판정은 HTTP 상태가 아니라 `resultType`이고, 데이터는 `success` 안에 있다.
- CORS는 `*`가 아니라 앱의 SDK 버전에 맞는 정확한 origin만 허용한다.
- 인증서·키·토큰 값은 코드, 커밋, 로그, 응답에 넣지 않는다. 경로와 바인딩 이름만
  다룬다.
- 로컬 검증은 가짜 mTLS fetch로 봉투 경우를 돌린다. 로그인 우회 플래그를 두지 않는다.

### 4. 보고

사용자가 직접 해야 할 일을 빠뜨리지 않는다: 콘솔에서 mTLS 인증서 발급, 호스팅
로그인(`! npx wrangler login` 등), 배포 후 클라이언트 서버 주소 갱신과 재빌드.

```
서버 작업 결과
  식별 방식: <익명 식별키 교환 | 토스 로그인>
  확인한 것: <로컬 테스트·봉투 경우>
  사용자가 할 일: <인증서 발급, 로그인, 배포 등>

다음 단계
  /ait:test-on-device   # 서버 주소로 다시 빌드한 번들을 폰에서 확인
                        #   말로: "만든 미니앱을 실제 토스 앱에서 돌려보고 싶어. 번들 올려서 폰에서 확인하게 해줘"
  /ait:launch           # 출시 전 점검
                        #   말로: "검수 넣기 전에 한번 봐줘"

문서가 필요하면 docs MCP(searchDocumentation/getPage)로 조회하세요.
```

## Out of scope (이 skill이 하지 않는 것)

- ❌ 사용자가 요청하지 않은 배포(`wrangler deploy` 등), 콘솔 쓰기
- ❌ mTLS 인증서 발급(콘솔에서 사용자가 한다), 인증서·키 파일 내용 읽기나 출력
- ❌ 화면 작업(`/ait:design`), 검수 점검(`/ait:launch`)
- ❌ 확인하지 못한 런타임의 mTLS 지원 여부 단정

## 참고

- `../launch/references/server-runtime.md`: 서버 연결 기준(식별, mTLS, Workers,
  응답 봉투, CORS, 로컬 검증)
- 짝 skill: `launch`(출시 전 점검), `test-on-device`(폰 확인), `design`(화면)
