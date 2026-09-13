import { useState, useEffect, useRef } from "react";
import { X, ImagePlus, Plus, Loader2, MoreHorizontal } from "lucide-react";
import {
    scopeOf, MANUAL_ENTRY_TYPES, MANUAL_ENTRY_PRIMARY, MANUAL_ENTRY_MORE_GROUPS,
    MANUAL_ENTRY_LABELS, MANUAL_ENTRY_FIELDS, buildManualEvents,
} from "../lib/events.js";
import { fileToDataUrl } from "../lib/imageUtils.js";
import { buildReminders, pickPriorityPlanting } from "../lib/reminders.js";
import { EventIcon } from "./EventIcon.jsx";
import { getChipUsage, recordChipUsage, sortByUsage } from "../lib/chipUsage.js";

function defaultTargetsForType(type, plantings, events, weather) {
    // Container-scoped types (relocated, soil_amended, weeding) have no
    // reminder-driven signal yet — the person always picks explicitly.
    if (scopeOf(type) !== "planting") return new Set();

    const kindByType = {
        watering: "water", harvest: "harvest",
        pest_sighting: "issue", disease_sighting: "issue",
        pest_treatment: "issue", disease_treatment: "issue",
        fertilizing: "fertilize",
    };
    const kind = kindByType[type];
    if (kind) {
        const flagged = buildReminders(plantings, events, weather).filter((r) => r.kind === kind).map((r) => r.planting_id);
        if (flagged.length) return new Set(flagged);
    }
    const fallback = pickPriorityPlanting(plantings, events, weather);
    return fallback ? new Set([fallback.id]) : new Set();
}

/**
 * Shared "log an entry" UI: a row of type chips (the most common actions)
 * plus a "More" overflow grouped by theme, expanding into one focused entry
 * sheet. Used unscoped on the Log tab, and locked to a single plant on that
 * plant's detail page (pass `lockedPlantingId`) — locking hides the target
 * picker and drops garden-scoped types, since a single plant's page isn't
 * the place to log a whole-garden note.
 *
 * Container-scoped types (relocated, soil_amended, weeding, and
 * transplanted's "move to" field) target `containers` instead of
 * `plantings`. When locked to a planting, pass `lockedContainerId` (that
 * planting's current container) so relocating/amending its pot doesn't
 * require re-picking it — if it's omitted, the person gets the normal
 * container picker instead.
 *
 * Pass `editingEvent` to switch into edit mode: the sheet opens directly
 * (no trigger chips) pre-filled from that event, and Save calls
 * `updateEvent` instead of `addEvent`.
 */
