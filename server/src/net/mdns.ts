import dgram from "node:dgram";

/**
 * Minimal multicast-DNS reverse resolver.
 *
 * Many devices (Macs, iPhones, printers, Chromecast/Nest, Sonos, smart-home
 * gear) answer a reverse PTR query for their IP over mDNS with a friendly
 * ".local" hostname — e.g. "Chads-MacBook-Pro.local", "Living-Room-Nest.local".
 * Home routers rarely provide reverse DNS, so this is where real device names
 * come from. We hand-roll the DNS packet so we don't need a native dependency.
 */

const MDNS_ADDR = "224.0.0.251";
const MDNS_PORT = 5353;

/** Encode a reverse-PTR mDNS query for one IPv4 address. */
function encodeReverseQuery(ip: string): Buffer {
  const labels = ip.split(".").reverse().concat(["in-addr", "arpa"]);
  const header = Buffer.from([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]); // 1 question
  const parts: Buffer[] = [];
  for (const label of labels) {
    const b = Buffer.from(label, "ascii");
    parts.push(Buffer.from([b.length]), b);
  }
  parts.push(Buffer.from([0])); // root label
  const qtype = Buffer.from([0, 12]); // PTR
  const qclass = Buffer.from([0x80, 0x01]); // QU bit (unicast response) + IN
  return Buffer.concat([header, ...parts, qtype, qclass]);
}

/** Decode a (possibly compressed) DNS name starting at `offset`. */
function readName(buf: Buffer, offset: number): [string, number] {
  const labels: string[] = [];
  let pos = offset;
  let next = -1;
  let guard = 0;
  while (guard++ < 128) {
    const len = buf[pos];
    if (len === 0) {
      if (next === -1) next = pos + 1;
      break;
    }
    if ((len & 0xc0) === 0xc0) {
      const ptr = ((len & 0x3f) << 8) | buf[pos + 1];
      if (next === -1) next = pos + 2;
      pos = ptr;
      continue;
    }
    labels.push(buf.toString("ascii", pos + 1, pos + 1 + len));
    pos += 1 + len;
  }
  return [labels.join("."), next === -1 ? pos + 1 : next];
}

/** Extract the target name from the first PTR answer in a response. */
function parsePtrAnswer(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  const qd = buf.readUInt16BE(4);
  const an = buf.readUInt16BE(6);
  let pos = 12;
  for (let i = 0; i < qd; i++) {
    const [, after] = readName(buf, pos);
    pos = after + 4; // qtype + qclass
  }
  for (let i = 0; i < an && pos < buf.length; i++) {
    const [, after] = readName(buf, pos);
    pos = after;
    const type = buf.readUInt16BE(pos);
    const rdlen = buf.readUInt16BE(pos + 8);
    pos += 10; // type(2) class(2) ttl(4) rdlength(2)
    if (type === 12) {
      const [name] = readName(buf, pos);
      return name;
    }
    pos += rdlen;
  }
  return null;
}

function cleanName(name: string): string {
  return name.replace(/\.local\.?$/i, "").replace(/\.$/, "").trim();
}

/**
 * Resolve friendly hostnames for a batch of IPs via reverse mDNS.
 * Best-effort: IPs that don't answer are simply absent from the result.
 */
export async function mdnsReverseBatch(
  ips: string[],
  timeoutMs = 2500
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (ips.length === 0) return result;

  return new Promise((resolve) => {
    const sock = dgram.createSocket({ type: "udp4", reuseAddr: true });
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try {
        sock.close();
      } catch {
        /* already closed */
      }
      resolve(result);
    };

    sock.on("message", (msg, rinfo) => {
      // Responses arrive unicast from the device's own IP (QU bit set).
      if (result.has(rinfo.address)) return;
      try {
        const name = parsePtrAnswer(msg);
        if (name) result.set(rinfo.address, cleanName(name));
      } catch {
        /* malformed packet — ignore */
      }
    });
    sock.on("error", finish);

    sock.bind(0, () => {
      try {
        sock.setMulticastTTL(255);
      } catch {
        /* not fatal */
      }
      for (const ip of ips) {
        const q = encodeReverseQuery(ip);
        sock.send(q, MDNS_PORT, MDNS_ADDR);
      }
    });

    setTimeout(finish, timeoutMs);
  });
}
