import { describe, expect, it } from "vitest";
import { sendMessageCore, getSessionMessagesCore, sessionChannelName } from "@/lib/chat/core";
import {
  getServiceClient,
  createTestStudentIdentity,
  deleteTestStudentIdentity,
  createTestSession,
  deleteTestSession,
  createTestUser,
  deleteTestUser,
} from "./helpers";

describe("chat core: permission checks", () => {
  it("a student can send and read messages in their own session", async () => {
    const service = getServiceClient();
    const cleanup: Array<() => Promise<void>> = [];

    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));

      const sessionId = await createTestSession({ studentLocalId: localId });
      cleanup.push(() => deleteTestSession(sessionId));

      await sendMessageCore(service, {
        sessionId,
        body: "Halo, aku butuh bantuan",
        actor: { kind: "student", studentLocalId: localId },
      });

      const history = await getSessionMessagesCore(service, {
        sessionId,
        actor: { kind: "student", studentLocalId: localId },
      });

      expect(history).toHaveLength(1);
      expect(history[0].body).toBe("Halo, aku butuh bantuan");
      expect(history[0].senderRole).toBe("student");
    } finally {
      for (const fn of cleanup.reverse()) {
        await fn();
      }
    }
  });

  it("rejects a student actor whose local id does not own the session", async () => {
    const service = getServiceClient();
    const cleanup: Array<() => Promise<void>> = [];

    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));

      const otherLocalId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(otherLocalId));

      const sessionId = await createTestSession({ studentLocalId: localId });
      cleanup.push(() => deleteTestSession(sessionId));

      await expect(
        sendMessageCore(service, {
          sessionId,
          body: "curious",
          actor: { kind: "student", studentLocalId: otherLocalId },
        }),
      ).rejects.toThrow("Tidak diizinkan");
    } finally {
      for (const fn of cleanup.reverse()) {
        await fn();
      }
    }
  });

  it("rejects a kader actor who is not assigned to the session", async () => {
    const service = getServiceClient();
    const cleanup: Array<() => Promise<void>> = [];

    try {
      const kaderA = await createTestUser("kader", { verified: true });
      cleanup.push(() => deleteTestUser(kaderA.id));

      const kaderB = await createTestUser("kader", { verified: true });
      cleanup.push(() => deleteTestUser(kaderB.id));

      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));

      const sessionId = await createTestSession({ studentLocalId: localId, assignedTo: kaderA.id });
      cleanup.push(() => deleteTestSession(sessionId));

      await expect(
        sendMessageCore(service, {
          sessionId,
          body: "aku bukan yang ditugaskan",
          actor: { kind: "kader", userId: kaderB.id },
        }),
      ).rejects.toThrow("Tidak diizinkan");
    } finally {
      for (const fn of cleanup.reverse()) {
        await fn();
      }
    }
  });
});

describe("chat core: realtime broadcast delivery", () => {
  it("delivers a sent message to a listener subscribed on the session channel", async () => {
    const service = getServiceClient();
    const cleanup: Array<() => Promise<void>> = [];

    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));

      const sessionId = await createTestSession({ studentLocalId: localId });
      cleanup.push(() => deleteTestSession(sessionId));

      const listener = getServiceClient();
      cleanup.push(async () => {
        await listener.removeAllChannels();
      });

      let resolveReceived: (value: { body: string }) => void;
      const received = new Promise<{ body: string }>((resolve) => {
        resolveReceived = resolve;
      });

      const channel = listener
        .channel(sessionChannelName(sessionId))
        .on("broadcast", { event: "new_message" }, ({ payload }) => {
          resolveReceived(payload as { body: string });
        });

      await new Promise<void>((resolve, reject) => {
        channel.subscribe((status) => {
          if (status === "SUBSCRIBED") resolve();
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            reject(new Error(`channel subscribe failed: ${status}`));
          }
        });
      });

      await sendMessageCore(service, {
        sessionId,
        body: "pesan realtime",
        actor: { kind: "student", studentLocalId: localId },
      });

      const payload = await Promise.race([
        received,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timed out waiting for broadcast")), 8000),
        ),
      ]);
      expect(payload.body).toBe("pesan realtime");
    } finally {
      for (const fn of cleanup.reverse()) {
        await fn();
      }
    }
  });
});
