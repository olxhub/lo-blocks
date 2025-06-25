'use client';

import Split from "react-split";


export function FourPaneLayout({
  TopLeft,
  BottomLeft,
  TopRight,
  BottomRight,
}) {
  return (
    <div className="h-full w-full">
      {/* Vertical split: Left and Right */}
      <Split
        className="flex h-full"
        sizes={[25, 75]}
        minSize={200}
        gutterSize={6}
        direction="horizontal"
        style={{ display: "flex" }}
      >
        <Split
          className="flex flex-col h-full"
          sizes={[60, 40]}
          minSize={100}
          gutterSize={6}
          direction="vertical"
        >
          <div className="p-2 overflow-auto border-b border-gray-200">
            {TopLeft}
          </div>
          <div className="p-2 overflow-auto h-full flex flex-col">
            {BottomLeft}
          </div>
        </Split>
        <Split
          className="flex flex-col h-full"
          sizes={[50, 50]}
          minSize={100}
          gutterSize={6}
          direction="vertical"
        >
          <div className="p-2 overflow-auto border-b border-gray-200 h-full flex flex-col">
            {TopRight}
          </div>
          <div className="p-2 overflow-auto">{BottomRight || <div>BottomRight</div>}</div>
        </Split>
      </Split>
    </div>
  );
}
