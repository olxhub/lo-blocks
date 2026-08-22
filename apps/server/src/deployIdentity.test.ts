// apps/server/src/deployIdentity.test.ts
//
// The deploy stamp is a debugging instrument: it is consulted exactly when
// something else has already gone wrong. So the properties under test are
// mostly about not making a bad day worse — never throwing, never lying
// about a dev build, and never carrying a shape that could fold into
// student state.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  assembleDeployIdentity,
  deployStampEvent,
  SERVER_DEPLOY_IDENTITY,
  type DeployIdentity,
} from './deployIdentity.js';

const GIT = { sha: 'abcdef1234567890', branch: 'main', describe: 'v1.2-3-gabcdef1', dirty: false };

function withManifest(body: string, fn: (p: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-info-'));
  const file = path.join(dir, '.deploy-info');
  fs.writeFileSync(file, body);
  try {
    fn(file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const MANIFEST = {
  deployed_at: '2026-08-22T10:00:00Z',
  deployed_by: 'pmitros',
  host: 'psych-pilot',
  repos: { 'lo-blocks': 'https://github.com/OlxHub/lo-blocks.git@0123456789abcdef0123' },
  content: {
    'edu.memphis.writing': {
      sha: 'fedcba9876543210',
      describe: 'v0.4-2-gfedcba9-dirty',
      branch: 'main',
      dirty: true,
      dirty_diff: true,
    },
  },
};

describe('assembleDeployIdentity', () => {
  it('reports a real manifest, keeping platform and content records side by side', () => {
    withManifest(JSON.stringify(MANIFEST), (file) => {
      const id = assembleDeployIdentity([file], GIT);
      expect(id.source).toBe('deploy-info');
      expect(id.host).toBe('psych-pilot');
      expect(id.deployedAt).toBe('2026-08-22T10:00:00Z');
      // The clobber bug this whole change exists to fix would show up here
      // as one of these two being absent.
      expect(id.repos?.['lo-blocks']).toContain('0123456789abcdef0123');
      expect(id.content?.['edu.memphis.writing']).toMatchObject({ dirty: true, dirty_diff: true });
      // The summary is what a human reads first; it must name the build.
      expect(id.summary).toContain('0123456789ab');
      expect(id.manifestPath).toBe(file);
    });
  });

  it('falls back to git and says "development build" when no manifest exists', () => {
    const id = assembleDeployIdentity(['/nonexistent/.deploy-info'], GIT);
    expect(id.source).toBe('development');
    expect(id.summary).toContain('development build');
    expect(id.summary).toContain('v1.2-3-gabcdef1');
    expect(id.summary).toContain('main');
    // The note names the paths tried — the next question after "no manifest?"
    // is always "where did you look?".
    expect(id.note).toContain('/nonexistent/.deploy-info');
  });

  it('flags a dirty dev checkout in the summary', () => {
    const id = assembleDeployIdentity(['/nonexistent'], { ...GIT, dirty: true });
    expect(id.summary).toContain('[dirty]');
  });

  it('reports "unknown" rather than throwing when there is no manifest and no git', () => {
    const id = assembleDeployIdentity(['/nonexistent'], undefined);
    expect(id.source).toBe('unknown');
    expect(id.summary).toContain('unknown build');
  });

  it('skips a corrupt manifest and keeps looking', () => {
    withManifest('{ this is not json', (bad) => {
      withManifest(JSON.stringify(MANIFEST), (good) => {
        const id = assembleDeployIdentity([bad, good], GIT);
        expect(id.source).toBe('deploy-info');
        expect(id.manifestPath).toBe(good);
      });
    });
  });

  it('does not mistake a corrupt-only manifest for a deployed build', () => {
    withManifest('not json at all', (bad) => {
      const id = assembleDeployIdentity([bad], GIT);
      expect(id.source).toBe('development');
    });
  });
});

describe('deployStampEvent', () => {
  const identity: DeployIdentity = assembleDeployIdentity(['/nonexistent'], GIT);

  it('carries the identity and the connection it belongs to', () => {
    const ev = deployStampEvent('conn-7', identity);
    expect(ev.event).toBe(SERVER_DEPLOY_IDENTITY);
    expect(ev.connection).toBe('conn-7');
    expect(ev.source).toBe('development');
    expect(ev.git).toEqual(GIT);
    expect(typeof ev.stampedAt).toBe('string');
  });

  // THE load-bearing assertion. The server folds every event it receives;
  // an unregistered type with a top-level `id` gets spread into
  // component[id] (store.ts). Deploy provenance becoming student state
  // would be silent, permanent, and per-user. Same rule as errorEvents.ts.
  it('carries no envelope key the state reducer routes on', () => {
    const ev = deployStampEvent('conn-7', identity);
    for (const key of ['id', 'scope', 'field', 'tag']) {
      expect(ev).not.toHaveProperty(key);
    }
  });

  it('omits absent sections rather than emitting undefined', () => {
    const ev = deployStampEvent('conn-7', { source: 'unknown', summary: 'nothing known' });
    expect(Object.keys(ev).sort()).toEqual(
      ['connection', 'event', 'source', 'stampedAt', 'summary'],
    );
  });
});
