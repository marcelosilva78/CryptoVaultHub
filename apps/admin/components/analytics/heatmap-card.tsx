"use client";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 24 }, (_, i) =>
  i.toString().padStart(2, "0")
);

interface HeatmapCardProps {
  title: string;
  data: { hour: number; day: number; value: number }[];
}

/**
 * Gold-scale heatmap: from surface-elevated (no activity) to accent-primary (max activity).
 * Uses interpolated gold tones to stay monochromatic.
 */
function getColor(value: number, max: number): string {
  const ratio = max > 0 ? value / max : 0;
  if (ratio < 0.15) return "var(--surface-elevated)";
  if (ratio < 0.35) return "rgba(226, 168, 40, 0.15)";
  if (ratio < 0.55) return "rgba(226, 168, 40, 0.35)";
  if (ratio < 0.75) return "rgba(226, 168, 40, 0.55)";
  return "var(--accent-primary)";
}

export function HeatmapCard({ title, data }: HeatmapCardProps) {
  const max = Math.max(...data.map((d) => d.value));

  return (
    <div className="rounded-card border border-border-default bg-surface-card p-card-p shadow-card">
      <h3 className="mb-4 font-display text-subheading text-text-primary">{title}</h3>
      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          {/* Hour labels — text-muted, 9px */}
          <div className="flex ml-10 mb-1">
            {HOURS.filter((_, i) => i % 3 === 0).map((h) => (
              <span
                key={h}
                className="font-display text-[9px] text-text-muted"
                style={{ width: `${(3 / 24) * 100}%` }}
              >
                {h}:00
              </span>
            ))}
          </div>

          {/* Grid — cells: rounded-[2px], 1px gap */}
          {DAYS.map((day, dayIdx) => (
            <div key={day} className="flex items-center gap-[1px] mb-[1px]">
              <span className="w-9 pr-1 text-right font-display text-[9px] text-text-muted">
                {day}
              </span>
              <div className="flex flex-1 gap-[1px]">
                {HOURS.map((_, hourIdx) => {
                  const cell = data.find(
                    (d) => d.day === dayIdx && d.hour === hourIdx
                  );
                  return (
                    <div
                      key={hourIdx}
                      className="flex-1 aspect-square rounded-[2px]"
                      style={{
                        backgroundColor: getColor(cell?.value ?? 0, max),
                        minHeight: "16px",
                      }}
                      title={`${day} ${HOURS[hourIdx]}:00 \u2014 ${cell?.value ?? 0} tx`}
                    />
                  );
                })}
              </div>
            </div>
          ))}

          {/* Legend */}
          <div className="flex items-center justify-end gap-1.5 mt-3">
            <span className="font-display text-[9px] text-text-muted">Less</span>
            {[0.1, 0.3, 0.5, 0.7, 0.9].map((r) => (
              <div
                key={r}
                className="h-3 w-3 rounded-[2px]"
                style={{ backgroundColor: getColor(r * max, max) }}
              />
            ))}
            <span className="font-display text-[9px] text-text-muted">More</span>
          </div>
        </div>
      </div>
    </div>
  );
}
