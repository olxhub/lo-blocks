// src/components/common/debug/DebugPanel.tsx
//
// Debug panel for inspecting events, state, and content during development.
// Toggle with Ctrl+` (backtick) or ⌘`
//
// Features:
// - Live event stream with idPrefix scoping
// - Redux state inspection
// - OLX content inspection (from Redux olxjson)
//
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSelector } from 'react-redux';
import './DebugPanel.css';

type DebugTab = 'events' | 'state' | 'content';

interface DebugPanelProps {
  onClose: () => void;
  idPrefix?: string;
}

// Get events from the global event capture logger
function getEvents(): any[] {
  if (typeof window !== 'undefined' && (window as any).__events) {
    return (window as any).__events.getEvents() ?? [];
  }
  return [];
}

// Clear captured events
function clearEvents(): void {
  if (typeof window !== 'undefined' && (window as any).__events) {
    (window as any).__events.clear();
  }
}

export default function DebugPanel({ onClose, idPrefix = '' }: DebugPanelProps) {
  const [activeTab, setActiveTab] = useState<DebugTab>('events');
  const [events, setEvents] = useState<any[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [filterPrefix, setFilterPrefix] = useState(idPrefix);
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set());
  const eventsEndRef = useRef<HTMLDivElement>(null);

  // Get Redux state reactively via useSelector
  const reduxState = useSelector((state: any) => state);
  const olxJson = useSelector((state: any) => state?.application_state?.olxjson ?? null);

  // Refresh events periodically when auto-refresh is on
  const prevEventCountRef = useRef(0);
  useEffect(() => {
    if (!autoRefresh) return;

    const refresh = () => {
      const allEvents = getEvents();
      // Filter by idPrefix if specified
      const filtered = filterPrefix
        ? allEvents.filter(e => e.id?.startsWith(filterPrefix) || e.scope === filterPrefix)
        : allEvents;
      // Only update if event count changed (avoids re-render on every poll)
      if (filtered.length !== prevEventCountRef.current) {
        prevEventCountRef.current = filtered.length;
        setEvents(filtered);
      }
    };

    refresh();
    const interval = setInterval(refresh, 500);
    return () => clearInterval(interval);
  }, [autoRefresh, filterPrefix]);

  // Auto-scroll to bottom of events
  useEffect(() => {
    if (autoRefresh && eventsEndRef.current) {
      eventsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [events, autoRefresh]);

  const handleClearEvents = useCallback(() => {
    clearEvents();
    setEvents([]);
  }, []);

  const handleDownloadEvents = useCallback(() => {
    if (typeof window !== 'undefined' && (window as any).__events) {
      (window as any).__events.download('debug-events.json');
    }
  }, []);

  const toggleEventExpanded = useCallback((index: number) => {
    setExpandedEvents(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="debug-panel">
      <div className="debug-panel-header">
        <div className="debug-panel-tabs">
          {(['events', 'state', 'content'] as DebugTab[]).map(tab => (
            <button
              key={tab}
              className={`debug-panel-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
        <button className="debug-panel-close" onClick={onClose} title="Close (Esc)">
          ×
        </button>
      </div>

      <div className="debug-panel-body">
        {activeTab === 'events' && (
          <div className="debug-events">
            <div className="debug-events-controls">
              <input
                type="text"
                className="debug-filter-input"
                placeholder="Filter by id prefix..."
                value={filterPrefix}
                onChange={e => setFilterPrefix(e.target.value)}
              />
              <label className="debug-checkbox">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={e => setAutoRefresh(e.target.checked)}
                />
                Auto-refresh
              </label>
              <button className="debug-btn" onClick={handleClearEvents}>Clear</button>
              <button className="debug-btn" onClick={handleDownloadEvents}>Download</button>
            </div>
            <div className="debug-events-list">
              {events.length === 0 ? (
                <div className="debug-empty">No events captured yet. Interact with the page to see events.</div>
              ) : (
                events.map((event, idx) => (
                  <div
                    key={idx}
                    className={`debug-event ${expandedEvents.has(idx) ? 'expanded' : ''}`}
                    onClick={() => toggleEventExpanded(idx)}
                  >
                    <div className="debug-event-header">
                      <span className="debug-event-type">{event.event}</span>
                      {event.id && <span className="debug-event-id">{event.id}</span>}
                      <span className="debug-event-time">
                        {event.metadata?.iso_ts ? new Date(event.metadata.iso_ts).toLocaleTimeString() : ''}
                      </span>
                    </div>
                    {expandedEvents.has(idx) && (
                      <pre className="debug-event-detail">
                        {JSON.stringify(event, null, 2)}
                      </pre>
                    )}
                  </div>
                ))
              )}
              <div ref={eventsEndRef} />
            </div>
          </div>
        )}

        {activeTab === 'state' && (
          <div className="debug-state">
            <div className="debug-state-content">
              {reduxState ? (
                <StateTree data={reduxState} />
              ) : (
                <div className="debug-empty">Redux state not available</div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'content' && (
          <div className="debug-content">
            {olxJson ? (
              <OlxJsonTree data={olxJson} />
            ) : (
              <div className="debug-empty">No olxjson content in Redux</div>
            )}
          </div>
        )}
      </div>

      <div className="debug-panel-footer">
        <kbd>⌘`</kbd> Toggle panel
        <span className="debug-footer-hint">Click to expand</span>
      </div>
    </div>
  );
}

// Summarize a value for collapsed preview (no recursion!)
function summarizeValue(value: any): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'boolean') return value.toString();
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    if (value.length > 30) return `"${value.slice(0, 30)}..."`;
    return `"${value}"`;
  }
  if (Array.isArray(value)) return `[${value.length}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    return `{${keys.length}}`;
  }
  return String(value);
}

// State tree component - doesn't recurse when collapsed
function StateTree({ data }: { data: any }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (data === null) return <span className="debug-value null">null</span>;
  if (data === undefined) return <span className="debug-value undefined">undefined</span>;
  if (typeof data === 'boolean') return <span className="debug-value boolean">{data.toString()}</span>;
  if (typeof data === 'number') return <span className="debug-value number">{data}</span>;
  if (typeof data === 'string') return <span className="debug-value string">"{data}"</span>;

  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="debug-value array">[]</span>;
    return <span className="debug-value array">[{data.length} items]</span>;
  }

  if (typeof data === 'object') {
    const keys = Object.keys(data);
    if (keys.length === 0) return <span className="debug-value object">{'{}'}</span>;

    const toggle = (key: string) => {
      setExpanded(prev => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    };

    return (
      <div className="debug-tree">
        {keys.map(key => {
          const value = data[key];
          const isExpandable = value && typeof value === 'object' && Object.keys(value).length > 0;
          const isExpanded = expanded.has(key);

          return (
            <div key={key} className="debug-tree-node">
              <div
                className={`debug-tree-key ${isExpandable ? 'expandable' : ''}`}
                onClick={() => isExpandable && toggle(key)}
              >
                {isExpandable && (
                  <span className="debug-tree-arrow">{isExpanded ? '▼' : '▶'}</span>
                )}
                <span className="debug-key-name">{key}</span>
                {!isExpandable && <>: <span className="debug-tree-preview">{summarizeValue(value)}</span></>}
              </div>
              {isExpanded && (
                <div className="debug-tree-children">
                  <StateTree data={value} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return <span className="debug-value">{String(data)}</span>;
}

// Content-specific tree for olxjson (shows source → blocks)
function OlxJsonTree({ data }: { data: Record<string, any> }) {
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(new Set());

  const sources = Object.keys(data);

  const toggleSource = (source: string) => {
    setExpandedSources(prev => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  };

  const toggleBlock = (key: string) => {
    setExpandedBlocks(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="debug-tree">
      {sources.map(source => {
        const blocks = data[source] || {};
        const blockIds = Object.keys(blocks);
        const isExpanded = expandedSources.has(source);

        return (
          <div key={source} className="debug-tree-node">
            <div className="debug-tree-key expandable" onClick={() => toggleSource(source)}>
              <span className="debug-tree-arrow">{isExpanded ? '▼' : '▶'}</span>
              <span className="debug-key-name">{source}</span>
              <span className="debug-count">({blockIds.length} blocks)</span>
            </div>
            {isExpanded && (
              <div className="debug-tree-children">
                {blockIds.map(blockId => {
                  const block = blocks[blockId];
                  const blockKey = `${source}:${blockId}`;
                  const blockExpanded = expandedBlocks.has(blockKey);

                  return (
                    <div key={blockId} className="debug-tree-node">
                      <div className="debug-tree-key expandable" onClick={() => toggleBlock(blockKey)}>
                        <span className="debug-tree-arrow">{blockExpanded ? '▼' : '▶'}</span>
                        <span className="debug-content-key">{blockId}</span>
                        <span className="debug-content-tag">{block?.olxJson?.tag || block?.tag || '?'}</span>
                      </div>
                      {blockExpanded && (
                        <pre className="debug-block-detail">
                          {JSON.stringify(block, null, 2)}
                        </pre>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
