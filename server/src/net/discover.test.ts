import { test } from "node:test";
import assert from "node:assert/strict";
import { inSubnet, ipToInt } from "./discover.js";
import type { NetInfo } from "./subnet.js";

const net = (ip: string, bits: number): NetInfo => ({
  iface: "en0",
  ip,
  netmaskBits: bits,
  cidr: `${ip}/${bits}`,
});

test("inSubnet works on networks whose first octet is >= 128", () => {
  // The bug this pins: `a & mask === b & mask >>> 0` only coerced the RIGHT
  // side unsigned (>>> binds tighter than ===), so `&`'s signed int32 result
  // never matched once the high bit was set. Every one of these returned false,
  // which meant ARP-known hosts that don't answer ICMP — Windows boxes with the
  // default firewall, ICMP-dropping IoT gear — were silently dropped from the
  // scan on the two most common home network layouts.
  assert.equal(inSubnet("192.168.1.55", net("192.168.1.10", 24)), true);
  assert.equal(inSubnet("172.16.3.55", net("172.16.3.10", 24)), true);
  assert.equal(inSubnet("192.168.4.200", net("192.168.4.1", 22)), true);
  assert.equal(inSubnet("10.0.0.55", net("10.0.0.10", 24)), true); // always worked
});

test("inSubnet rejects addresses outside the subnet", () => {
  assert.equal(inSubnet("192.168.2.55", net("192.168.1.10", 24)), false);
  assert.equal(inSubnet("10.0.0.55", net("192.168.1.10", 24)), false);
  assert.equal(inSubnet("192.168.8.1", net("192.168.4.1", 22)), false); // just past /22
});

test("inSubnet handles the boundary prefix lengths", () => {
  assert.equal(inSubnet("1.2.3.4", net("255.255.255.255", 0)), true, "/0 matches everything");
  assert.equal(inSubnet("192.168.1.10", net("192.168.1.10", 32)), true);
  assert.equal(inSubnet("192.168.1.11", net("192.168.1.10", 32)), false);
});

test("ipToInt is unsigned across the whole range", () => {
  assert.equal(ipToInt("0.0.0.0"), 0);
  assert.equal(ipToInt("192.168.1.1"), 3232235777);
  assert.equal(ipToInt("255.255.255.255"), 4294967295, "must not come back negative");
});
