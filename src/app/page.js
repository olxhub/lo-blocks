// src/app/page.js
'use client';

import { useState } from 'react';
import Link from 'next/link';
import Spinner from '@/components/common/Spinner';
import { DisplayError } from '@/lib/util/debug';
import { useContentLoader } from '@/lib/content/useContentLoader';

const ENDPOINT_LINKS = [
  {
    href: '/api/content/root',
    label: '/api/content/root',
    type: 'JSON',
    description: 'Launchable content entries (GET)',
  },
  {
    href: '/api/content/all',
    label: '/api/content/all',
    type: 'JSON',
    description: 'Complete content map (GET)',
  },
  {
    key: 'contentId',
    hrefTemplate: id => `/api/content/${id}`,
    label: '/api/content/',
    placeholder: 'id',
    type: 'JSON',
    description: 'Content lookup for a specific ID (GET)',
  },
  {
    href: '/api/files',
    label: '/api/files',
    type: 'JSON',
    description: 'File tree for the content directory (GET)',
  },
  {
    key: 'filePath',
    hrefTemplate: path => `/api/file?path=${encodeURIComponent(path)}`,
    label: '/api/file?path=',
    placeholder: 'path/to/file',
    type: 'JSON',
    description: 'Read an allowed file via a path query (GET)',
  },
  {
    href: '/api/admin/shutdown',
    label: '/api/admin/shutdown',
    type: 'JSON',
    description: 'Development-only shutdown endpoint (GET)',
  },
  {
    href: '/docs',
    label: '/docs',
    type: 'HTML',
    description: 'Block documentation index',
  },
];

// TODO: This should not be hardcoded.
function categorizeActivities(entries) {
  const categories = {
    demo: { title: 'Demos', icon: '🎯', color: 'blue', items: [] },
    writing: { title: 'Writing', icon: '✍️', color: 'amber', items: [] },
    psychology: { title: 'Psychology', icon: '🧠', color: 'purple', items: [] },
    interdisciplinary: { title: 'Interdisciplinary', icon: '🔗', color: 'green', items: [] },
    other: { title: 'Other', icon: '📚', color: 'gray', items: [] }
  };

  entries.forEach(entry => {
    // Use metadata category if available, otherwise fall back to ID-based categorization
    const category = entry.category?.toLowerCase();

    if (category && categories[category]) {
      categories[category].items.push(entry);
    } else {
      // Fallback: ID-based categorization for uncategorized items
      const id = entry.id.toLowerCase();
      if (id.includes('demo')) {
        categories.demo.items.push(entry);
      } else if (id.includes('psych')) {
        categories.psychology.items.push(entry);
      } else if (id.includes('interdisciplinary')) {
        categories.interdisciplinary.items.push(entry);
      } else {
        categories.other.items.push(entry);
      }
    }
  });

  return Object.values(categories).filter(cat => cat.items.length > 0);
}

function ActivityRow({ entry }) {
  const title = entry.attributes.title || entry.id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const description = entry.description || entry.attributes.description;  // Prefer metadata description
  const type = entry.tag || 'Activity';
  // editPath is computed server-side from provenance (see /api/content/[id])
  const editPath = entry.editPath || entry.id;

  return (
    <div className="group py-4 border-b border-gray-200/50 hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-transparent transition-all">
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <Link
            href={`/preview/${entry.id}`}
            className="text-lg font-medium text-gray-900 hover:text-blue-600 transition-colors inline-block"
          >
            {title}
          </Link>
          {description && (
            <p className="text-sm text-gray-600 mt-1 leading-relaxed">{description}</p>
          )}
        </div>
        <div className="flex items-center gap-5 text-sm shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
          <span className="text-xs text-gray-400 font-mono">
            {type}
          </span>
          {editPath ? (
            <Link
              href={`/studio?file=${encodeURIComponent(editPath)}`}
              className="text-gray-500 hover:text-gray-900 transition-colors"
            >
              Edit
            </Link>
          ) : (
            <span
              className="text-gray-300 cursor-not-allowed"
              title={entry.editError || 'Editing not available'}
            >
              Edit
            </span>
          )}
          <Link
            href={`/graph/${entry.id}`}
            className="text-gray-400 hover:text-gray-700 transition-colors"
          >
            Graph
          </Link>
          <Link
            href={`/api/content/${entry.id}`}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            target="_blank"
          >
            API
          </Link>
        </div>
      </div>
    </div>
  );
}

