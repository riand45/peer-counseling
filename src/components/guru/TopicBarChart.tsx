"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/Card";
import { TOPIC_LABELS } from "@/lib/student/types";
import type { TopicDistributionEntry } from "@/lib/guru/types";

export function TopicBarChart({ distribution }: { distribution: TopicDistributionEntry[] }) {
  const data = distribution.map((entry) => ({
    topic: TOPIC_LABELS[entry.topic],
    count: entry.count,
  }));

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="text-headline-md text-on-surface">Konsultasi Berdasarkan Topik</h2>
        <p className="text-label-sm text-on-surface-variant">Kategorisasi isu yang dibahas siswa</p>
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-outline-variant)" />
            <XAxis dataKey="topic" stroke="var(--color-on-surface-variant)" fontSize={12} />
            <YAxis allowDecimals={false} stroke="var(--color-on-surface-variant)" fontSize={12} />
            <Tooltip />
            <Bar dataKey="count" name="Jumlah Sesi" fill="var(--color-secondary)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
