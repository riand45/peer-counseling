"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { StudentEmojiAvatar } from "@/components/ui/Avatar";
import { listAvailableKader } from "@/lib/student/actions";
import { TOPIC_LABELS, type KaderSummary, type Topic } from "@/lib/student/types";
import { useStoryWizard } from "../wizard-context";

function statusLabel(status: KaderSummary["status"]): string {
  if (status === "available") return "Sedang tersedia";
  if (status === "busy") return "Sedang Sibuk";
  return "Tersedia Nanti";
}

function KaderCard({ kader, onSelect }: { kader: KaderSummary; onSelect: (k: KaderSummary) => void }) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <StudentEmojiAvatar avatarSeed={kader.avatarSeed} size="lg" />
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
      .catch((err) => setError(err instanceof Error ? err.message : "Gagal memuat daftar konselor"))
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

      {loading && (
        <div className="flex flex-col gap-4 animate-pulse" aria-busy="true" aria-label="Memuat daftar konselor">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-sm">
              <div className="h-10 w-10 shrink-0 rounded-full bg-surface-container-high" />
              <div className="flex flex-col gap-2 flex-1">
                <div className="h-4 w-32 rounded-full bg-surface-container-high" />
                <div className="h-3 w-20 rounded-full bg-surface-container-high" />
              </div>
              <div className="h-8 w-16 rounded-lg bg-surface-container-high shrink-0" />
            </div>
          ))}
        </div>
      )}

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
            Belum ada konselor yang tersedia untuk topik ini.
          </p>
        )}
      </div>
    </div>
  );
}
