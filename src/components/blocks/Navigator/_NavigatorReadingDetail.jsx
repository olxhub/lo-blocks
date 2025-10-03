import React from 'react';
import { render } from '@/lib/render';
import { DisplayError } from '@/lib/util/debug';
export default function _NavigatorReadingDetail(props) {
  const { ref, name, title, subtitle } = props;
  if (!ref) return <DisplayError props={props} name="NavigatorReadingDetail" message="No block reference specified" technical="Use ref attribute" />;
  const displayTitle = title || name || 'Reading';
  return (<div className="reading-detail-pane"><div className="sticky top-0 bg-white border-b p-4 z-10"><h2 className="text-xl font-semibold text-gray-900">{displayTitle}</h2>{subtitle && <p className="text-sm text-gray-600 mt-1">{subtitle}</p>}</div><div className="p-6 prose prose-sm max-w-none">{render({ ...props, node: ref })}</div></div>);
}
