"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiFetch } from "../../../../../../lib/api.js";
import PageHeader from "../../../../../../components/PageHeader.js";
import { formatShortDate, formatDateTime } from "../../../../../../lib/compostUi.js";
import {
  buildGrowingStageBounds,
  masterStageNotes,
  normalizeGrowStageKey,
  STAGE_EXPECTED_TASK_TYPES,
  STAGE_FOCUS_LINE,
  STAGE_RECOMMENDATIONS,
  countTaskStats,
  effectiveTimelineStageKey,
  groupGrowTasksByStage,
  growOverallProgressFraction,
  growPhaseOpenTaskCount,
  growStagesForGuide,
  growStageProgressFraction,
  isBeforeFirstFlushStage,
  maxGrowCycleDay,
  sortTasksForDisplay,
  stageForCycleDay,
  sumYieldKgFromTasks,
  tasksOpenInStage,
  timelineStageEntries
} from "../../../../../../lib/growingRoomUi.js";

/** Spawn run: one combined daily env monitoring task (form in task row, not separate Done). */
const SPAWN_DAILY_MONITORING_TASK_KEY = "th_rh_co2_monitoring";

/** Order for cleaning-stage tasks when sharing the same due day (Cleaning before Release room). */
function cleaningTaskOrder(taskKey) {
  const o = {
    room_cleaning: 0,
    room_emptying: 0,
    cleaning_disinfection: 1,
    release_room: 2
  };
  return o[String(taskKey || "").trim()] ?? 50;
}

/** One table row per calendar cycle day (`scheduledDay`). */
function groupTasksByScheduledDay(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) return [];
  const m = new Map();
  for (const t of tasks) {
    const day = Number(t.scheduledDay);
    const k = Number.isFinite(day) ? day : 0;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(t);
  }
  return [...m.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([scheduledDay, taskList]) => {
      const sorted = [...taskList].sort((a, b) => {
        const da = a.dueDate ? new Date(a.dueDate).getTime() : 0;
        const db = b.dueDate ? new Date(b.dueDate).getTime() : 0;
        if (da !== db) return da - db;
        if (String(a.stageKey) === "cleaning" && String(b.stageKey) === "cleaning") {
          const co = cleaningTaskOrder(a.taskKey) - cleaningTaskOrder(b.taskKey);
          if (co !== 0) return co;
        }
        return String(a.title || "").localeCompare(String(b.title || ""));
      });
      const seenTaskKey = new Set();
      const deduped = [];
      for (const t of sorted) {
        const tk = String(t.taskKey || "").trim();
        if (tk && seenTaskKey.has(tk)) continue;
        if (tk) seenTaskKey.add(tk);
        deduped.push(t);
      }
      return { scheduledDay, tasks: deduped };
    });
}

function taskStatusLabel(t) {
  if (t.status === "completed") return "Done";
  if (t.status === "skipped") return "Skipped";
  if (t.status === "in_progress") return "In progress";
  return "Open";
}

function targetRangeSummary(spec) {
  if (!spec) return "";
  const fmt = (range, unit) => {
    if (!range) return "—";
    const lo = range.min != null ? range.min : "—";
    const hi = range.max != null ? range.max : "—";
    return `${lo}–${hi}${unit}`;
  };
  return `Targets for ${spec.label}: temperature ${fmt(spec.temperatureC, "°C")}, RH ${fmt(spec.humidityPercent, "%")}, CO₂ ${fmt(spec.co2Ppm, " ppm")}.`;
}

function apiErrorMessage(err) {
  if (err == null) return "Could not advance grow stage.";
  if (typeof err === "string") return err;
  if (typeof err.message === "string" && err.message.trim()) return err.message.trim();
  return "Could not advance grow stage.";
}

function timelineClassForStep(cycleDay, currentStageKey, entryKey, thirdFlushEnabled) {
  const bounds = buildGrowingStageBounds(thirdFlushEnabled);
  const b = bounds[entryKey];
  if (!b) return "compost-timeline__step";
  const d = Math.max(1, Number(cycleDay) || 1);
  if (d < b.dayStart) return "compost-timeline__step";
  if (d > b.dayEnd) return "compost-timeline__step compost-timeline__step--past";
  if (entryKey === currentStageKey) return "compost-timeline__step compost-timeline__step--active";
  return "compost-timeline__step compost-timeline__step--past";
}

