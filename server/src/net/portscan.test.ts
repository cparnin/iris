import { test } from "node:test";
import assert from "node:assert/strict";
import { riskFor } from "./portscan.js";

test("flags classic remote-access exposures", () => {
  assert.match(riskFor(23, "telnet") ?? "", /Telnet/);
  assert.match(riskFor(3389, null) ?? "", /RDP/);
  assert.match(riskFor(5900, null) ?? "", /VNC/);
  assert.match(riskFor(2375, null) ?? "", /Docker/);
});

test("flags file sharing and transfer", () => {
  assert.match(riskFor(445, "microsoft-ds") ?? "", /SMB/);
  assert.match(riskFor(21, "ftp") ?? "", /FTP/);
  assert.match(riskFor(2049, null) ?? "", /NFS/);
});

test("flags unauthenticated printing", () => {
  assert.match(riskFor(9100, "jetdirect") ?? "", /JetDirect/);
  assert.match(riskFor(515, "printer") ?? "", /LPD/);
});

test("flags IoT management surfaces", () => {
  assert.match(riskFor(1900, null) ?? "", /UPnP/);
  assert.match(riskFor(161, "snmp") ?? "", /SNMP/);
  assert.match(riskFor(1883, null) ?? "", /MQTT/);
  assert.match(riskFor(554, "rtsp") ?? "", /RTSP/);
});

test("flags exposed data stores by name", () => {
  assert.match(riskFor(6379, null) ?? "", /Redis/);
  assert.match(riskFor(27017, null) ?? "", /MongoDB/);
  assert.match(riskFor(3306, null) ?? "", /MySQL/);
});

test("does NOT flag ports that are normal on consumer gear", () => {
  // Chromecast / Google Cast
  for (const p of [8008, 8009, 8443, 9000, 10001, 10010]) {
    assert.equal(riskFor(p, "http"), null, `port ${p} should not be flagged`);
  }
  assert.equal(riskFor(80, "http"), null);
  assert.equal(riskFor(443, "ssl/https"), null);
  assert.equal(riskFor(631, "ipp"), null); // modern IPP printing is fine
  assert.equal(riskFor(22, "ssh"), null); // encrypted, expected on servers/NAS
  assert.equal(riskFor(53, "domain"), null);
  assert.equal(riskFor(9999, "abyss"), null); // TP-Link Kasa control port
});
