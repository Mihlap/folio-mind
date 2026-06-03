import { useCallback, useEffect, useRef, useState } from 'react';

type Config = {
  side: 'left' | 'right';
  defaultWidth: number;
  /** Минимальная ширина в развёрнутом режиме. */
  minExpandedWidth: number;
  /** Ниже — автосворачивание в иконки. */
  collapseBelow: number;
  maxWidth: number;
  collapsedWidth?: number;
};

export function useHorizontalPanelResize({
  side,
  defaultWidth,
  minExpandedWidth,
  collapseBelow,
  maxWidth,
  collapsedWidth = 48,
}: Config) {
  const lastExpandedRef = useRef(defaultWidth);
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(defaultWidth);
  const [isResizing, setIsResizing] = useState(false);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      if (prev) {
        setWidth(lastExpandedRef.current);
        return false;
      }
      lastExpandedRef.current = width;
      return true;
    });
  }, [width]);

  const expand = useCallback(() => {
    setWidth(lastExpandedRef.current);
    setCollapsed(false);
  }, []);

  const beginResize = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const onMove = (event: MouseEvent) => {
      const raw = side === 'left' ? event.clientX : window.innerWidth - event.clientX;
      if (raw < collapseBelow) {
        setCollapsed(true);
        return;
      }
      setCollapsed(false);
      const clamped = Math.min(maxWidth, Math.max(minExpandedWidth, raw));
      lastExpandedRef.current = clamped;
      setWidth(clamped);
    };

    const onUp = () => setIsResizing(false);

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);

    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [collapseBelow, isResizing, maxWidth, minExpandedWidth, side]);

  const panelWidth = collapsed ? collapsedWidth : width;

  return {
    panelWidth,
    collapsed,
    isResizing,
    beginResize,
    toggleCollapsed,
    expand,
  };
}
