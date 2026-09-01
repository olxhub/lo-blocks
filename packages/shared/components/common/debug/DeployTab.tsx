// packages/shared/components/common/debug/DeployTab.tsx
//
// "What is running here?" tab for the debug panel (Ctrl+`).
//
// Reads /api/deploy-info — the server's projection of APP_HOME/.deploy-info,
// the manifest learning-ops writes on every `ops deploy` / `ops deploy-content`.
// A stale platform on a server should be visible in one keystroke instead of
// costing a debugging round.
//
// Failure is informative, not fatal: a 404 (an app build without the route)
// and a dev checkout with no manifest both render as readable text.
//
'use client';

import { useEffect, useState } from 'react';

interface GitInfo {
  sha?: string;
  branch?: string;
  describe?: string;
  dirty?: boolean;
}

interface ContentEntry {
  repo?: string;
  sha?: string;
  describe?: string;
  branch?: string;
  dirty?: boolean;
  dirty_diff?: boolean;
  deployed_at?: string;
}

interface DeployInfo {
  source: 'deploy-info' | 'development' | 'unknown';
  summary: string;
  deployedAt?: string;
  deployedBy?: string;
  host?: string;
  repos?: Record<string, string>;
  content?: Record<string, ContentEntry>;
  git?: GitInfo;
  manifestPath?: string;
  note?: string;
}

// "https://github.com/OlxHub/lo-blocks.git@a1b2c3d..." → { url, sha }
function splitRef(ref: string): { url: string; sha: string } {
  const at = ref.lastIndexOf('@');
  return at < 0 ? { url: '', sha: ref } : { url: ref.slice(0, at), sha: ref.slice(at + 1) };
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="debug-deploy-row">
      <span className="debug-deploy-label">{label}</span>
      <span className="debug-deploy-value">{children}</span>
    </div>
  );
}

function DirtyFlag({ dirty, diffShipped }: { dirty?: boolean; diffShipped?: boolean }) {
  if (!dirty) return null;
  return (
    <span className="debug-deploy-dirty">
      DIRTY{diffShipped ? ' (working-tree diff shipped)' : ''}
    </span>
  );
}

export default function DeployTab() {
  const [info, setInfo] = useState<DeployInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch on mount only. This is deploy identity — it cannot change without
  // the server restarting, which drops the page anyway.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/deploy-info')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(d => { if (!cancelled) setInfo(d); })
      .catch(e => { if (!cancelled) setError(String(e.message ?? e)); });
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <div className="debug-deploy">
        <div className="debug-empty">
          Could not read deploy info: {error}
          <br />
          (This build may predate the /api/deploy-info route.)
        </div>
      </div>
    );
  }
  if (!info) return <div className="debug-deploy"><div className="debug-empty">Loading…</div></div>;

  const isDev = info.source !== 'deploy-info';

  return (
    <div className="debug-deploy">
      <div className={`debug-deploy-summary${isDev ? ' dev' : ''}`}>
        {isDev ? 'development build' : 'deployed build'}
        <span className="debug-deploy-summary-detail">{info.summary}</span>
      </div>

      {info.host && <Row label="host">{info.host}</Row>}
      {info.deployedAt && <Row label="deployed">{info.deployedAt}</Row>}
      {info.deployedBy && <Row label="by">{info.deployedBy}</Row>}

      {info.repos && Object.keys(info.repos).length > 0 && (
        <>
          <div className="debug-deploy-heading">platform repos</div>
          {Object.entries(info.repos).map(([name, ref]) => {
            const { url, sha } = splitRef(ref);
            return (
              <Row key={name} label={name}>
                <span className="debug-deploy-sha">{sha.slice(0, 12)}</span>
                {url && <span className="debug-deploy-url">{url}</span>}
              </Row>
            );
          })}
        </>
      )}

      {info.content && Object.keys(info.content).length > 0 && (
        <>
          <div className="debug-deploy-heading">content repos</div>
          {Object.entries(info.content).map(([name, entry]) => (
            <Row key={name} label={name}>
              <span className="debug-deploy-sha">
                {entry.describe ?? (entry.sha ? entry.sha.slice(0, 12) : 'unknown')}
              </span>
              {entry.branch && <span className="debug-deploy-branch">{entry.branch}</span>}
              <DirtyFlag dirty={entry.dirty} diffShipped={entry.dirty_diff} />
              {entry.deployed_at && (
                <span className="debug-deploy-when">{entry.deployed_at}</span>
              )}
            </Row>
          ))}
        </>
      )}

      {info.git && (
        <>
          <div className="debug-deploy-heading">
            server checkout (live git)
          </div>
          <Row label="lo-blocks">
            <span className="debug-deploy-sha">
              {info.git.describe ?? info.git.sha?.slice(0, 12) ?? 'unknown'}
            </span>
            {info.git.branch && <span className="debug-deploy-branch">{info.git.branch}</span>}
            <DirtyFlag dirty={info.git.dirty} />
          </Row>
        </>
      )}

      {info.manifestPath && <Row label="manifest">{info.manifestPath}</Row>}
      {info.note && <div className="debug-deploy-note">{info.note}</div>}
    </div>
  );
}
