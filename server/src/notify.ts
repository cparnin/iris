import type { DeviceRow } from "./db.js";
import { displayNameOf } from "./db.js";

/**
 * ntfy push notifications. Configure via environment:
 *   NTFY_URL       full topic URL, e.g. https://ntfy.sh/polaris-home-abc123
 *                  (use a long, unguessable topic — anyone who knows it can read it)
 *   NTFY_TOKEN     optional access token for protected/self-hosted servers
 *   NTFY_PRIORITY  optional default priority (min|low|default|high|urgent)
 *
 * If NTFY_URL is unset, notifications are silently disabled.
 */
const NTFY_URL = process.env.NTFY_URL?.trim();
const NTFY_TOKEN = process.env.NTFY_TOKEN?.trim();
const NTFY_PRIORITY = process.env.NTFY_PRIORITY?.trim();

export function isNtfyConfigured(): boolean {
  return Boolean(NTFY_URL);
}

/** Redacted config summary for the health endpoint (never leaks the topic). */
export function ntfyStatus(): { configured: boolean; host: string | null } {
  if (!NTFY_URL) return { configured: false, host: null };
  try {
    return { configured: true, host: new URL(NTFY_URL).host };
  } catch {
    return { configured: true, host: "invalid-url" };
  }
}

export interface NtfyMessage {
  title: string;
  message: string;
  tags?: string[]; // ntfy emoji shortcodes, e.g. ["warning","satellite"]
  priority?: string;
  click?: string; // URL opened when the notification is tapped
}

/** Low-level send. Returns true on success; never throws (logs and returns false). */
export async function sendNtfy(msg: NtfyMessage): Promise<boolean> {
  if (!NTFY_URL) return false;
  try {
    const headers: Record<string, string> = {
      Title: msg.title,
      Priority: msg.priority ?? NTFY_PRIORITY ?? "default",
    };
    if (msg.tags?.length) headers.Tags = msg.tags.join(",");
    if (msg.click) headers.Click = msg.click;
    if (NTFY_TOKEN) headers.Authorization = `Bearer ${NTFY_TOKEN}`;

    const res = await fetch(NTFY_URL, {
      method: "POST",
      headers,
      body: msg.message,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error(`[ntfy] send failed: ${res.status} ${res.statusText}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[ntfy] send error: ${(err as Error).message}`);
    return false;
  }
}

/** Notification for a newly-discovered device joining the network. */
export async function notifyNewDevice(dev: DeviceRow): Promise<void> {
  const name = displayNameOf(dev);
  const lines = [
    `IP: ${dev.ip ?? "?"}`,
    `MAC: ${dev.mac ?? "unknown"}`,
    `Vendor: ${dev.vendor ?? "unknown"}`,
  ];
  if (dev.os_guess) lines.push(`OS: ${dev.os_guess}`);
  if (dev.randomized) lines.push("⚠️ randomized (privacy) MAC");

  await sendNtfy({
    title: `New device on your network: ${name}`,
    message: lines.join("\n"),
    tags: dev.randomized ? ["warning", "detective"] : ["satellite", "eye"],
    priority: "high",
  });
}
