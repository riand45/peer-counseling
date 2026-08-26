export type SenderRole = "student" | "kader" | "guru" | "system";

export type ChatMessage = {
  id: string;
  sessionId: string;
  senderRole: SenderRole;
  body: string;
  createdAt: string;
};

export type ChatActor =
  | { kind: "student"; studentLocalId: string }
  | { kind: "kader"; userId: string }
  | { kind: "guru"; userId: string };
