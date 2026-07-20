import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The DB module renames a legacy database file to polaris.sqlite on first load
 * so device history survives a rebrand. We exercise that by pointing
 * POLARIS_DATA_DIR at a temp dir seeded with an (empty, therefore valid) legacy
 * iris.sqlite, then importing the module and asserting the rename happened.
 */
test("migrates a legacy iris.sqlite to polaris.sqlite on load", async () => {
  const dir = mkdtempSync(join(tmpdir(), "polaris-db-"));
  try {
    writeFileSync(join(dir, "iris.sqlite"), ""); // empty file = fresh valid sqlite
    process.env.POLARIS_DATA_DIR = dir;

    await import("./db.js"); // side effect: runs the migration + opens the DB

    assert.ok(existsSync(join(dir, "polaris.sqlite")), "polaris.sqlite should exist");
    assert.ok(!existsSync(join(dir, "iris.sqlite")), "legacy iris.sqlite should be gone");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.POLARIS_DATA_DIR;
  }
});
