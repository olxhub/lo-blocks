'use client';
import React from 'react';
import RenderMarkdown from '@/components/common/RenderMarkdown';
import type { RuntimeProps } from '@/lib/types';
import { useTextWithTemplate } from '@/lib/player/client/useText';
import { renderBlockStatus } from '@/lib/player/client/renderBlockStatus';

export default function Markdown(props: RuntimeProps) {
  const { text, ...status } = useTextWithTemplate(props);
  const statusView = renderBlockStatus(props, status);

  if (statusView) return statusView;

  // ns: embedded ```olx fences parse in this block's own namespace, so
  // they can reference sibling content with bare refs.
  return <RenderMarkdown ns={props.runtime.ns}>{text}</RenderMarkdown>;
}
