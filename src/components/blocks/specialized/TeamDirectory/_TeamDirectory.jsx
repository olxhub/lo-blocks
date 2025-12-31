// src/components/blocks/specialized/TeamDirectory/_TeamDirectory.jsx
'use client';

import React from 'react';
import { useReduxState } from '@/lib/state';
import { useKids } from '@/lib/render';

// Default team data for the Comm360 SBA
// TODO: Make this configurable via OLX children or data attribute
const DEFAULT_TEAM = [
  {
    id: 'ty',
    name: 'Ty',
    role: 'Intern Teammate',
    photo: 'sba/interdisciplinary/images/ty.png',
    bio: 'Intern at Comm360 focusing on program evaluation and data analysis.',
    experience: '6 months at Comm360',
    skills: ['Data Analysis', 'Research', 'Program Evaluation']
  },
  {
    id: 'peggy',
    name: 'Peggy',
    role: 'Intern Teammate',
    photo: 'sba/interdisciplinary/images/peggy.png',
    bio: 'Intern specializing in community outreach and stakeholder engagement.',
    experience: '4 months at Comm360',
    skills: ['Community Outreach', 'Communication', 'Project Management']
  },
  {
    id: 'lacy',
    name: 'Lacy',
    role: 'Intern Teammate',
    photo: 'sba/interdisciplinary/images/lacy.png',
    bio: 'Intern with focus on program development and implementation strategies.',
    experience: '5 months at Comm360',
    skills: ['Program Development', 'Strategic Planning', 'Implementation']
  },
  {
    id: 'lianne',
    name: 'Lianne Park',
    role: 'Supervisor/Mentor',
    photo: 'sba/interdisciplinary/images/lianne.png',
    bio: 'Director of multiple programs at Comm360 with extensive experience in program evaluation and development. Presents findings to the PDE committee.',
    experience: '5 years at Comm360',
    skills: ['Program Management', 'Leadership', 'Strategic Planning', 'Evaluation']
  },
  {
    id: 'anne',
    name: 'Anne Hastings',
    role: 'Chief Executive Officer',
    photo: 'sba/interdisciplinary/images/anne.png',
    bio: 'CEO of Comm360, making ultimate decisions about programs and resources. Reports to the board of directors.',
    experience: '8 years at Comm360, 15+ years leadership experience',
    skills: ['Executive Leadership', 'Strategic Decision Making', 'Resource Management', 'Organizational Development']
  }
];

function _TeamDirectory(props) {
  const { fields, teamData = DEFAULT_TEAM, title = "Team Directory" } = props;

  const [selectedMember, setSelectedMember] = useReduxState(props, fields.selectedMember, null);
  const [viewMode, setViewMode] = useReduxState(props, fields.viewMode, 'grid');

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

  // Resolve photo path to content URL
  const getPhotoUrl = (photo) => {
    if (!photo) return null;
    if (photo.startsWith('http://') || photo.startsWith('https://')) return photo;
    return `/content/${photo}`;
  };

  const { kids: renderedKids } = useKids(props);

  return (
    <div className="team-directory p-4 border rounded-lg bg-white">
      {/* Render any child content */}
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
          {teamData.map((member) => (
            <div
              key={member.id}
              onClick={() => handleMemberClick(member.id)}
              className={`team-member-card p-4 border rounded-lg cursor-pointer transition-all hover:shadow-lg ${
                selectedMember === member.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-gray-300 rounded-full flex items-center justify-center overflow-hidden">
                  {member.photo ? (
                    <img
                      src={getPhotoUrl(member.photo)}
                      alt={member.name}
                      className="w-12 h-12 rounded-full object-cover"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <span className="text-gray-600 font-medium" style={{display: member.photo ? 'none' : 'flex'}}>
                    {member.name.split(' ').map(n => n[0]).join('')}
                  </span>
                </div>
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900">{member.name}</h4>
                  <p className="text-sm text-gray-600">{member.role}</p>
                </div>
              </div>
              <p className="mt-2 text-sm text-gray-700 line-clamp-2">{member.bio}</p>
            </div>
          ))}
        </div>
      )}

      {viewMode === 'detail' && selectedMemberData && (
        <div className="team-member-detail bg-gray-50 p-6 rounded-lg">
          <div className="flex items-start space-x-6">
            <div className="w-24 h-24 bg-gray-300 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
              {selectedMemberData.photo ? (
                <img
                  src={getPhotoUrl(selectedMemberData.photo)}
                  alt={selectedMemberData.name}
                  className="w-24 h-24 rounded-full object-cover"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
                  }}
                />
              ) : null}
              <span className="text-gray-600 font-medium text-xl" style={{display: selectedMemberData.photo ? 'none' : 'flex'}}>
                {selectedMemberData.name.split(' ').map(n => n[0]).join('')}
              </span>
            </div>

            <div className="flex-1">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h4 className="text-xl font-semibold text-gray-900">{selectedMemberData.name}</h4>
                  <p className="text-lg text-blue-600 font-medium">{selectedMemberData.role}</p>
                  <p className="text-sm text-gray-600 mt-1">{selectedMemberData.experience}</p>
                </div>
                <button
                  onClick={() => {
                    setSelectedMember(null);
                    setViewMode('grid');
                  }}
                  className="text-gray-400 hover:text-gray-600 text-xl"
                >
                  ×
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <h5 className="font-medium text-gray-900 mb-2">Background</h5>
                  <p className="text-gray-700">{selectedMemberData.bio}</p>
                </div>

                <div>
                  <h5 className="font-medium text-gray-900 mb-2">Key Skills</h5>
                  <div className="flex flex-wrap gap-2">
                    {selectedMemberData.skills.map((skill, index) => (
                      <span
                        key={index}
                        className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {viewMode === 'detail' && !selectedMemberData && (
        <div className="text-center py-8 text-gray-500">
          Select a team member to view their details
        </div>
      )}
    </div>
  );
}

export default _TeamDirectory;
