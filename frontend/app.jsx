import React, { useState } from "react";
import { Sprout, NotebookPen, MessageCircle, RotateCcw, MapPin, CloudRain, Thermometer, Loader as Loader2, LogOut } from "lucide-react";
import { Analytics } from "@vercel/analytics/react";
import gnomeLogo from "./assets/gnome_only.jpg";
import "./styles.css";
import { useAuth } from "./hooks/useAuth.js";
import { AuthScreen } from "./components/AuthScreen.jsx";
import { useGardenData } from "./hooks/useGardenData.js";
import { useWeather } from "./hooks/useWeather.js";
import { PRESET_LOCATIONS } from "./lib/species.js";
import { CaptureTab } from "./components/CaptureTab.jsx";
import { PlantsTab } from "./components/PlantsTab.jsx";
import { ChatTab } from "./components/ChatTab.jsx";
import { useToast, Toast } from "./lib/toast.jsx";
import { WeatherProtectionPrompt } from "./components/WeatherProtectionPrompt.jsx";

const TABS = [
  { id: "capture", icon: NotebookPen, shortLabel: "Log" },
  { id: "plants", icon: Sprout, shortLabel: "Garden" },
  { id: "chat", icon: MessageCircle, shortLabel: "Ask" },
];

export default function App() {
  const [tab, setTab] = useState("capture");
  const [resetKey, setResetKey] = useState(0);
  const { toast, showToast } = useToast();

  const auth = useAuth();

  // Owned here (not inside PlantsTab) so the Log tab / Calendar can jump
  // straight to a plant's detail page, and the Garden nav button can
  // reliably reset it back to the garden list.
  const [selectedPlantingId, setSelectedPlantingId] = useState(null);
  const goToPlant = (plantingId) => {
    setSelectedPlantingId(plantingId);
    setTab("plants");
  };

  // All hooks run on every render regardless of auth state (rules of
  // hooks) — useGardenData just no-ops internally until authEnabled flips
  // to true, so nothing fetches before someone is actually signed in.
  const {
    loaded, loadError, plantings, containers, events, calendarTasks, garden, gardenId,
    allGardens, switchGarden, createGarden, deleteGarden,
    addEvent, addPlanting, addPlantingPhoto, updateEvent, deleteEvent,
    updateCalendarTask, completeCalendarTask,
    updateGardenLocal, updateGardenAndPersist, persistGarden,
    resetDemo: resetGardenData, refresh: refreshGardenData,
  } = useGardenData(!!auth.session);

  const {
    weather, weatherError, locating, weatherPrompt,
    setGardenLocation, clearGardenLocation, useMyLocation,
    logWeatherProtection, dismissWeatherPrompt,
    refresh: refreshWeather, reset: resetWeather,
  } = useWeather({ garden, events: events || [], addEvent, updateGardenAndPersist });

  if (auth.loading) {
    return (
      <div className="sg-root sg-loading">
        <Loader2 className="spin" size={22} /><span>Loading…</span>
      </div>
    );
  }

  if (!auth.session) {
    return (
      <AuthScreen
        signInWithGoogle={auth.signInWithGoogle}
        signInWithEmail={auth.signInWithEmail}
        signUpWithEmail={auth.signUpWithEmail}
        sendMagicLink={auth.sendMagicLink}
        authError={auth.authError}
      />
    );
  }

  const resetDemo = async () => {
    try {
      await resetGardenData();
      resetWeather();
      setSelectedPlantingId(null);
      setResetKey((k) => k + 1);
      showToast("Demo data reset.");
    } catch (err) {
      showToast("Couldn't reset demo data — try again.", "error");
    }
  };

  const handleSignOut = async () => {
    await auth.signOut();
    setSelectedPlantingId(null);
    setTab("capture");
  };

  if (!loaded) {
    return (
      <div className="sg-root sg-loading">
        <Loader2 className="spin" size={22} /><span>Loading your garden…</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="sg-root sg-loading">
        <span className="sg-error">{loadError}</span>
        <button className="sg-secondary sm" onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  return (
    <div className="sg-root">
      <Analytics />
      <Toast toast={toast} />

      <header className="sg-header">
        <div className="sg-brand"><img src={gnomeLogo} alt="myGnomie logo" /><span>myGnomie</span></div>
        <div className="sg-header-actions">
          <button className="sg-reset" onClick={resetDemo} title="Reset demo data" aria-label="Reset demo data">
            <RotateCcw size={14} />
          </button>
          <button
            className="sg-reset"
            onClick={handleSignOut}
            title={auth.user?.email ? `Sign out (${auth.user.email})` : "Sign out"}
            aria-label="Sign out"
          >
            <LogOut size={14} />
          </button>
        </div>
      </header>

      {!garden?.location ? (
        <div className="sg-weatherbar setup">
          <span>Set your garden's location for weather-aware advice</span>
          <div className="sg-weather-actions">
            <button className="sg-secondary sm" onClick={useMyLocation} disabled={locating} aria-label="Use my current location">
              {locating ? <Loader2 className="spin" size={12} /> : <MapPin size={12} />} Use my location
            </button>
            {PRESET_LOCATIONS.map((loc) => (
              <button key={loc.label} className="sg-chip" onClick={() => setGardenLocation(loc)}>{loc.label}</button>
            ))}
          </div>
          {weatherError && <span className="sg-weather-err">{weatherError}</span>}
        </div>
      ) : (
        <div className="sg-weatherbar">
          <span className="sg-weather-loc"><MapPin size={13} /> {garden.label}</span>
          {garden.hardiness_zone && <span className="sg-hardiness-badge">Zone {garden.hardiness_zone}</span>}
          {weather ? (
            <span className="sg-weather-data">
              <Thermometer size={13} /> {Math.round(weather.current.temperature_2m)}°C
              <CloudRain size={13} /> {weather.daily.precipitation_sum[0]}mm today
            </span>
          ) : weatherError ? (
            <span className="sg-weather-err">{weatherError}</span>
          ) : (
            <span className="sg-weather-data"><Loader2 className="spin" size={12} /> Checking weather…</span>
          )}
          <button className="sg-reset sm" onClick={refreshWeather} aria-label="Refresh weather">
            <RotateCcw size={12} />
          </button>
          <button className="sg-reset sm" onClick={clearGardenLocation} aria-label="Change garden location">
            Change
          </button>
        </div>
      )}
      {weatherPrompt && containers.length > 0 && (
        <WeatherProtectionPrompt
          prompt={weatherPrompt}
          containers={containers}
          onLog={async (ids, action) => {
            try { await logWeatherProtection(ids, action); showToast("Logged."); }
            catch { showToast("Couldn't save that — try again.", "error"); }
          }}
          onDismiss={dismissWeatherPrompt}
        />
      )}
      <main className="sg-main">
        <div hidden={tab !== "capture"}>
          <CaptureTab
            gardenId={gardenId} plantings={plantings} containers={containers} events={events}
            addEvent={addEvent} updateEvent={updateEvent} deleteEvent={deleteEvent}
            resetSignal={resetKey} showToast={showToast} weather={weather}
            onSelectPlanting={goToPlant}
            calendarTasks={calendarTasks} onUpdateTask={updateCalendarTask} onCompleteTask={completeCalendarTask}
          />
        </div>
        <div hidden={tab !== "plants"}>
          <PlantsTab
            garden={garden} allGardens={allGardens}
            onSwitchGarden={switchGarden} onCreateGarden={createGarden} onDeleteGarden={deleteGarden}
            plantings={plantings} containers={containers} events={events}
            addPlanting={addPlanting} addPlantingPhoto={addPlantingPhoto}
            addEvent={addEvent} updateEvent={updateEvent} deleteEvent={deleteEvent}
            weather={weather}
            updateGardenLocal={updateGardenLocal} updateGardenAndPersist={updateGardenAndPersist}
            persistGarden={persistGarden} showToast={showToast}
            selectedPlantingId={selectedPlantingId} onSelectPlanting={setSelectedPlantingId}
          />
        </div>
        <div hidden={tab !== "chat"}>
          <ChatTab
            gardenId={gardenId} plantings={plantings} containers={containers} events={events}
            garden={garden} weather={weather} onGardenChanged={refreshGardenData} resetSignal={resetKey}
          />
        </div>
      </main>

      <nav className="sg-bottom-nav" aria-label="Primary">
        <div className="sg-bottom-nav-row">
          {TABS.map(({ id, icon: Icon, shortLabel }) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => {
                // Always land on the garden list, never a plant's zoomed-in
                // page, when the Garden tab is tapped from the bottom nav.
                if (id === "plants") setSelectedPlantingId(null);
                setTab(id);
              }}
              aria-label={shortLabel}
              aria-current={tab === id ? "page" : undefined}
            >
              <Icon size={20} />
              <span>{shortLabel}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}