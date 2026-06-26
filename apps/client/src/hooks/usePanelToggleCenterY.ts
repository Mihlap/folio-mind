import { useLayoutEffect, type RefObject } from 'react';

export const PANEL_TOGGLE_TOP_VAR = '--panel-toggle-top';
export const PANEL_TOGGLE_RIGHT_LEFT_VAR = '--panel-toggle-right-left';
export const PANEL_TOGGLE_LEFT_EDGE_VAR = '--panel-toggle-left-edge';

export function usePanelToggleCenterY(
  workspaceRef: RefObject<HTMLElement | null>,
  rightPanelRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  layoutVersion = 0,
) {
  useLayoutEffect(() => {
    if (!enabled) {
      document.documentElement.style.removeProperty(PANEL_TOGGLE_TOP_VAR);
      document.documentElement.style.removeProperty(PANEL_TOGGLE_RIGHT_LEFT_VAR);
      return;
    }

    const workspace = workspaceRef.current;
    if (!workspace) return;

    const update = () => {
      const ws = workspace.getBoundingClientRect();
      const center = ws.top + ws.height / 2;
      document.documentElement.style.setProperty(PANEL_TOGGLE_TOP_VAR, `${center}px`);

      const rightPanel = rightPanelRef.current;
      if (rightPanel) {
        document.documentElement.style.setProperty(
          PANEL_TOGGLE_RIGHT_LEFT_VAR,
          `${rightPanel.getBoundingClientRect().left}px`,
        );
      }
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(workspace);
    const rightPanel = rightPanelRef.current;
    if (rightPanel) observer.observe(rightPanel);
    window.addEventListener('resize', update);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
      document.documentElement.style.removeProperty(PANEL_TOGGLE_TOP_VAR);
      document.documentElement.style.removeProperty(PANEL_TOGGLE_RIGHT_LEFT_VAR);
    };
  }, [enabled, workspaceRef, rightPanelRef, layoutVersion]);
}

export function usePanelToggleLeftEdge(
  sidebarRef: RefObject<HTMLElement | null>,
  enabled: boolean,
) {
  useLayoutEffect(() => {
    if (!enabled) {
      document.documentElement.style.removeProperty(PANEL_TOGGLE_LEFT_EDGE_VAR);
      return;
    }

    const sidebar = sidebarRef.current;
    if (!sidebar) return;

    const update = () => {
      document.documentElement.style.setProperty(
        PANEL_TOGGLE_LEFT_EDGE_VAR,
        `${sidebar.getBoundingClientRect().right}px`,
      );
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(sidebar);
    window.addEventListener('resize', update);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
      document.documentElement.style.removeProperty(PANEL_TOGGLE_LEFT_EDGE_VAR);
    };
  }, [enabled, sidebarRef]);
}
