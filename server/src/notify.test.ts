import { test } from "node:test";
import assert from "node:assert/strict";
import { headerSafe } from "./notify.js";

test("strips emoji so header encoding can't throw", () => {
  // The exact case that silently killed every notification: an emoji title.
  assert.equal(headerSafe("Polaris test notification 🛰️"), "Polaris test notification");
  assert.equal(headerSafe("New device: Chad's 📱"), "New device: Chad's");
});

test("keeps ordinary and accented Latin-1 text", () => {
  assert.equal(headerSafe("New device on your network: eero router"), "New device on your network: eero router");
  assert.equal(headerSafe("Café Printer"), "Café Printer");
});

test("drops control characters to prevent header injection", () => {
  // A hostile mDNS name must not be able to inject extra headers.
  assert.equal(headerSafe("Evil\r\nX-Injected: 1"), "EvilX-Injected: 1");
  assert.equal(headerSafe("tab\there"), "tabhere");
});