export default function GrowingRoomCycleDetailPage() {
  const params = useParams();
  const cycleId = params?.cycleId;
  const [permissions, setPermissions] = useState(null);
  const [cycle, setCycle] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [paramLogs, setParamLogs] = useState([]);
  const [interventions, setInterventions] = useState([]);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [paramForm, setParamForm] = useState({
    temperatureC: "",
    humidityPercent: "",
    co2Ppm: "",
    notes: ""
  });
  const [noteForm, setNoteForm] = useState({ action: "Note", detail: "" });
  const [emergencyReason, setEmergencyReason] = useState("");
  const [paramLogAlerts, setParamLogAlerts] = useState([]);
  const [advancingStage, setAdvancingStage] = useState(false);
  const [advanceStageError, setAdvanceStageError] = useState("");
  const [growParamTargets, setGrowParamTargets] = useState(null);

  const canEdit = permissions === "all" || Boolean(permissions?.growingRoomOps?.edit);

  const loadAll = useCallback(async () => {
    if (!cycleId) return;
    const permData = await apiFetch("/auth/permissions").catch(() => ({ permissions: {} }));
    const perms = permData.permissions ?? {};
    setPermissions(perms);
    const canEditLocal = perms === "all" || Boolean(perms?.growingRoomOps?.edit);
    const [c, t, pl, iv, targets] = await Promise.all([
      apiFetch(`/growing-room/cycles/${cycleId}`),
      apiFetch(`/growing-room/cycles/${cycleId}/tasks`),
      apiFetch(`/growing-room/cycles/${cycleId}/parameter-logs`),
      apiFetch(`/growing-room/cycles/${cycleId}/intervention-logs`),
      apiFetch("/growing-room/grow-stage-param-targets").catch(() => null)
    ]);
    if (targets && typeof targets === "object") {
      setGrowParamTargets(targets);
    }
    setCycle(c);
    setTasks(Array.isArray(t) ? t : []);
    setParamLogs(Array.isArray(pl) ? pl : []);
    setInterventions(Array.isArray(iv) ? iv : []);
    if (canEditLocal) {
      try {
        const u = await apiFetch("/growing-room/user-options");
        setUsers(Array.isArray(u) ? u : []);
      } catch {
        setUsers([]);
      }
    } else {
      setUsers([]);
    }
  }, [cycleId]);

  useEffect(() => {
    if (!cycleId) return;
    loadAll().catch((err) => setError(err.message));
  }, [cycleId, loadAll]);

  useEffect(() => {
    if (!advanceStageError) return;
    function onKeyDown(e) {
      if (e.key === "Escape") setAdvanceStageError("");
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [advanceStageError]);

  const thirdFlush = Boolean(cycle?.thirdFlushEnabled);
  const calendarBounds = useMemo(() => buildGrowingStageBounds(thirdFlush), [thirdFlush]);
  const maxGrow = maxGrowCycleDay(thirdFlush);
  const cycleDay = cycle?.currentCycleDay ?? 1;
  const rawStage = cycle ? stageForCycleDay(cycleDay, thirdFlush) : { stageKey: "spawn_run", label: "—" };
  const timelineStageKey = effectiveTimelineStageKey(cycle?.status, cycleDay, rawStage.stageKey);
  const stageInfo =
    timelineStageKey === "cleaning"
      ? {
          stageKey: "cleaning",
          label: calendarBounds.cleaning?.label || "Clean & release",
          dayStart: 0,
          dayEnd: 0
        }
      : rawStage;

  const overallFrac = useMemo(() => {
    if (cycle?.status === "cleaning") return 1;
    if (cycle?.status === "completed") return 1;
    return growOverallProgressFraction(cycleDay, thirdFlush);
  }, [cycle?.status, cycleDay, thirdFlush]);

  const stageFrac = useMemo(() => {
    if (cycle?.status === "cleaning" || timelineStageKey === "cleaning") return 1;
    return growStageProgressFraction(cycleDay, stageInfo);
  }, [cycle?.status, cycleDay, stageInfo, timelineStageKey]);

  const { pending: pendingCount, overdue: overdueCount } = useMemo(() => countTaskStats(tasks), [tasks]);
  const growPhaseOpen = useMemo(() => growPhaseOpenTaskCount(tasks), [tasks]);
  const canBeginScheduledCleaning = growPhaseOpen === 0;
  const totalYieldKg = useMemo(() => sumYieldKgFromTasks(tasks), [tasks]);

  const showHarvestYieldSection = useMemo(() => {
    if (!cycle || cycle.status !== "active") return false;
    if (isBeforeFirstFlushStage(rawStage.stageKey) && cycleDay < calendarBounds.first_flush.dayStart) {
      return false;
    }
    return true;
  }, [cycle, rawStage.stageKey, cycleDay, calendarBounds.first_flush.dayStart]);

  const flushHarvestTasks = useMemo(() => {
    const flushStages = ["first_flush", "second_flush", "third_flush"];
    return tasks.filter(
      (t) =>
        flushStages.includes(normalizeGrowStageKey(t.stageKey)) &&
        (t.taskKey === "harvesting" || t.taskKey === "yield_entry")
    );
  }, [tasks]);

  const cleaningTasks = useMemo(() => tasks.filter((t) => t.stageKey === "cleaning"), [tasks]);

  const timelineEntries = useMemo(() => timelineStageEntries(thirdFlush), [thirdFlush]);

  const tasksByGrowStage = useMemo(() => groupGrowTasksByStage(tasks), [tasks]);

  const recordedGrowKey = useMemo(() => {
    if (!cycle || cycle.status !== "active") return "";
    return normalizeGrowStageKey(String(cycle.recordedGrowStageKey || "spawn_run").trim());
  }, [cycle]);

  const howToProceedLines = useMemo(() => {
    if (!cycle) return [];
    if (cycle.status === "cleaning") {
      const openClean = cleaningTasks.filter((t) => t.status === "pending" || t.status === "in_progress").length;
      return [
        "Clean & release — finish Cleaning, then Release room. Use Complete cycle & release room in Context only when both are done or skipped.",
        openClean > 0
          ? `${openClean} task(s) still open in this stage — complete or skip each below.`
          : "All tasks in this stage are done — you can finish the cycle and make the room available for a new crop.",
        "Use Parameter log to record room temperature, humidity, and CO₂ during cleaning; out-of-range values show a warning after save."
      ];
    }
    if (cycle.status === "completed") {
      return ["This cycle is finished. The room should be available for a new crop from Growing rooms."];
    }
    if (cycle.status !== "active") return [];
    const rk = normalizeGrowStageKey(String(cycle.recordedGrowStageKey || "spawn_run").trim());
    const rb = calendarBounds[rk];
    const opLabel = cycle.recordedGrowStageLabel || rb?.label || rk;
    const openInStage = tasksOpenInStage(tasks, rk);
    const openTotalGrow = growPhaseOpenTaskCount(tasks);
    const focus = STAGE_FOCUS_LINE[rk] || "Work through the tasks scheduled for this stage.";
    const lines = [
      `Operational stage: ${opLabel}${rb ? ` (planned days ${rb.dayStart}–${rb.dayEnd})` : ""}. Calendar reference: day ${cycle.currentCycleDay} · ${rawStage.label}.`,
      focus,
      openInStage > 0
        ? `${openInStage} open task(s) in this operational stage — complete or skip them below, then use Advance grow stage.`
        : `No open tasks in ${opLabel}. ${
            cycle.canAdvanceGrowStage
              ? `Use Advance grow stage to move to ${cycle.nextGrowStageKey ? calendarBounds[cycle.nextGrowStageKey]?.label || cycle.nextGrowStageKey : "next"}.`
              : openTotalGrow > 0
                ? `${openTotalGrow} open task(s) remain in other stages — finish your current stage first.`
                : "All grow-phase tasks are done — begin clean & release when ready."
          }`,
      "Log temperature, humidity, and CO₂ as often as needed for this stage; out-of-range values show a warning after save.",
      overdueCount > 0 ? `${overdueCount} task(s) are overdue — complete them as soon as possible.` : null
    ];
    return lines.filter(Boolean);
  }, [cycle, rawStage, tasks, cleaningTasks, overdueCount, calendarBounds]);

  async function patchTask(taskId, body) {
    setError("");
    setMessage("");
    try {
      await apiFetch(`/growing-room/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify(body)
      });
      setMessage("Saved.");
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function submitSpawnEnvMonitoring(t, e) {
    e.preventDefault();
    if (!cycleId || !cycle) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    const tc = fd.get("temperatureC");
    const rh = fd.get("humidityPercent");
    const co2 = fd.get("co2Ppm");
    if (tc === "" || tc == null || rh === "" || rh == null || co2 === "" || co2 == null) {
      setError("Enter temperature, humidity, and CO₂ to record this daily monitoring.");
      return;
    }
    setError("");
    setMessage("");
    try {
      await apiFetch(`/growing-room/cycles/${cycleId}/parameter-logs`, {
        method: "POST",
        body: JSON.stringify({
          growStageKey: normalizeGrowStageKey(String(cycle.recordedGrowStageKey || "spawn_run")),
          taskId: t._id,
          temperatureC: Number(tc),
          humidityPercent: Number(rh),
          co2Ppm: Number(co2),
          notes: ""
        })
      });
      await apiFetch(`/growing-room/tasks/${t._id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "completed" })
      });
      setMessage("Monitoring logged and daily task completed.");
      form.reset();
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function beginCleaning() {
    setError("");
    try {
      await apiFetch(`/growing-room/cycles/${cycleId}/begin-cleaning`, { method: "POST", body: JSON.stringify({}) });
      setMessage("Clean & release started — complete Cleaning and Release room, then finish the cycle.");
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function beginEmergencyCleaning() {
    setError("");
    const reason = emergencyReason.trim();
    if (reason.length < 10) {
      setError("Describe the incident (at least 10 characters).");
      return;
    }
    try {
      await apiFetch(`/growing-room/cycles/${cycleId}/begin-cleaning`, {
        method: "POST",
        body: JSON.stringify({ emergency: true, reason })
      });
      setEmergencyReason("");
      setMessage("Emergency clean & release started — complete Cleaning and Release room, then finish the cycle.");
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function completeCleaning() {
    setError("");
    try {
      await apiFetch(`/growing-room/cycles/${cycleId}/complete-cleaning`, { method: "POST" });
      setMessage("Cycle completed. Room is available for a new batch.");
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function submitParamLog(e) {
    e.preventDefault();
    setError("");
    setParamLogAlerts([]);
    try {
      const growStageKey =
        cycle?.status === "cleaning" ? "cleaning" : normalizeGrowStageKey(String(cycle?.recordedGrowStageKey || "spawn_run"));
      const data = await apiFetch(`/growing-room/cycles/${cycleId}/parameter-logs`, {
        method: "POST",
        body: JSON.stringify({
          growStageKey,
          temperatureC: paramForm.temperatureC === "" ? null : Number(paramForm.temperatureC),
          humidityPercent: paramForm.humidityPercent === "" ? null : Number(paramForm.humidityPercent),
          co2Ppm: paramForm.co2Ppm === "" ? null : Number(paramForm.co2Ppm),
          notes: paramForm.notes.trim()
        })
      });
      setParamForm({ temperatureC: "", humidityPercent: "", co2Ppm: "", notes: "" });
      const alerts = Array.isArray(data.parameterAlerts) ? data.parameterAlerts : [];
      setParamLogAlerts(alerts);
      setMessage(
        alerts.length
          ? "Parameters logged — review warnings below (values outside the target range for this stage)."
          : "Parameters logged."
      );
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function advanceGrowStage() {
    if (!cycleId) return;
    setError("");
    setAdvanceStageError("");
    setAdvancingStage(true);
    try {
      await apiFetch(`/growing-room/cycles/${cycleId}/advance-grow-stage`, { method: "POST", body: JSON.stringify({}) });
      setParamLogAlerts([]);
      setMessage("Grow stage advanced.");
      await loadAll();
    } catch (err) {
      setError("");
      setAdvanceStageError(apiErrorMessage(err));
    } finally {
      setAdvancingStage(false);
    }
  }

  function canActOnTask(t) {
    if (!cycle) return false;
    if (cycle.status === "cleaning") return String(t.stageKey) === "cleaning";
    if (cycle.status !== "active") return false;
    const rk = normalizeGrowStageKey(String(cycle.recordedGrowStageKey || "spawn_run").trim());
    return normalizeGrowStageKey(t.stageKey) === rk;
  }

  async function submitInterventionNote(e) {
    e.preventDefault();
    setError("");
    try {
      await apiFetch(`/growing-room/cycles/${cycleId}/intervention-logs`, {
        method: "POST",
        body: JSON.stringify({
          action: noteForm.action.trim() || "Note",
          detail: noteForm.detail.trim()
        })
      });
      setNoteForm({ action: "Note", detail: "" });
      setMessage("Intervention note saved.");
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  const room = cycle?.growingRoomId;
  const roomName =
    room && typeof room === "object" && room.name != null ? String(room.name) : "—";
  const batch = cycle?.compostLifecycleBatchId;
  const batchLabel =
    batch && typeof batch === "object" && batch.batchName
      ? batch.batchName
      : cycle?.compostLifecycleBatchId
        ? String(cycle.compostLifecycleBatchId)
        : "—";

  const recs = Array.isArray(cycle?.recommendations) ? cycle.recommendations : [];

  /** Current operational stage first so guide + tasks + advance read as one vertical flow. */
  const guideStageKeysOrdered = useMemo(() => {
    const keys = growStagesForGuide(thirdFlush);
    const cur = recordedGrowKey;
    if (!cur || !keys.includes(cur)) return keys;
    return [cur, ...keys.filter((k) => k !== cur)];
  }, [thirdFlush, recordedGrowKey]);

  const growGuideOrder = useMemo(() => growStagesForGuide(thirdFlush), [thirdFlush]);

  const stageWorkbenchRowState = useCallback(
    (stageKey) => {
      const sk = normalizeGrowStageKey(stageKey);
      const rk = normalizeGrowStageKey(String(recordedGrowKey || "spawn_run").trim());
      const i = growGuideOrder.indexOf(sk);
      const bi = growGuideOrder.indexOf(rk);
      if (bi < 0 || i < 0) return sk === rk ? "current" : "future";
      if (i < bi) return "done";
      if (i === bi) return "current";
      return "future";
    },
    [growGuideOrder, recordedGrowKey]
  );

  const paramSpecForLog = useMemo(() => {
    if (!cycle) return null;
    const pick = thirdFlush ? growParamTargets?.withThirdFlush : growParamTargets?.withoutThirdFlush;
    if (cycle.status === "cleaning") {
      return pick?.cleaning ?? growParamTargets?.withThirdFlush?.cleaning ?? null;
    }
    if (cycle.status === "active") {
      const k = normalizeGrowStageKey(String(cycle.recordedGrowStageKey || "spawn_run").trim());
      return cycle.paramTargetsForRecordedStage || pick?.[k] || null;
    }
    return null;
  }, [cycle, growParamTargets, thirdFlush]);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Growing room cycle"
        title={roomName}
        description={
          cycle
            ? cycle.status === "active"
              ? `Operational stage: ${cycle.recordedGrowStageLabel || calendarBounds[normalizeGrowStageKey(String(cycle.recordedGrowStageKey || "spawn_run"))]?.label || "—"}. Calendar: day ${cycle.currentCycleDay} · ${cycle.currentStageLabel}. Started ${formatShortDate(cycle.cycleStartedAt)}. Status: ${cycle.status}.`
              : `Day ${cycle.currentCycleDay} · ${cycle.currentStageLabel}. Started ${formatShortDate(cycle.cycleStartedAt)}. Status: ${cycle.status}.`
            : "Loading…"
        }
      >
        <Link href="/plant-operations/growing-rooms" className="btn btn-ghost">
          ← Growing rooms
        </Link>
      </PageHeader>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {message ? <div className="alert alert-success">{message}</div> : null}
      {cycle?.parameterLogStaleWarning ? (
        <div className="alert alert-warn">
          No environmental log for over {cycle.parameterLogStaleAfterHours ?? 48} hours — add temperature, humidity, and CO₂ in
          Parameter log when monitoring.
        </div>
      ) : null}

      {cycle ? (
        <>
          <div className="card card-soft grow-lifecycle-card">
            <h3 className="panel-title">Crop lifecycle</h3>
            <p className="page-lead grow-lifecycle-card__lead">
              Planned stages from spawn through flush{thirdFlush ? "es" : " (third flush off)"}. The active step follows cycle
              day — open <strong>How to proceed</strong> and <strong>This stage — guide, tasks &amp; advance</strong> below for
              details, work lines, and when to move to the next operational stage.
            </p>
            <div className="compost-timeline grow-timeline" role="list">
              {timelineEntries.map((e) => (
                <div
                  key={e.key}
                  role="listitem"
                  className={timelineClassForStep(cycleDay, rawStage.stageKey, e.key, thirdFlush)}
                >
                  <div className="compost-timeline__label-row">
                    <span className="compost-timeline__label">{e.label}</span>
                  </div>
                  <p className="compost-timeline__meta">
                    Days {e.dayStart}–{e.dayEnd}
                  </p>
                </div>
              ))}
              {cycle.status === "cleaning" || cycle.status === "completed" ? (
                <div
                  role="listitem"
                  className={`compost-timeline__step ${cycle.status === "cleaning" ? "compost-timeline__step--active" : "compost-timeline__step--past"}`}
                >
                  <div className="compost-timeline__label-row">
                    <span className="compost-timeline__label">{calendarBounds.cleaning?.label || "Clean & release"}</span>
                  </div>
                  <p className="compost-timeline__meta">After release, room is available</p>
                </div>
              ) : null}
            </div>
          </div>

          <div className="card grow-cycle-status-card">
            <h3 className="panel-title">Cycle status</h3>
            <div className="grow-cycle-status-row" role="region" aria-label="Cycle progress summary">
              <div className="grow-cycle-status-row__col grow-cycle-status-row__col--stage">
                <span className="grow-cycle-status-row__label">Current stage</span>
                <span className="compost-stage-pill compost-stage-pill--growing-active">
                  {timelineStageKey === "cleaning"
                    ? calendarBounds.cleaning?.label || "Clean & release"
                    : rawStage.label}
                </span>
                <span className="grow-cycle-status-row__sub">
                  Day {Math.min(cycleDay, maxGrow)} of {maxGrow} (grow calendar)
                </span>
                {cycle.status === "active" ? (
                  <span className="grow-cycle-status-row__sub" style={{ marginTop: 6, display: "block" }}>
                    Operational stage:{" "}
                    <strong>{cycle.recordedGrowStageLabel || calendarBounds[recordedGrowKey]?.label || recordedGrowKey}</strong>
                  </span>
                ) : null}
              </div>
              <div className="grow-cycle-status-row__col grow-cycle-status-row__col--bars">
                <div className="compost-progress-wrap compost-progress-wrap--wide">
                  <div className="compost-lifecycle-card__progress-label">Overall grow progress</div>
                  <div className="compost-progress compost-progress--lg">
                    <div className="compost-progress__fill" style={{ width: `${Math.round(overallFrac * 100)}%` }} />
                  </div>
                  <p className="compost-progress-foot">
                    {cycle.status === "cleaning"
                      ? "Grow phase complete — finish clean & release below."
                      : `${Math.round(overallFrac * 100)}% through planned grow days.`}
                  </p>
                </div>
                {cycle.status === "active" && timelineStageKey !== "cleaning" ? (
                  <div className="compost-progress-wrap compost-progress-wrap--wide grow-cycle-stage-bar">
                    <div className="compost-lifecycle-card__progress-label">This stage</div>
                    <div className="compost-progress">
                      <div className="compost-progress__fill" style={{ width: `${Math.round(stageFrac * 100)}%` }} />
                    </div>
                    <p className="compost-progress-foot">
                      {stageInfo.label} · days {stageInfo.dayStart}–{stageInfo.dayEnd}
                    </p>
                  </div>
                ) : null}
              </div>
              <div className="grow-cycle-status-row__col grow-cycle-status-row__col--stats">
                <span className="grow-cycle-status-row__label">Tasks</span>
                <div className="grow-cycle-stats">
                  <span className="grow-cycle-stats__item">
                    <strong>{pendingCount}</strong> open
                  </span>
                  <span className="grow-cycle-stats__item grow-cycle-stats__item--alert">
                    <strong>{overdueCount}</strong> overdue
                  </span>
                  {showHarvestYieldSection ? (
                    <span className="grow-cycle-stats__item">
                      <strong>{totalYieldKg.toFixed(2)}</strong> kg logged
                    </span>
                  ) : (
                    <span className="grow-cycle-stats__hint">Yield after first flush</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {cycle && (cycle.status === "active" || cycle.status === "cleaning" || cycle.status === "completed") ? (
            <div className="card grow-howto-card">
              <h3 className="panel-title">How to proceed</h3>
              <p className="page-lead grow-howto-card__lead">
                Follow <strong>This stage — guide, tasks &amp; advance</strong> below for what each phase means, which
                interventions are usually scheduled, and your <strong>actual tasks</strong> for this room — including when to use
                <strong> Advance grow stage</strong>. Complete or skip lines as you go; parameter logs support daily monitoring
                tasks.
              </p>
              <div className="panel-inset panel-inset--strong grow-howto-callout">
                <ul className="grow-howto-list">
                  {howToProceedLines.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          {cycle && cycle.status === "active" ? (
            <div
              className={`card grow-playbook-card grow-stage-workbench-card${
                cycle.recordedStageRisky ? " grow-stage-workbench-card--risky" : ""
              }`}
            >
              <h3 className="panel-title">This stage — guide, tasks &amp; advance</h3>
              <p className="page-lead grow-playbook-card__lead">
                Your operational stage is listed first (highlighted). Stages you have already finished show a{" "}
                <strong className="grow-playbook-card__lead-em">green check</strong>. Use <strong>Expected tasks</strong> for the
                default plan and <strong>Your tasks</strong> for this cycle&apos;s lines. When every task for this stage is done or
                skipped, use <strong>Advance grow stage</strong> at the bottom. Parameter logs stay tied to the stage you are in.
              </p>
              {cycle.recordedStageRisky ? (
                <p className="alert alert-warn" style={{ marginBottom: 12 }}>
                  This stage has elevated disease / quality risk — monitor closely per SOP.
                </p>
              ) : null}

              <div className="grow-stage-details-stack">
                {guideStageKeysOrdered.map((stageKey) => {
                  const bounds = calendarBounds[stageKey];
                  if (!bounds) return null;
                  const isCurrent = recordedGrowKey === stageKey;
                  const rowState = stageWorkbenchRowState(stageKey);
                  const detailsClass = [
                    "grow-stage-details",
                    rowState === "done" && "grow-stage-details--done",
                    rowState === "future" && "grow-stage-details--future",
                    rowState === "current" && "grow-stage-details--current"
                  ]
                    .filter(Boolean)
                    .join(" ");
                  const tips = STAGE_RECOMMENDATIONS[stageKey] || [];
                  const focus = STAGE_FOCUS_LINE[stageKey] || "";
                  const sopNotes = masterStageNotes(stageKey);
                  const expected = STAGE_EXPECTED_TASK_TYPES[stageKey] || [];
                  const stageTasks = sortTasksForDisplay(tasksByGrowStage.get(stageKey) || []);
                  const openN = tasksOpenInStage(tasks, stageKey);
                  return (
                    <details key={stageKey} className={detailsClass} open={isCurrent}>
                      <summary className="grow-stage-details__summary">
                        <span className="grow-stage-details__title-row">
                          {rowState === "done" ? (
                            <span className="grow-stage-details__done-icon" aria-label="Completed stage">
                              ✓
                            </span>
                          ) : null}
                          <span className="grow-stage-details__title">{bounds.label}</span>
                        </span>
                        <span className="grow-stage-details__meta">
                          Days {bounds.dayStart}–{bounds.dayEnd}
                          {rowState === "done" ? (
                            <span className="grow-stage-details__done-tag">Completed</span>
                          ) : isCurrent ? (
                            <span className="tag grow-stage-details__current">Current</span>
                          ) : null}
                          {rowState !== "done" ? (
                            openN > 0 ? (
                              <span className="grow-stage-details__open-count">{openN} open</span>
                            ) : (
                              <span className="text-muted grow-stage-details__open-count">
                                {rowState === "future" ? "Later" : "—"}
                              </span>
                            )
                          ) : null}
                        </span>
                      </summary>
                      <div className="grow-stage-details__body">
                        <p className="grow-stage-details__focus">{focus}</p>
                        {sopNotes ? (
                          <p className="page-lead text-muted" style={{ fontSize: 13, marginBottom: 12 }}>
                            <strong>SOP notes:</strong> {sopNotes}
                          </p>
                        ) : null}
                        {tips.length ? (
                          <ul className="grow-stage-details__tips">
                            {tips.map((t, i) => (
                              <li key={i}>{t}</li>
                            ))}
                          </ul>
                        ) : null}
                        {expected.length ? (
                          <div className="grow-stage-details__block">
                            <h4 className="grow-stage-details__subhead">Expected task types (plan)</h4>
                            <ul className="grow-stage-details__expected">
                              {expected.map((ex, i) => (
                                <li key={i}>
                                  <strong>{ex.title}</strong> <span className="text-muted">· {ex.note}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : (
                          <p className="text-muted grow-stage-details__muted">No separate generated tasks in this window — finish flush work, then move to clean &amp; release.</p>
                        )}
                        <div className="grow-stage-details__block">
                          <h4 className="grow-stage-details__subhead">Your tasks (this cycle)</h4>
                          {stageKey === "spawn_run" ? (
                            <p className="text-muted" style={{ fontSize: 12, marginBottom: 10, lineHeight: 1.45 }}>
                              All work due on the same cycle day is grouped in <strong>one row</strong>. Daily{" "}
                              <strong>Temperature / Humidity / CO₂ Monitoring</strong>: fill all three fields and use{" "}
                              <strong>Record &amp; complete</strong> (no separate Done).
                            </p>
                          ) : stageKey === "ruffling_case_run" ? (
                            <p className="text-muted" style={{ fontSize: 12, marginBottom: 10, lineHeight: 1.45 }}>
                              <strong>Once on each day</strong> in this stage: one row per cycle day for humidity, optional light
                              watering, ruffling, and thumping — use <strong>Done</strong> or <strong>Skip</strong> when that
                              day&apos;s work is finished.
                            </p>
                          ) : stageKey === "pinheads_fruiting" ? (
                            <p className="text-muted" style={{ fontSize: 12, marginBottom: 10, lineHeight: 1.45 }}>
                              <strong>Once on each day</strong>: one row combines controlled watering, fresh air adjustment, and
                              pin observation — use <strong>Done</strong> or <strong>Skip</strong> when that day&apos;s bundle is
                              finished.
                            </p>
                          ) : (
                            <p className="text-muted" style={{ fontSize: 12, marginBottom: 10, lineHeight: 1.45 }}>
                              Tasks due on the same day are combined into <strong>one row</strong> (due date shown once).
                            </p>
                          )}
                          {stageTasks.length === 0 ? (
                            <p className="text-muted grow-stage-details__muted">No task rows for this stage in this cycle yet.</p>
                          ) : (
                            <div className="table-wrap grow-stage-details__table-wrap">
                              <table className="table grow-stage-task-table">
                                <thead>
                                  <tr>
                                    <th>Task</th>
                                    <th>Due</th>
                                    <th>Status</th>
                                    <th>Action</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {groupTasksByScheduledDay(stageTasks).map((group) => {
                                    const multiday = group.tasks.length > 1;
                                    const rowOverdue = group.tasks.some((x) => x.overdue);
                                    const first = group.tasks[0];
                                    const dueDisplay = first?.dueDate ? formatShortDate(first.dueDate) : "—";
                                    return (
                                      <tr
                                        key={`${stageKey}-day-${group.scheduledDay}`}
                                        className={rowOverdue ? "gr-task-row--alert" : undefined}
                                      >
                                        <td className="grow-stage-day-cell-tasks">
                                          {multiday ? (
                                            <ul className="grow-stage-day-bullets">
                                              {group.tasks.map((t) => (
                                                <li key={String(t._id)}>
                                                  {t.title}
                                                  {t.isOptional ? (
                                                    <span className="text-muted" style={{ fontSize: 12 }}>
                                                      {" "}
                                                      (optional)
                                                    </span>
                                                  ) : null}
                                                </li>
                                              ))}
                                            </ul>
                                          ) : (
                                            <>
                                              {first.title}
                                              {first.isOptional ? (
                                                <span className="text-muted" style={{ fontSize: 12 }}>
                                                  {" "}
                                                  (optional)
                                                </span>
                                              ) : null}
                                            </>
                                          )}
                                        </td>
                                        <td>{dueDisplay}</td>
                                        <td className="grow-stage-day-cell-status">
                                          {multiday ? (
                                            <div className="grow-stage-day-status-stack">
                                              {group.tasks.map((t) => (
                                                <div key={String(t._id)} className="grow-stage-day-status-line">
                                                  <span className="grow-stage-day-status-name">{t.title}:</span>{" "}
                                                  {taskStatusLabel(t)}
                                                </div>
                                              ))}
                                            </div>
                                          ) : (
                                            taskStatusLabel(first)
                                          )}
                                        </td>
                                        <td className="grow-stage-day-cell-actions">
                                          <div className="grow-stage-day-actions-stack">
                                            {group.tasks.map((t) => {
                                              const done = t.status === "completed" || t.status === "skipped";
                                              const canRow = canActOnTask(t);
                                              return (
                                                <div
                                                  key={String(t._id)}
                                                  className={multiday ? "grow-stage-day-action-seg" : undefined}
                                                >
                                                  {multiday ? <div className="grow-stage-day-action-heading">{t.title}</div> : null}
                                                  {canEdit && !done && !canRow ? (
                                                    <span className="text-muted" style={{ fontSize: 12 }}>
                                                      Actions apply in the current operational stage only.
                                                    </span>
                                                  ) : null}
                                                  {canEdit && !done && canRow ? (
                                                    <div className="grow-stage-task-actions">
                                                      {t.taskKey === SPAWN_DAILY_MONITORING_TASK_KEY ? (
                                                        <div className="grow-stage-env-wrap">
                                                          <form
                                                            className="grow-stage-env-form"
                                                            onSubmit={(e) => void submitSpawnEnvMonitoring(t, e)}
                                                          >
                                                            <label>
                                                              Temp °C
                                                              <input
                                                                name="temperatureC"
                                                                className="input grow-stage-env-input"
                                                                type="number"
                                                                inputMode="decimal"
                                                                step="0.1"
                                                                required
                                                                autoComplete="off"
                                                              />
                                                            </label>
                                                            <label>
                                                              RH %
                                                              <input
                                                                name="humidityPercent"
                                                                className="input grow-stage-env-input"
                                                                type="number"
                                                                inputMode="decimal"
                                                                step="0.1"
                                                                required
                                                                autoComplete="off"
                                                              />
                                                            </label>
                                                            <label>
                                                              CO₂ ppm
                                                              <input
                                                                name="co2Ppm"
                                                                className="input grow-stage-env-input"
                                                                type="number"
                                                                inputMode="numeric"
                                                                step="1"
                                                                required
                                                                autoComplete="off"
                                                              />
                                                            </label>
                                                            <button
                                                              type="submit"
                                                              className="btn btn-secondary grow-stage-env-submit"
                                                            >
                                                              Record &amp; complete
                                                            </button>
                                                          </form>
                                                          <button
                                                            type="button"
                                                            className="btn btn-ghost"
                                                            onClick={() =>
                                                              patchTask(t._id, { status: "skipped", skipReason: "N/A" })
                                                            }
                                                          >
                                                            Skip
                                                          </button>
                                                        </div>
                                                      ) : null}
                                                      {t.taskKey === "yield_entry" ? (
                                                        <input
                                                          className="input grow-stage-task-yield"
                                                          type="number"
                                                          step="0.01"
                                                          placeholder="kg"
                                                          defaultValue={t.yieldKg ?? ""}
                                                          onBlur={(e) => {
                                                            const v = e.target.value;
                                                            if (v === "") return;
                                                            patchTask(t._id, { yieldKg: Number(v), status: t.status });
                                                          }}
                                                        />
                                                      ) : null}
                                                      {t.taskKey !== SPAWN_DAILY_MONITORING_TASK_KEY ? (
                                                        <>
                                                          <button
                                                            type="button"
                                                            className="btn btn-secondary"
                                                            onClick={() => patchTask(t._id, { status: "completed" })}
                                                          >
                                                            Done
                                                          </button>
                                                          <button
                                                            type="button"
                                                            className="btn btn-ghost"
                                                            onClick={() =>
                                                              patchTask(t._id, { status: "skipped", skipReason: "N/A" })
                                                            }
                                                          >
                                                            Skip
                                                          </button>
                                                        </>
                                                      ) : null}
                                                    </div>
                                                  ) : null}
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </div>
                    </details>
                  );
                })}
              </div>

              <div className="grow-stage-workbench-advance" role="region" aria-label="Advance operational grow stage">
                <h4 className="grow-stage-workbench-advance__title">When this stage is complete</h4>
                <p className="grow-stage-workbench-advance__lead">
                  Advance only after every <strong>task</strong> in{" "}
                  <strong>{cycle.recordedGrowStageLabel || calendarBounds[recordedGrowKey]?.label || recordedGrowKey}</strong> is
                  done or skipped.
                </p>
                <div className="grow-stage-workbench-advance__row">
                  <p className="grow-stage-workbench-advance__next">
                    {cycle.nextGrowStageKey ? (
                      <>
                        Next stage after advance:{" "}
                        <strong>{calendarBounds[cycle.nextGrowStageKey]?.label || cycle.nextGrowStageKey}</strong>
                      </>
                    ) : (
                      <span className="text-muted">No further grow stage (use clean &amp; release when the grow is finished).</span>
                    )}
                  </p>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => void advanceGrowStage()}
                    disabled={!canEdit || !cycle.canAdvanceGrowStage || advancingStage}
                  >
                    {advancingStage ? "Advancing…" : "Advance grow stage"}
                  </button>
                </div>
                {!cycle.canAdvanceGrowStage ? (
                  <p className="grow-stage-workbench-advance__hint text-muted">
                    Complete or skip every task for this stage to unlock advance.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {cycle && cycle.status === "cleaning" ? (
            <div className="card grow-playbook-card">
              <h3 className="panel-title">Clean &amp; release</h3>
              <p className="page-lead grow-playbook-card__lead">
                Complete <strong>Cleaning</strong> and <strong>Release room</strong> below, then use{" "}
                <strong>Complete cycle &amp; release room</strong> in Context. The room stays unavailable for a new crop
                until the cycle is completed.
              </p>
              <details className="grow-stage-details" open>
                <summary className="grow-stage-details__summary">
                  <span className="grow-stage-details__title">{calendarBounds.cleaning?.label || "Clean & release"}</span>
                  <span className="grow-stage-details__meta">
                    <span className="tag grow-stage-details__current">Current</span>
                  </span>
                </summary>
                <div className="grow-stage-details__body">
                  <p className="grow-stage-details__focus">{STAGE_FOCUS_LINE.cleaning}</p>
                  <ul className="grow-stage-details__tips">
                    {(STAGE_RECOMMENDATIONS.cleaning || []).map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                  <div className="grow-stage-details__block">
                    <h4 className="grow-stage-details__subhead">Expected task types</h4>
                    <ul className="grow-stage-details__expected">
                      {(STAGE_EXPECTED_TASK_TYPES.cleaning || []).map((ex, i) => (
                        <li key={i}>
                          <strong>{ex.title}</strong> <span className="text-muted">· {ex.note}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </details>
            </div>
          ) : null}

          <div className="card card-soft">
            <h3 className="panel-title">Context</h3>
            <ul className="page-lead" style={{ margin: 0, paddingLeft: 20 }}>
              <li>
                <strong>Linked compost batch:</strong> {batchLabel}
              </li>
              <li>
                <strong>Third flush:</strong> {cycle.thirdFlushEnabled ? "Yes" : "No"}
              </li>
              {recs.length ? (
                <li>
                  <strong>Suggestions:</strong> {recs.join(" ")}
                </li>
              ) : null}
            </ul>
            {cycle.status === "active" ? (
              <div className="section-stack" style={{ marginTop: 16, gap: 16 }}>
                {canBeginScheduledCleaning ? (
                  <div>
                    <button type="button" className="btn btn-secondary" onClick={beginCleaning} disabled={!canEdit}>
                      Begin clean &amp; release
                    </button>
                    <p className="page-lead" style={{ marginTop: 8, marginBottom: 0, fontSize: 13 }}>
                      Available because every <strong>grow-phase</strong> task is completed or skipped. This opens the final
                      stage: one <strong>Cleaning</strong> task and a <strong>Release room</strong> confirmation before the
                      room can start a new cycle.
                    </p>
                  </div>
                ) : (
                  <div className="alert alert-warn" style={{ marginBottom: 0 }}>
                    <strong>Clean &amp; release is locked.</strong> Complete or skip all grow-phase tasks first (
                    <strong>{growPhaseOpen}</strong> still open). Use <strong>Emergency room clean</strong> below only for
                    incidents (e.g. damaged bags) where the room must be cleared before the grow workflow is finished.
                  </div>
                )}
                <div className="panel-inset panel-inset--strong grow-emergency-clean">
                  <h4 className="panel-title" style={{ fontSize: 15, marginBottom: 8 }}>
                    Emergency room clean
                  </h4>
                  <p className="page-lead" style={{ marginBottom: 12, fontSize: 13 }}>
                    Use when there is a mishap with mushroom bags, contamination risk, or the room must be evacuated before
                    normal stage completion. A reason is required for the log.
                  </p>
                  <div className="section-stack" style={{ gap: 10 }}>
                    <div>
                      <label htmlFor="gr-emergency-reason">Reason (required)</label>
                      <textarea
                        id="gr-emergency-reason"
                        className="input"
                        rows={3}
                        placeholder="e.g. Burst bags on bay 2 — need full clean before continuing."
                        value={emergencyReason}
                        onChange={(e) => setEmergencyReason(e.target.value)}
                        disabled={!canEdit}
                      />
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => void beginEmergencyCleaning()}
                      disabled={!canEdit || emergencyReason.trim().length < 10}
                    >
                      Start emergency clean &amp; release
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
            {cycle.status === "cleaning" ? (
              <div style={{ marginTop: 16 }}>
                <button type="button" className="btn" onClick={completeCleaning} disabled={!canEdit}>
                  Complete cycle &amp; release room
                </button>
                <p className="page-lead" style={{ marginTop: 8, marginBottom: 0, fontSize: 13 }}>
                  Marks the cycle finished and sets the room to <strong>available</strong> for the next crop (only after all
                  clean &amp; release tasks are done or skipped).
                </p>
              </div>
            ) : null}
          </div>

          {!showHarvestYieldSection && cycle.status === "active" ? (
            <div className="card card-soft">
              <h3 className="panel-title">Interventions</h3>
              <p className="page-lead" style={{ marginBottom: 0 }}>
                Day-to-day monitoring and casing work use parameter logs and the task list in the background.{" "}
                <strong>Harvest and yield entry</strong> appears below once you reach <strong>first flush</strong> (day{" "}
                {calendarBounds.first_flush.dayStart}+).
              </p>
            </div>
          ) : null}

          {showHarvestYieldSection && flushHarvestTasks.length > 0 ? (
            <div className="card">
              <h3 className="panel-title">Harvest &amp; yield (flushes)</h3>
              <p className="page-lead">
                Log pick weights on yield lines. Totals roll into the status row above.
              </p>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Stage</th>
                      <th>Task</th>
                      <th>Due</th>
                      <th>Yield (kg)</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {groupTasksByScheduledDay(flushHarvestTasks).map((group) => {
                      const multiday = group.tasks.length > 1;
                      const rowOverdue = group.tasks.some((x) => x.overdue);
                      const dueDisplay = group.tasks[0]?.dueDate ? formatShortDate(group.tasks[0].dueDate) : "—";
                      return (
                        <tr
                          key={`harvest-day-${group.scheduledDay}`}
                          className={rowOverdue ? "gr-task-row--alert" : ""}
                        >
                          <td>
                            {multiday ? (
                              <ul className="grow-stage-day-bullets">
                                {group.tasks.map((t) => (
                                  <li key={String(t._id)}>{t.stageKey}</li>
                                ))}
                              </ul>
                            ) : (
                              group.tasks[0].stageKey
                            )}
                          </td>
                          <td>
                            {multiday ? (
                              <ul className="grow-stage-day-bullets">
                                {group.tasks.map((t) => (
                                  <li key={String(t._id)}>{t.title}</li>
                                ))}
                              </ul>
                            ) : (
                              group.tasks[0].title
                            )}
                          </td>
                          <td>{dueDisplay}</td>
                          <td>
                            <div className="grow-stage-day-actions-stack">
                              {group.tasks.map((t) => {
                                const harvestOpen = t.status !== "completed" && t.status !== "skipped";
                                const canRow = canActOnTask(t);
                                return (
                                  <div key={String(t._id)} className={multiday ? "grow-stage-day-action-seg" : undefined}>
                                    {multiday ? <div className="grow-stage-day-action-heading">{t.title}</div> : null}
                                    {canEdit && harvestOpen && canRow && t.taskKey === "yield_entry" ? (
                                      <input
                                        className="input"
                                        style={{ width: 100, maxWidth: "100%" }}
                                        type="number"
                                        step="0.01"
                                        placeholder="kg"
                                        defaultValue={t.yieldKg ?? ""}
                                        onBlur={(e) => {
                                          const v = e.target.value;
                                          if (v === "") return;
                                          patchTask(t._id, { yieldKg: Number(v), status: t.status });
                                        }}
                                      />
                                    ) : (
                                      <span>{t.yieldKg != null ? Number(t.yieldKg).toFixed(2) : "—"}</span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                          <td>
                            <div className="grow-stage-day-actions-stack">
                              {group.tasks.map((t) => {
                                const harvestOpen = t.status !== "completed" && t.status !== "skipped";
                                const canRow = canActOnTask(t);
                                return (
                                  <div key={String(t._id)} className={multiday ? "grow-stage-day-action-seg" : undefined}>
                                    {multiday ? <div className="grow-stage-day-action-heading">{t.title}</div> : null}
                                    {canEdit && harvestOpen && !canRow ? (
                                      <span className="text-muted" style={{ fontSize: 12 }}>
                                        Other stage
                                      </span>
                                    ) : null}
                                    {canEdit && harvestOpen && canRow ? (
                                      <button
                                        type="button"
                                        className="btn btn-secondary"
                                        onClick={() => patchTask(t._id, { status: "completed" })}
                                      >
                                        Done
                                      </button>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {cycle.status === "cleaning" && cleaningTasks.length > 0 ? (
            <div className="card">
              <h3 className="panel-title">Clean &amp; release tasks</h3>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Task</th>
                      <th>Due</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {groupTasksByScheduledDay(cleaningTasks).map((group) => {
                      const multiday = group.tasks.length > 1;
                      const dueDisplay = group.tasks[0]?.dueDate ? formatShortDate(group.tasks[0].dueDate) : "—";
                      return (
                        <tr key={`clean-day-${group.scheduledDay}`}>
                          <td>
                            {multiday ? (
                              <ul className="grow-stage-day-bullets">
                                {group.tasks.map((t) => (
                                  <li key={String(t._id)}>{t.title}</li>
                                ))}
                              </ul>
                            ) : (
                              group.tasks[0].title
                            )}
                          </td>
                          <td>{dueDisplay}</td>
                          <td>
                            {multiday ? (
                              <div className="grow-stage-day-status-stack">
                                {group.tasks.map((t) => (
                                  <div key={String(t._id)}>
                                    <span className="text-muted" style={{ fontSize: 12 }}>
                                      {t.title}:{" "}
                                    </span>
                                    {taskStatusLabel(t)}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              taskStatusLabel(group.tasks[0])
                            )}
                          </td>
                          <td>
                            <div className="grow-stage-day-actions-stack">
                              {group.tasks.map((t) => {
                                const cleanOpen = t.status !== "completed" && t.status !== "skipped";
                                const canRow = canActOnTask(t);
                                return (
                                  <div key={String(t._id)} className={multiday ? "grow-stage-day-action-seg" : undefined}>
                                    {multiday ? <div className="grow-stage-day-action-heading">{t.title}</div> : null}
                                    {canEdit && cleanOpen && canRow ? (
                                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                        <button
                                          type="button"
                                          className="btn btn-secondary"
                                          onClick={() => patchTask(t._id, { status: "completed" })}
                                        >
                                          Done
                                        </button>
                                        <button
                                          type="button"
                                          className="btn btn-ghost"
                                          onClick={() =>
                                            patchTask(t._id, { status: "skipped", skipReason: "N/A" })
                                          }
                                        >
                                          Skip
                                        </button>
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {cycle?.status === "active" || cycle?.status === "cleaning" ? (
        <div className="card">
          <h3 className="panel-title">Parameter log</h3>
          <p className="page-lead" style={{ marginBottom: 12 }}>
            {cycle.status === "cleaning"
              ? "Readings are stored under the clean & release stage. You can log as many times as needed."
              : `Readings are stored under ${cycle.recordedGrowStageLabel || calendarBounds[normalizeGrowStageKey(String(cycle.recordedGrowStageKey || "spawn_run"))]?.label || "this stage"}. You can log as many times as needed while this stage is active.`}
          </p>
          {paramSpecForLog ? (
            <p className="page-lead text-muted" style={{ marginBottom: 12, fontSize: 14 }}>
              {targetRangeSummary(paramSpecForLog)}
            </p>
          ) : null}
          {paramLogAlerts.length ? (
            <div className="alert alert-warn" style={{ marginBottom: 12 }}>
              <strong>Outside target range</strong>
              <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
                {paramLogAlerts.map((a, i) => (
                  <li key={i}>{a.message || `${a.param}: ${a.level}`}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <form onSubmit={submitParamLog} className="section-stack" style={{ gap: 16 }}>
            <div className="grid grid-3" style={{ gap: 12, alignItems: "end" }}>
              <div>
                <label htmlFor="gr-pl-temp">Temp °C</label>
                <input
                  id="gr-pl-temp"
                  className="input"
                  inputMode="decimal"
                  autoComplete="off"
                  value={paramForm.temperatureC}
                  onChange={(e) => setParamForm((p) => ({ ...p, temperatureC: e.target.value }))}
                />
              </div>
              <div>
                <label htmlFor="gr-pl-rh">RH %</label>
                <input
                  id="gr-pl-rh"
                  className="input"
                  inputMode="decimal"
                  autoComplete="off"
                  value={paramForm.humidityPercent}
                  onChange={(e) => setParamForm((p) => ({ ...p, humidityPercent: e.target.value }))}
                />
              </div>
              <div>
                <label htmlFor="gr-pl-co2">CO₂ ppm</label>
                <input
                  id="gr-pl-co2"
                  className="input"
                  inputMode="numeric"
                  autoComplete="off"
                  value={paramForm.co2Ppm}
                  onChange={(e) => setParamForm((p) => ({ ...p, co2Ppm: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label htmlFor="gr-pl-notes">Notes</label>
              <textarea
                id="gr-pl-notes"
                className="input"
                rows={2}
                value={paramForm.notes}
                onChange={(e) => setParamForm((p) => ({ ...p, notes: e.target.value }))}
              />
            </div>
            <button type="submit" className="btn" disabled={!canEdit}>
              Save log
            </button>
          </form>
        </div>
      ) : null}

      <div className="card">
        <h3 className="panel-title">Parameter history</h3>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Stage</th>
                <th>Temp</th>
                <th>RH</th>
                <th>CO₂</th>
                <th>Alerts</th>
              </tr>
            </thead>
            <tbody>
              {paramLogs.map((log) => (
                <tr key={String(log._id)}>
                  <td>{formatDateTime(log.loggedAt)}</td>
                  <td>{log.growStageKey ?? "—"}</td>
                  <td>{log.temperatureC ?? "—"}</td>
                  <td>{log.humidityPercent ?? "—"}</td>
                  <td>{log.co2Ppm ?? "—"}</td>
                  <td>
                    {Array.isArray(log.parameterAlerts) && log.parameterAlerts.length ? (
                      <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13 }}>
                        {log.parameterAlerts.map((a, i) => (
                          <li key={i}>{a.message || `${a.param}: ${a.level}`}</li>
                        ))}
                      </ul>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3 className="panel-title">Intervention history</h3>
        {canEdit ? (
          <form onSubmit={submitInterventionNote} className="section-stack" style={{ marginBottom: 16, gap: 14 }}>
            <div>
              <label htmlFor="gr-iv-action">Action</label>
              <input
                id="gr-iv-action"
                className="input"
                value={noteForm.action}
                onChange={(e) => setNoteForm((n) => ({ ...n, action: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="gr-iv-detail">Detail</label>
              <textarea
                id="gr-iv-detail"
                className="input"
                rows={3}
                value={noteForm.detail}
                onChange={(e) => setNoteForm((n) => ({ ...n, detail: e.target.value }))}
              />
            </div>
            <button type="submit" className="btn btn-secondary">
              Add note
            </button>
          </form>
        ) : null}
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {interventions.map((log) => (
                <tr key={String(log._id)}>
                  <td>{formatDateTime(log.performedAt)}</td>
                  <td>{log.action}</td>
                  <td>{log.detail || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {advanceStageError && typeof document !== "undefined"
        ? createPortal(
            <div
              className="voucher-modal-backdrop gr-advance-err-backdrop"
              role="presentation"
              onClick={(e) => {
                if (e.target === e.currentTarget) setAdvanceStageError("");
              }}
            >
              <div
                className="voucher-modal-dialog voucher-modal-dialog--narrow"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="gr-advance-err-title"
                aria-describedby="gr-advance-err-desc"
                onClick={(ev) => ev.stopPropagation()}
              >
                <div className="voucher-modal-header">
                  <h3 id="gr-advance-err-title" className="voucher-modal-title">
                    Cannot advance grow stage
                  </h3>
                  <button
                    type="button"
                    className="voucher-modal-close"
                    aria-label="Close"
                    onClick={() => setAdvanceStageError("")}
                  >
                    ×
                  </button>
                </div>
                <div className="voucher-modal-body">
                  <div id="gr-advance-err-desc" className="alert alert-error" style={{ margin: 0 }}>
                    {advanceStageError}
                  </div>
                  <div className="voucher-modal-actions" style={{ marginTop: 18 }}>
                    <button type="button" className="btn" onClick={() => setAdvanceStageError("")}>
                      OK
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
