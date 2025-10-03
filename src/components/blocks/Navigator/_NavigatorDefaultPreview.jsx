import React from 'react';
export default function _NavigatorDefaultPreview(props) {
  const { id, title, name, subtitle, description } = props;
  const displayTitle = title || name || id || 'Untitled';
  return (<div className="p-3 border-b cursor-pointer transition-all hover:bg-gray-50"><div className="font-medium text-gray-900">{displayTitle}</div>{subtitle && <div className="text-sm text-gray-600">{subtitle}</div>}{description && <div className="text-sm text-gray-500 mt-1 line-clamp-2">{description}</div>}</div>);
}
