import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnv } from "./env.js";

test("loads KEY=VALUE pairs, skipping comments and blanks", () => {
  const dir = mkdtempSync(join(tmpdir(), "polaris-env-"));
  const file = join(dir, ".env");
  try {
    writeFileSync(
      file,
      ["# a comment", "", "NTFY_URL=https://ntfy.sh/topic-abc", 'ISP_NAME="Frontier"', "BARE=  spaced  "].join("\n")
    );
    process.env.POLARIS_ENV_FILE = file;
    delete process.env.NTFY_URL;
    delete process.env.ISP_NAME;
    delete process.env.BARE;

    loadEnv();

    assert.equal(process.env.NTFY_URL, "https://ntfy.sh/topic-abc");
    assert.equal(process.env.ISP_NAME, "Frontier", "surrounding quotes are stripped");
    assert.equal(process.env.BARE, "spaced");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.POLARIS_ENV_FILE;
    delete process.env.NTFY_URL;
    delete process.env.ISP_NAME;
    delete process.env.BARE;
  }
});

test("a real environment variable wins over the file", () => {
  const dir = mkdtempSync(join(tmpdir(), "polaris-env-"));
  const file = join(dir, ".env");
  try {
    writeFileSync(file, "NTFY_URL=from-file");
    process.env.POLARIS_ENV_FILE = file;
    process.env.NTFY_URL = "from-shell";

    loadEnv();

    assert.equal(process.env.NTFY_URL, "from-shell");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.POLARIS_ENV_FILE;
    delete process.env.NTFY_URL;
  }
});

test("a missing .env is not fatal", () => {
  process.env.POLARIS_ENV_FILE = join(tmpdir(), "definitely-not-here-polaris", ".env");
  assert.doesNotThrow(() => loadEnv());
  delete process.env.POLARIS_ENV_FILE;
});
