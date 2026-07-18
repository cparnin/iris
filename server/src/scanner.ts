import { EventEmitter } from "node:events";
import { scanNetwork, type ScanResult } from "./net/discover.js";
import { applyScan, listDevices, getDeviceById, pruneEvents, type SeenDevice, type ScanDiff } from "./db.js";
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
let paused = false;
let lastSummary: ScanSummary | null = null;
let scanCount = 0;

export function isPaused(): boolean {
  return paused;
}

/** Pause/resume the auto-scan loop. Pure: flips the flag and announces it. */
export function setPaused(value: boolean): void {
  paused = value;
  scanBus.emit("scan:paused", { paused });
}

// Every Nth scan, re-resolve *every* device's name from the network instead of
// trusting the cache — so renamed devices and names that were unresolvable the
// first time get picked up. Unknown hosts are always re-resolved regardless.
const NAME_REFRESH_EVERY = Math.max(1, Number(process.env.NAME_REFRESH_EVERY ?? 6));

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
    const priorDevices = listDevices();
    const isBaseline = priorDevices.length === 0;

    // Feed already-resolved names back in so most scans skip the mDNS/NetBIOS/DNS
    // lookups for hosts we've already identified — background scans stay cheap.
    // On a refresh scan we pass nothing, forcing a fresh resolve of everyone.
    const refreshNames = scanCount % NAME_REFRESH_EVERY === 0;
    scanCount++;
    const knownNames = new Map<string, string>();
    if (!refreshNames) {
      for (const d of priorDevices) {
        if (d.hostname) knownNames.set(d.id, d.hostname);
      }
    }

    const result = await scanNetwork(knownNames);
    const now = result.finishedAt;
    const diff = applyScan(toSeen(result), now);
    pruneEvents(); // keep the activity log (and the SQLite WAL) bounded

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
    if (!scanning && !paused) {
      void runScan().catch((e) => console.error("[scan] periodic scan failed:", e.message));
    }
  }, intervalMs);
}