export function LogEntryForm({
    gardenId, plantings = [], containers = [], events = [], weather,
    lockedPlantingId, lockedContainerId, addEvent, updateEvent, notify,
    editingEvent, onDoneEditing,
}) {
    const isEditing = !!editingEvent;
    const [usageCounts, setUsageCounts] = useState({});
    useEffect(() => { getChipUsage().then(setUsageCounts); }, []);
    const availableTypes = MANUAL_ENTRY_TYPES.filter((t) => !lockedPlantingId || scopeOf(t) !== "garden");
    const primaryTypes = sortByUsage(MANUAL_ENTRY_PRIMARY.filter((t) => availableTypes.includes(t)), usageCounts);
    const moreGroups = MANUAL_ENTRY_MORE_GROUPS
        .map((g) => ({ ...g, types: g.types.filter((t) => availableTypes.includes(t)) }))
        .filter((g) => g.types.length > 0);

    const [formOpen, setFormOpen] = useState(false);
    const [showMore, setShowMore] = useState(false);
    const [moreOpen, setMoreOpen] = useState(false); // note/photo disclosure — unrelated to the chip overflow above
    const [type, setType] = useState(primaryTypes[0] || availableTypes[0]);
    const [targets, setTargets] = useState(() => new Set(lockedPlantingId ? [lockedPlantingId] : lockedContainerId ? [lockedContainerId] : []));
    const [values, setValues] = useState({});
    const [note, setNote] = useState("");
    const [photo, setPhoto] = useState(null);
    const [saving, setSaving] = useState(false);
    const wrapperRef = useRef(null);

    const scope = scopeOf(type);
    const gardenScoped = scope === "garden";
    const containerScoped = scope === "container";
    const pickList = containerScoped ? containers : plantings;
    const targetNoun = containerScoped ? "container" : "plant";
    const lockedTargetId = containerScoped ? lockedContainerId : lockedPlantingId;

    const resetFields = (nextType) => {
        setValues({}); setNote(""); setPhoto(null); setMoreOpen(false);
        const nextScope = scopeOf(nextType);
        if (nextScope === "garden") { setTargets(new Set()); return; }
        if (nextScope === "container") { setTargets(new Set(lockedContainerId ? [lockedContainerId] : [])); return; }
        if (lockedPlantingId) { setTargets(new Set([lockedPlantingId])); return; }
        setTargets(defaultTargetsForType(nextType, plantings, events, weather));
    };

    const selectType = (nextType) => { setType(nextType); resetFields(nextType); };

    const openForType = (nextType) => {
        selectType(nextType);
        setFormOpen(true);
        requestAnimationFrame(() => wrapperRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    };

    const closeForm = () => setFormOpen(false);

    const handleTriggerClick = (nextType) => {
        if (formOpen && type === nextType) { closeForm(); return; }
        openForType(nextType);
    };
    // Keep a sensible default target selected as the plant list loads in —
    // skipped when locked to one plant/container, or for container-scoped
    // types (no reminder signal to default from yet).
    useEffect(() => {
        if (lockedPlantingId || lockedContainerId) return;
        if (scopeOf(type) !== "planting") return;
        setTargets((prev) => (prev.size ? prev : defaultTargetsForType(type, plantings, events, weather)));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [plantings.length, lockedPlantingId, lockedContainerId, type]);

    // Enter edit mode: pre-fill the sheet from the event being edited.
    useEffect(() => {
        if (!editingEvent) return;
        setType(editingEvent.event_type);
        setTargets(new Set(editingEvent.entity_type === "garden" ? [] : [editingEvent.entity_id]));
        const fields = MANUAL_ENTRY_FIELDS[editingEvent.event_type] || [];
        const nextValues = {};
        for (const field of fields) {
            const raw = editingEvent.payload?.[field.key];
            if (raw !== undefined && raw !== null) nextValues[field.key] = raw;
        }
        setValues(nextValues);
        setNote(editingEvent.note || "");
        setPhoto(editingEvent.media?.[0] || null);
        setMoreOpen(!!(editingEvent.note || editingEvent.media?.length));
        setFormOpen(true);
        requestAnimationFrame(() => wrapperRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }, [editingEvent]);

    const toggleTarget = (id) => setTargets((prev) => {
        const next = new Set(prev);
        if (type === "photo_log") { next.clear(); next.add(id); return next; }
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });
    const selectAllTargets = () => setTargets(new Set(pickList.map((p) => p.id)));

    const attachPhoto = async (file) => {
        if (!file) return;
        try { setPhoto(await fileToDataUrl(file)); } catch (err) { console.error(err); }
    };

    const cancelEdit = () => { setFormOpen(false); onDoneEditing?.(); };

    const save = async () => {
        if (!gardenScoped && !targets.size) return;
        if (type === "photo_log" && !photo) return;
        setSaving(true);
        try {
            const fields = MANUAL_ENTRY_FIELDS[type] || [];
            const payload = {};
            for (const field of fields) {
                const raw = values[field.key];
                if (raw === undefined || raw === "") continue;
                payload[field.key] = field.kind === "number" ? Number(raw) : raw;
            }

            if (isEditing) {
                // Always send `media` explicitly (even []) so removing a photo
                // during edit actually clears it, rather than being dropped
                // silently as an "unset" field.
                await updateEvent(editingEvent.id, { payload, note: note.trim() || null, media: photo ? [photo] : [] });
                notify?.("Entry updated.");
                onDoneEditing?.();
                return;
            }

            const built = buildManualEvents({
                eventType: type, gardenId,
                targetIds: gardenScoped ? [] : Array.from(targets),
                payload, note: note.trim(), media: photo ? [photo] : undefined,
            });
            await addEvent(built);
            if (!isEditing) recordChipUsage(type);
            notify?.(
                gardenScoped
                    ? "Logged for the whole garden."
                    : `Logged ${MANUAL_ENTRY_LABELS[type].toLowerCase()} for ${built.length} ${built.length === 1 ? targetNoun : `${targetNoun}s`}.`
            );
            setValues({}); setNote(""); setPhoto(null); setMoreOpen(false); setFormOpen(false);
        } catch (err) {
            notify?.("Couldn't save that — try again.", "error");
        } finally {
            setSaving(false);
        }
    };

    const fields = MANUAL_ENTRY_FIELDS[type] || [];
    const showTargetPicker = !isEditing && !gardenScoped && !lockedTargetId;
    const submitLabel = isEditing
        ? "Save changes"
        : gardenScoped
            ? "Log for the whole garden"
            : lockedTargetId
                ? "Log entry"
                : `Log for ${targets.size} ${targets.size === 1 ? targetNoun : `${targetNoun}s`}`;

    return (
        <div className="sg-manual-section" ref={wrapperRef}>
            {!isEditing && (
                <>
                    <div className="sg-entry-trigger-row">
                        {primaryTypes.map((t) => (
                            <button
                                key={t} type="button"
                                className={`sg-entry-trigger-chip${formOpen && type === t ? " active" : ""}`}
                                onClick={() => handleTriggerClick(t)}
                                aria-pressed={formOpen && type === t}
                            >
                                <EventIcon type={t} size={28} />
                                <span>{MANUAL_ENTRY_LABELS[t]}</span>
                            </button>
                        ))}
                        {moreGroups.length > 0 && (
                            <button
                                type="button"
                                className={`sg-entry-trigger-chip${showMore ? " active" : ""}`}
                                onClick={() => setShowMore((s) => !s)}
                                aria-pressed={showMore}
                                aria-expanded={showMore}
                            >
                                <div className="sg-stamp sg-stamp-moss" style={{ width: 28, height: 28, minWidth: 28 }}>
                                    <MoreHorizontal size={13} />
                                </div>
                                <span>More</span>
                            </button>
                        )}
                    </div>

                    {showMore && (
                        <div className="sg-entry-more-groups">
                            {moreGroups.map((g) => (
                                <div key={g.label} className="sg-entry-more-group">
                                    <div className="sg-form-label">{g.label}</div>
                                    <div className="sg-entry-trigger-row">
                                        {g.types.map((t) => (
                                            <button
                                                key={t} type="button"
                                                className={`sg-entry-trigger-chip${formOpen && type === t ? " active" : ""}`}
                                                onClick={() => handleTriggerClick(t)}
                                                aria-pressed={formOpen && type === t}
                                            >
                                                <EventIcon type={t} size={28} />
                                                <span>{MANUAL_ENTRY_LABELS[t]}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            {formOpen && (
                <div className="sg-entry-sheet">
                    <div className="sg-entry-sheet-head">
                        <span>{isEditing ? `Edit ${MANUAL_ENTRY_LABELS[type]?.toLowerCase()}` : MANUAL_ENTRY_LABELS[type]}</span>
                        <button className="sg-icon-btn" onClick={isEditing ? cancelEdit : closeForm} aria-label="Close">
                            <X size={16} />
                        </button>
                    </div>

                    {showTargetPicker && (
                        <div className="sg-entry-targets">
                            <div className="sg-target-header">
                                <span className="sg-form-label">Which {targetNoun}{type !== "photo_log" ? "s" : ""}?</span>
                                {type !== "photo_log" && pickList.length > 1 && (
                                    <button className="sg-select-all" onClick={selectAllTargets}>Select all</button>
                                )}
                            </div>
                            {pickList.length === 0 ? (
                                <p className="sg-empty">
                                    {containerScoped ? "Add a container first — see the Garden tab." : "Add a plant first — see the Garden tab."}
                                </p>
                            ) : (
                                <div className="sg-target-chips">
                                    {pickList.map((item) => (
                                        <button
                                            key={item.id} type="button"
                                            className={`sg-chip${targets.has(item.id) ? " active" : ""}`}
                                            aria-pressed={targets.has(item.id)}
                                            onClick={() => toggleTarget(item.id)}
                                        >
                                            {containerScoped ? item.name : item.nickname}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {fields.length > 0 && (
                        <div className="sg-entry-fields">
                            {fields.map((field) => (
                                <label key={field.key} className="sg-entry-field">
                                    <span>{field.label}</span>
                                    {field.key === "to_container_id" ? (
                                        <select value={values.to_container_id || ""} onChange={(e) => setValues((v) => ({ ...v, to_container_id: e.target.value }))}>
                                            <option value="">—</option>
                                            {containers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                    ) : field.kind === "select" ? (
                                        <select value={values[field.key] || ""} onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}>
                                            <option value="">—</option>
                                            {field.options.map((opt) => <option key={opt} value={opt}>{opt.replace(/_/g, " ")}</option>)}
                                        </select>
                                    ) : (
                                        <input
                                            type={field.kind}
                                            placeholder={field.placeholder || ""}
                                            value={values[field.key] || ""}
                                            onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                                        />
                                    )}
                                </label>
                            ))}
                        </div>
                    )}

                    {type === "photo_log" && (
                        <div className="sg-draft-row">
                            {photo ? (
                                <div className="sg-photo-thumb"><img src={photo} alt="attached" /><button onClick={() => setPhoto(null)}><X size={10} /></button></div>
                            ) : (
                                <label className="sg-photo-add wide">
                                    <ImagePlus size={13} /> Add a photo
                                    <input type="file" accept="image/*" hidden onChange={(e) => attachPhoto(e.target.files?.[0])} />
                                </label>
                            )}
                        </div>
                    )}

                    {!moreOpen ? (
                        <button className="sg-note-toggle" onClick={() => setMoreOpen(true)}>
                            <Plus size={13} /> Add a note{type !== "photo_log" ? " or photo" : ""} (optional)
                        </button>
                    ) : (
                        <div className="sg-entry-more">
                            <textarea className="sg-manual-note" placeholder="Add a note (optional)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
                            {type !== "photo_log" && (
                                <div className="sg-draft-row">
                                    {photo ? (
                                        <div className="sg-photo-thumb"><img src={photo} alt="attached" /><button onClick={() => setPhoto(null)}><X size={10} /></button></div>
                                    ) : (
                                        <label className="sg-photo-add wide">
                                            <ImagePlus size={13} /> Add a photo
                                            <input type="file" accept="image/*" hidden onChange={(e) => attachPhoto(e.target.files?.[0])} />
                                        </label>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="sg-entry-sheet-actions">
                        {isEditing && <button className="sg-secondary sg-entry-submit" onClick={cancelEdit} disabled={saving}>Cancel</button>}
                        <button
                            className="sg-primary sg-entry-submit"
                            disabled={saving || (!gardenScoped && targets.size === 0) || (type === "photo_log" && !photo)}
                            onClick={save}
                        >
                            {saving ? <Loader2 className="spin" size={14} /> : null} {submitLabel}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
