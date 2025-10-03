import React from 'react';
export default function _NavigatorDefaultDetail(props) {
  const { id, title, name, subtitle, description, details } = props;
  const displayTitle = title || name || id || 'Untitled';
  return (<div className="p-6"><h2 className="text-xl font-semibold text-gray-900 mb-4">{displayTitle}</h2>{subtitle && <p className="text-lg text-blue-600 font-medium mb-3">{subtitle}</p>}{description && <div className="mb-4"><h3 className="font-medium text-gray-900 mb-2">Description</h3><p className="text-gray-700">{description}</p></div>}{details && typeof details === 'object' && Object.keys(details).length > 0 && <div className="space-y-3">{Object.entries(details).map(([key, value]) => <div key={key}><h4 className="font-medium text-gray-900 capitalize">{key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}</h4>{Array.isArray(value) ? <div className="flex flex-wrap gap-2 mt-1">{value.map((item, index) => <span key={index} className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm">{item}</span>)}</div> : <p className="text-gray-700 mt-1">{value}</p>}</div>)}</div>}</div>);
}
