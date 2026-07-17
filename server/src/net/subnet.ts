import { execFile } from "node:child_process";
import { promisify } from "node:util";

const pexec = promisify(execFile);

export interface NetInfo {
  iface: string;
  ip: string;
  netmaskBits: number;
  cidr: string; // e.g. 192.168.1.0/24
  gateway?: string;
}

/** Convert a hex netmask like 0xfffffc00 to a bit count (prefix length). */
function hexMaskToBits(hex: string): number {
  const n = parseInt(hex, 16) >>> 0;
  let bits = 0;
  for (let i = 31; i >= 0; i--) {
    if ((n >>> i) & 1) bits++;
    else break;
  }
  return bits;
}

/** Compute the network base address given an IP and prefix length. */
export function networkBase(ip: string, bits: number): string {
  const parts = ip.split(".").map(Number);
  const ipInt = ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  const net = (ipInt & mask) >>> 0;
  return [(net >>> 24) & 255, (net >>> 16) & 255, (net >>> 8) & 255, net & 255].join(".");
}

/**
 * Detect the active interface, its IPv4 address and subnet on macOS.
 * Reads the default route's interface, then that interface's inet config.
 */
export async function detectNetwork(): Promise<NetInfo> {
  // 1. Which interface holds the default route?
  let iface = "en0";
  let gateway: string | undefined;
  try {
    const { stdout } = await pexec("route", ["-n", "get", "default"]);
    const ifaceMatch = stdout.match(/interface:\s*(\S+)/);
    const gwMatch = stdout.match(/gateway:\s*(\S+)/);
    if (ifaceMatch) iface = ifaceMatch[1];
    if (gwMatch) gateway = gwMatch[1];
  } catch {
    /* fall through to en0 */
  }

  // 2. Read that interface's IPv4 address + netmask.
  const { stdout } = await pexec("ifconfig", [iface]);
  const inetLine = stdout.split("\n").find((l) => l.trim().startsWith("inet "));
  if (!inetLine) {
    throw new Error(`No IPv4 address found on interface ${iface}`);
  }
  const ip = inetLine.match(/inet\s+(\d+\.\d+\.\d+\.\d+)/)?.[1];
  const maskHex = inetLine.match(/netmask\s+(0x[0-9a-fA-F]+)/)?.[1];
  if (!ip || !maskHex) {
    throw new Error(`Could not parse inet config for ${iface}: ${inetLine}`);
  }

  const netmaskBits = hexMaskToBits(maskHex);
  const cidr = `${networkBase(ip, netmaskBits)}/${netmaskBits}`;

  return { iface, ip, netmaskBits, cidr, gateway };
}
