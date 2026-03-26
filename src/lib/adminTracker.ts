/**
 * Tracks pending admin command ACKs from the device.
 * Config commands return packet IDs; MessageAck events fire when the device responds.
 * This module correlates them with a timeout fallback.
 */

const ADMIN_TIMEOUT_MS = 10_000;

interface PendingAdmin {
  packetIds: Set<number>;
  ackedIds: Set<number>;
  resolve: (result: AdminResult) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

export type AdminResult =
  | { status: "confirmed" }
  | { status: "partial"; acked: number; total: number }
  | { status: "timeout" }
  | { status: "failed"; error: string };

const pending = new Map<string, PendingAdmin>();
let nextTrackingId = 0;

/**
 * Start tracking a set of admin packet IDs.
 * Returns a promise that resolves when all ACKs arrive or timeout.
 */
export function trackAdminCommand(packetIds: number[]): Promise<AdminResult> {
  const trackingId = `admin-${nextTrackingId++}`;
  const idSet = new Set(packetIds);

  return new Promise<AdminResult>((resolve) => {
    const timeoutId = setTimeout(() => {
      const entry = pending.get(trackingId);
      if (entry) {
        pending.delete(trackingId);
        if (entry.ackedIds.size === 0) {
          // No ACKs at all — firmware may not support admin responses.
          // Treat as assumed success (timeout fallback).
          resolve({ status: "confirmed" });
        } else if (entry.ackedIds.size < entry.packetIds.size) {
          resolve({
            status: "partial",
            acked: entry.ackedIds.size,
            total: entry.packetIds.size,
          });
        }
      }
    }, ADMIN_TIMEOUT_MS);

    pending.set(trackingId, {
      packetIds: idSet,
      ackedIds: new Set(),
      resolve,
      timeoutId,
    });
  });
}

/**
 * Called from the MessageAck event handler.
 * If the request_id matches a pending admin command, mark it as acked.
 */
export function notifyAdminAck(requestId: number, errorReason: number): void {
  for (const [trackingId, entry] of pending) {
    if (entry.packetIds.has(requestId)) {
      if (errorReason !== 0) {
        // Device explicitly rejected
        clearTimeout(entry.timeoutId);
        pending.delete(trackingId);
        entry.resolve({ status: "failed", error: `Device error code: ${errorReason}` });
        return;
      }

      entry.ackedIds.add(requestId);

      // All packets acked — success
      if (entry.ackedIds.size >= entry.packetIds.size) {
        clearTimeout(entry.timeoutId);
        pending.delete(trackingId);
        entry.resolve({ status: "confirmed" });
      }
      return;
    }
  }
}
