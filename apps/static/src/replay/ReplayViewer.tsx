// apps/static/src/replay/ReplayViewer.tsx
//
// Teacher-facing static replay viewer.
//
// Model (see sessions.ts): a run (deployment) contains students; each student
// has work sessions; a session is a scrubbable timeline of interaction frames.
// The connection-level taxonomy (self-contained / reconnect / partial) is gone
// — connections are merged into sessions and long pauses show as subtle ticks.
//
// Navigation is hash-routed (#/<run>/<student>/<session>) so browser
// back/forward and deep links work on plain static hosting.
//
// Rendering: we reconstruct the student's Redux state by replaying their merged
// event stream, and render the course read-only through a frozen store. Course
// content is injected as a synthetic LOAD_OLXJSON built from the run's own
// content.json (the pilot ran a different course than the current branch).
//
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Provider } from 'react-redux';
import { legacy_createStore as createStore } from 'redux';
import { ChevronLeft, ChevronRight, Home, Moon } from 'lucide-react';

import { store, extendSettings } from '@/lib/state';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import { replayToEvent, applyEvent, type AppState, type LoggedEvent } from '@/lib/replay';
import { LOAD_OLXJSON } from '@/lib/state/olxjson';
import { definitionKeyForRef, parseDefinitionRef, addScope, PLACEHOLDER_NS } from '@/lib/types/id-grammar';
import RenderOLX from '@/components/common/RenderOLX';
import Spinner from '@/components/common/Spinner';
import { DebugSettingsContext, type DebugSettings } from '@/lib/state/debugSettings';

import {
  fetchRuns, fetchRunIndex, fetchRunContent, fetchStudentEvents, sliceSession,
  findStudent, findSession,
  type RunSummary, type RunIndex, type StudentEntry, type SessionEntry,
} from './replayIndex';
import {
  DISCONNECT_GAP_MS, eventTimeMs, formatDurationMs, formatStart, dayLabel, sessionLabel,
  type GapMarker,
} from './sessions';
import SessionScrubber from './SessionScrubber';
import { useHashRoute, type Route } from './useHashRoute';
import './replay.css';

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';

// The live store is only used as a Provider fallback; content always renders
// through the frozen replay store.
const liveStore = store.init({
  extraFields: extendSettings([]),
  blockRegistry: BLOCK_REGISTRY,
  websocket: false,
});

function createReplayStore(state: AppState) {
  const wrapped = { application_state: state };
  return createStore(() => wrapped, wrapped);
}

// The course route is "/" -> CONTENT/psych_course in both runs' manifests.
const DEFINITION_KEY = 'CONTENT/psych_course';

// =============================================================================
// Course rendering for one session
// =============================================================================

/**
 * Renders the course at a scrub position within a session.
 *
 * `baseline` (earlier sessions' events) and the content-load event are always
 * applied; the scrubber only moves through `sessionEvents`. We memoise a
 * stride of snapshots so scrubbing a 30k-event session doesn't re-reduce from
 * scratch on every frame.
 */
