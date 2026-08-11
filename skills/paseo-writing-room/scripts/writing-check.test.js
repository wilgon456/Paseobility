#!/usr/bin/env node

const assert = require("node:assert/strict");
const { analyze, parseArgs } = require("./writing-check.js");

const draft = `오늘날 빠르게 변화하는 시대에 글쓰기는 중요합니다.

우리는 이 생각을 설명하며 먼저 출발합니다. 이것은 짧은 문장입니다.

우리는 이 생각을 설명하며 다시 돌아옵니다. 이것은 짧은 문장입니다.

우리는 이 생각을 설명하며 마지막에 멈춥니다. [TODO: 실제 사례]

참고: https://example.com/used
`;

const report = analyze({
  draft,
  sources: "https://example.com/used\nhttps://example.com/missing\n",
  sample: "나는 길게 생각한 뒤 짧게 쓴다. 가끔은 한 문단을 오래 끌고 간다. 하지만 다음 문장은 짧다.",
  forbidden: "중요합니다\n",
});

const ids = new Set(report.findings.map((item) => item.id));
assert.equal(report.sourceCoverage.supplied, 2);
assert.equal(report.sourceCoverage.presentInDraft, 1);
assert(ids.has("generic-opening"));
assert(ids.has("placeholder"));
assert(ids.has("forbidden-phrase"));
assert(ids.has("source-url-not-present"));
assert(ids.has("repeated-paragraph-opening"));
assert.equal(report.summary.errors, 2);

const koreanMechanicalDraft = `도구를 더 쓰는 일은 채팅 창을 계속 늘리는 일이 아니다.

어떤 쪽은 긴 글에 강하고 그쪽은 복잡한 코드를 맡는다고 말한다.

한 글에서 여러 도구를 역할별로 나눠야 한다는 비슷한 이야기를 했다.

여기서 중요한 건 단순히 구독한 서비스의 숫자를 세는 일이 아니다.

반대로 하나의 서비스만 고집하는 선택도 언제나 정답인 것은 아니다.

다시 여러 서비스를 구독하는 이야기로 돌아오면 역할 분담이 보인다.

같은 줄기에서 매달 지출해야 하는 비용과 사용량 이야기도 자연스럽게 나온다.

정리하면 중요한 것은 도구의 수가 아니라 각 도구에 맡길 역할의 문제다.`;

const koreanReport = analyze({ draft: koreanMechanicalDraft });
const koreanIds = new Set(koreanReport.findings.map((item) => item.id));
assert(koreanIds.has("repeated-korean-antithesis"));
assert(koreanIds.has("vague-korean-referent"));
assert(koreanIds.has("vague-source-attribution"));
assert(koreanIds.has("transition-scaffold-density"));
assert(koreanIds.has("mechanical-short-paragraph-rhythm"));

const staccatoDraft = `지금은 서비스를 역할별로 나눠 쓴다. 일상 업무에는 Grok을 쓴다. 속도가 빠르다. 이미지 제작에도 자주 쓴다. 긴 판단은 다른 도구에 맡긴다.`;
const staccatoReport = analyze({ draft: staccatoDraft });
const staccatoIds = new Set(staccatoReport.findings.map((item) => item.id));
assert(staccatoIds.has("staccato-short-sentence-run"));

assert.deepEqual(parseArgs(["--draft", "draft.md", "--json", "--strict"]), {
  draft: "draft.md",
  json: true,
  strict: true,
});

process.stdout.write("writing-check tests passed\n");
