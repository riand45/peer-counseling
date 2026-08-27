import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createStudentIdentity } from "@/lib/student/actions";
import { getServiceClient, deleteTestStudentIdentity } from "./helpers";

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