function SessionStage({
  content, baseline, sessionEvents, gaps,
}: {
  content: LoggedEvent;
  baseline: LoggedEvent[];
  sessionEvents: LoggedEvent[];
  gaps: GapMarker[];
}) {
  // Sessions begin with bootstrap events (lock_fields, SET_LOCALE,
  // LOAD_OLXJSON — none carry an id) before the student does anything.
  // Fold that leading run into the frozen prefix so frame 0 is a settled
  // UI, not a "Loading language settings..." spinner.
  const lead = useMemo(() => {
    let n = 0;
    while (n < sessionEvents.length - 1 && !(sessionEvents[n] as any).id) n++;
    return n;
  }, [sessionEvents]);
  const frames = useMemo(() => sessionEvents.slice(lead), [sessionEvents, lead]);
  const frameGaps = useMemo(
    () => gaps
      .map((g) => ({ ...g, afterEventIndex: g.afterEventIndex - lead }))
      .filter((g) => g.afterEventIndex > 0),
    [gaps, lead],
  );

  // Start at the beginning of the session — the teacher watches it unfold.
  // (Baseline state from earlier sessions is already applied underneath.)
  const [index, setIndex] = useState<number>(0);
  const [axis, setAxis] = useState<'events' | 'time'>('events');

  useEffect(() => {
    setIndex(0);
  }, [frames]);

  // The full stream this session renders against: content-load, then the
  // frozen baseline (earlier sessions), then this session's bootstrap events.
  const prefixLen = 1 + baseline.length + lead; // content + baseline + bootstrap
  const full = useMemo(() => [content, ...baseline, ...sessionEvents], [content, baseline, sessionEvents]);

  // Stride checkpoints over the full stream, computed once per session. Each
  // checkpoint stores the reduced state after `at` events; scrubbing then steps
  // forward from the nearest checkpoint with applyEvent (O(stride) per frame),
  // so a 30k-event session scrubs smoothly instead of re-reducing from zero.
  const STRIDE = 500;
  const checkpoints = useMemo(() => {
    const cps: { at: number; state: AppState }[] = [];
    let state = replayToEvent(full, prefixLen); // baseline + content applied
    cps.push({ at: prefixLen, state });
    for (let i = prefixLen; i < full.length; i++) {
      state = applyEvent(state, full[i]);
      if ((i + 1 - prefixLen) % STRIDE === 0) cps.push({ at: i + 1, state });
    }
    return cps;
  }, [full, prefixLen]);

  const stateAt = useMemo(() => {
    const globalUpTo = prefixLen + Math.min(index, frames.length - 1) + 1;
    let cp = checkpoints[0];
    for (const c of checkpoints) { if (c.at <= globalUpTo) cp = c; else break; }
    let state = cp.state;
    for (let i = cp.at; i < globalUpTo; i++) state = applyEvent(state, full[i]);
    return state;
  }, [checkpoints, full, index, prefixLen, frames.length]);

  const replayStore = useMemo(() => createReplayStore(stateAt), [stateAt]);

  const key = definitionKeyForRef(parseDefinitionRef(DEFINITION_KEY), PLACEHOLDER_NS);

  // Are we sitting just after a long pause? A gap marker at afterEventIndex
  // means the pause happened between frames (afterEventIndex-1) and
  // afterEventIndex — so when the scrub position lands on that frame, the pause
  // is what the teacher just "skipped over". Surface the calm overlay then.
  const clampedIndex = Math.min(index, frames.length - 1);
  const gapNote = useMemo(() => {
    // A gap marker at afterEventIndex sits between frames afterEventIndex-1 and
    // afterEventIndex. Show the overlay when the scrub position is on either
    // side of that boundary (±1 tolerates scrubber rounding on long sessions).
    const g = frameGaps.find((x) => Math.abs(x.afterEventIndex - clampedIndex) <= 1);
    if (g) return g.durationMs;
    // Fallback: derive directly from timestamps around this frame.
    const prev = eventTimeMs(frames[Math.max(0, clampedIndex - 1)]);
    const cur = eventTimeMs(frames[clampedIndex]);
    if (prev != null && cur != null && cur - prev >= DISCONNECT_GAP_MS) return cur - prev;
    return null;
  }, [frameGaps, clampedIndex, frames]);

  // Minimal DebugSettings so RenderOLX / any nested debug hooks see replay mode.
  const debugSettings: DebugSettings = useMemo(() => ({
    panelOpen: false,
    setPanelOpen: () => {},
    replayMode: true,
    replayEventIndex: index,
    setReplayMode: () => {},
    setReplayEventIndex: (v) => setIndex((prev) => (typeof v === 'function' ? v(prev) : v)),
    getEvents: () => frames,
    hideReturnToLive: true,
  }), [index, frames]);

  return (
    <DebugSettingsContext.Provider value={debugSettings}>
      <SessionScrubber events={frames} index={index} onIndex={setIndex} gaps={frameGaps} axis={axis} onAxis={setAxis} />
      <div className="rv-stage">
        {gapNote != null && (
          <div
            className="rv-gap-overlay"
            title="A long pause — usually the tab was in the background or the laptop was asleep."
          >
            <Moon className="w-4 h-4" />
            A long pause of {formatDurationMs(gapNote)} — the tab was likely in the background
          </div>
        )}
        <Provider store={replayStore}>
          <div className="p-6">
            <RenderOLX id={addScope(key)} eventContext="replay" />
          </div>
        </Provider>
      </div>
    </DebugSettingsContext.Provider>
  );
}

