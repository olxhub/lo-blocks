'use client';
// packages/shared/components/catalog/ForgeLinkIcon.tsx
//
// Renders a ForgeLink as an icon link ("view on GitHub"). The forge identity
// (a serializable token from the source provider) picks the icon here — the
// shared lib stays free of UI, the rendering layer owns the pixels.

import { Github, Gitlab, type LucideIcon } from 'lucide-react';
import type { ForgeLink } from '@/lib/types';

const ICONS: Record<ForgeLink['forge'], LucideIcon> = {
  github: Github,
  gitlab: Gitlab,
};

export default function ForgeLinkIcon({ link, className = 'text-dimmed hover:text-foreground', size = 16 }: {
  link: ForgeLink;
  className?: string;
  size?: number;
}) {
  const Icon = ICONS[link.forge];
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noreferrer"
      title={link.label}
      aria-label={link.label}
      className={className}
    >
      <Icon size={size} aria-hidden />
    </a>
  );
}
