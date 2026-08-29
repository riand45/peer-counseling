"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { updateKaderTopics } from "@/lib/kader/actions";
import { TOPICS, TOPIC_LABELS, type Topic } from "@/lib/student/types";

export function TopicsEditor({ topics }: { topics: Topic[] }) {
  const [current, setCurrent] = useState(topics);
  const [picked, setPicked] = useState<Topic | "">("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const remaining = TOPICS.filter((topic) => !current.includes(topic));

  function save(next: Topic[]) {
    const previous = current;
    setCurrent(next);
    setError(null);
    startTransition(async () => {
      try {
        await updateKaderTopics(next);
      } catch (err) {
        setCurrent(previous);
        setError(err instanceof Error ? err.message : "Gagal memperbarui topik");
      }
    });
  }

  function handleRemove(topic: Topic) {
    save(current.filter((t) => t !== topic));
  }

  function handleAdd() {
    if (!picked) return;
    save([...current, picked]);
    setPicked("");
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {current.length === 0 && (
          <p className="text-body-md text-on-surface-variant">Belum ada topik dipilih.</p>
        )}
        {current.map((topic) => (
          <Chip key={topic} tone="secondary" className="gap-1">
            {TOPIC_LABELS[topic]}
            <button
              type="button"
              onClick={() => handleRemove(topic)}
              disabled={pending}
              aria-label={`Hapus topik ${TOPIC_LABELS[topic]}`}
              className="ml-1 hover:text-error"
            >
              ×
            </button>
          </Chip>
        ))}
      </div>

      {remaining.length > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <select
            value={picked}
            onChange={(e) => setPicked(e.target.value as Topic)}
            disabled={pending}
            className="rounded-md border-2 border-outline-variant bg-surface-container-low px-3 py-2 text-body-md text-on-surface outline-none"
          >
            <option value="">Pilih topik...</option>
            {remaining.map((topic) => (
              <option key={topic} value={topic}>
                {TOPIC_LABELS[topic]}
              </option>
            ))}
          </select>
          <Button variant="secondary" onClick={handleAdd} disabled={!picked || pending}>
            Tambah
          </Button>
        </div>
      )}

      {error && <p className="mt-2 text-label-sm text-error">{error}</p>}
    </div>
  );
}
