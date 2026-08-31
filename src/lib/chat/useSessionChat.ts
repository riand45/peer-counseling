"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { sendMessage, getSessionMessages } from "./actions";
import { sessionChannelName } from "./core";
import type { ChatMessage } from "./types";

/**
 * Gabung pesan masuk ke state berdasarkan id (bukan replace/append), lalu
 * urutkan by createdAt. Ini yang menjaga: (a) broadcast yang datang saat
 * fetch history masih jalan tidak ketimpa hasil history, (b) replay setelah
 * reconnect tidak menduplikasi pesan yang sudah ada.
 */
function mergeById(incoming: ChatMessage[], current: ChatMessage[]): ChatMessage[] {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const message of incoming) {
    byId.set(message.id, message);
  }
  return Array.from(byId.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function useSessionChat(sessionId: string, studentLocalId?: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [typingFrom, setTypingFrom] = useState<string | null>(null);
  const supabaseRef = useRef(createClient());
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    const supabase = supabaseRef.current;
    setLoading(true);

    getSessionMessages({ sessionId, studentLocalId })
      .then((history) => {
        if (active) setMessages((current) => mergeById(history, current));
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Gagal memuat pesan");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const channel = supabase
      .channel(sessionChannelName(sessionId))
      .on("broadcast", { event: "new_message" }, ({ payload }) => {
        setMessages((current) => mergeById([payload as ChatMessage], current));
      })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const { senderRole } = payload as { senderRole: string };
        setTypingFrom(senderRole);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setTypingFrom(null), 3000);
      })
      .subscribe();

    return () => {
      active = false;
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      supabase.removeChannel(channel);
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

  return { messages, error, loading, typingFrom, send, notifyTyping };
}
