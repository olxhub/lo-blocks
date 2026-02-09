// src/app/page.js
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Spinner from '@/components/common/Spinner';
import { DisplayError } from '@/lib/util/debug';
import LanguageSwitcher from '@/components/common/LanguageSwitcher';
import { useLocaleAttributes } from '@/lib/i18n/useLocaleAttributes';
import { extractLocalizedVariant } from '@/lib/i18n/getBestVariant';
import { localeFromVariant } from '@/lib/i18n/localeUtils';
import type { ContentVariant, Locale } from '@/lib/types';

const ENDPOINT_LINKS = [
  {
    href: '/api/activities',
    label: '/api/activities',
    type: 'JSON',
    description: 'Activity cards for browsing and launching (GET)',
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
  const categories: Record<string, { title: string; icon: string; color: string; items: any[] }> = {
    demo: { title: 'Demos', icon: '🎯', color: 'blue', items: [] },
    writing: { title: 'Writing', icon: '✍️', color: 'amber', items: [] },
    psychology: { title: 'Psychology', icon: '🧠', color: 'purple', items: [] },
    interdisciplinary: { title: 'Interdisciplinary', icon: '🔗', color: 'green', items: [] },
    other: { title: 'Other', icon: '📚', color: 'gray', items: [] }
  };

  entries.forEach(entry => {
    const category = entry.category?.toLowerCase() || 'other';
    if (categories[category]) {
      categories[category].items.push(entry);
    } else {
      categories.other.items.push(entry);
    }
  });

  return Object.values(categories).filter(cat => cat.items.length > 0);
}

function ActivityRow({ entry, userLocale }: { entry: any; userLocale: string }) {
  // Pick best title from available locales with BCP 47 fallback
  const title: string = extractLocalizedVariant(entry.title, userLocale) || entry.id;

  // Pick best description from available locales with BCP 47 fallback
  const description: string = extractLocalizedVariant(entry.description, userLocale) || '';

  const type = entry.tag || 'Activity';
  const editPath = entry.editPath;

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
            <span className="text-gray-300 cursor-not-allowed">Edit</span>
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
  const [activities, setActivities] = useState(null); // TODO: useFieldState
  const [error, setError] = useState(null); // TODO: useFieldState
  const [loading, setLoading] = useState(true); // TODO: useFieldState

  // Get user's locale from Redux
  const localeAttrs = useLocaleAttributes();
  const userLocale = localeAttrs.lang;

  useEffect(() => {
    // Activities list is locale-independent, fetch once on mount
    setLoading(true);
    setError(null);
    globalThis.fetch('/api/activities')
      .then(res => res.json())
      .then(data => {
        if (!data.ok) {
          setError(data.error);
        } else {
          setActivities(data.activities);
        }
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const entries = activities ? Object.values(activities) : [];

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
              <ActivityRow key={entry.id} entry={entry} userLocale={userLocale} />
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
  const [availableLocales, setAvailableLocales] = useState<Locale[]>([]);
  const localeAttrs = useLocaleAttributes();
  const userLocale = localeAttrs.lang;

  // Extract available locales when activities load
  useEffect(() => {
    if (!userLocale) return;

    globalThis.fetch('/api/activities', {
      headers: {
        'Accept-Language': userLocale,
      },
    })
      .then(res => res.json())
      .then(data => {
        if (data.activities) {
          // Extract available locales from activity titles/descriptions
          // Variants come from idMap keys; extract just the language part (no feature flags)
          const localeSet = new Set<Locale>();
          for (const activity of Object.values(data.activities) as Record<string, any>[]) {
            if (activity.title && typeof activity.title === 'object') {
              Object.keys(activity.title).forEach(variant => {
                localeSet.add(localeFromVariant(variant as ContentVariant));
              });
            }
            if (activity.description && typeof activity.description === 'object') {
              Object.keys(activity.description).forEach(variant => {
                localeSet.add(localeFromVariant(variant as ContentVariant));
              });
            }
          }
          setAvailableLocales(Array.from(localeSet).sort());
        }
      })
      .catch(() => {
        // Silently fail - Activities component will handle the fetch
      });
  }, [userLocale]);

  return (
    <div {...localeAttrs} className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto bg-gray-50/30 flex flex-col">
        <div className="flex justify-end p-4 border-b border-gray-200">
          <LanguageSwitcher availableLocales={availableLocales} />
        </div>
        <div className="flex-1 overflow-auto">
          <div className="max-w-4xl mx-auto p-8">
            <header className="mb-8">
              <h1 className="text-3xl font-semibold text-gray-900">Activities</h1>
              <p className="text-gray-600 mt-2">Choose an activity to begin</p>
            </header>
            <Activities />
          </div>
        </div>
      </main>
    </div>
  );
}
