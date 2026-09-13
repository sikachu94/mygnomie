import { useState } from "react";
import { History, ChevronDown, ChevronUp } from "lucide-react";
import { buildContainerHistory } from "../lib/containerHistory.js";
import { fmtDate } from "../lib/format.js";

/** Collapsed by default — occupancy history is hindsight, not a daily need. */
export function ContainerHistoryPanel({ container, plantings, events, onSelectPlanting }) {
    const [open, setOpen] = useState(false);
    if (!container) return null;

    const history = buildContainerHistory(container.id, plantings, events);
    if (history.length === 0) return null;

    return (
        <div className="sg-container-history">
            <button className="sg-note-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
                <History size={13} /> {open ? "Hide" : "Show"} what's grown here ({history.length})
                {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
            {open && (
                <div className="sg-container-history-list">
                    {history.map((entry, i) => (
                        <div key={`${entry.planting.id}-${i}`} className="sg-container-history-row">
                            <button type="button" className="sg-entity-link" onClick={() => onSelectPlanting?.(entry.planting.id)}>
                                {entry.planting.nickname}
                            </button>
                            <span className="sg-container-history-meta">
                                {fmtDate(entry.entered_at)} – {entry.left_at ? fmtDate(entry.left_at) : "present"}
                                {entry.harvest_count ? ` · ${entry.harvest_count} harvest${entry.harvest_count === 1 ? "" : "s"}` : ""}
                                {entry.had_issue ? " · had an open issue" : ""}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}