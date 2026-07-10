import { useCallback, useEffect, useRef, useState } from 'react';
import type { DocumentVersionItem } from '../components/documents/DocumentVersionsPanel.js';

export type VersionCreatedNotice = {
  versionId: string;
  versionNumber: number;
  previousVersionId: string | null;
  previousVersionNumber: number | null;
};

export function useVersionCreatedNotice(
  versions: DocumentVersionItem[],
  activeVersionId: string | undefined,
): {
  notice: VersionCreatedNotice | null;
  dismissNotice: () => void;
} {
  const [notice, setNotice] = useState<VersionCreatedNotice | null>(null);
  const initializedRef = useRef(false);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const previousActiveIdRef = useRef<string | undefined>(activeVersionId);

  useEffect(() => {
    if (versions.length === 0) return;

    const currentIds = new Set(versions.map((v) => v.id));

    if (!initializedRef.current) {
      initializedRef.current = true;
      knownIdsRef.current = currentIds;
      previousActiveIdRef.current = activeVersionId;
      return;
    }

    const newVersions = versions.filter((v) => !knownIdsRef.current.has(v.id));
    if (newVersions.length > 0 && activeVersionId) {
      const activated = newVersions.find((v) => v.id === activeVersionId);
      if (activated) {
        const previous =
          versions.find((v) => v.id === previousActiveIdRef.current) ??
          versions
            .filter((v) => knownIdsRef.current.has(v.id) && v.id !== activated.id)
            .sort((a, b) => b.version - a.version)[0];
        setNotice({
          versionId: activated.id,
          versionNumber: activated.version,
          previousVersionId: previous?.id ?? null,
          previousVersionNumber: previous?.version ?? null,
        });
      }
    }

    knownIdsRef.current = currentIds;
    previousActiveIdRef.current = activeVersionId;
  }, [versions, activeVersionId]);

  const dismissNotice = useCallback(() => setNotice(null), []);

  return { notice, dismissNotice };
}
