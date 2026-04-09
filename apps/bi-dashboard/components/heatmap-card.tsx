"use client";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 24 }, (_, i) =>
  i.toString().padStart(2, "0")
);

interface HeatmapCardProps {
  title: string;
  data: { hour: number; day: number; value: number }[];
  height?: number;
}

function getColor(value: number, max: number): string {
  const ratio = value / max;
  if (ratio < 0.2) return "#0c0c10";
  if (ratio < 0.4) return "#1e1b4b";
  if (ratio < 0.6) return "#3730a3";
  if (ratio < 0.8) return "#6366f1";
  return "#8b5cf6";
}

export function HeatmapCard({ title, data }: HeatmapCardProps) {
  const max = Math.max(...data.map((d) => d.value));

  return (
    <div className="rounded-xl border border-white/5 bg-bg-card p-5">
      <h3 className="mb-4 text-sm font-medium text-gray-300">{title}</h3>
      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          {/* Hour labels */}
          <div className="flex ml-10 mb-1">
            {HOURS.filter((_, i) => i % 3 === 0).map((h) => (
              <span
                key={h}
                className="text-[10px] text-gray-500"
                style={{ width: `${(3 / 24) * 100}%` }}
              >
                {h}:00
              </span>
            ))}
          </div>

          {/* Grid */}
          {DAYS.map((day, dayIdx) => (
            <div key={day} className="flex items-center gap-1 mb-0.5">
              <span className="w-9 text-[10px] text-gray-500 text-right pr-1">
                {day}
              </span>
              <div className="flex flex-1 gap-px">
                {HOURS.map((_, hourIdx) => {
                  const cell = data.find(
                    (d) => d.day === dayIdx && d.hour === hourIdx
                  );
                  return (
                    <div
                      key={hourIdx}
                      className="flex-1 aspect-square rounded-sm"
                      style={{
                        backgroundColor: getColor(cell?.value ?? 0, max),
                        minHeight: "16px",
                      }}
                      title={`${day} ${HOURS[hourIdx]}:00 — ${cell?.value ?? 0} tx`}
                    />
                  );
                })}
              </div>
            </div>
          ))}

          {/* Legend */}
          <div className="flex items-center justify-end gap-1.5 mt-3">
            <span className="text-[10px] text-gray-500">Less</span>
            {[0.1, 0.3, 0.5, 0.7, 0.9].map((r) => (
              <div
                key={r}
                className="h-3 w-3 rounded-sm"
                style={{ backgroundColor: getColor(r * max, max) }}
              />
            ))}
            <span className="text-[10px] text-gray-500">More</span>
          </div>
        </div>
      </div>
    </div>
  );
}
