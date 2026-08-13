// packages/shared/components/blocks/action/printFileName.test.ts
//
// The default filename a print/save-as-PDF produces.
//
// Worth pinning because the whole feature is a string, and every way it can go
// wrong produces a file that still saves — just uselessly. A missing piece
// written as the literal "undefined", a display name carrying a slash, or an
// empty name that makes the browser fall back to the URL: none of these throw,
// none show up in a render test, and each one lands in a folder of student
// submissions where it is someone else's problem to sort out.
import { describe, it, expect } from 'vitest';
import { printFileName, printTimestamp, sanitizeSegment, leafId } from './PrintAction';

const AT = new Date(2026, 7, 13, 14, 25, 30);   // 2026-08-13 14:25:30 local

/** Minimal stand-in for the props an action receives from propsFromNode. */
const propsWith = ({ user, activityId, buttonId, launchableId }: any = {}) => ({
  runtime: {
    activityId,
    store: { getState: () => ({ application_state: { system: { currentUser: user } } }) },
  },
  nodeInfo: buttonId === undefined ? undefined : {
    parent: {
      loBlock: { name: 'ActionButton' },
      olxJson: { id: `edu.memphis.psych/${buttonId}`, attributes: { id: buttonId } },
      parent: launchableId ? {
        loBlock: { name: 'Sequential' },
        olxJson: { id: `edu.memphis.psych/${launchableId}`,
                   attributes: { id: launchableId, launchable: 'true' } },
      } : undefined,
    },
  },
}) as any;

describe('printTimestamp', () => {
  it('is sortable and filesystem-safe', () => {
    expect(printTimestamp(AT)).toBe('20260813-142530');
    // Zero-padding: an unpadded month would sort "2026913" before "20261013".
    expect(printTimestamp(new Date(2026, 0, 2, 3, 4, 5))).toBe('20260102-030405');
  });
});

describe('sanitizeSegment', () => {
  it('strips anything that would make trouble in a filename', () => {
    expect(sanitizeSegment('Dr. Chen (she/her)')).toBe('Dr.-Chen-she-her');
    expect(sanitizeSegment('../../etc/passwd')).toBe('etc-passwd');
    expect(sanitizeSegment('  spaced  out  ')).toBe('spaced-out');
  });

  it('renders absent values as empty, never as "undefined"', () => {
    // The whole point of filtering below: a hole in the name beats the word.
    expect(sanitizeSegment(undefined)).toBe('');
    expect(sanitizeSegment(null)).toBe('');
  });
});

describe('printFileName', () => {
  it('names who, which activity, which button, and when', () => {
    const name = printFileName(propsWith({
      user: { user_id: 'PluckyLlama99' },
      activityId: 'bmod_handout1',
      buttonId: 'bmod_h1_print_btn',
    }), AT);
    expect(name).toBe('PluckyLlama99_bmod_handout1_bmod_h1_print_btn_20260813-142530');
  });

  it('falls back to safe_user_id when there is no display id', () => {
    const name = printFileName(propsWith({
      user: { safe_user_id: 'guest-PluckyLlama99' },
      activityId: 'bmod_handout2',
      buttonId: 'b',
    }), AT);
    expect(name).toBe('guest-PluckyLlama99_bmod_handout2_b_20260813-142530');
  });

  it('drops parts it cannot determine instead of writing "undefined"', () => {
    // Auth not yet echoed, previewing a bare screen, PrintAction with no
    // button around it — each is a real state, and none should reach a file.
    const name = printFileName(propsWith({}), AT);
    expect(name).toBe('20260813-142530');
    expect(name).not.toMatch(/undefined|null/);

    const partial = printFileName(propsWith({ user: { user_id: 'u' }, buttonId: 'btn' }), AT);
    expect(partial).toBe('u_btn_20260813-142530');
  });

  it('never returns an empty name', () => {
    // An empty title makes the browser fall back to the URL.
    expect(printFileName({} as any, AT)).toBe('20260813-142530');
    expect(printFileName(propsWith({ user: { user_id: '///' } }), AT)).toBe('20260813-142530');
  });

  it('prefers the launchable ancestor over whatever page is being rendered', () => {
    // In preview, runtime.activityId is the id being RENDERED — one screen of
    // a handout. Naming the file after the screen would scatter a student's
    // submissions across as many names as they printed from.
    const name = printFileName(propsWith({
      user: { user_id: 'u' },
      activityId: 'edu.memphis.psych/bmod_h1_gate_done',   // the previewed screen
      launchableId: 'bmod_handout1',                        // the real activity
      buttonId: 'bmod_h1_print_btn',
    }), AT);
    expect(name).toBe('u_bmod_handout1_bmod_h1_print_btn_20260813-142530');
  });

  it('strips the namespace off the activityId fallback', () => {
    // activityId arrives namespaced; "edu.memphis.psych/x" sanitized whole
    // becomes "edu.memphis.psych-x", which is noise in every filename.
    expect(leafId('edu.memphis.psych/bmod_handout1')).toBe('bmod_handout1');
    const name = printFileName(propsWith({
      user: { user_id: 'u' },
      activityId: 'edu.memphis.psych/bmod_handout3',
      buttonId: 'b',                                        // no launchable ancestor
    }), AT);
    expect(name).toBe('u_bmod_handout3_b_20260813-142530');
  });

  it('finds the button even when PrintAction is nested deeper inside it', () => {
    const props: any = propsWith({ user: { user_id: 'u' }, activityId: 'act', buttonId: 'the_btn' });
    // getParents walks up, so an intervening wrapper must not hide the button.
    props.nodeInfo = { parent: { loBlock: { name: 'Vertical' }, olxJson: {}, parent: props.nodeInfo.parent } };
    expect(printFileName(props, AT)).toBe('u_act_the_btn_20260813-142530');
  });
});
