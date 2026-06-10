// packages/shared/components/blocks/scenario/TeamDirectory/_TeamDirectory.jsx
'use client';

import { useFieldState } from '@/lib/state';
import Avatar from '@/components/common/Avatar';
import { useCast, mergeCasts, castMemberToAvatarProps } from '@/lib/avatar/cast';
import { useBlockTranslation } from '@/lib/i18n/blockI18n';
import type { RuntimeProps } from '@/lib/types';
import type { Cast, CastMember } from '@/lib/avatar/types';

/** A cast member with its id folded in (the cast map key). */
type TeamMember = CastMember & { id: string };

/** Block translation function (from useBlockTranslation). */
type TFn = (key: string, vars?: Record<string, unknown>) => string;

function _TeamDirectory(props: RuntimeProps) {
  const { fields, group, title, kids } = props;
  const { t } = useBlockTranslation(props);
  const resolvedTitle = title || t('teamDirectoryTitle');
  // Merge: runtime.cast ← cast= attribute ← body YAML (kids). kids is inline
  // cast-shaped content; the parse boundary (validateCast) covers schema
  // checking, so treating it as a Cast layer here is a deliberate trust cast.
  const cast = mergeCasts(useCast(props), kids as unknown as Cast);

  const [selectedMember, setSelectedMember] = useFieldState(props, fields.selectedMember, null);
  const [viewMode, setViewMode] = useFieldState(props, fields.viewMode, 'grid');

  // Build team from cast, optionally filtered by group
  const teamData = Object.entries(cast)
    .filter(([, member]) => {
      if (!group) return true;
      return member.groups?.includes(group);
    })
    .map(([id, member]) => ({ id, ...member }));

  const handleMemberClick = (memberId: string) => {
    if (selectedMember === memberId) {
      setSelectedMember(null);
      setViewMode('grid');
    } else {
      setSelectedMember(memberId);
      setViewMode('detail');
    }
  };

  const selectedMemberData = teamData.find(member => member.id === selectedMember);

  if (teamData.length === 0) {
    return (
      <div className="team-directory p-4 border rounded-lg bg-background">
        <p className="text-dimmed text-sm">
            {group
            ? t('noTeamMembersFoundInGroup', { group })
            : t('noTeamMembersFound')}
        </p>
      </div>
    );
  }

  return (
    <div className="team-directory p-4 border rounded-lg bg-background">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">{resolvedTitle}</h3>
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('grid')}
            className={`px-3 py-1 rounded text-sm ${
              viewMode === 'grid' ? 'bg-accent text-inverse' : 'bg-muted text-secondary'
            }`}
          >
            {t('gridView')}
          </button>
          <button
            onClick={() => setViewMode('detail')}
            className={`px-3 py-1 rounded text-sm ${
              viewMode === 'detail' ? 'bg-accent text-inverse' : 'bg-muted text-secondary'
            }`}
            disabled={!selectedMember}
          >
            {t('detailView')}
          </button>
        </div>
      </div>

      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {teamData.map((member) => {
            const avatarProps = castMemberToAvatarProps(member.id, member);
            return (
              <div
                key={member.id}
                onClick={() => handleMemberClick(member.id)}
                className={`team-member-card p-4 border rounded-lg cursor-pointer transition-all hover:shadow-lg ${
                  selectedMember === member.id ? 'border-accent bg-accent-subtle' : 'border-border hover:border-border'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div className="flex-shrink-0">
                    <Avatar {...avatarProps} size={48} />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-foreground">{member.name ?? member.id}</h4>
                    {member.profile?.role ? (
                      <p className="text-sm text-secondary">{String(member.profile.role)}</p>
                    ) : null}
                  </div>
                </div>
                {member.profile?.bio ? (
                  <p className="mt-2 text-sm text-secondary line-clamp-2">{String(member.profile.bio)}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {viewMode === 'detail' && selectedMemberData && (
        <MemberDetail
          member={selectedMemberData}
          onClose={() => { setSelectedMember(null); setViewMode('grid'); }}
          t={t}
        />
      )}

      {viewMode === 'detail' && !selectedMemberData && (
        <div className="text-center py-8 text-dimmed">
          {t('selectMemberToViewDetails')}
        </div>
      )}
    </div>
  );
}

function MemberDetail({ member, onClose, t }: {
  member: TeamMember;
  onClose: () => void;
  t: TFn;
}) {
  const avatarProps = castMemberToAvatarProps(member.id, member);
  const skills = Array.isArray(member.profile?.skills) ? member.profile.skills : [];

  return (
    <div className="team-member-detail bg-surface p-6 rounded-lg">
      <div className="flex items-start space-x-6">
        <div className="flex-shrink-0">
          <Avatar {...avatarProps} size={96} />
        </div>

        <div className="flex-1">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h4 className="text-xl font-semibold text-foreground">{member.name ?? member.id}</h4>
              {!!member.profile?.role && (
                <p className="text-lg text-accent font-medium">{String(member.profile.role)}</p>
              )}
              {!!member.profile?.experience && (
                <p className="text-sm text-secondary mt-1">{String(member.profile.experience)}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-dimmed hover:text-secondary text-xl"
            >
              ×
            </button>
          </div>

          <div className="space-y-4">
            {!!member.profile?.bio && (
              <div>
                <h5 className="font-medium text-foreground mb-2">{t('profileBackground')}</h5>
                <p className="text-secondary">{String(member.profile.bio)}</p>
              </div>
            )}

            {skills.length > 0 && (
              <div>
                <h5 className="font-medium text-foreground mb-2">{t('keySkills')}</h5>
                <div className="flex flex-wrap gap-2">
                  {skills.map((skill, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-accent-subtle text-accent rounded-full text-sm"
                    >
                      {String(skill)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default _TeamDirectory;
