import { test } from "node:test";
import assert from "node:assert/strict";
import { headerSafe, buildNewDeviceAlert } from "./notify.js";
import type { DeviceRow } from "./db.js";
import type { PortScanResult } from "./net/portscan.js";

function device(over: Partial<DeviceRow> = {}): DeviceRow {
  return {
    id: "aa:bb:cc:dd:ee:ff", mac: "aa:bb:cc:dd:ee:ff", ip: "192.168.4.61",
    hostname: "guest-phone", vendor: "Apple", os_guess: null, label: null,
    trusted: 0, is_gateway: 0, is_self: 0, randomized: 0, online: 1,
    first_seen: 0, last_seen: 0, open_ports: null, risk_count: null,
    last_portscan_at: null, ...over,
  };
}

function scanResult(over: Partial<PortScanResult> = {}): PortScanResult {
  return {
    available: true, scanned: true, ip: "192.168.4.61", scannedAt: 0,
    durationMs: 100, ports: [], risks: [], message: null, ...over,
  };
}

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

test("new-device alert without a scan keeps the plain headline", () => {
  const a = buildNewDeviceAlert(device());
  assert.match(a.title, /^New device on your network: guest-phone$/);
  assert.equal(a.priority, "high");
  assert.match(a.message, /192\.168\.4\.61/);
});

test("new-device alert reports the open ports it found", () => {
  const a = buildNewDeviceAlert(
    device(),
    scanResult({
      ports: [
        { port: 80, proto: "tcp", service: "http", product: null, risk: null },
        { port: 443, proto: "tcp", service: "https", product: null, risk: null },
      ],
    })
  );
  assert.match(a.message, /Open ports: 80, 443/);
  assert.equal(a.priority, "high", "no risks → not urgent");
});

test("new-device alert leads with the exposure count and escalates priority", () => {
  const a = buildNewDeviceAlert(
    device({ hostname: "sketchy-nas" }),
    scanResult({
      ports: [{ port: 23, proto: "tcp", service: "telnet", product: null, risk: "Telnet — unencrypted remote login, should not be open" }],
      risks: ["Telnet — unencrypted remote login, should not be open", "SMB/Windows file sharing exposed"],
    })
  );
  assert.match(a.title, /New device \(2 risky ports\): sketchy-nas/);
  assert.equal(a.priority, "urgent");
  assert.match(a.message, /Telnet/);
  assert.match(a.message, /SMB/);
});

test("a clean scan says so explicitly", () => {
  const a = buildNewDeviceAlert(device(), scanResult({ ports: [], risks: [] }));
  assert.match(a.message, /No open ports found/);
});
