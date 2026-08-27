import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChatScreen } from "@/components/kader/ChatScreen";

export default async function KaderChatPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/kader/login");
  }

  return <ChatScreen sessionId={sessionId} />;
}
