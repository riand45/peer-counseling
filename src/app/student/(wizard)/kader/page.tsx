"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { listAvailableKader } from "@/lib/student/actions";
import { TOPIC_LABELS, type KaderSummary, type Topic } from "@/lib/student/types";
import { useStoryWizard } from "../wizard-context";

function statusLabel(status: KaderSummary["status"]): string {
  if (status === "available") return "Sedang tersedia";
  if (status === "busy") return "Sedang Sibuk";
  return "Tersedia Nanti";
}

function KaderCard({ kader, onSelect }: { kader: KaderSummary; onSelect: (k: KaderSummary) => void }) {
  const initial = kader.fullName.trim().charAt(0).toUpperCase() || "K";

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div
          aria-hidden="true"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-fixed text-headline-md font-bold text-on-primary-fixed"
        >
          {initial}
        </div>
        <div>
          <p className="text-label-md font-semibold text-on-surface">Kak {kader.fullName}</p>
          <Chip tone={kader.status === "available" ? "primary" : "neutral"}>
            {statusLabel(kader.status)}
          </Chip>
        </div>
      </div>

      {kader.bio && <p className="text-body-md text-on-surface-variant">{kader.bio}</p>}

      {kader.topics.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {kader.topics.map((topic) => (
            <Chip key={topic} tone="secondary">
              {TOPIC_LABELS[topic]}
            </Chip>
          ))}
        </div>
      )}

      {kader.status === "available" ? (
        <Button onClick={() => onSelect(kader)}>Pilih Kak {kader.fullName}</Button>
      ) : (
        <Button variant="ghost" disabled>
          Ingatkan Saya
        </Button>
      )}
    </Card>
  );
}

export default function PilihKaderPage() {
  const router = useRouter();
  const { topics: selectedTopics, setKader } = useStoryWizard();
  const [kaderList, setKaderList] = useState<KaderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Topic | "semua">("semua");

  useEffect(() => {
    if (selectedTopics.length === 0) {
      router.replace("/student/topik");
      return;
    }
    listAvailableKader()
      .then(setKaderList)
      .catch((err) => setError(err instanceof Error ? err.message : "Gagal memuat daftar kader"))
      .finally(() => setLoading(false));
  }, [selectedTopics, router]);

  const availableFilters = useMemo(() => {
    const topicSet = new Set<Topic>();
    for (const kader of kaderList) {
      for (const topic of kader.topics) topicSet.add(topic);
    }
    return Array.from(topicSet);
  }, [kaderList]);

  const filteredKader = useMemo(() => {
    if (filter === "semua") return kaderList;
    return kaderList.filter((k) => k.topics.includes(filter));
  }, [kaderList, filter]);

  function handleSelect(kader: KaderSummary) {
    setKader(kader);
    router.push("/student/konfirmasi");
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-headline-md font-bold text-on-surface">Pilih Teman Cerita</h1>
        <p className="mt-1 text-body-md text-on-surface-variant">
          Pilih kakak pendamping yang ingin kamu ajak bicara.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFilter("semua")}
          className={cn(
            "rounded-full px-3 py-1 text-label-sm font-medium",
            filter === "semua"
              ? "bg-primary text-on-primary"
              : "bg-surface-container-high text-on-surface-variant",
          )}
        >
          Semua
        </button>
        {availableFilters.map((topic) => (
          <button
            key={topic}
            type="button"
            onClick={() => setFilter(topic)}
            className={cn(
              "rounded-full px-3 py-1 text-label-sm font-medium",
              filter === topic
                ? "bg-primary text-on-primary"
                : "bg-surface-container-high text-on-surface-variant",
            )}
          >
            {TOPIC_LABELS[topic]}
          </button>
        ))}
      </div>

      {loading && <p className="text-body-md text-on-surface-variant">Memuat daftar kader...</p>}
      {error && (
        <p className="rounded-md border-l-4 border-error bg-error-container px-3 py-2 text-label-md text-on-error-container">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-4">
        {filteredKader.map((kader) => (
          <KaderCard key={kader.id} kader={kader} onSelect={handleSelect} />
        ))}
        {!loading && !error && filteredKader.length === 0 && (
          <p className="text-body-md text-on-surface-variant">
            Belum ada kader yang tersedia untuk topik ini.
          </p>
        )}
      </div>
    </div>
  );
}
