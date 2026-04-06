// src/components/blocks/layout/Navigator/_NavigatorTeamPreview.jsx
'use client';
import type { RuntimeProps } from '@/lib/types';

import React from 'react';
import NextImage from 'next/image';
import { resolveContentPath } from '@/lib/content/contentPaths';

export default function _NavigatorTeamPreview(props: RuntimeProps) {
  const { name, role, photo } = props;

  if (!name || !role) {
    return <div className="p-3 text-error text-sm">Missing name or role</div>;
  }

  const photoUrl = resolveContentPath(photo);

  return (
    <div className="p-3 border-b cursor-pointer transition-all hover:bg-surface">
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center overflow-hidden">
          {photoUrl ? (
            <NextImage
              src={photoUrl}
              alt={name}
              width={40}
              height={40}
              className="rounded-full object-cover"
            />
          ) : (
            <span className="text-secondary font-medium text-sm">
              {name.split(' ').map(n => n[0]).join('')}
            </span>
          )}
        </div>
        <div className="flex-1">
          <div className="font-medium text-foreground">{name}</div>
          <div className="text-sm text-secondary">{role}</div>
        </div>
      </div>
    </div>
  );
}
