"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { KaderSummary, Topic } from "@/lib/student/types";

type StoryWizardContextValue = {
  topics: Topic[];
  kader: KaderSummary | null;
  toggleTopic: (topic: Topic) => void;
  setKader: (kader: KaderSummary) => void;
  reset: () => void;
};

const StoryWizardContext = createContext<StoryWizardContextValue | null>(null);

export function StoryWizardProvider({ children }: { children: ReactNode }) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [kader, setKaderState] = useState<KaderSummary | null>(null);

  const toggleTopic = useCallback((topic: Topic) => {
    setTopics((current) =>
      current.includes(topic) ? current.filter((t) => t !== topic) : [...current, topic],
    );
  }, []);

  const setKader = useCallback((next: KaderSummary) => {
    setKaderState(next);
  }, []);

  const reset = useCallback(() => {
    setTopics([]);
    setKaderState(null);
  }, []);

  const value = useMemo(
    () => ({ topics, kader, toggleTopic, setKader, reset }),
    [topics, kader, toggleTopic, setKader, reset],
  );

  return <StoryWizardContext.Provider value={value}>{children}</StoryWizardContext.Provider>;
}

export function useStoryWizard(): StoryWizardContextValue {
  const ctx = useContext(StoryWizardContext);
  if (!ctx) {
    throw new Error("useStoryWizard must be used within StoryWizardProvider");
  }
  return ctx;
}
