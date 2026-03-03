// src/app/preview/[id]/page.tsx
//
// Server component wrapper. Renders the client-side PreviewPage component.
//
import PreviewPage from './PreviewPage';
import { getStaticContentIds } from '@/lib/content/staticParams';

export const generateStaticParams = getStaticContentIds;

export default function Page() {
  return <PreviewPage />;
}
