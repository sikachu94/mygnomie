/**
 * SPECIES_META (species.js) was hardcoded demo data covering 8 species and
 * is no longer maintained — the app now sources real per-species facts from
 * the `plants` table (USDA PLANTS reference data, joined in as
 * planting.species_info by api/gardens.py's _flatten_planting).
 *
 * That table has real ecological data (moisture use, drought/shade
 * tolerance, precipitation range, growth habit, harvest type) but no
 * ready-made "water every N days" / "feed every N days" / "N hours of sun" /
 * "which stage means ready to harvest" fields — those are inferred here
 * from the closest available signals. These are deliberately rough
 * estimates, not horticultural fact — reasonable enough to drive
 * reminders/badges without silently doing nothing, not precise enough to
 * promise a gardener.
 *
 * NOTE: the category values below (e.g. "high"/"medium"/"low" for
 * moisture_use, "intolerant"/"intermediate"/"tolerant" for shade_tolerance)
 * assume standard USDA PLANTS vocabulary. Worth spot-checking against what's
 * actually stored in your `plants` table — if the real values use different
 * wording, these silently fall through to the defaults below rather than
 * erroring, which is safe but worth knowing about.
 */

const WATERING_BY_MOISTURE_USE = { high: 2, medium: 3, low: 5 };
const WATERING_BY_DROUGHT_TOLERANCE = { none: 2, low: 3, medium: 4, high: 6 };
const SUN_HOURS_BY_SHADE_TOLERANCE = {
  intolerant: [6, 8],   // needs full sun
  intermediate: [4, 6],
  tolerant: [2, 4],     // shade-tolerant, gets by on less
};

// harvest_type -> which growth stage means "ready to pick"
const TARGET_STAGE_BY_HARVEST_TYPE = {
  fruit: "fruiting",
  seed_grain: "seed_set",
  flower_bud: "budding",
  ornamental_flower: "flowering",
  leaf: "vegetative",
  root: "vegetative",
  ornamental_foliage: "vegetative",
};

// harvest_type -> what reaching "flowering" means for this plant.
// "harvest_precondition": flowering is a good sign, fruit/seed comes next.
// "decline_warning": flowering means bolting — quality is dropping.
// "neutral": flowering doesn't really signal anything either way.
const FLOWERING_SIGNAL_BY_HARVEST_TYPE = {
  fruit: "harvest_precondition",
  seed_grain: "harvest_precondition",
  ornamental_flower: "harvest_precondition",
  root: "decline_warning",
  flower_bud: "decline_warning",
  ornamental_foliage: "neutral",
  // "leaf" is refined below using growth_habit — soft herbs like basil
  // bolt and decline, woody ones like rosemary largely don't.
};

// harvest_type -> roughly how often to feed a potted plant, in days. Every
// container-fertilizing source consulted converged on "weekly-ish for heavy
// (fruiting) feeders, every 2-4 weeks for everything else" — this maps that
// onto the same harvest_type signal used for watering/target-stage above,
// rather than inventing a new axis.
const FERTILIZE_BY_HARVEST_TYPE = {
  fruit: 10,
  seed_grain: 14,
  flower_bud: 14,
  ornamental_flower: 14,
  leaf: 18,
  root: 21,
  ornamental_foliage: 21,
};

const WOODY_GROWTH_HABIT = /shrub|tree/i;

function lower(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : null;
}

function estimateWaterFrequencyDays(info) {
  const byMoisture = WATERING_BY_MOISTURE_USE[lower(info?.moisture_use)];
  if (byMoisture) return byMoisture;

  const byDrought = WATERING_BY_DROUGHT_TOLERANCE[lower(info?.drought_tolerance)];
  if (byDrought) return byDrought;

  if (info?.precipitation_min_in != null && info?.precipitation_max_in != null) {
    const midpoint = (info.precipitation_min_in + info.precipitation_max_in) / 2;
    if (midpoint < 15) return 5;
    if (midpoint > 30) return 2;
    return 3;
  }

  return 3; // no signal at all — reasonable generic default for a potted plant
}

function estimateFertilizeFrequencyDays(info) {
  return FERTILIZE_BY_HARVEST_TYPE[lower(info?.harvest_type)] || 14; // generic 2-week default
}

function estimateSunHours(info) {
  return SUN_HOURS_BY_SHADE_TOLERANCE[lower(info?.shade_tolerance)] || [4, 6];
}

function estimateTargetStage(info) {
  return TARGET_STAGE_BY_HARVEST_TYPE[lower(info?.harvest_type)] || "vegetative";
}

function estimateFloweringSignal(info) {
  const harvestType = lower(info?.harvest_type);
  if (harvestType === "leaf") {
    return WOODY_GROWTH_HABIT.test(info?.growth_habit || "") ? "neutral" : "decline_warning";
  }
  return FLOWERING_SIGNAL_BY_HARVEST_TYPE[harvestType] || "neutral";
}

/**
 * Drop-in replacement for `SPECIES_META[planting.species]`. Pass
 * `planting.species_info` (the DB-backed reference data) in; returns the
 * same shape SPECIES_META entries had, minus `days_to_maturity`, plus
 * `fertilize_frequency_days`.
 */
export function estimateSpeciesReference(speciesInfo) {
  if (!speciesInfo) return null;
  return {
    water_frequency_days: estimateWaterFrequencyDays(speciesInfo),
    fertilize_frequency_days: estimateFertilizeFrequencyDays(speciesInfo),
    sun_hours: estimateSunHours(speciesInfo),
    target_stage: estimateTargetStage(speciesInfo),
    flowering_signal: estimateFloweringSignal(speciesInfo),
  };
}
