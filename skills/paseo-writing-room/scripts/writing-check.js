#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

function usage() {
  process.stdout.write(`Usage:
  writing-check.js --draft <file> [--sources <file>] [--sample <file>]
                   [--forbid <file>] [--json] [--strict]

Reports deterministic editing signals. It does not detect AI authorship.
`);
}

function parseArgs(argv) {
  const options = { json: false, strict: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (["--draft", "--sources", "--sample", "--forbid"].includes(arg)) {
      const value = argv[index + 1];
      if (!value) throw new Error(`${arg} requires a file path`);
      options[arg.slice(2)] = value;
      index += 1;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--strict") {
      options.strict = true;
    } else if (arg === "-h" || arg === "--help") {
      options.help = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function words(text) {
  return text.match(/[\p{L}\p{N}]+/gu) || [];
}

function cleanText(text) {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!?\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function paragraphs(text) {
  return text
    .split(/\n\s*\n/)
    .map((item) => cleanText(item))
    .filter((item) => item.length >= 20);
}

function sentences(text) {
  const cleaned = cleanText(text);
  return (cleaned.match(/[^.!?。！？]+[.!?。！？]?/g) || [])
    .map((item) => item.trim())
    .filter((item) => words(item).length >= 2);
}

function coefficientOfVariation(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  return Math.sqrt(variance) / mean;
}

function lineNumber(text, index) {
  return text.slice(0, index).split("\n").length;
}

function extractUrls(text) {
  const matches = text.match(/https?:\/\/[^\s)>\]}"']+/g) || [];
  return [...new Set(matches.map((url) => url.replace(/[.,;:!?]+$/, "")))];
}

function openingKey(text, count) {
  return words(text.toLowerCase()).slice(0, count).join(" ");
}

function repeatedOpenings(items, count) {
  const grouped = new Map();
  items.forEach((item, index) => {
    const key = openingKey(item, count);
    if (!key) return;
    const entries = grouped.get(key) || [];
    entries.push(index + 1);
    grouped.set(key, entries);
  });
  return [...grouped.entries()]
    .filter(([, positions]) => positions.length > 1)
    .map(([key, positions]) => ({ key, positions }));
}

function styleStats(text) {
  const paragraphList = paragraphs(text);
  const sentenceList = sentences(text);
  const sentenceLengths = sentenceList.map((item) => words(item).length);
  const paragraphLengths = paragraphList.map((item) => words(item).length);
  const wordCount = words(cleanText(text)).length;
  return {
    characters: text.length,
    words: wordCount,
    paragraphs: paragraphList.length,
    sentences: sentenceList.length,
    averageSentenceWords: sentenceLengths.length
      ? Number((sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length).toFixed(2))
      : 0,
    sentenceLengthCv: Number(coefficientOfVariation(sentenceLengths).toFixed(3)),
    averageParagraphWords: paragraphLengths.length
      ? Number((paragraphLengths.reduce((a, b) => a + b, 0) / paragraphLengths.length).toFixed(2))
      : 0,
    paragraphLengthCv: Number(coefficientOfVariation(paragraphLengths).toFixed(3)),
  };
}

function addPatternFindings(text, findings) {
  const patterns = [
    ["generic-opening", "warning", /오늘날(?:의)?\s|현대 사회에서|빠르게 변화하는 (?:시대|환경)|in today'?s (?:rapidly )?(?:changing|evolving)/giu],
    ["inflated-importance", "warning", /매우 중요한 역할|중요하다고 할 수 (?:있다|있습니다)|it is (?:important|crucial|essential) to (?:note|remember)/giu],
    ["formulaic-conclusion", "info", /결론적으로|종합해 ?보면|in conclusion|to sum up/giu],
    ["placeholder", "error", /\[(?:TODO|TBD|PLACEHOLDER)[^\]]*\]|\{\{[^}]+\}\}|<[^>]*(?:입력|작성|insert|replace|placeholder)[^>]*>/giu],
  ];

  for (const [id, severity, pattern] of patterns) {
    for (const match of text.matchAll(pattern)) {
      findings.push({
        id,
        severity,
        line: lineNumber(text, match.index),
        evidence: match[0],
        message: id === "placeholder"
          ? "Resolve or explicitly retain this placeholder before finalization."
          : "Review this phrase for generic or formulaic wording in context.",
      });
    }
  }
}

function addForbiddenFindings(text, forbiddenText, findings) {
  if (!forbiddenText) return;
  const phrases = forbiddenText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  for (const phrase of phrases) {
    const index = text.toLowerCase().indexOf(phrase.toLowerCase());
    if (index >= 0) {
      findings.push({
        id: "forbidden-phrase",
        severity: "error",
        line: lineNumber(text, index),
        evidence: phrase,
        message: "Draft contains a user-defined forbidden phrase.",
      });
    }
  }
}

function addRhythmFindings(text, stats, findings) {
  const paragraphList = paragraphs(text);
  const sentenceList = sentences(text);
  for (const repeated of repeatedOpenings(paragraphList, 4)) {
    findings.push({
      id: "repeated-paragraph-opening",
      severity: "warning",
      evidence: repeated.key,
      positions: repeated.positions,
      message: "Multiple paragraphs begin with the same four-word pattern.",
    });
  }
  for (const repeated of repeatedOpenings(sentenceList, 3)) {
    if (repeated.positions.length < 3) continue;
    findings.push({
      id: "repeated-sentence-opening",
      severity: "warning",
      evidence: repeated.key,
      positions: repeated.positions,
      message: "Three or more sentences begin with the same three-word pattern.",
    });
  }
  if (stats.paragraphs >= 6 && stats.paragraphLengthCv < 0.18) {
    findings.push({
      id: "uniform-paragraph-rhythm",
      severity: "info",
      evidence: `cv=${stats.paragraphLengthCv}`,
      message: "Paragraph lengths are unusually uniform; inspect whether the rhythm feels mechanical.",
    });
  }
  if (stats.sentences >= 10 && stats.sentenceLengthCv < 0.25) {
    findings.push({
      id: "uniform-sentence-rhythm",
      severity: "info",
      evidence: `cv=${stats.sentenceLengthCv}`,
      message: "Sentence lengths are unusually uniform; read aloud before changing anything.",
    });
  }
}

function matchedSignals(text, pattern) {
  return [...text.matchAll(pattern)].map((match) => ({
    evidence: match[0],
    line: lineNumber(text, match.index),
  }));
}

function addKoreanClarityFindings(text, findings) {
  const paragraphList = paragraphs(text);
  const antithesis = matchedSignals(text, /(?:아니라|아니다|아닌\s+(?:것|셈|이유))/gu);
  if (antithesis.length >= 3) {
    findings.push({
      id: "repeated-korean-antithesis",
      severity: "warning",
      count: antithesis.length,
      lines: antithesis.map((item) => item.line),
      evidence: antithesis.slice(0, 4).map((item) => item.evidence).join(" | "),
      message: "Negation or A-not-B rhetoric repeats; verify that each instance adds meaning instead of acting as a slogan scaffold.",
    });
  }

  const vagueReferents = matchedSignals(
    text,
    /(?:그쪽|이쪽|저쪽|어떤\s+쪽|같은\s+줄기|그런\s+식|같은\s+이야기)/gu,
  );
  if (vagueReferents.length >= 2) {
    findings.push({
      id: "vague-korean-referent",
      severity: "warning",
      count: vagueReferents.length,
      lines: vagueReferents.map((item) => item.line),
      evidence: vagueReferents.slice(0, 4).map((item) => item.evidence).join(" | "),
      message: "Several shorthand referents may force the reader to guess the subject; name the actor, model, source, or idea when needed.",
    });
  }

  const vagueSources = matchedSignals(
    text,
    /(?:(?:한|어떤|앞선|위의)\s*(?:글|자료|정리)(?:에서|에\s*따르면|처럼)?|[\p{L}\p{N}]+\s*쪽\s*(?:글|자료|정리)(?:에서|에\s*따르면|처럼)?)/gu,
  );
  for (const signal of vagueSources) {
    findings.push({
      id: "vague-source-attribution",
      severity: "warning",
      line: signal.line,
      evidence: signal.evidence,
      message: "A source-dependent statement uses an unnamed or indirect attribution; identify or cite the source precisely.",
    });
  }

  const transitions = matchedSignals(
    text,
    /(?:여기서\s+중요한\s+(?:건|것은)|반대로|다시\s+[^.!?\n]{0,30}(?:돌아오면|돌아가면)|정리하면|결국|같은\s+줄기)/gu,
  );
  if (transitions.length >= 4) {
    findings.push({
      id: "transition-scaffold-density",
      severity: "info",
      count: transitions.length,
      lines: transitions.map((item) => item.line),
      evidence: transitions.slice(0, 5).map((item) => item.evidence).join(" | "),
      message: "Turn-signaling phrases are dense; verify that each transition introduces a concrete relation or new information.",
    });
  }

  const shortBeats = paragraphList.filter((paragraph) => {
    const sentenceCount = sentences(paragraph).length;
    return sentenceCount <= 2 && words(paragraph).length <= 35 && paragraph.length <= 180;
  });
  if (paragraphList.length >= 8 && shortBeats.length / paragraphList.length >= 0.6) {
    findings.push({
      id: "mechanical-short-paragraph-rhythm",
      severity: "info",
      evidence: `${shortBeats.length}/${paragraphList.length} paragraphs`,
      message: "Most paragraphs are similar short beats; inspect whether the cadence feels intentionally varied or mechanically segmented.",
    });
  }
}

function addSourceFindings(draft, sourcesText, findings) {
  if (!sourcesText) return { supplied: 0, presentInDraft: 0, absentFromDraft: [] };
  const supplied = extractUrls(sourcesText);
  const present = supplied.filter((url) => draft.includes(url));
  const absent = supplied.filter((url) => !draft.includes(url));
  for (const url of absent) {
    findings.push({
      id: "source-url-not-present",
      severity: "info",
      evidence: url,
      message: "This source URL is not literally present in the draft; verify whether citation or attribution is required.",
    });
  }
  return { supplied: supplied.length, presentInDraft: present.length, absentFromDraft: absent };
}

function addSampleComparison(stats, sampleText, findings) {
  if (!sampleText) return null;
  const sample = styleStats(sampleText);
  const comparisons = [
    ["averageSentenceWords", "sentence length"],
    ["averageParagraphWords", "paragraph length"],
  ];
  for (const [key, label] of comparisons) {
    if (!sample[key] || !stats[key]) continue;
    const ratio = stats[key] / sample[key];
    if (ratio < 0.55 || ratio > 1.8) {
      findings.push({
        id: "sample-rhythm-drift",
        severity: "info",
        evidence: `${label}: draft=${stats[key]}, sample=${sample[key]}`,
        message: "Draft rhythm differs substantially from the supplied sample; confirm that the difference is intentional.",
      });
    }
  }
  return sample;
}

function analyze({ draft, sources = "", sample = "", forbidden = "" }) {
  const findings = [];
  const stats = styleStats(draft);
  addPatternFindings(draft, findings);
  addForbiddenFindings(draft, forbidden, findings);
  addRhythmFindings(draft, stats, findings);
  addKoreanClarityFindings(draft, findings);
  const sourceCoverage = addSourceFindings(draft, sources, findings);
  const sampleStats = addSampleComparison(stats, sample, findings);
  return {
    schemaVersion: 1,
    disclaimer: "Editing signals only; not an AI-authorship detector.",
    stats,
    sampleStats,
    sourceCoverage,
    summary: {
      errors: findings.filter((item) => item.severity === "error").length,
      warnings: findings.filter((item) => item.severity === "warning").length,
      info: findings.filter((item) => item.severity === "info").length,
    },
    findings,
  };
}

function renderText(report, draftPath) {
  const lines = [
    "Paseo Writing Check",
    `draft: ${draftPath}`,
    report.disclaimer,
    `stats: ${report.stats.words} words, ${report.stats.sentences} sentences, ${report.stats.paragraphs} paragraphs`,
    `findings: ${report.summary.errors} error, ${report.summary.warnings} warning, ${report.summary.info} info`,
    "",
  ];
  if (report.findings.length === 0) {
    lines.push("No deterministic findings.");
  } else {
    for (const finding of report.findings) {
      const location = finding.line ? ` line ${finding.line}` : "";
      lines.push(`[${finding.severity}] ${finding.id}${location}: ${finding.message}`);
      if (finding.evidence) lines.push(`  evidence: ${finding.evidence}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function main(argv) {
  let options;
  try {
    options = parseArgs(argv);
    if (options.help) {
      usage();
      return 0;
    }
    if (!options.draft) throw new Error("--draft is required");
    const report = analyze({
      draft: readText(options.draft),
      sources: options.sources ? readText(options.sources) : "",
      sample: options.sample ? readText(options.sample) : "",
      forbidden: options.forbid ? readText(options.forbid) : "",
    });
    if (options.json) {
      process.stdout.write(`${JSON.stringify({ ...report, draft: path.resolve(options.draft) }, null, 2)}\n`);
    } else {
      process.stdout.write(renderText(report, options.draft));
    }
    return options.strict && report.summary.errors > 0 ? 1 : 0;
  } catch (error) {
    process.stderr.write(`error: ${error.message}\n`);
    usage();
    return 2;
  }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { analyze, parseArgs, styleStats };
