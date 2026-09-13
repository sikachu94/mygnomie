import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Check, Clock3, Droplets, Scissors, FlaskConical, SkipForward } from "lucide-react";
import { generateCalendarTasks, getMonthDays, groupCalendarItems, shiftTaskDate } from "../lib/calendar.js";
import { EVENT_TYPE_LABELS, labelForEntity } from "../lib/events.js";

const TYPE_ICON = { watering: Droplets, harvest: Scissors, fertilizing: FlaskConical };
const TYPE_LABEL = { watering: "Water", harvest: "Harvest", fertilizing: "Feed" };
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dateKey(date) { return date.toISOString().slice(0, 10); }
function displayDate(dateKeyValue) { return new Date(`${dateKeyValue}T12:00:00.000Z`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }); }

export function GardenCalendar({ plantings, events, calendarTasks, onUpdateTask, onCompleteTask, onSelectPlanting }) {
    const today = dateKey(new Date());
    const [monthDate, setMonthDate] = useState(() => new Date(`${today}T12:00:00.000Z`));
    const [selectedDate, setSelectedDate] = useState(today);
    const tasks = useMemo(() => generateCalendarTasks(plantings, events, calendarTasks, today), [plantings, events, calendarTasks, today]);
    const grouped = useMemo(() => groupCalendarItems(tasks, events), [tasks, events]);
    const days = getMonthDays(monthDate);
    const selected = grouped[selectedDate] || { tasks: [], events: [] };

    const moveMonth = (offset) => {
        const next = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + offset, 1));
        setMonthDate(next);
        setSelectedDate(dateKey(next));
    };

    const handleReschedule = async (task, dueDate) => {
        if (dueDate && dueDate !== task.due_date) await onUpdateTask(shiftTaskDate(task, dueDate));
    };

    return (
        <div className="sg-calendar">
            <div className="sg-calendar-toolbar">
                <div>
                    <h2>Garden calendar</h2>
                    <p className="sg-calendar-caption">Care plans adjust as you log what happened.</p>
                </div>
                <div className="sg-calendar-nav">
                    <button className="sg-icon-btn" onClick={() => moveMonth(-1)} aria-label="Previous month"><ChevronLeft size={18} /></button>
                    <strong>{monthDate.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" })}</strong>
                    <button className="sg-icon-btn" onClick={() => moveMonth(1)} aria-label="Next month"><ChevronRight size={18} /></button>
                </div>
            </div>

            <div className="sg-calendar-weekdays">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
            <div className="sg-calendar-grid">
                {days.map((day) => {
                    const items = grouped[day.date];
                    const active = day.date === selectedDate;
                    return (
                        <button key={day.date} className={`sg-calendar-day ${day.inMonth ? "" : "outside"} ${active ? "selected" : ""} ${day.date === today ? "today" : ""}`} onClick={() => setSelectedDate(day.date)} aria-label={`${displayDate(day.date)}${items?.tasks.length ? `, ${items.tasks.length} tasks` : ""}`}>
                            <span className="sg-calendar-day-number">{day.day}</span>
                            {items?.tasks.slice(0, 3).map((task) => <span key={task.id} className={`sg-calendar-dot ${task.type} ${task.status}`} title={`${TYPE_LABEL[task.type]}: ${task.planting_name}`} />)}
                            {items?.events.length > 0 && <span className="sg-calendar-event-count">{items.events.length} logged</span>}
                        </button>
                    );
                })}
            </div>

            <section className="sg-calendar-agenda" aria-live="polite">
                <div className="sg-calendar-agenda-head">
                    <h3>{displayDate(selectedDate)}</h3>
                    {selected.tasks.length + selected.events.length > 0 && <span>{selected.tasks.length + selected.events.length} items</span>}
                </div>
                {selected.tasks.map((task) => {
                    const Icon = TYPE_ICON[task.type] || Clock3;
                    return (
                        <div key={task.id} className={`sg-calendar-task ${task.status}`}>
                            <div className={`sg-calendar-task-icon ${task.type}`}><Icon size={16} /></div>
                            <div className="sg-calendar-task-body">
                                <strong>
                                    {TYPE_LABEL[task.type]}{" "}
                                    <button type="button" className="sg-entity-link" onClick={() => onSelectPlanting?.(task.planting_id)}>{task.planting_name}</button>
                                </strong>
                                <span>{task.status === "completed" ? "Completed" : task.status === "skipped" ? "Skipped" : task.status === "snoozed" ? "Snoozed" : "Planned"}</span>
                            </div>
                            {task.status === "open" && (
                                <div className="sg-calendar-task-actions">
                                    <button className="sg-secondary sm" onClick={() => onCompleteTask(task)}><Check size={12} /> Done</button>
                                    <button className="sg-icon-btn" onClick={() => onUpdateTask({ ...task, status: "snoozed", due_date: dateKey(new Date(Date.now() + 86400000)) })} aria-label={`Snooze ${TYPE_LABEL[task.type].toLowerCase()} task`}><Clock3 size={15} /></button>
                                    <label className="sg-calendar-date" title="Reschedule task"><input type="date" value={task.due_date} onChange={(event) => handleReschedule(task, event.target.value)} aria-label={`Reschedule ${TYPE_LABEL[task.type].toLowerCase()} task`} /></label>
                                    <button className="sg-icon-btn" onClick={() => onUpdateTask({ ...task, status: "skipped" })} aria-label={`Skip ${TYPE_LABEL[task.type].toLowerCase()} task`}><SkipForward size={15} /></button>
                                </div>
                            )}
                        </div>
                    );
                })}
                {selected.events.map((event) => (
                    <div key={event.id} className="sg-calendar-event">
                        <Check size={15} />
                        <span>
                            <strong>{EVENT_TYPE_LABELS[event.event_type] || event.event_type}</strong>{" "}
                            {event.entity_type === "planting" ? (
                                <button type="button" className="sg-entity-link" onClick={() => onSelectPlanting?.(event.entity_id)}>{labelForEntity(event, plantings, [])}</button>
                            ) : labelForEntity(event, plantings, [])}
                        </span>
                    </div>
                ))}
                {selected.tasks.length === 0 && selected.events.length === 0 && <p className="sg-calendar-empty">Nothing planned or logged for this day.</p>}
            </section>
        </div>
    );
}
