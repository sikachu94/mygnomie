import { Droplets, Scissors, Bug, FlaskConical, CircleCheck as CheckCircle2 } from "lucide-react";

const ICON = { water: Droplets, harvest: Scissors, issue: Bug, fertilize: FlaskConical };

export function Reminders({ reminders, onLogWatering, onLogFertilizing }) {
  if (!reminders || reminders.length === 0) {
    return (
      <div className="sg-reminders-done">
        <CheckCircle2 size={16} />
        <span>All caught up — nothing needs attention right now.</span>
      </div>
    );
  }

  return (
    <div className="sg-reminders">
      {reminders.map((r, i) => {
        const Icon = ICON[r.kind] || Droplets;
        return (
          <div key={`${r.planting_id}-${r.kind}-${i}`} className={`sg-reminder-card sg-reminder-${r.kind}`}>
            <div className="sg-reminder-icon"><Icon size={16} /></div>
            <div className="sg-reminder-body">
              <div className="sg-reminder-title">{r.title}</div>
              <div className="sg-reminder-detail">{r.detail}</div>
            </div>
            {r.kind === "water" && onLogWatering && (
              <button className="sg-secondary sm" onClick={() => onLogWatering(r.planting_id)}>
                <Droplets size={12} /> Watered
              </button>
            )}
            {r.kind === "fertilize" && onLogFertilizing && (
              <button className="sg-secondary sm" onClick={() => onLogFertilizing(r.planting_id)}>
                <FlaskConical size={12} /> Fed
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
