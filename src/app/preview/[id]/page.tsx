// src/app/preview/[id]/page.tsx
//
// Server component wrapper. Exports generateStaticParams for static builds
// and renders the client-side PreviewPage component.
//
import PreviewPage from './_PreviewPage';
import { getStaticContentIds } from '@/lib/content/staticParams';

export const generateStaticParams = getStaticContentIds;

export default function Page() {
  return <PreviewPage />;
}
