import { useState } from "react";
import { Umbrella, Home, CloudSun, X, Loader2 } from "lucide-react";

/**
 * One-tap follow-up shown right after a frost gets auto-logged. Lets the
 * gardener say what they actually did about it — closing the loop the
 * auto-logger otherwise leaves open — without making it required; dismissing
 * is always available. Defaults the container selection to movable ones,
 * since those are the containers a frost response usually applies to, but
 * lets any container be picked (a raised bed can still be covered).
 */
export function WeatherProtectionPrompt({ prompt, containers, onLog, onDismiss }) {
    const [selected, setSelected] = useState(
        () => new Set(containers.filter((c) => c.mobility === "movable").map((c) => c.id))
    );
    const [saving, setSaving] = useState(null);

    if (!prompt || containers.length === 0) return null;

    const toggle = (id) => setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    const act = async (action) => {
        setSaving(action);
        try {
            await onLog(Array.from(selected), action);
        } finally {
            setSaving(null);
        }
    };

    return (
        <div className="sg-frost-prompt">
            <div className="sg-frost-prompt-head">
                <span>{prompt.severity === "hard" ? "Hard frost" : "Light frost"} tonight — protect anything?</span>
                <button className="sg-icon-btn" onClick={onDismiss} aria-label="Dismiss"><X size={14} /></button>
            </div>
            {containers.length > 1 && (
                <div className="sg-target-chips">
                    {containers.map((c) => (
                        <button
                            key={c.id} type="button"
                            className={`sg-chip${selected.has(c.id) ? " active" : ""}`}
                            aria-pressed={selected.has(c.id)}
                            onClick={() => toggle(c.id)}
                        >
                            {c.name}
                        </button>
                    ))}
                </div>
            )}
            <div className="sg-frost-prompt-actions">
                <button className="sg-secondary sm" disabled={!selected.size || !!saving} onClick={() => act("covered")}>
                    {saving === "covered" ? <Loader2 className="spin" size={12} /> : <Umbrella size={12} />} Covered
                </button>
                <button className="sg-secondary sm" disabled={!selected.size || !!saving} onClick={() => act("moved_indoors")}>
                    {saving === "moved_indoors" ? <Loader2 className="spin" size={12} /> : <Home size={12} />} Moved indoors
                </button>
                <button className="sg-secondary sm" disabled={!selected.size || !!saving} onClick={() => act("shade_provided")}>
                    {saving === "shade_provided" ? <Loader2 className="spin" size={12} /> : <CloudSun size={12} />} Shaded
                </button>
            </div>
        </div>
    );
}