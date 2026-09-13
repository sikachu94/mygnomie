import { useState } from "react";
import { ChevronLeft, ChevronDown, Box, Layers, MapPin, Bug, Sprout, Sun, Pencil, Trash2, CircleCheck as CheckCircle2 } from "lucide-react";
import { estimateSpeciesReference } from "../lib/speciesEstimates.js";
import { projectPlanting, projectContainer } from "../lib/projections.js";
import { fmtDate, fmtTime, formatComposition, groupByDay } from "../lib/format.js";
import { friendlyStage } from "../lib/reminders.js";
import { labelForEventType, isAlertEvent, describeEventPayload } from "../lib/events.js";
import { GenericPlantImage } from "./PlantCard.jsx";
import { EventIcon } from "./EventIcon.jsx";
import { LogEntryForm } from "./LogEntryForm.jsx";

/**
 * The "zoom in" screen for a single plant, reached by tapping its card in
 * the Garden tab. Hosts the same log-entry form as the Log tab, locked to
 * this plant, plus its container info, siblings, ideal-conditions
 * reference data, and its own editable history.
 */
export function PlantDetail({ planting, plantings, containers, events, garden, addEvent, updateEvent, deleteEvent, showToast, onBack, onSelectPlanting }) {
  const proj = projectPlanting(planting, events);
  const meta = estimateSpeciesReference(planting.species_info);
  const container = containers.find((c) => c.id === proj.container_id);
  const contState = projectContainer(container, events);
  const coverImage = proj.cover_image || contState?.cover_image;
  const isReady = meta && proj.stage === meta.target_stage && proj.status === "active";
  const isBolting = meta?.flowering_signal === "decline_warning" && proj.stage === "flowering" && proj.status === "active";
  const usda = planting.species_info;
  const hasUsdaData = usda && [
    "ph_min", "ph_max", "precipitation_min_in", "precipitation_max_in",
    "moisture_use", "drought_tolerance", "shade_tolerance", "growth_habit", "bloom_period",
    "usda_source_url",
  ].some((field) => usda[field] !== null && usda[field] !== undefined && usda[field] !== "");

  const [editingEvent, setEditingEvent] = useState(null);
  const notify = (message, kind = "success") => showToast?.(message, kind);

  const handleDeleteEvent = async (eventId) => {
    if (!window.confirm("Delete this log entry? This can't be undone.")) return;
    try {
      await deleteEvent(eventId);
      notify("Entry deleted.");
    } catch (err) {
      notify("Couldn't delete that — try again.", "error");
    }
  };

  const siblings = container
    ? (plantings || [])
      .filter((p) => p.id !== planting.id)
      .filter((p) => projectPlanting(p, events).container_id === container.id)
    : [];

  const relevantEvents = events
    .filter((e) => (e.entity_type === "planting" && e.entity_id === planting.id) || (e.entity_type === "container" && container && e.entity_id === container.id))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const dayGroups = groupByDay(relevantEvents);
  const [visibleDays, setVisibleDays] = useState(2);
  const visibleGroups = dayGroups.slice(0, visibleDays);
  const hiddenCount = dayGroups.slice(visibleDays).reduce((sum, g) => sum + g.items.length, 0);

  return (
    <section className="sg-panel">
      <button className="sg-back-link" onClick={onBack}><ChevronLeft size={16} /> Garden</button>

      <div className="sg-plant-detail-head">
        <div className="sg-cover sm">
          {coverImage ? <img src={coverImage} alt={planting.nickname} /> : <div className="sg-cover-generic"><GenericPlantImage harvestType={planting.species_info?.harvest_type} size={26} /></div>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="sg-plant-name">{planting.nickname}</div>
          <div className="sg-plant-species">{planting.species}</div>
        </div>
        {isReady ? (
          <span className="sg-stage ready"><CheckCircle2 size={11} /> Ready</span>
        ) : isBolting ? (
          <span className="sg-stage ready">Harvest soon</span>
        ) : (
          <span className={`sg-stage ${proj.status === "ended" ? "ended" : ""}`}>{friendlyStage(proj.stage)}</span>
        )}
      </div>

      <div className="sg-plant-detail-stats">
        <div><span>Age</span><strong>{proj.days_since_entry}d</strong></div>
        <div><span>Watered</span><strong>{proj.last_watered_at ? fmtDate(proj.last_watered_at) : "—"}</strong></div>
        <div><span>Harvests</span><strong>{proj.harvest_count || "—"}</strong></div>
      </div>

      {container && (
        <div className="sg-container-info" style={{ margin: "16px 0 16px", border: "none", padding: 0 }}>
          <span><Box size={12} /> {container.type.replace("_", " ")} · {container.material}{container.volume_l ? ` · ${container.volume_l}L` : ""}</span>
          <span><Layers size={12} /> {formatComposition(contState.soil_composition)}</span>
          <span><MapPin size={12} /> {contState.placement}</span>
        </div>
      )}

      {siblings.length > 0 && (
        <div className="sg-siblings-section">
          <h2>Also in this container</h2>
          <div className="sg-siblings-row">
            {siblings.map((sib) => {
              const sibProj = projectPlanting(sib, events);
              return (
                <button key={sib.id} className="sg-sibling" onClick={() => onSelectPlanting?.(sib.id)}>
                  <div className="sg-sibling-avatar">
                    {sibProj.cover_image ? <img src={sibProj.cover_image} alt={sib.nickname} /> : <GenericPlantImage harvestType={sib.species_info?.harvest_type} size={18} />}
                  </div>
                  <span>{sib.nickname}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {proj.open_issue && (
        <div className="sg-issue" style={{ margin: "0 0 16px" }}>
          <Bug size={13} /> {proj.open_issue.payload?.pest || proj.open_issue.payload?.disease} · {proj.open_issue.payload?.severity} · {fmtDate(proj.open_issue.timestamp)}
        </div>
      )}

      {planting.species_info && (
        <div className="sg-ideal-card">
          <div className="sg-ideal-card-head">
            <div className="sg-ideal-card-names">
              {planting.species_info.latin_name && <span className="sg-latin-name">{planting.species_info.latin_name}</span>}
              {planting.species_info.usda_common_name && planting.species_info.usda_common_name !== planting.species && (
                <span className="sg-common-name">Also known as {planting.species_info.usda_common_name}</span>
              )}
            </div>
            {planting.species_info.usda_symbol && <span className="sg-pill muted">{planting.species_info.usda_symbol}</span>}
          </div>

          {meta && (
            <div className="sg-care-row">
              <span><Sprout size={13} /> Water every ~{meta.water_frequency_days}d</span>
              <span><Sun size={13} /> {meta.sun_hours[0]}–{meta.sun_hours[1]}h sun/day</span>
            </div>
          )}

          {(planting.species_info.variety || planting.species_info.life_cycle_type || planting.species_info.harvest_type) && (
            <div className="sg-ideal-rows">
              {planting.species_info.variety && <div><span>Variety</span><strong>{planting.species_info.variety}</strong></div>}
              {planting.species_info.life_cycle_type && <div><span>Life cycle</span><strong>{planting.species_info.life_cycle_type}</strong></div>}
              {planting.species_info.harvest_type && <div><span>Harvest type</span><strong>{planting.species_info.harvest_type}</strong></div>}
            </div>
          )}

          {hasUsdaData && (
            <div className="sg-usda-panel">
              <div className="sg-usda-title">USDA reference data</div>
              <div className="sg-usda-rows">
                {usda.ph_min != null && usda.ph_max != null && <div><span>Soil pH</span><strong>pH {usda.ph_min}–{usda.ph_max}</strong></div>}
                {usda.precipitation_min_in != null && usda.precipitation_max_in != null && <div><span>Annual precipitation</span><strong>{usda.precipitation_min_in}–{usda.precipitation_max_in} in/yr</strong></div>}
                {usda.moisture_use && <div><span>Moisture use</span><strong>{usda.moisture_use}</strong></div>}
                {usda.drought_tolerance && <div><span>Drought tolerance</span><strong>{usda.drought_tolerance}</strong></div>}
                {usda.shade_tolerance && <div><span>Shade tolerance</span><strong>{usda.shade_tolerance}</strong></div>}
                {usda.growth_habit && <div><span>Growth habit</span><strong>{usda.growth_habit}</strong></div>}
                {usda.bloom_period && <div><span>Bloom period</span><strong>{usda.bloom_period}</strong></div>}
              </div>
              {usda.usda_source_url && <a className="sg-usda-source" href={usda.usda_source_url} target="_blank" rel="noreferrer">Source: USDA PLANTS Database</a>}
            </div>
          )}
        </div>
      )}

      <p className="sg-form-label" style={{ margin: "18px 0 8px" }}>Log entry</p>
      <LogEntryForm
        gardenId={garden?.id} lockedPlantingId={planting.id}
        containers={containers} lockedContainerId={container?.id}
        addEvent={addEvent} updateEvent={updateEvent} notify={notify}
        editingEvent={editingEvent} onDoneEditing={() => setEditingEvent(null)}
      />

      <div className="sg-recent">
        <h2>History</h2>
        {relevantEvents.length === 0 ? (
          <div className="sg-empty">Nothing logged for {planting.nickname} yet.</div>
        ) : (
          <>
            {visibleGroups.map((group) => (
              <div key={group.label} className="sg-day-group">
                <div className="sg-day-label">{group.label}</div>
                {group.items.map((e) => {
                  const isAlert = isAlertEvent(e.event_type);
                  const detail = describeEventPayload(e.event_type, e.payload);
                  return (
                    <div key={e.id} className={`sg-event-row ${isAlert ? "alert" : ""}`}>
                      <EventIcon type={e.event_type} />
                      <div className="sg-event-body">
                        <div className="sg-event-title">{labelForEventType(e.event_type)}</div>
                        {detail && <div className="sg-event-meta">{detail}</div>}
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
            ))}
            {hiddenCount > 0 && (
              <button className="sg-day-toggle" onClick={() => setVisibleDays(dayGroups.length)}>
                <span>{hiddenCount} earlier {hiddenCount === 1 ? "entry" : "entries"}</span>
                <ChevronDown size={14} />
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
