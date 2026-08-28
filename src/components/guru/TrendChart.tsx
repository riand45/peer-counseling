"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/Card";
import type { StatisticsTrendPoint } from "@/lib/guru/types";

function formatDateLabel(date: string): string {
  return new Date(date).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

export function TrendChart({ trend }: { trend: StatisticsTrendPoint[] }) {
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="text-headline-md text-on-surface">Tren Konsultasi</h2>
        <p className="text-label-sm text-on-surface-variant">Jumlah sesi konsultasi per hari</p>
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-outline-variant)" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDateLabel}
              stroke="var(--color-on-surface-variant)"
              fontSize={12}
            />
            <YAxis allowDecimals={false} stroke="var(--color-on-surface-variant)" fontSize={12} />
            <Tooltip labelFormatter={(value) => formatDateLabel(String(value))} />
            <Area
              type="monotone"
              dataKey="count"
              name="Sesi Konsultasi"
              stroke="var(--color-primary)"
              fill="var(--color-primary)"
              fillOpacity={0.15}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
