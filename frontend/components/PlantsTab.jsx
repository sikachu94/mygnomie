import { useState, useEffect } from "react";
import { Plus, X, ImagePlus, ChevronDown, ChevronUp, Trash2, Loader2 } from "lucide-react";
import { PHENOPHASES, PHENOPHASE_LABELS, ACQUISITION, ACQUISITION_LABELS, CONTAINER_TYPES, CONTAINER_TYPE_LABELS, CONTAINER_MATERIALS, GARDEN_TYPES, GARDEN_TYPE_LABELS } from "../lib/species.js";
import { uid, fmtDate } from "../lib/format.js";
import { fileToDataUrl } from "../lib/imageUtils.js";
import { PlantCard } from "./PlantCard.jsx";
import { PlantDetail } from "./PlantDetail.jsx";
import { Reminders } from "./Reminders.jsx";
import { buildReminders } from "../lib/reminders.js";
import { PlantSearch } from "./PlantSearch.jsx";

const blankSoilRow = () => ({ id: uid("soil"), component: "", percent: 0 });
const blankNewPlanting = () => ({
  nickname: "", species: "", plant: null, entry_stage: "seedling", acquisition_source: "purchased_seedling",
  containerMode: "new", containerId: "", containerType: "pot", material: "terracotta", containerSize: "", placement: "",
  soilComposition: [{ id: uid("soil"), component: "Potting mix", percent: 100 }],
  photo: null,
});

