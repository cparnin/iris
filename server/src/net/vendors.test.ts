import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeMac, formatMac, isRandomizedMac, lookupVendor } from "./vendors.js";

test("normalizeMac accepts colon, dash and dot notations", () => {
  assert.equal(normalizeMac("aa:bb:cc:dd:ee:ff"), "AABBCCDDEEFF");
  assert.equal(normalizeMac("AA-BB-CC-DD-EE-FF"), "AABBCCDDEEFF");
  assert.equal(normalizeMac("aabb.ccdd.eeff"), "AABBCCDDEEFF");
});

test("normalizeMac rejects malformed input", () => {
  assert.equal(normalizeMac("aa:bb:cc"), null); // too short
  assert.equal(normalizeMac("not-a-mac"), null);
  assert.equal(normalizeMac(""), null);
});

test("formatMac renders colon notation lowercase", () => {
  assert.equal(formatMac("AABBCCDDEEFF"), "aa:bb:cc:dd:ee:ff");
});

test("isRandomizedMac detects the locally-administered bit", () => {
  assert.equal(isRandomizedMac("AABBCCDDEEFF"), true); // 0xAA & 0x02 = set
  assert.equal(isRandomizedMac("02AABBCCDDEE"), true); // 0x02 & 0x02 = set
  assert.equal(isRandomizedMac("A0BBCCDDEEFF"), false); // 0xA0 & 0x02 = clear
  assert.equal(isRandomizedMac("F4BBCCDDEEFF"), false); // real vendor OUI
});

test("lookupVendor labels an unknown randomized MAC", () => {
  assert.equal(lookupVendor("02:00:00:00:00:01"), "Private (randomized MAC)");
});

test("lookupVendor returns null for an unknown, non-randomized MAC", () => {
  assert.equal(lookupVendor("f4:00:00:00:00:01"), null);
});

test("normalizeMac handles macOS arp output with leading zeros stripped", () => {
  // `arp -an` prints 44:7:b:e5:19:84, not 44:07:0b:e5:19:84. Stripping
  // separators and requiring 12 hex chars rejected these outright, so any
  // device with a low-valued octet lost its MAC — and with it its identity.
  assert.equal(normalizeMac("44:7:b:e5:19:84"), "44070BE51984");
  assert.equal(normalizeMac("c:83:cc:18:57:fa"), "0C83CC1857FA");
  assert.equal(normalizeMac("5c:62:8b:a3:ac:0"), "5C628BA3AC00");
  assert.equal(normalizeMac("0:0:0:0:0:1"), "000000000001");
  assert.equal(normalizeMac("1:0:5e:0:0:fb"), "01005E0000FB", "multicast still parses");
});

test("normalizeMac still rejects genuinely malformed input", () => {
  assert.equal(normalizeMac("44:7:b:e5:19"), null, "only five octets");
  assert.equal(normalizeMac("44:7:b:e5:19:84:99"), null, "seven octets");
  assert.equal(normalizeMac("zz:7:b:e5:19:84"), null, "non-hex");
  assert.equal(normalizeMac("44:777:b:e5:19:84"), null, "three-digit octet");
  assert.equal(normalizeMac(""), null);
});
