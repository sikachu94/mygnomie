import { useState, useRef, useEffect } from "react";
import { Mic, Square, Sparkles, Loader2, X, ChevronDown, List, Calendar as CalendarIcon, Pencil, Trash2 } from "lucide-react";
import { apiExtract } from "../api.js";
import { scopeOf, buildEvent, labelForEntity, labelForEventType, quickLogEvent, isAlertEvent, describeEventPayload } from "../lib/events.js";
import { uid, fmtTime, groupByDay } from "../lib/format.js";
import { fileToDataUrl } from "../lib/imageUtils.js";
import { EventIcon } from "./EventIcon.jsx";
import { Reminders } from "./Reminders.jsx";
import { buildReminders } from "../lib/reminders.js";
import { GardenCalendar } from "./GardenCalendar.jsx";
import { LogEntryForm } from "./LogEntryForm.jsx";

const RECENT_EVENT_WINDOW = 25;

export function CaptureTab({
  gardenId, plantings, containers, events, addEvent, updateEvent, deleteEvent,
  resetSignal, showToast, weather, onSelectPlanting,
  calendarTasks, onUpdateTask, onCompleteTask,
}) {
  const [note, setNote] = useState("");
  const [noteExpanded, setNoteExpanded] = useState(false);
  const [listening, setListening] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [drafts, setDrafts] = useState([]);
  const [extractError, setExtractError] = useState(null);
  const [savingDraftId, setSavingDraftId] = useState(null);
  const [savingAll, setSavingAll] = useState(false);
  const recognitionRef = useRef(null);

  const [logView, setLogView] = useState("activity");
  const [editingEvent, setEditingEvent] = useState(null);

  const notify = (message, kind = "success") => showToast?.(message, kind);

  const sortedEvents = [...events].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, RECENT_EVENT_WINDOW);
  const dayGroups = groupByDay(sortedEvents);
  const [expandedDays, setExpandedDays] = useState(() => new Set(dayGroups.slice(0, 2).map((g) => g.label)));

  useEffect(() => {
    setDrafts([]);
    setNoteExpanded(false);
    setExpandedDays(new Set(dayGroups.slice(0, 2).map((g) => g.label)));
    setEditingEvent(null);
    setLogView("activity");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  const toggleDay = (label) => setExpandedDays((prev) => {
    const next = new Set(prev);
    if (next.has(label)) next.delete(label); else next.add(label);
    return next;
  });
  const dayHasAlert = (group) => group.items.some((e) => isAlertEvent(e.event_type));

  const reminders = buildReminders(plantings, events, weather);

  const handleLogWatering = async (plantingId) => {
    try {
      await addEvent(quickLogEvent("watering", plantingId, gardenId));
      notify("Watered.");
    } catch (err) {
      notify("Couldn't save that — try again.", "error");
    }
  };

  const handleLogFertilizing = async (plantingId) => {
    try {
      await addEvent(quickLogEvent("fertilizing", plantingId, gardenId));
      notify("Fed.");
    } catch (err) {
      notify("Couldn't save that — try again.", "error");
    }
  };

  const handleDeleteEvent = async (eventId) => {
    if (!window.confirm("Delete this log entry? This can't be undone.")) return;
    try {
      await deleteEvent(eventId);
      notify("Entry deleted.");
    } catch (err) {
      notify("Couldn't delete that — try again.", "error");
    }
  };

  const runExtraction = async () => {
    if (!note.trim()) return;
    setExtracting(true); setExtractError(null);
    try {
      const { drafts: rawDrafts } = await apiExtract(gardenId, note);
      const withIds = (rawDrafts || []).map((d) => ({ ...d, draft_id: uid("draft"), media: [] }));
      setDrafts(withIds);
      if (!withIds.length) notify("Nothing to log in that note — try describing an action, like watering or a pest.", "error");
    } catch (err) {
      setExtractError("Couldn't read your note just now. Check your connection and that you're signed in, then try again.");
    } finally { setExtracting(false); }
  };

  function summarizeDraft(d) {
    const p = d.payload || {};
    switch (d.event_type) {
      case "watering": return `Watered${p.amount_l ? ` — ${p.amount_l}L` : ""}${p.method ? `, by ${p.method}` : ""}.`;
      case "fertilizing": return `Fertilized${p.fertilizer_type ? ` — ${p.fertilizer_type}` : ""}${p.amount ? `, ${p.amount}${p.unit || ""}` : ""}.`;
      case "pruning": return `${p.technique ? p.technique.charAt(0).toUpperCase() + p.technique.slice(1) : "Pruned"}${p.reason ? ` — ${p.reason}` : ""}.`;
      case "harvest": return `Harvested${p.quantity ? ` ${p.quantity}${p.unit ? ` ${p.unit}` : ""}` : ""}${p.quality ? `, ${p.quality} quality` : ""}.`;
      case "pest_sighting": return `Spotted ${p.pest || "a pest"}${p.severity ? `, ${p.severity} severity` : ""}.`;
      case "disease_sighting": return `Signs of ${p.disease || "disease"}${p.severity ? `, ${p.severity}` : ""}.`;
      case "pest_treatment": return `Treated ${p.target_pest || "a pest"}${p.method ? ` with ${p.method.replace(/_/g, " ")}` : ""}.`;
      case "disease_treatment": return `Treated ${p.target_disease || "disease"}${p.method ? ` with ${p.method.replace(/_/g, " ")}` : ""}.`;
      case "inspection": return "Checked in — no issues noted.";
      case "weeding": return `Weeded${p.area ? ` — ${p.area}` : ""}.`;
      case "relocated": return `Moved${p.new_placement ? ` to ${p.new_placement}` : ""}.`;
      case "soil_amended": return `Soil ${p.trigger ? p.trigger.replace(/_/g, " ") : "amended"}.`;
      case "transplanted": return `Transplanted${p.reason ? ` — ${p.reason}` : ""}.`;
      case "rainfall": return `${p.amount_mm ? `${p.amount_mm}mm of rain` : "Rain"} recorded.`;
      case "frost": return `Frost${p.severity ? ` (${p.severity})` : ""} recorded.`;
      case "growth_measurement": return `${p.metric || "Measurement"}: ${p.value ?? "—"}${p.unit ? ` ${p.unit}` : ""}.`;
      default: return "New entry.";
    }
  }

  const speechSupported = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const toggleListening = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    if (listening) { recognitionRef.current?.stop(); setListening(false); return; }
    const rec = new SR();
    rec.continuous = false; rec.interimResults = false; rec.lang = "en-US";
    rec.onresult = (e) => { const t = Array.from(e.results).map((r) => r[0].transcript).join(" "); setNote((prev) => (prev ? prev + " " + t : t)); };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec; rec.start(); setListening(true);
  };

  const updateDraftPlanting = (draftId, plantingId) => setDrafts((ds) => ds.map((d) => (d.draft_id === draftId ? { ...d, planting_id: plantingId } : d)));
  const updateDraftContainer = (draftId, containerId) => setDrafts((ds) => ds.map((d) => (d.draft_id === draftId ? { ...d, container_id: containerId } : d)));
  const discardDraft = (draftId) => setDrafts((ds) => ds.filter((d) => d.draft_id !== draftId));
  const attachDraftPhoto = async (draftId, file) => {
    if (!file) return;
    try { const dataUrl = await fileToDataUrl(file); setDrafts((ds) => ds.map((d) => (d.draft_id === draftId ? { ...d, media: [dataUrl] } : d))); }
    catch (err) { console.error(err); }
  };
  const removeDraftPhoto = (draftId) => setDrafts((ds) => ds.map((d) => (d.draft_id === draftId ? { ...d, media: [] } : d)));

  // A draft is "ready" (safe to save) once it has whatever target its scope
  // needs: garden-scoped drafts always are, planting/container-scoped ones
  // need the matching id filled in (either by the extractor or by the
  // person picking one from the dropdown below).
  const isDraftReady = (d) => {
    const draftScope = scopeOf(d.event_type);
    if (draftScope === "garden") return true;
    if (draftScope === "container") return !!d.container_id;
    return !!d.planting_id;
  };

  const saveDraft = async (draft) => {
    if (!isDraftReady(draft)) return;
    setSavingDraftId(draft.draft_id);
    try {
      await addEvent(buildEvent(draft, gardenId));
      discardDraft(draft.draft_id);
      notify("Saved to your log.");
    } catch (err) {
      notify("Couldn't save that entry — try again.", "error");
    } finally {
      setSavingDraftId(null);
    }
  };

  const readyDrafts = drafts.filter(isDraftReady);

  const saveAllDrafts = async () => {
    if (!readyDrafts.length) return;
    setSavingAll(true);
    try {
      await addEvent(readyDrafts.map((d) => buildEvent(d, gardenId)));
      setDrafts((ds) => ds.filter((d) => !isDraftReady(d)));
      setNote("");
      notify(`Saved ${readyDrafts.length} ${readyDrafts.length === 1 ? "entry" : "entries"} to your log.`);
    } catch (err) {
      notify("Couldn't save those entries — try again.", "error");
    } finally {
      setSavingAll(false);
    }
  };

  return (
    <section className="sg-panel">
      <h1>What's happening in the garden?</h1>
      <p className="sg-sub">Log an entry, snap a photo, or speak or type a note — whichever's fastest.</p>

      {plantings.length > 0 && (
        <div className="sg-reminders-section">
          <h2>Needs attention</h2>
          <Reminders reminders={reminders} onLogWatering={handleLogWatering} onLogFertilizing={handleLogFertilizing} />
        </div>
      )}

      <p className="sg-form-label" style={{ margin: "18px 0 8px" }}>Log entry</p>
      <LogEntryForm
        gardenId={gardenId} plantings={plantings} containers={containers} events={events} weather={weather}
        addEvent={addEvent} updateEvent={updateEvent} notify={notify}
        editingEvent={editingEvent} onDoneEditing={() => setEditingEvent(null)}
      />

      {!noteExpanded ? (
        <button className="sg-note-toggle" onClick={() => setNoteExpanded(true)}>
          <Mic size={14} /> Or describe it in your own words
        </button>
      ) : (
        <div className="sg-capture-box">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Watered the balcony tomato, and I think the basil has some aphids on the underside of the leaves" rows={4} autoFocus />
          <div className="sg-capture-actions">
            {speechSupported && (
              <button className={`sg-mic ${listening ? "on" : ""}`} onClick={toggleListening}>
                {listening ? <Square size={14} /> : <Mic size={14} />} {listening ? "Stop" : "Speak instead"}
              </button>
            )}
            <button className="sg-primary" disabled={!note.trim() || extracting} onClick={runExtraction}>
              {extracting ? <Loader2 className="spin" size={14} /> : <Sparkles size={14} />} Find events in this note
            </button>
          </div>
          {extractError && <div className="sg-error">{extractError}</div>}
        </div>
      )}

      {drafts.length > 0 && (
        <div className="sg-drafts">
          <div className="sg-drafts-head">
            <h2>Found in your note</h2>
            <button className="sg-primary sm" disabled={!readyDrafts.length || savingAll} onClick={saveAllDrafts}>
              {savingAll ? <Loader2 className="spin" size={12} /> : null} Save all ({readyDrafts.length})
            </button>
          </div>
          {drafts.map((d) => {
            const draftScope = scopeOf(d.event_type);
            const needsTarget = !isDraftReady(d);
            return (
              <div key={d.draft_id} className="sg-draft-card">
                <div className="sg-draft-row">
                  <span className="sg-pill">{labelForEventType(d.event_type)}</span>
                  <button className="sg-icon-btn" onClick={() => discardDraft(d.draft_id)} aria-label="Discard this suggestion"><X size={14} /></button>
                </div>
                <div className="sg-draft-summary">{summarizeDraft(d)}</div>
                {d.note && <div className="sg-draft-note">"{d.note}"</div>}
                <div className="sg-draft-row">
                  {d.media?.length ? (
                    <div className="sg-photo-thumb"><img src={d.media[0]} alt="attached" /><button onClick={() => removeDraftPhoto(d.draft_id)}><X size={10} /></button></div>
                  ) : (
                    <label className="sg-photo-add"><Sparkles size={13} /><input type="file" accept="image/*" hidden onChange={(e) => attachDraftPhoto(d.draft_id, e.target.files?.[0])} /></label>
                  )}
                  {draftScope === "garden" ? (
                    <span className="sg-pill muted">Applies to the whole garden</span>
                  ) : draftScope === "container" ? (
                    <select value={d.container_id || ""} onChange={(e) => updateDraftContainer(d.draft_id, e.target.value)}>
                      <option value="">Which container is this?</option>
                      {containers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  ) : (
                    <select value={d.planting_id || ""} onChange={(e) => updateDraftPlanting(d.draft_id, e.target.value)}>
                      <option value="">Which plant is this?</option>
                      {plantings.map((p) => <option key={p.id} value={p.id}>{p.nickname}</option>)}
                    </select>
                  )}
                  <button className="sg-secondary sm" disabled={needsTarget || savingDraftId === d.draft_id} onClick={() => saveDraft(d)}>
                    {savingDraftId === d.draft_id ? <Loader2 className="spin" size={12} /> : "Save"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="sg-recent">
        <div className="sg-recent-head">
          <div className="sg-view-toggle" role="tablist" aria-label="Log view">
            <button type="button" role="tab" aria-selected={logView === "activity"} className={`sg-view-toggle-btn${logView === "activity" ? " active" : ""}`} onClick={() => setLogView("activity")}>
              <List size={13} /> Recent activity
            </button>
            <button type="button" role="tab" aria-selected={logView === "calendar"} className={`sg-view-toggle-btn${logView === "calendar" ? " active" : ""}`} onClick={() => setLogView("calendar")}>
              <CalendarIcon size={13} /> Calendar
            </button>
          </div>
        </div>

        {logView === "calendar" ? (
          <GardenCalendar
            plantings={plantings} events={events} calendarTasks={calendarTasks}
            onUpdateTask={onUpdateTask} onCompleteTask={onCompleteTask}
            onSelectPlanting={onSelectPlanting}
          />
        ) : dayGroups.length === 0 ? (
          <div className="sg-empty">Nothing logged yet. Try a quick action above, or write a note.</div>
        ) : (
          dayGroups.map((group) => {
            const isOpen = expandedDays.has(group.label);
            const alert = dayHasAlert(group);
            return (
              <div key={group.label} className="sg-day-group">
                {isOpen ? (
                  <button className="sg-day-label" onClick={() => toggleDay(group.label)} aria-expanded="true">{group.label}</button>
                ) : (
                  <button className={`sg-day-toggle ${alert ? "alert" : ""}`} onClick={() => toggleDay(group.label)} aria-expanded="false">
                    <span>{group.label} · {group.items.length} {group.items.length === 1 ? "entry" : "entries"}{alert ? " · needs attention" : ""}</span>
                    <ChevronDown size={14} />
                  </button>
                )}
                {isOpen && group.items.map((e) => {
                  const isAlert = isAlertEvent(e.event_type);
                  const entityLabel = labelForEntity(e, plantings, containers);
                  const detail = describeEventPayload(e.event_type, e.payload);
                  const plantingId = e.entity_type === "planting" ? e.entity_id : null;
                  return (
                    <div key={e.id} className={`sg-event-row ${isAlert ? "alert" : ""}`}>
                      <EventIcon type={e.event_type} />
                      <div className="sg-event-body">
                        <div className="sg-event-title">{labelForEventType(e.event_type)}</div>
                        <div className="sg-event-meta">
                          {plantingId ? (
                            <button type="button" className="sg-entity-link" onClick={() => onSelectPlanting?.(plantingId)}>{entityLabel}</button>
                          ) : entityLabel}
                          {detail ? ` · ${detail}` : ""}
                        </div>
                        {e.note && <div className="sg-event-note">"{e.note}"</div>}
                        {e.media?.length ? <img className="sg-event-thumb" src={e.media[0]} alt="" /> : null}
                      </div>
                      <div className="sg-event-row-side">
                        <div className="sg-event-time">{fmtTime(e.timestamp)}</div>
                        <div className="sg-event-row-actions">
                          <button className="sg-icon-btn xs" onClick={() => setEditingEvent(e)} aria-label="Edit entry"><Pencil size={13} /></button>
                          <button className="sg-icon-btn xs" onClick={() => handleDeleteEvent(e.id)} aria-label="Delete entry"><Trash2 size={13} /></button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
      <p className="sg-footnote">Tap the pencil to edit an entry, or the trash icon to remove it.</p>
    </section>
  );
}
