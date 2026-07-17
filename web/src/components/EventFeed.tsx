import type { Device, NetEvent } from "../api.js";
import { displayName } from "../api.js";
import { relTime } from "../deviceMeta.js";

const META: Record<NetEvent["type"], { icon: string; color: string; verb: string }> = {
  new_device: { icon: "✨", color: "text-amber-300", verb: "joined the network" },
  online: { icon: "🟢", color: "text-emerald-300", verb: "came online" },
  offline: { icon: "⚪", color: "text-zinc-400", verb: "went offline" },
};

export function EventFeed({
  events,
  byId,
}: {
  events: NetEvent[];
  byId: Map<string, Device>;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02]">
      <div className="border-b border-white/10 px-4 py-3 text-sm font-semibold text-white">
        Activity
      </div>
      <div className="max-h-[70vh] divide-y divide-white/5 overflow-y-auto">
        {events.length === 0 && (
          <div className="px-4 py-6 text-sm text-zinc-500">No events yet.</div>
        )}
        {events.map((e) => {
          const m = META[e.type];
          const dev = byId.get(e.device_id);
          const name = dev ? displayName(dev) : e.device_id;
          return (
            <div key={e.id} className="flex items-start gap-3 px-4 py-2.5">
              <span className="text-sm">{m.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-zinc-200">
                  <span className="font-medium text-white">{name}</span>{" "}
                  <span className={m.color}>{m.verb}</span>
                </div>
                <div className="text-[11px] text-zinc-600">{relTime(e.ts)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
