export type VersionAncestry = {
  id: string;
  sourceVersionId?: string | null;
};
export function getVersionChain<T extends VersionAncestry>(versions: T[], startId: string): T[] {
  const byId = new Map(versions.map((v) => [v.id, v]));
  const chain: T[] = [];
  let id: string | undefined = startId;
  const seen = new Set<string>();
  while (id && !seen.has(id)) {
    seen.add(id);
    const v = byId.get(id);
    if (!v) break;
    chain.push(v);
    id = v.sourceVersionId ?? undefined;
  }
  return chain;
}
export function getRootVersionFromChain<T extends VersionAncestry>(chain: T[]): T | undefined {
  return chain[chain.length - 1];
}
