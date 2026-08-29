import { ChatScreen } from "@/components/student/ChatScreen";

export default async function StudentChatPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <ChatScreen sessionId={sessionId} />;
}