export function PlantsTab({
  garden, allGardens = [], onSwitchGarden, onCreateGarden, onDeleteGarden,
  plantings, containers, events, addPlanting, addPlantingPhoto, addEvent, updateEvent, deleteEvent,
  weather, updateGardenAndPersist, showToast, openAddSignal,
  selectedPlantingId, onSelectPlanting,
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [newPlanting, setNewPlanting] = useState(blankNewPlanting());
  const [draftName, setDraftName] = useState(garden?.name || "");
  const [draftNotes, setDraftNotes] = useState(garden?.notes || "");
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState(null);

  useEffect(() => {
    if (selectedPlantingId && !plantings.some((p) => p.id === selectedPlantingId)) onSelectPlanting(null);
  }, [selectedPlantingId, plantings, onSelectPlanting]);

  const detailsDirty =
    draftName !== (garden?.name || "") ||
    draftNotes !== (garden?.notes || "");

  const saveGardenDetails = async () => {
    if (!detailsDirty) return;
    setSavingDetails(true);
    setDetailsError(null);
    try {
      await updateGardenAndPersist({ name: draftName.trim() || "My garden", notes: draftNotes });
      showToast?.("Garden details saved.");
    } catch (err) {
      setDetailsError("Couldn't save — try again.");
    } finally {
      setSavingDetails(false);
    }
  };

  const [showAddGarden, setShowAddGarden] = useState(false);
  const [newGardenName, setNewGardenName] = useState("");
  const [newGardenType, setNewGardenType] = useState("balcony");
  const [creatingGarden, setCreatingGarden] = useState(false);

  const handleCreateGarden = async () => {
    if (!newGardenName.trim()) return;
    setCreatingGarden(true);
    try {
      await onCreateGarden({ name: newGardenName.trim(), type: newGardenType });
      setNewGardenName(""); setNewGardenType("balcony"); setShowAddGarden(false);
      showToast?.("Garden created.");
    } catch (err) {
      showToast?.("Couldn't create that garden — try again.", "error");
    } finally {
      setCreatingGarden(false);
    }
  };

  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [deletingGarden, setDeletingGarden] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const handleConfirmDelete = async () => {
    setDeletingGarden(true);
    setDeleteError(null);
    try {
      await onDeleteGarden(garden.id);
      showToast?.("Garden deleted.");
      setDeleteConfirming(false);
    } catch (err) {
      const match = /"detail":"([^"]+)"/.exec(err.message || "");
      setDeleteError(match ? match[1] : "Couldn't delete this garden — try again.");
    } finally {
      setDeletingGarden(false);
    }
  };
  // Guards against a dead-end detail view if the selected planting is ever
  // removed out from under it (e.g. after a demo reset).
  useEffect(() => {
    if (selectedPlantingId && !plantings.some((p) => p.id === selectedPlantingId)) setSelectedPlantingId(null);
  }, [selectedPlantingId, plantings]);

  // The Log tab's "New plant" quick action switches to this tab and bumps
  // openAddSignal — open the add-plant form in response.
  useEffect(() => {
    if (openAddSignal) setShowAddForm(true);
  }, [openAddSignal]);

  const handleNewPlantingPhoto = async (file) => {
    if (!file) return;
    try { const dataUrl = await fileToDataUrl(file); setNewPlanting((n) => ({ ...n, photo: dataUrl })); }
    catch (err) { console.error(err); }
  };
  const addSoilRow = () => setNewPlanting((n) => ({ ...n, soilComposition: [...n.soilComposition, blankSoilRow()] }));
  const updateSoilRow = (id, patch) => setNewPlanting((n) => ({ ...n, soilComposition: n.soilComposition.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const removeSoilRow = (id) => setNewPlanting((n) => ({ ...n, soilComposition: n.soilComposition.filter((r) => r.id !== id) }));
  const soilTotal = newPlanting.soilComposition.reduce((s, r) => s + (Number(r.percent) || 0), 0);

  const handleCreatePlanting = async () => {
    if (!newPlanting.nickname.trim()) return;
    if (!newPlanting.plant) return;
    if (newPlanting.containerMode === "existing" && !newPlanting.containerId) return;
    await addPlanting(newPlanting);
    setNewPlanting(blankNewPlanting());
    setShowAdvanced(false);
    setShowAddForm(false);
  };

  const handleLogWatering = async (plantingId) => {
    if (!addEvent) return;
    try {
      await addEvent({
        id: uid("evt"), timestamp: new Date().toISOString(), garden_id: garden?.id,
        entity_type: "planting", entity_id: plantingId, category: "action", source: "self",
        event_type: "watering", payload: {}, confidence: "observed",
      });
    } catch (err) { console.error(err); }
  };

  const handleLogFertilizing = async (plantingId) => {
    if (!addEvent) return;
    try {
      await addEvent({
        id: uid("evt"), timestamp: new Date().toISOString(), garden_id: garden?.id,
        entity_type: "planting", entity_id: plantingId, category: "action", source: "self",
        event_type: "fertilizing", payload: {}, confidence: "observed",
      });
    } catch (err) { console.error(err); }
  };

  const selectedPlanting = plantings.find((p) => p.id === selectedPlantingId);
  if (selectedPlanting) {
    return (
      <PlantDetail
        planting={selectedPlanting}
        plantings={plantings}
        containers={containers}
        events={events}
        garden={garden}
        addEvent={addEvent}
        updateEvent={updateEvent}
        deleteEvent={deleteEvent}
        showToast={showToast}
        onBack={() => onSelectPlanting(null)}
        onSelectPlanting={onSelectPlanting}
      />
    );
  }

  const reminders = buildReminders(plantings, events, weather);

  return (
    <section className="sg-panel">
      <h1></h1>

      <div className="sg-garden-overview">
        <div className="sg-garden-header">
          <div className="sg-garden-identity">
            <input
              className="sg-garden-name"
              value={draftName}
              placeholder="Garden name"
              onChange={(e) => setDraftName(e.target.value)}
            />
            {garden?.type && (
              <span className="sg-garden-type-badge">{GARDEN_TYPE_LABELS[garden.type] || garden.type}</span>
            )}
          </div>
          <div className="sg-garden-header-actions">
            <select
              className="sg-garden-switch-select"
              value={garden?.id || ""}
              onChange={(e) => onSwitchGarden(e.target.value)}
              aria-label="Switch garden"
            >
              {allGardens.map((g) => <option key={g.id} value={g.id}>{g.name || "Unnamed garden"}</option>)}
            </select>
            <button className="sg-icon-btn" onClick={() => setShowAddGarden((s) => !s)} aria-label="New garden" title="New garden">
              <Plus size={15} />
            </button>
            <button
              className="sg-icon-btn"
              onClick={() => setDeleteConfirming(true)}
              disabled={allGardens.length <= 1}
              aria-label="Delete this garden"
              title={allGardens.length <= 1 ? "You need at least one garden" : "Delete this garden"}
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        {showAddGarden && (
          <div className="sg-draft-card">
            <div className="sg-draft-row">
              <input placeholder="New garden name" value={newGardenName} onChange={(e) => setNewGardenName(e.target.value)} />
              <select value={newGardenType} onChange={(e) => setNewGardenType(e.target.value)}>
                {GARDEN_TYPES.map((t) => <option key={t} value={t}>{GARDEN_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <button className="sg-primary sm" disabled={!newGardenName.trim() || creatingGarden} onClick={handleCreateGarden}>
              {creatingGarden ? <Loader2 className="spin" size={12} /> : null} Create garden
            </button>
          </div>
        )}

        {deleteConfirming && (
          <div className="sg-draft-card sg-garden-delete-confirm">
            <p>Delete "{garden?.name}"? This can't be undone.</p>
            {deleteError && <div className="sg-error">{deleteError}</div>}
            <div className="sg-draft-row">
              <button className="sg-secondary sm" onClick={() => setDeleteConfirming(false)}>Cancel</button>
              <button className="sg-primary sm" disabled={deletingGarden} onClick={handleConfirmDelete}>
                {deletingGarden ? <Loader2 className="spin" size={12} /> : null} Delete
              </button>
            </div>
          </div>
        )}

        <div className="sg-garden-meta">
          <div className="sg-garden-meta-item"><span>Plants</span><strong>{plantings.length}</strong></div>
          <div className="sg-garden-meta-item"><span>Pots</span><strong>{containers.length}</strong></div>
          <div className="sg-garden-meta-item"><span>Since</span><strong>{garden?.established_at ? fmtDate(garden.established_at) : "—"}</strong></div>
        </div>

        <textarea
          className="sg-garden-notes"
          rows={2}
          placeholder="Notes about the garden — microclimate, common pests, anything gnome should know."
          value={draftNotes}
          onChange={(e) => setDraftNotes(e.target.value)}
        />

        {detailsDirty && (
          <div className="sg-draft-row">
            <button className="sg-secondary sm" onClick={() => { setDraftName(garden?.name || ""); setDraftNotes(garden?.notes || ""); }}>
              Discard
            </button>
            <button className="sg-primary sm" disabled={savingDetails} onClick={saveGardenDetails}>
              {savingDetails ? <Loader2 className="spin" size={12} /> : null} Save changes
            </button>
          </div>
        )}
        {detailsError && <div className="sg-error">{detailsError}</div>}
      </div>

      {plantings.length > 0 && (
        <div className="sg-reminders-section">
          <h2>Needs attention</h2>
          <Reminders reminders={reminders} onLogWatering={handleLogWatering} onLogFertilizing={handleLogFertilizing} />
        </div>
      )}

      <div className="sg-drafts-head" style={{ marginTop: "26px" }}><h2>Plants</h2><button className="sg-primary sm" onClick={() => setShowAddForm((s) => !s)}><Plus size={14} /> Add plant</button></div>

      {showAddForm && (
        <div className="sg-draft-card">
          <input placeholder="What did you name it? e.g. Balcony tomato" value={newPlanting.nickname} onChange={(e) => setNewPlanting((n) => ({ ...n, nickname: e.target.value }))} />
          <PlantSearch value={newPlanting.plant} onChange={(plant) => setNewPlanting((n) => ({ ...n, plant, species: plant?.plant_name || "" }))} />

          <div className="sg-draft-row">
            <select value={newPlanting.containerMode} onChange={(e) => setNewPlanting((n) => ({ ...n, containerMode: e.target.value, containerId: e.target.value === "existing" ? (n.containerId || containers[0]?.id || "") : "" }))}>
              <option value="new">New container</option>
              <option value="existing" disabled={containers.length === 0}>Existing container</option>
            </select>
            {newPlanting.containerMode === "existing" && (
              <select value={newPlanting.containerId} onChange={(e) => setNewPlanting((n) => ({ ...n, containerId: e.target.value }))}>
                <option value="">Pick a container</option>
                {containers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </div>

          {newPlanting.containerMode === "new" && (
            <div className="sg-draft-row">
              <select value={newPlanting.containerType} onChange={(e) => setNewPlanting((n) => ({ ...n, containerType: e.target.value }))}>{CONTAINER_TYPES.map((t) => <option key={t} value={t}>{CONTAINER_TYPE_LABELS[t]}</option>)}</select>
              <select value={newPlanting.material} onChange={(e) => setNewPlanting((n) => ({ ...n, material: e.target.value }))}>{CONTAINER_MATERIALS.map((m) => <option key={m} value={m}>{m}</option>)}</select>
            </div>
          )}

          <div className="sg-draft-row">
            {newPlanting.photo ? (
              <div className="sg-photo-thumb"><img src={newPlanting.photo} alt="new planting" /><button onClick={() => setNewPlanting((n) => ({ ...n, photo: null }))}><X size={10} /></button></div>
            ) : (
              <label className="sg-photo-add wide"><ImagePlus size={13} /> Add a photo (optional)<input type="file" accept="image/*" hidden onChange={(e) => handleNewPlantingPhoto(e.target.files?.[0])} /></label>
            )}
          </div>

          <button className="sg-advanced-toggle" onClick={() => setShowAdvanced((s) => !s)}>
            {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Advanced details
          </button>

          {showAdvanced && (
            <div className="sg-advanced-section">
              <div className="sg-form-label">Growth stage</div>
              <div className="sg-draft-row">
                <select value={newPlanting.entry_stage} onChange={(e) => setNewPlanting((n) => ({ ...n, entry_stage: e.target.value }))}>{PHENOPHASES.map((p) => <option key={p} value={p}>{PHENOPHASE_LABELS[p]}</option>)}</select>
              </div>

              <div className="sg-form-label">Where did you get it?</div>
              <div className="sg-draft-row">
                <select value={newPlanting.acquisition_source} onChange={(e) => setNewPlanting((n) => ({ ...n, acquisition_source: e.target.value }))}>{ACQUISITION.map((a) => <option key={a} value={a}>{ACQUISITION_LABELS[a]}</option>)}</select>
              </div>

              {newPlanting.containerMode === "new" && (
                <>
                  <div className="sg-form-label">Placement</div>
                  <div className="sg-draft-row">
                    <input placeholder="e.g. south balcony rail" value={newPlanting.placement} onChange={(e) => setNewPlanting((n) => ({ ...n, placement: e.target.value }))} />
                  </div>
                  <div className="sg-draft-row">
                    <input type="number" min="0" step="0.5" placeholder="Size (liters)" value={newPlanting.containerSize} onChange={(e) => setNewPlanting((n) => ({ ...n, containerSize: e.target.value }))} style={{ maxWidth: "130px" }} />
                  </div>

                  <div className="sg-form-label">Soil composition</div>
                  {newPlanting.soilComposition.map((row) => (
                    <div className="sg-draft-row" key={row.id}>
                      <input placeholder="Component, e.g. potting mix" value={row.component} onChange={(e) => updateSoilRow(row.id, { component: e.target.value })} />
                      <input type="number" min="0" max="100" placeholder="%" value={row.percent} onChange={(e) => updateSoilRow(row.id, { percent: e.target.value })} style={{ maxWidth: "70px" }} />
                      {newPlanting.soilComposition.length > 1 && <button className="sg-icon-btn" onClick={() => removeSoilRow(row.id)}><X size={14} /></button>}
                    </div>
                  ))}
                  <div className="sg-draft-row">
                    <button className="sg-secondary sm" onClick={addSoilRow}><Plus size={12} /> Add component</button>
                    <span className={`sg-soil-total ${soilTotal !== 100 ? "warn" : ""}`}>{soilTotal}% total</span>
                  </div>
                </>
              )}
            </div>
          )}

          <button className="sg-primary sm" onClick={handleCreatePlanting} disabled={!newPlanting.plant}>Add to garden</button>
        </div>
      )}

      <div className="sg-plant-grid">
        {plantings.map((p) => (
          <PlantCard key={p.id} planting={p} events={events} containers={containers} addPlantingPhoto={addPlantingPhoto} onOpen={() => onSelectPlanting(p.id)} />
        ))}
      </div>
    </section>
  );
}
