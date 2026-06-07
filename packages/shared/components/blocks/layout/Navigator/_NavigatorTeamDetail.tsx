// src/components/blocks/layout/Navigator/_NavigatorTeamDetail.jsx
'use client';
import type { RuntimeProps } from '@/lib/types';

import NextImage from 'next/image';
import { resolveContentPath } from '@/lib/content/contentPaths';

export default function _NavigatorTeamDetail(props: RuntimeProps) {
  const { name, role, photo, bio, experience, skills } = props;

  if (!name || !role) {
    return <div className="p-6 text-error">Missing name or role</div>;
  }

  const skillsArray = Array.isArray(skills)
    ? skills
    : (skills ? skills.split(',').map(s => s.trim()) : []);

  const photoUrl = resolveContentPath(photo);

  return (
    <div className="p-6">
      <div className="flex items-start space-x-4 mb-6">
        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
          {photoUrl ? (
            <NextImage
              src={photoUrl}
              alt={name}
              width={64}
              height={64}
              className="rounded-full object-cover"
            />
          ) : (
            <span className="text-secondary font-medium">
              {name.split(' ').map(n => n[0]).join('')}
            </span>
          )}
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-semibold text-foreground">{name}</h2>
          <p className="text-lg text-accent font-medium">{role}</p>
          {experience && <p className="text-sm text-secondary mt-1">{experience}</p>}
        </div>
      </div>

      {bio && (
        <div className="mb-4">
          <h3 className="font-medium text-foreground mb-2">Background</h3>
          <p className="text-secondary">{bio}</p>
        </div>
      )}

      {skillsArray.length > 0 && (
        <div>
          <h3 className="font-medium text-foreground mb-2">Key Skills</h3>
          <div className="flex flex-wrap gap-2">
            {skillsArray.map((skill, i) => (
              <span key={i} className="px-3 py-1 bg-accent-subtle text-accent rounded-full text-sm">
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