// =============================================================================
// Data hooks
// =============================================================================

function useRuns() {
  const [manifest, setManifest] = useState<{ runs: RunSummary[]; generatedAt: string } | null | 'error'>(null);
  useEffect(() => {
    fetchRuns(BASE_PATH)
      .then((m) => setManifest(m ? { runs: m.runs, generatedAt: m.generatedAt } : 'error'))
      .catch(() => setManifest('error'));
  }, []);
  return manifest;
}

function useRunIndex(runId: string | undefined) {
  const [state, setState] = useState<{ index: RunIndex; content: LoggedEvent } | null | 'error'>(null);
  useEffect(() => {
    if (!runId) { setState(null); return; }
    let cancelled = false;
    setState(null);
    Promise.all([fetchRunIndex(BASE_PATH, runId), fetchRunContent(BASE_PATH, runId)])
      .then(([index, content]) => {
        if (cancelled) return;
        const contentEvent: LoggedEvent = { event: LOAD_OLXJSON, source: 'content', blocks: content.idMap } as any;
        setState({ index, content: contentEvent });
      })
      .catch(() => { if (!cancelled) setState('error'); });
    return () => { cancelled = true; };
  }, [runId]);
  return state;
}

// =============================================================================
// Views
// =============================================================================

function Breadcrumb({
  route, runLabel, studentName, sessionWhen, onNavigate, sessionNav,
}: {
  route: Route;
  runLabel?: string;
  studentName?: string;
  sessionWhen?: string;
  onNavigate: (r: Route) => void;
  sessionNav?: { prev?: () => void; next?: () => void };
}) {
  const crumbs: React.ReactNode[] = [];
  crumbs.push(
    <button key="home" className="rv-crumb" onClick={() => onNavigate({})} title="All runs">
      <Home className="w-4 h-4" style={{ display: 'inline', verticalAlign: '-2px' }} /> Home
    </button>,
  );
  if (route.run) {
    crumbs.push(<span key="s1" className="rv-crumb-sep">/</span>);
    const isCurrent = !route.student;
    crumbs.push(
      <button key="run" className={`rv-crumb ${isCurrent ? 'rv-crumb-current' : ''}`}
        onClick={() => !isCurrent && onNavigate({ run: route.run })}>
        {runLabel ?? route.run}
      </button>,
    );
  }
  if (route.student) {
    crumbs.push(<span key="s2" className="rv-crumb-sep">/</span>);
    const isCurrent = !route.session;
    crumbs.push(
      <button key="stu" className={`rv-crumb ${isCurrent ? 'rv-crumb-current' : ''}`}
        onClick={() => !isCurrent && onNavigate({ run: route.run, student: route.student })}>
        {studentName ?? route.student}
      </button>,
    );
  }
  if (route.session) {
    crumbs.push(<span key="s3" className="rv-crumb-sep">/</span>);
    crumbs.push(<span key="sess" className="rv-crumb rv-crumb-current">{sessionWhen ?? route.session}</span>);
  }

  return (
    <header className="rv-header">
      <nav className="rv-crumbs">{crumbs}</nav>
      <div className="rv-header-spacer" />
      {sessionNav && (
        <div className="rv-session-nav">
          <button className="rv-iconbtn" onClick={sessionNav.prev} disabled={!sessionNav.prev} aria-label="Previous session">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button className="rv-iconbtn" onClick={sessionNav.next} disabled={!sessionNav.next} aria-label="Next session">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </header>
  );
}

function RunsLanding({ runs, generatedAt, onPick }: { runs: RunSummary[]; generatedAt: string; onPick: (r: string) => void }) {
  const when = new Date(generatedAt);
  const snapshotDate = when.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  const dataRuns = runs.filter((r) => r.hasResponses);
  return (
    <div className="rv-page">
      <h1 className="rv-title">Session Replay</h1>
      <p className="rv-subtitle">Review how students worked through each activity, step by step.</p>
      <p className="rv-generated" title="Sessions that happened after this snapshot are not shown here.">
        Data snapshot from {snapshotDate}, {when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} — later activity is not included.
      </p>
      <div className="rv-run-grid rv-section-gap">
        {runs.map((r) => (
          <button key={r.id} className="rv-run-card" onClick={() => onPick(r.id)}>
            <div className="rv-run-card-label">{r.label}</div>
            <div className="rv-run-card-meta">
              {r.studentCount} students · {r.sessionCount} sessions
              {r.totalActiveMs > 0 && (
                <> · {formatDurationMs(r.totalActiveMs)} active</>
              )}
            </div>
            <div className="rv-run-card-arrow">View students →</div>
          </button>
        ))}
      </div>

      {dataRuns.length > 0 && (
        <div className="rv-section-gap rv-data-section">
          <h2 className="rv-data-heading">Response data</h2>
          <ul className="rv-data-bullets">
            {dataRuns.map((r) => (
              <li key={r.id}>
                {r.label}:{' '}
                <a
                  className="rv-data-bullet-link"
                  href={`${BASE_PATH}/replay-data/runs/${r.id}/responses.csv`}
                  download={`${r.id}-responses.csv`}
                >
                  responses
                </a>
                {' · '}
                <a
                  className="rv-data-bullet-link"
                  href={`${BASE_PATH}/replay-data/runs/${r.id}/sessions.csv`}
                  download={`${r.id}-sessions.csv`}
                >
                  sessions
                </a>
                {' '}(CSV)
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StudentTable({ index, onPick }: { index: RunIndex; onPick: (safeUserId: string) => void }) {
  return (
    <div className="rv-page">
      <h1 className="rv-title">{index.label}</h1>
      <p className="rv-subtitle">{index.students.length} students</p>
      <table className="rv-table rv-section-gap">
        <thead>
          <tr>
            <th>Student</th>
            <th>Sessions</th>
            <th title="Time-on-task: session time with long idle stretches capped, so it reads as real work time rather than wall-clock.">Active time</th>
            <th>Last active</th>
          </tr>
        </thead>
        <tbody>
          {index.students.map((s) => (
            <tr key={s.safeUserId} className="rv-row-click" onClick={() => onPick(s.safeUserId)}>
              <td className="rv-student-name">{s.userId}</td>
              <td className="rv-num">{s.sessions.length}</td>
              <td className="rv-num">{formatDurationMs(s.totalActiveMs)}</td>
              <td className="rv-num">{formatStart(s.lastActive)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SessionList({
  student, onPick,
}: {
  student: StudentEntry;
  onPick: (sessionId: string) => void;
}) {
  // Group sessions by day.
  const groups = useMemo(() => {
    const m = new Map<string, SessionEntry[]>();
    for (const s of student.sessions) {
      const k = dayLabel(s.started);
      (m.get(k) ?? m.set(k, []).get(k)!).push(s);
    }
    return [...m.entries()];
  }, [student]);

  return (
    <div className="rv-page">
      <h1 className="rv-title">{student.userId}</h1>
      <p className="rv-subtitle">
        {student.sessions.length} work sessions · {formatDurationMs(student.totalActiveMs)} active
      </p>
      {groups.map(([day, sessions]) => (
        <div key={day}>
          <div className="rv-day-heading">{day}</div>
          <div className="rv-session-list">
            {sessions.map((s) => (
              <button key={s.id} className="rv-session-item" onClick={() => onPick(s.id)}>
                <div>
                  <div className="rv-session-when">{formatStart(s.started)}</div>
                  <div className="rv-session-meta">
                    {formatDurationMs(s.durationMs)} (~{formatDurationMs(s.activeMs)} active) · {s.eventCount} events
                    {s.gaps.length > 0 && (
                      <span title="A long pause — usually the tab was in the background or the laptop was asleep.">
                        {` · ${s.gaps.length} long pause${s.gaps.length > 1 ? 's' : ''}`}
                      </span>
                    )}
                  </div>
                </div>
                <div className="rv-session-badge">Open →</div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SessionViewer({
  runId, content, student, session,
}: {
  runId: string;
  content: LoggedEvent;
  student: StudentEntry;
  session: SessionEntry;
}) {
  const [slices, setSlices] = useState<{ baseline: LoggedEvent[]; sessionEvents: LoggedEvent[] } | null | 'error'>(null);

  useEffect(() => {
    let cancelled = false;
    setSlices(null);
    fetchStudentEvents(BASE_PATH, runId, student)
      .then((all) => { if (!cancelled) setSlices(sliceSession(all, session)); })
      .catch(() => { if (!cancelled) setSlices('error'); });
    return () => { cancelled = true; };
  }, [runId, student, session]);

  if (slices === 'error') return <div className="rv-error">Could not load this session’s events.</div>;
  if (slices == null) return <div className="rv-loading"><Spinner>Loading session…</Spinner></div>;
  if (slices.sessionEvents.length === 0) return <div className="rv-note">This session has no replayable events.</div>;

  return (
    <SessionStage
      content={content}
      baseline={slices.baseline}
      sessionEvents={slices.sessionEvents}
      gaps={session.gaps}
    />
  );
}

// =============================================================================
// Root
// =============================================================================

export default function ReplayViewer() {
  const { route, navigate } = useHashRoute();
  const runsManifest = useRuns();
  const runState = useRunIndex(route.run);

  // Resolve student/session from the loaded index.
  const index = runState && runState !== 'error' ? runState.index : null;
  const content = runState && runState !== 'error' ? runState.content : null;
  const student = index && route.student ? findStudent(index, route.student) : undefined;
  const session = student && route.session ? findSession(student, route.session) : undefined;

  const runLabel = index?.label
    ?? (runsManifest && runsManifest !== 'error' ? runsManifest.runs.find((r) => r.id === route.run)?.label : undefined);

  // Prev/next session navigation.
  const sessionNav = useMemo(() => {
    if (!student || !session) return undefined;
    const i = student.sessions.findIndex((s) => s.id === session.id);
    const go = (j: number) => () => navigate({ run: route.run, student: route.student, session: student.sessions[j].id });
    return {
      prev: i > 0 ? go(i - 1) : undefined,
      next: i >= 0 && i < student.sessions.length - 1 ? go(i + 1) : undefined,
    };
  }, [student, session, navigate, route.run, route.student]);

  const onNavigate = useCallback((r: Route) => navigate(r), [navigate]);

  // ---- Render by route depth ----
  let body: React.ReactNode;

  if (runsManifest == null) {
    body = <div className="rv-loading"><Spinner>Loading…</Spinner></div>;
  } else if (runsManifest === 'error') {
    body = <div className="rv-error">No replay data found. Build it with the replay index script.</div>;
  } else if (!route.run) {
    body = <RunsLanding runs={runsManifest.runs} generatedAt={runsManifest.generatedAt} onPick={(r) => navigate({ run: r })} />;
  } else if (runState == null) {
    body = <div className="rv-loading"><Spinner>Loading run…</Spinner></div>;
  } else if (runState === 'error' || !index) {
    body = <div className="rv-error">Could not load run “{route.run}”.</div>;
  } else if (!route.student) {
    body = <StudentTable index={index} onPick={(sid) => navigate({ run: route.run, student: sid })} />;
  } else if (!student) {
    body = <div className="rv-error">Unknown student “{route.student}”.</div>;
  } else if (!route.session) {
    body = <SessionList student={student} onPick={(sid) => navigate({ run: route.run, student: route.student, session: sid })} />;
  } else if (!session) {
    body = <div className="rv-error">Unknown session “{route.session}”.</div>;
  } else {
    body = <SessionViewer runId={route.run} content={content!} student={student} session={session} />;
  }

  const showBreadcrumb = !!route.run;

  return (
    <Provider store={liveStore}>
      <div className="rv-app">
        {showBreadcrumb && (
          <Breadcrumb
            route={route}
            runLabel={runLabel}
            studentName={student?.userId}
            sessionWhen={session ? formatStart(session.started) : undefined}
            onNavigate={onNavigate}
            sessionNav={sessionNav}
          />
        )}
        {body}
      </div>
    </Provider>
  );
}
