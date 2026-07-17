import { OUI as CURATED } from "./vendors-data.js";
import ouiDb from "./oui-db.json" with { type: "json" };

const DB = ouiDb as Record<string, string>;

/** Normalize a MAC to 12 uppercase hex chars, or null if invalid. */
export function normalizeMac(mac: string): string | null {
  const hex = mac.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  if (hex.length !== 12) return null;
  return hex;
}

/** Format a normalized MAC back to colon notation (aa:bb:cc:dd:ee:ff). */
export function formatMac(mac12: string): string {
  return mac12.toLowerCase().match(/.{2}/g)?.join(":") ?? mac12;
}

/**
 * Locally-administered / randomized MACs have bit 1 of the first octet set.
 * These are privacy MACs (common on modern phones) and won't resolve to a
 * real vendor — worth surfacing in the UI.
 */
export function isRandomizedMac(mac12: string): boolean {
  const firstOctet = parseInt(mac12.slice(0, 2), 16);
  return (firstOctet & 0x02) === 0x02;
}

/** Look up a vendor: curated overrides first, then the bundled IEEE/Wireshark DB. */
export function lookupVendor(mac: string): string | null {
  const norm = normalizeMac(mac);
  if (!norm) return null;
  const prefix = norm.slice(0, 6);
  if (CURATED[prefix]) return CURATED[prefix];
  if (DB[prefix]) return DB[prefix];
  if (isRandomizedMac(norm)) return "Private (randomized MAC)";
  return null;
}
