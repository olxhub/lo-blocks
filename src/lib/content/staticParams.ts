// src/lib/content/staticParams.ts
//
// Shared generateStaticParams logic for static export builds.
// Only generates pages for launchable activities (not all 2000+ blocks).
//

export async function getStaticContentIds(): Promise<{ id: string }[]> {
  if (process.env.STATIC_EXPORT !== 'true') return [];

  const fs = await import('fs');
  const path = await import('path');
  const activitiesPath = path.join(process.cwd(), 'public', 'static-content', 'activities.json');
  const data = JSON.parse(fs.readFileSync(activitiesPath, 'utf-8'));
  return Object.keys(data.activities).map(id => ({ id }));
}
