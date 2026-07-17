import { EventEmitter } from "node:events";
import { scanNetwork, type ScanResult } from "./net/discover.js";
import { applyScan, listDevices, getDeviceById, type SeenDevice, type ScanDiff } from "./db.js";
import { notifyNewDevice, isNtfyConfigured } from "./notify.js";

export interface ScanSummary {
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  cidr: string;
  iface: string;
  hostCount: number;
  diff: ScanDiff;
}

/** Emits: "scan:start", "scan:done" (ScanSummary), "scan:error" (Error). */
export const scanBus = new EventEmitter();

let scanning = false;
let lastSummary: ScanSummary | null = null;

export function isScanning(): boolean {
  return scanning;
}
export function getLastSummary(): ScanSummary | null {
  return lastSummary;
}

function toSeen(result: ScanResult): SeenDevice[] {
  return result.hosts.map((h) => {
    const id = h.mac ? h.mac : `ip:${h.ip}`;
    return {
      id,
      mac: h.mac,
      ip: h.ip,
      hostname: h.hostname,
      vendor: h.vendor,
      os_guess: h.osGuess,
      is_gateway: h.ip === result.net.gateway,
      is_self: h.ip === result.net.ip,
      randomized: h.randomizedMac,
    };
  });
}

/** Run one scan, persist results, emit events. Guards against concurrent runs. */
export async function runScan(): Promise<ScanSummary> {
  if (scanning) {
    throw new Error("A scan is already in progress");
  }
  scanning = true;
  scanBus.emit("scan:start", { at: Date.now() });
  try {
    // If the DB is empty this is the very first scan — treat everything as a
    // baseline and don't fire a notification storm for pre-existing devices.
    const isBaseline = listDevices().length === 0;

    const result = await scanNetwork();
    const now = result.finishedAt;
    const diff = applyScan(toSeen(result), now);

    if (!isBaseline && isNtfyConfigured() && diff.newDevices.length) {
      for (const id of diff.newDevices) {
        const dev = getDeviceById(id);
        if (dev) void notifyNewDevice(dev);
      }
    }
    const summary: ScanSummary = {
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
      durationMs: result.durationMs,
      cidr: result.net.cidr,
      iface: result.net.iface,
      hostCount: result.hosts.length,
      diff,
    };
    lastSummary = summary;
    scanBus.emit("scan:done", summary);
    return summary;
  } catch (err) {
    scanBus.emit("scan:error", err);
    throw err;
  } finally {
    scanning = false;
  }
}

let timer: NodeJS.Timeout | null = null;

/** Start periodic scanning every `intervalMs`, running one immediately. */
export function startAutoScan(intervalMs: number): void {
  if (timer) clearInterval(timer);
  void runScan().catch((e) => console.error("[scan] initial scan failed:", e.message));
  timer = setInterval(() => {
    if (!scanning) {
      void runScan().catch((e) => console.error("[scan] periodic scan failed:", e.message));
    }
  }, intervalMs);
}
