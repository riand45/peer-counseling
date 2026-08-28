"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card } from "@/components/ui/Card";
import { SESSION_STATUS_LABELS } from "@/lib/guru/types";
import type { StatusDistributionEntry } from "@/lib/guru/types";
import type { SessionStatus } from "@/lib/kader/types";

const STATUS_COLORS: Record<SessionStatus, string> = {
  waiting: "var(--color-outline)",
  active: "var(--color-primary)",
  escalated: "var(--color-error)",
  ended: "var(--color-tertiary)",
};

export function StatusDonutChart({ distribution }: { distribution: StatusDistributionEntry[] }) {
  const data = distribution.map((entry) => ({
    name: SESSION_STATUS_LABELS[entry.status],
    value: entry.count,
    status: entry.status,
  }));
  const hasData = distribution.some((entry) => entry.count > 0);

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="text-headline-md text-on-surface">Status Konsultasi</h2>
        <p className="text-label-sm text-on-surface-variant">Distribusi penyelesaian</p>
      </div>
      {hasData ? (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={2}>
                {data.map((entry) => (
                  <Cell key={entry.status} fill={STATUS_COLORS[entry.status]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-body-md text-on-surface-variant">Belum ada data pada rentang ini.</p>
      )}
    </Card>
  );
}
