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

assert.deepEqual(parseArgs(["--draft", "draft.md", "--json", "--strict"]), {
  draft: "draft.md",
  json: true,
  strict: true,
});

process.stdout.write("writing-check tests passed\n");
