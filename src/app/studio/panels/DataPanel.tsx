// src/components/studio/panels/DataPanel.tsx
'use client';

export function DataPanel() {
  return (
    <div className="sidebar-panel">
      <div className="sidebar-panel-header">Data</div>
      <div className="data-placeholder">
        Item statistics and psychometrics.
        <br /><br />
        <strong>Avg time:</strong> 45s<br />
        <strong>% correct:</strong> 72%<br />
        <strong>Discrimination:</strong> 0.45
      </div>
    </div>
  );
}
