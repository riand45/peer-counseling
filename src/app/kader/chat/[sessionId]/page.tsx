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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_verified")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/kader/login");
  }

  if (profile.role !== "kader") {
    redirect("/guru");
  }

  if (!profile.is_verified) {
    redirect("/kader");
  }

  return <ChatScreen sessionId={sessionId} />;
}
