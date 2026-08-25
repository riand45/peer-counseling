"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { sendMessage, getSessionMessages } from "./actions";
import { sessionChannelName } from "./core";
import type { ChatMessage } from "./types";

export function useSessionChat(sessionId: string, studentLocalId?: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typingFrom, setTypingFrom] = useState<string | null>(null);
  const supabaseRef = useRef(createClient());

  useEffect(() => {
    let active = true;
    getSessionMessages({ sessionId, studentLocalId }).then((history) => {
      if (active) setMessages(history);
    });

    const channel = supabaseRef.current
      .channel(sessionChannelName(sessionId))
      .on("broadcast", { event: "new_message" }, ({ payload }) => {
        setMessages((current) => [...current, payload as ChatMessage]);
      })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const { senderRole } = payload as { senderRole: string };
        setTypingFrom(senderRole);
        setTimeout(() => setTypingFrom(null), 3000);
      })
      .subscribe();

    return () => {
      active = false;
      supabaseRef.current.removeChannel(channel);
    };
  }, [sessionId, studentLocalId]);

  const send = useCallback(
    (body: string) => sendMessage({ sessionId, body, studentLocalId }),
    [sessionId, studentLocalId],
  );

  const notifyTyping = useCallback(
    (senderRole: string) => {
      supabaseRef.current.channel(sessionChannelName(sessionId)).send({
        type: "broadcast",
        event: "typing",
        payload: { senderRole },
      });
    },
    [sessionId],
  );

  return { messages, typingFrom, send, notifyTyping };
}
