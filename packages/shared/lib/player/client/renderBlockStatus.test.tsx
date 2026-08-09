import React from 'react';
import { describe, expect, it } from 'vitest';
import Spinner from '@/components/common/Spinner';
import { DisplayError } from '@/lib/util/debug';
import { blockData } from '@/lib/state/blockData';
import { renderBlockStatus } from './renderBlockStatus';

const props = { loBlock: { name: 'TestBlock' } } as any;

describe('renderBlockStatus', () => {
  it('returns null when every result is ready', () => {
    expect(renderBlockStatus(props, [blockData('ready'), blockData('ready')])).toBeNull();
  });

  it('renders loading when any result is pending', () => {
    const view = renderBlockStatus(props, [blockData('ready'), blockData('loading')]) as React.ReactElement;
    expect(view.type).toBe(Spinner);
  });

  it('gives an error precedence over an unrelated loading result', () => {
    const view = renderBlockStatus(props, [
      blockData('loading'),
      blockData('error', 'Could not load text'),
    ]) as React.ReactElement;

    expect(view.type).toBe(DisplayError);
    expect(view.props).toMatchObject({ title: 'TestBlock', message: 'Could not load text' });
  });
});
