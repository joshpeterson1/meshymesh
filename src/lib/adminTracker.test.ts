import { describe, it, expect, vi, beforeEach } from "vitest";
import { trackAdminCommand, notifyAdminAck } from "./adminTracker";

describe("adminTracker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("resolves as confirmed when all packets are acked", async () => {
    const promise = trackAdminCommand([100, 200, 300]);

    notifyAdminAck(100, 0);
    notifyAdminAck(200, 0);
    notifyAdminAck(300, 0);

    const result = await promise;
    expect(result.status).toBe("confirmed");
  });

  it("resolves as failed when device rejects with error", async () => {
    const promise = trackAdminCommand([100, 200]);

    notifyAdminAck(100, 0);
    notifyAdminAck(200, 3); // Non-zero = error

    const result = await promise;
    expect(result.status).toBe("failed");
  });

  it("resolves as confirmed on timeout with no ACKs (firmware fallback)", async () => {
    const promise = trackAdminCommand([100, 200]);

    vi.advanceTimersByTime(11_000);

    const result = await promise;
    expect(result.status).toBe("confirmed");
  });

  it("resolves as partial on timeout with some ACKs", async () => {
    const promise = trackAdminCommand([100, 200, 300]);

    notifyAdminAck(100, 0);
    vi.advanceTimersByTime(11_000);

    const result = await promise;
    expect(result.status).toBe("partial");
    if (result.status === "partial") {
      expect(result.acked).toBe(1);
      expect(result.total).toBe(3);
    }
  });

  it("ignores unrelated ACKs", async () => {
    const promise = trackAdminCommand([100]);

    notifyAdminAck(999, 0); // Unrelated
    notifyAdminAck(100, 0); // Matching

    const result = await promise;
    expect(result.status).toBe("confirmed");
  });
});
