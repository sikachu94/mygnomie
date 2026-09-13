import {
  Droplets, Scissors, Bug, CloudRain, Snowflake, Camera, Ruler, NotebookPen, Sparkles,
  FlaskConical, Leaf, ShieldCheck, Stethoscope, Eye, Shovel, Move, Layers, ArrowRightLeft,
  Thermometer, Umbrella, Sprout, MinusCircle, Sun, Wind, CloudLightning,
} from "lucide-react";
import { isAlertEvent } from "../lib/events.js";

const WEATHER_SUBTYPE_ICON = { heat: Sun, wind: Wind, hail: CloudLightning };

const ICON_BY_TYPE = {
  watering: Droplets,
  fertilizing: FlaskConical,
  pruning: Leaf,
  harvest: Scissors,
  pest_sighting: Bug,
  disease_sighting: Bug,
  pest_treatment: ShieldCheck,
  disease_treatment: Stethoscope,
  inspection: Eye,
  rainfall: CloudRain,
  frost: Snowflake,
  photo_log: Camera,
  growth_measurement: Ruler,
  garden_event: NotebookPen,
  relocated: Move,
  soil_amended: Layers,
  weeding: Shovel,
  transplanted: ArrowRightLeft,
  soil_test: Thermometer,
  weather_protection: Umbrella,
  germination: Sprout,
  thinning: MinusCircle,

};

// Which color a given event's stamp gets. Alerts (see isAlertEvent) always
// win regardless of what's listed here — everything else groups into
// "routine action/lifecycle" (moss) or "notable measurement" (gold).
// Treatments intentionally fall through to the default "moss" — visually
// distinct from the "clay" alert color of the sighting they resolve.
const STAMP_COLOR_BY_TYPE = {
  harvest: "gold",
  growth_measurement: "gold",
  frost: "gold",
  soil_test: "gold",
};

export function EventIcon({ type, payload, size = 34 }) {
  const subtypeIcon = type === "weather_event" ? WEATHER_SUBTYPE_ICON[payload?.subtype] : null;
  const Icon = subtypeIcon || ICON_BY_TYPE[type] || Sparkles;
  const color = isAlertEvent(type) ? "clay" : STAMP_COLOR_BY_TYPE[type] || "moss";
  return (
    <div className={`sg-stamp sg-stamp-${color}`} style={{ width: size, height: size, minWidth: size }}>
      <Icon size={Math.round(size * 0.47)} aria-hidden="true" />
    </div>
  );
}
