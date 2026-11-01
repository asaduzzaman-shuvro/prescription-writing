import { io, type Socket } from "socket.io-client";

export type SlotReleasePayload = {
  appointmentSlotId: number;
  appointmentTime: string;
  reason?: string;
};

function resolveSocketUrl(): string {
  const explicit = (process.env.NEXT_PUBLIC_SAKURA_SOCKET_URL || "").trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const api = (process.env.NEXT_PUBLIC_SAKURA_API_ORIGIN || "").trim().replace(/\/$/, "");
  if (api) return `${api}/booking`;
  return "http://localhost:3000/booking";
}

/**
 * Socket.IO room sync for appointment slots — peer holds (orange) + realtime booked (red).
 * Ported from sakura_05_02_26_web BookingRealtimeService.
 */
export class BookingRealtimeClient {
  private readonly peerHeldKeys = new Set<string>();
  private readonly peerBookedKeys = new Set<string>();
  private socket: Socket | null = null;
  private joinedRoom: { chamberId: number; date: string } | null = null;
  private lastHold: {
    chamberId: number;
    date: string;
    parentSlotId: number;
    time: string;
  } | null = null;
  private pendingHoldKey: string | null = null;
  private holdRequestSeq = 0;
  private destroyed = false;

  holdToken: string | null = null;

  constructor(
    private readonly onDirty: () => void,
    private readonly onSlotReleasedByServer?: (data: SlotReleasePayload) => void,
  ) {}

  static normalizeSlotTime(time: string | null | undefined): string {
    if (time == null || time === "") return "";
    let s = String(time).trim();
    if (s.includes(".")) s = s.split(".")[0]!;
    if (s.length === 5) s += ":00";
    const parts = s.split(":");
    if (parts.length >= 2) {
      const h = parts[0]!.padStart(2, "0");
      const m = parts[1]!.padStart(2, "0");
      const sec = (parts[2] ?? "00").toString().padStart(2, "0").slice(0, 2);
      return `${h}:${m}:${sec}`;
    }
    return s;
  }

  static slotHoldKey(parentSlotId: number, time: string): string {
    return `${parentSlotId}|${BookingRealtimeClient.normalizeSlotTime(time)}`;
  }

  isPeerHeld(parentSlotId: number, time: string): boolean {
    const key = BookingRealtimeClient.slotHoldKey(parentSlotId, time);
    if (!this.peerHeldKeys.has(key)) return false;
    if (this.pendingHoldKey === key) return false;
    if (
      this.holdToken &&
      this.lastHold &&
      BookingRealtimeClient.slotHoldKey(this.lastHold.parentSlotId, this.lastHold.time) === key
    ) {
      return false;
    }
    return true;
  }

  isPeerBooked(parentSlotId: number, time: string): boolean {
    return this.peerBookedKeys.has(BookingRealtimeClient.slotHoldKey(parentSlotId, time));
  }

  isSocketConnected(): boolean {
    return !!this.socket?.connected;
  }

  destroy(): void {
    this.destroyed = true;
    this.releaseCurrentHoldQuiet();
    this.leaveRoom();
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.peerHeldKeys.clear();
    this.peerBookedKeys.clear();
    this.pendingHoldKey = null;
  }

  syncRoom(chamberId: unknown, date: unknown): void {
    if (!chamberId || !date) {
      this.peerHeldKeys.clear();
      this.peerBookedKeys.clear();
      this.pendingHoldKey = null;
      this.holdRequestSeq++;
      this.leaveRoom();
      this.notify();
      return;
    }
    const cid = typeof chamberId === "string" ? parseInt(chamberId, 10) : Number(chamberId);
    const dateStr = typeof date === "string" ? date.split("T")[0]! : String(date);
    if (Number.isNaN(cid)) return;
    this.ensureSocket();
    this.leaveRoom();
    this.peerBookedKeys.clear();
    this.pendingHoldKey = null;
    this.holdRequestSeq++;
    this.joinedRoom = { chamberId: cid, date: dateStr };
    if (this.socket?.connected) {
      this.socket.emit("joinRoom", { chamberId: cid, date: dateStr });
    }
  }

  private notify(): void {
    if (!this.destroyed) this.onDirty();
  }

