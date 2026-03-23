// src/components/blocks/specialized/TeamDirectory/_TeamDirectory.jsx
'use client';

import React from 'react';
import { useFieldState } from '@/lib/state';
import { useKids } from '@/lib/render';
import Avatar from '@/components/common/Avatar';
import { useCast, castMemberToAvatarProps } from '@/lib/cast';

function _TeamDirectory(props) {
  const { fields, group, title = 'Team Directory' } = props;
  const cast = useCast(props);

  const [selectedMember, setSelectedMember] = useFieldState(props, fields.selectedMember, null);
  const [viewMode, setViewMode] = useFieldState(props, fields.viewMode, 'grid');

  // Build team from cast, optionally filtered by group
  const teamData = Object.entries(cast)
    .filter(([, member]) => {
      if (!group) return true;
      return member.groups?.includes(group);
    })
    .map(([id, member]) => ({ id, ...member }));

  const handleMemberClick = (memberId) => {
    if (selectedMember === memberId) {
      setSelectedMember(null);
      setViewMode('grid');
    } else {
      setSelectedMember(memberId);
      setViewMode('detail');
    }
  };

  const selectedMemberData = teamData.find(member => member.id === selectedMember);

  const { kids: renderedKids } = useKids(props);

  if (teamData.length === 0) {
    return (
      <div className="team-directory p-4 border rounded-lg bg-white">
        {renderedKids}
        <p className="text-gray-500 text-sm">No team members found{group ? ` in group "${group}"` : ''}. Wrap in a &lt;Cast&gt; block to provide cast data.</p>
      </div>
    );
  }

  return (
    <div className="team-directory p-4 border rounded-lg bg-white">
      {renderedKids}

      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">{title}</h3>
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('grid')}
            className={`px-3 py-1 rounded text-sm ${
              viewMode === 'grid' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'
            }`}
          >
            Grid View
          </button>
          <button
            onClick={() => setViewMode('detail')}
            className={`px-3 py-1 rounded text-sm ${
              viewMode === 'detail' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'
            }`}
            disabled={!selectedMember}
          >
            Detail View
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
                  selectedMember === member.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div className="flex-shrink-0">
                    <Avatar {...avatarProps} size={48} />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900">{member.name ?? member.id}</h4>
                    {member.profile?.role && (
                      <p className="text-sm text-gray-600">{String(member.profile.role)}</p>
                    )}
                  </div>
                </div>
                {member.profile?.bio && (
                  <p className="mt-2 text-sm text-gray-700 line-clamp-2">{String(member.profile.bio)}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {viewMode === 'detail' && selectedMemberData && (
        <MemberDetail member={selectedMemberData} onClose={() => { setSelectedMember(null); setViewMode('grid'); }} />
      )}

      {viewMode === 'detail' && !selectedMemberData && (
        <div className="text-center py-8 text-gray-500">
          Select a team member to view their details
        </div>
      )}
    </div>
  );
}

function MemberDetail({ member, onClose }) {
  const avatarProps = castMemberToAvatarProps(member.id, member);
  const skills = Array.isArray(member.profile?.skills) ? member.profile.skills : [];

  return (
    <div className="team-member-detail bg-gray-50 p-6 rounded-lg">
      <div className="flex items-start space-x-6">
        <div className="flex-shrink-0">
          <Avatar {...avatarProps} size={96} />
        </div>

        <div className="flex-1">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h4 className="text-xl font-semibold text-gray-900">{member.name ?? member.id}</h4>
              {member.profile?.role && (
                <p className="text-lg text-blue-600 font-medium">{String(member.profile.role)}</p>
              )}
              {member.profile?.experience && (
                <p className="text-sm text-gray-600 mt-1">{String(member.profile.experience)}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-xl"
            >
              ×
            </button>
          </div>

          <div className="space-y-4">
            {member.profile?.bio && (
              <div>
                <h5 className="font-medium text-gray-900 mb-2">Background</h5>
                <p className="text-gray-700">{String(member.profile.bio)}</p>
              </div>
            )}

            {skills.length > 0 && (
              <div>
                <h5 className="font-medium text-gray-900 mb-2">Key Skills</h5>
                <div className="flex flex-wrap gap-2">
                  {skills.map((skill, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
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
