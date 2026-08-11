"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  MAX_BYTES,
  resolveWithin,
  sha256,
  validateArtifactMetadata,
  validateFetchedPayload,
  validatePortableFileName
} = require("./paseo-share.js");

function fixture(t) {
  const checkoutPath = fs.mkdtempSync(path.join(os.tmpdir(), "paseo-share-security-"));
  t.after(() => fs.rmSync(checkoutPath, { recursive: true, force: true }));
  const config = {
    checkoutPath,
    machine: "machine-a",
    maxBytes: MAX_BYTES
  };
  const createdAt = "2026-08-11T03:24:01.000Z";
  const id = "psh_20260811T032401Z_16d876";
  const name = "result.txt";
  const relativePath = `artifacts/machine-a/2026/08/${id}/${name}`;
  const payloadPath = resolveWithin(checkoutPath, relativePath, "test payload path");
  fs.mkdirSync(path.dirname(payloadPath), { recursive: true });
  fs.writeFileSync(payloadPath, "hello from paseo share\n");
  const metadata = {
    version: 1,
    id,
    name,
    machine: "machine-a",
    createdAt,
    size: fs.statSync(payloadPath).size,
    sha256: sha256(payloadPath),
    note: "test",
    relativePath
  };
  const metadataPath = path.join(path.dirname(payloadPath), "artifact.json");
  fs.writeFileSync(metadataPath, `${JSON.stringify(metadata)}\n`);
  return { checkoutPath, config, metadata, metadataPath, payloadPath };
}

test("accepts a valid artifact and verifies its payload", (t) => {
  const value = fixture(t);
  assert.equal(validateArtifactMetadata(value.metadata, value.config, value.metadataPath), value.metadata);
  assert.equal(validateFetchedPayload(value.payloadPath, value.metadata, value.config).stat.isFile(), true);
});

test("rejects traversal and absolute artifact paths", (t) => {
  const value = fixture(t);
  assert.throws(
    () => resolveWithin(value.checkoutPath, "../../outside.txt", "artifact relative path"),
    /unsafe path segment|escapes/
  );
  assert.throws(
    () => resolveWithin(value.checkoutPath, "/absolute.txt", "artifact relative path"),
    /cannot be absolute/
  );
  assert.throws(
    () => resolveWithin(value.checkoutPath, "artifacts\\outside.txt", "artifact relative path"),
    /forward slashes/
  );
});

test("rejects metadata whose path fields do not agree", (t) => {
  const value = fixture(t);
  assert.throws(
    () => validateArtifactMetadata(
      { ...value.metadata, relativePath: "artifacts/machine-a/2026/08/psh_20260811T032401Z_16d876/other.txt" },
      value.config,
      value.metadataPath
    ),
    /does not match/
  );
  assert.throws(
    () => validateArtifactMetadata(value.metadata, value.config, path.join(value.checkoutPath, "artifact.json")),
    /outside its declared artifact directory/
  );
});

test("rejects traversal, control characters, and Windows reserved filenames", () => {
  for (const unsafeName of ["../secret.txt", "folder/file.txt", "folder\\file.txt", "bad\nname.txt", "CON.txt", "trail. "]) {
    assert.throws(() => validatePortableFileName(unsafeName));
  }
  assert.equal(validatePortableFileName("한글-result_01.txt"), "한글-result_01.txt");
});

test("rejects payload size and checksum tampering", (t) => {
  const value = fixture(t);
  assert.throws(
    () => validateFetchedPayload(value.payloadPath, { ...value.metadata, size: value.metadata.size + 1 }, value.config),
    /does not match metadata/
  );
  fs.writeFileSync(value.payloadPath, "jello from paseo share\n");
  assert.equal(fs.statSync(value.payloadPath).size, value.metadata.size);
  assert.throws(
    () => validateFetchedPayload(value.payloadPath, value.metadata, value.config),
    /does not match metadata/
  );
});

test("accepts a legacy CRLF hash and reconstructs the original bytes", (t) => {
  const value = fixture(t);
  const crlf = Buffer.from(fs.readFileSync(value.payloadPath, "utf8").replace(/\r?\n/g, "\r\n"));
  const legacyMetadata = {
    ...value.metadata,
    size: crlf.length,
    sha256: crypto.createHash("sha256").update(crlf).digest("hex")
  };
  const verified = validateFetchedPayload(value.payloadPath, legacyMetadata, value.config);
  assert.equal(verified.legacyLineEndings, true);
  assert.deepEqual(verified.buffer, crlf);
});

test("rejects a symbolic-link payload", (t) => {
  const value = fixture(t);
  const externalPath = path.join(value.checkoutPath, "outside.txt");
  fs.writeFileSync(externalPath, "hello from paseo share\n");
  fs.unlinkSync(value.payloadPath);
  try {
    fs.symlinkSync(externalPath, value.payloadPath, "file");
  } catch (error) {
    if (process.platform === "win32" && ["EPERM", "EACCES"].includes(error.code)) {
      t.skip("Windows symlink creation is not permitted in this environment");
      return;
    }
    throw error;
  }
  assert.throws(
    () => validateFetchedPayload(value.payloadPath, value.metadata, value.config),
    /symbolic link/
  );
});