  private ensureSocket(): void {
    if (this.socket) return;
    this.socket = io(resolveSocketUrl(), {
      transports: ["websocket", "polling"],
      autoConnect: true,
    });

    this.socket.on("connect", () => {
      if (this.joinedRoom) {
        this.socket!.emit("joinRoom", {
          chamberId: this.joinedRoom.chamberId,
          date: this.joinedRoom.date,
        });
      }
    });

    this.socket.on(
      "activeHolds",
      (data: { holds: { appointmentSlotId: number; appointmentTime: string }[] }) => {
        this.peerHeldKeys.clear();
        for (const h of data?.holds || []) {
          this.peerHeldKeys.add(
            BookingRealtimeClient.slotHoldKey(h.appointmentSlotId, h.appointmentTime),
          );
        }
        this.notify();
      },
    );

    this.socket.on(
      "slotHeld",
      (data: { appointmentSlotId: number; appointmentTime: string }) => {
        this.peerHeldKeys.add(
          BookingRealtimeClient.slotHoldKey(data.appointmentSlotId, data.appointmentTime),
        );
        this.notify();
      },
    );

    this.socket.on(
      "slotReleased",
      (data: { appointmentSlotId: number; appointmentTime: string; reason?: string }) => {
        this.peerHeldKeys.delete(
          BookingRealtimeClient.slotHoldKey(data.appointmentSlotId, data.appointmentTime),
        );
        this.onSlotReleasedByServer?.(data);
        this.notify();
      },
    );

    this.socket.on(
      "slotBooked",
      (data: { appointmentSlotId: number; appointmentTime: string }) => {
        const key = BookingRealtimeClient.slotHoldKey(
          data.appointmentSlotId,
          data.appointmentTime,
        );
        this.peerHeldKeys.delete(key);
        this.peerBookedKeys.add(key);
        this.notify();
      },
    );

    this.socket.on(
      "slotFreed",
      (data: { appointmentSlotId: number; appointmentTime: string }) => {
        this.peerBookedKeys.delete(
          BookingRealtimeClient.slotHoldKey(data.appointmentSlotId, data.appointmentTime),
        );
        this.notify();
      },
    );
  }

  private leaveRoom(): void {
    const prev = this.joinedRoom;
    this.joinedRoom = null;
    if (prev && this.socket?.connected) {
      this.socket.emit("leaveRoom", {
        chamberId: prev.chamberId,
        date: prev.date,
      });
    }
  }

  releaseHoldOnServer(
    chamberId: number,
    dateStr: string,
    parentSlotId: number,
    time: string,
  ): void {
    if (!this.socket?.connected) return;
    this.socket.emit("releaseSlot", {
      chamberId,
      date: dateStr,
      appointmentSlotId: parentSlotId,
      appointmentTime: time,
    });
  }

  releaseCurrentHoldQuiet(): void {
    if (!this.lastHold || !this.holdToken) {
      this.holdToken = null;
      this.lastHold = null;
      return;
    }
    const h = this.lastHold;
    this.releaseHoldOnServer(h.chamberId, h.date, h.parentSlotId, h.time);
    this.holdToken = null;
    this.lastHold = null;
  }

  clearAfterServerRelease(): void {
    this.holdToken = null;
    this.lastHold = null;
  }

  requestSlotHold(
    chamberId: number,
    dateStr: string,
    parentSlot: { id: number },
    timeSlot: { time: string },
  ): Promise<boolean> {
    return new Promise((resolve) => {
      this.ensureSocket();
      const sock = this.socket;
      if (!sock) {
        resolve(false);
        return;
      }

      const waitConnect = (cb: () => void) => {
        if (sock.connected) {
          cb();
          return;
        }
        const t = setTimeout(() => {
          sock.off("connect", onConnect);
          resolve(false);
        }, 10_000);
        const onConnect = () => {
          clearTimeout(t);
          sock.off("connect", onConnect);
          cb();
        };
        sock.once("connect", onConnect);
        if (sock.connected) {
          clearTimeout(t);
          sock.off("connect", onConnect);
          cb();
        }
      };

      waitConnect(() => {
        if (!sock.connected) {
          resolve(false);
          return;
        }

        const key = BookingRealtimeClient.slotHoldKey(parentSlot.id, timeSlot.time);
        this.pendingHoldKey = key;
        const seq = ++this.holdRequestSeq;

        let settled = false;
        let timer: ReturnType<typeof setTimeout>;
        const done = (ok: boolean) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (seq === this.holdRequestSeq) this.pendingHoldKey = null;
          resolve(ok);
        };
        timer = setTimeout(() => done(false), 4000);

        sock.once(
          "holdResult",
          (result: {
            ok?: boolean;
            holdToken?: string;
            error?: string;
            appointmentSlotId?: number;
            appointmentTime?: string;
          }) => {
            if (seq !== this.holdRequestSeq) {
              done(false);
              return;
            }
            if (result?.ok && result.holdToken) {
              this.holdToken = result.holdToken;
              this.lastHold = {
                chamberId,
                date: dateStr,
                parentSlotId: parentSlot.id,
                time: timeSlot.time,
              };
              done(true);
              return;
            }
            if (
              result?.error === "taken" &&
              result.appointmentSlotId != null &&
              result.appointmentTime
            ) {
              this.peerHeldKeys.add(
                BookingRealtimeClient.slotHoldKey(
                  result.appointmentSlotId,
                  result.appointmentTime,
                ),
              );
              this.notify();
            }
            done(false);
          },
        );

        sock.emit("holdSlot", {
          chamberId,
          date: dateStr,
          appointmentSlotId: parentSlot.id,
          appointmentTime: timeSlot.time,
        });
      });
    });
  }
}
