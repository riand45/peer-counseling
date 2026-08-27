import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createStudentIdentity, listAvailableKader } from "@/lib/student/actions";
import { getServiceClient, deleteTestStudentIdentity, createTestUser, deleteTestUser } from "./helpers";

describe("createStudentIdentity", () => {
  it("creates a student_identities row with the given id and nickname", async () => {
    const localId = randomUUID();
    try {
      const result = await createStudentIdentity({ localId, nickname: "Sahabat Langit" });
      expect(result.id).toBe(localId);

      const service = getServiceClient();
      const { data, error } = await service
        .from("student_identities")
        .select("id, nickname, avatar_seed")
        .eq("id", localId)
        .single();

      expect(error).toBeNull();
      expect(data?.nickname).toBe("Sahabat Langit");
      expect(data?.avatar_seed).toBeTruthy();
    } finally {
      await deleteTestStudentIdentity(localId);
    }
  });

  it("allows creating an identity without a nickname", async () => {
    const localId = randomUUID();
    try {
      const result = await createStudentIdentity({ localId });
      expect(result.id).toBe(localId);
    } finally {
      await deleteTestStudentIdentity(localId);
    }
  });
});

describe("listAvailableKader", () => {
  it("returns only verified kader, with the expected shape", async () => {
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const verifiedKader = await createTestUser("kader", { verified: true });
      cleanup.push(() => deleteTestUser(verifiedKader.id));

      const service = getServiceClient();
      await service
        .from("profiles")
        .update({ bio: "Suka dengerin cerita", topics: ["akademik", "keluarga"], status: "available" })
        .eq("id", verifiedKader.id);

      const unverifiedKader = await createTestUser("kader", { verified: false });
      cleanup.push(() => deleteTestUser(unverifiedKader.id));

      const guru = await createTestUser("guru", { verified: true });
      cleanup.push(() => deleteTestUser(guru.id));

      const result = await listAvailableKader();
      const ids = result.map((k) => k.id);

      expect(ids).toContain(verifiedKader.id);
      expect(ids).not.toContain(unverifiedKader.id);
      expect(ids).not.toContain(guru.id);

      const found = result.find((k) => k.id === verifiedKader.id)!;
      expect(found.bio).toBe("Suka dengerin cerita");
      expect(found.topics).toEqual(["akademik", "keluarga"]);
      expect(found.status).toBe("available");
    } finally {
      for (const fn of cleanup.reverse()) {
        await fn();
      }
    }
  });
});
