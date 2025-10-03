import React from 'react';
import NextImage from 'next/image';
import { resolveImagePath } from '@/lib/util';

export default function _NavigatorTeamDetail(props) {
  const { name, role, photo, bio, experience, skills } = props;
  if (!name || !role) return <div className="p-6 text-red-500">Missing name or role</div>;
  const skillsArray = Array.isArray(skills) ? skills : (skills ? skills.split(',').map(s => s.trim()) : []);
  return (
    <div className="p-6">
      <div className="flex items-start space-x-4 mb-6">
        <div className="w-16 h-16 bg-gray-300 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
          {photo ? <NextImage src={resolveImagePath(photo)} alt={name} width={64} height={64} className="rounded-full object-cover" /> : <span className="text-gray-600 font-medium">{name.split(' ').map(n => n[0]).join('')}</span>}
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-semibold text-gray-900">{name}</h2>
          <p className="text-lg text-blue-600 font-medium">{role}</p>
          {experience && <p className="text-sm text-gray-600 mt-1">{experience}</p>}
        </div>
      </div>
      {bio && <div className="mb-4"><h3 className="font-medium text-gray-900 mb-2">Background</h3><p className="text-gray-700">{bio}</p></div>}
      {skillsArray.length > 0 && <div><h3 className="font-medium text-gray-900 mb-2">Key Skills</h3><div className="flex flex-wrap gap-2">{skillsArray.map((skill, i) => <span key={i} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">{skill}</span>)}</div></div>}
    </div>
  );
}
