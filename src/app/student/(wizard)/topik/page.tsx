"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { TOPICS, TOPIC_EMOJI, TOPIC_LABELS, type Topic } from "@/lib/student/types";
import { useStoryWizard } from "../wizard-context";

function TopicCard({
  topic,
  selected,
  onToggle,
}: {
  topic: Topic;
  selected: boolean;
  onToggle: (topic: Topic) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(topic)}
      aria-pressed={selected}
      className={cn(
        "flex flex-col items-center gap-2 rounded-lg border-2 p-md text-center transition-colors",
        selected
          ? "border-primary bg-primary-fixed text-on-primary-fixed"
          : "border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container-low",
      )}
    >
      <span className="text-headline-md" aria-hidden="true">
        {TOPIC_EMOJI[topic]}
      </span>
      <span className="text-label-md font-semibold">{TOPIC_LABELS[topic]}</span>
    </button>
  );
}

export default function PilihTopikPage() {
  const router = useRouter();
  const { topics, toggleTopic } = useStoryWizard();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-headline-md font-bold text-on-surface">
          Apa yang ingin kamu ceritakan hari ini?
        </h1>
        <p className="mt-1 text-body-md text-on-surface-variant">
          Kamu bisa pilih lebih dari satu topik.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {TOPICS.map((topic) => (
          <TopicCard
            key={topic}
            topic={topic}
            selected={topics.includes(topic)}
            onToggle={toggleTopic}
          />
        ))}
      </div>

      <Button
        className="ml-auto"
        disabled={topics.length === 0}
        onClick={() => router.push("/student/kader")}
      >
        Lanjut →
      </Button>
    </div>
  );
}
