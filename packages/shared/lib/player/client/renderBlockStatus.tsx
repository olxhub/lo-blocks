'use client';

import React from 'react';
import Spinner from '@/components/common/Spinner';
import { DisplayError } from '@/lib/util/debug';
import type { BlockDataResult, RuntimeProps } from '@/lib/types';

/**
 * Render the non-ready state of one or more block-data hooks.
 *
 * Errors take precedence over loading so a completed failure is not hidden by
 * an unrelated dependency that is still pending. Ready results return null.
 */
export function renderBlockStatus(
  props: RuntimeProps,
  status: BlockDataResult | BlockDataResult[],
): React.ReactNode | null {
  const statuses = Array.isArray(status) ? status : [status];
  const failed = statuses.find(item => item.status === 'error' || item.error);

  if (failed) {
    return (
      <DisplayError
        props={props}
        title={props.loBlock?.name ?? 'Block'}
        message={failed.error ?? 'Block data is unavailable'}
      />
    );
  }

  if (statuses.some(item => item.loading)) return <Spinner />;
  if (statuses.every(item => item.ready)) return null;

  return (
    <DisplayError
      props={props}
      title={props.loBlock?.name ?? 'Block'}
      message="Block data is unavailable"
    />
  );
}