function Activities() {
  const { idMap, error, loading } = useContentLoader('root');

  const entries = idMap ? Object.keys(idMap).map(key => ({
    id: key,
    ...idMap[key]
  })) : [];

  if (loading) {
    return <Spinner>Loading activities...</Spinner>;
  }

  if (error) {
    return (
      <DisplayError
        props={{ id: 'lessons', tag: 'home' }}
        name="Failed to Load Activities"
        message="Could not retrieve available activities"
        technical={error}
        id="lessons_load_error"
      />
    );
  }

  const categories = categorizeActivities(entries);

  return (
    <div className="space-y-8">
      {categories.map(category => (
        <section key={category.title}>
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-700 mb-3 pb-2 border-b-2 border-gray-200">
            <span className="text-xl">{category.icon}</span>
            {category.title}
          </h2>
          <div className="bg-white rounded-lg">
            {category.items.map(entry => (
              <ActivityRow key={entry.id} entry={entry} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Sidebar() {
  const [showEndpoints, setShowEndpoints] = useState(false);
  const [params, setParams] = useState({});

  return (
    <aside className="w-64 bg-gray-50 border-r border-gray-200 p-6 flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900 mb-4">Learning Observer</h1>
        <nav className="space-y-2">
          <Link
            href="/docs"
            className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded transition-colors"
          >
            📖 Documentation
          </Link>
          <a
            href="https://github.com/ETS-Next-Gen/lo-blocks"
            target="_blank"
            rel="noopener noreferrer"
            className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded transition-colors"
          >
            🔗 GitHub
          </a>
          <a
            href="https://learning-observer.org"
            target="_blank"
            rel="noopener noreferrer"
            className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded transition-colors"
          >
            🌐 Learning Observer
          </a>
        </nav>
      </div>

      <div>
        <button
          onClick={() => setShowEndpoints(!showEndpoints)}
          className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded transition-colors"
        >
          <span>Developer Tools</span>
          <span className="text-gray-400">{showEndpoints ? '▼' : '▶'}</span>
        </button>

        {showEndpoints && (
          <div className="mt-2 pl-3 space-y-3 text-xs">
            {ENDPOINT_LINKS.map(endpoint => (
              <div key={endpoint.key || endpoint.label}>
                {endpoint.hrefTemplate ? (
                  <div className="space-y-1">
                    <code className="text-gray-600">{endpoint.label}</code>
                    <div className="flex gap-1">
                      <input
                        type="text"
                        placeholder={endpoint.placeholder}
                        value={params[endpoint.key] || ''}
                        onChange={e => setParams({ ...params, [endpoint.key]: e.target.value })}
                        className="flex-1 text-xs border border-gray-300 px-2 py-1 rounded"
                      />
                      <a
                        href={params[endpoint.key] ? endpoint.hrefTemplate(params[endpoint.key]) : '#'}
                        className={`px-2 py-1 text-xs rounded ${params[endpoint.key] ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-200 text-gray-400'}`}
                        target="_blank"
                        onClick={e => !params[endpoint.key] && e.preventDefault()}
                      >
                        Go
                      </a>
                    </div>
                  </div>
                ) : (
                  <Link
                    href={endpoint.href}
                    className="block text-blue-600 hover:underline"
                    target="_blank"
                  >
                    {endpoint.label}
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

export default function Home() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto bg-gray-50/30">
        <div className="max-w-4xl mx-auto p-8">
          <header className="mb-8">
            <h1 className="text-3xl font-semibold text-gray-900">Activities</h1>
            <p className="text-gray-600 mt-2">Choose an activity to begin</p>
          </header>
          <Activities />
        </div>
      </main>
    </div>
  );
}
