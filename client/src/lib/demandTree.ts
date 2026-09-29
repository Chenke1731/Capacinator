/**
 * Flat-row projection for the virtualized demand board (P5+P6 fix).
 *
 * The board renders an SR→AR tree: a "plain" row is a standalone item,
 * an "sr" row is a collapsible summary header over its AR children, and
 * a "child" row is one of those AR items. Virtualization needs ONE
 * flat list of uniformly-addressable rows, so the tree is flattened
 * with the collapse state deciding which children appear.
 *
 * Kept as a pure function so it can be unit-tested independently of the
 * virtualizer (the e2e world never grows past a handful of rows, so
 * this projection is where tree/collapse correctness is pinned).
 */
export type FlatRowKind = 'plain' | 'sr' | 'child';

export interface FlatRow<P = any, A = any> {
  project: P;
  kind: FlatRowKind;
  /** Only present on 'sr' rows — the children aggregate for summary cells. */
  agg?: A;
  /** Only present on 'sr' rows — the raw children (iter window needs them). */
  children?: P[];
}

export function flattenTrees(
  trees: Array<{ project: any; children: any[]; agg?: any }>,
  collapsed: Set<string>
): FlatRow[] {
  return trees.flatMap((tree) => {
    const isSR = tree.children.length > 0;
    const head: FlatRow = {
      project: tree.project,
      kind: isSR ? 'sr' : 'plain',
      ...(isSR ? { agg: tree.agg, children: tree.children } : {}),
    };
    if (!isSR) return [head];
    if (collapsed.has(tree.project.id)) return [head];
    return [head, ...tree.children.map((c) => ({ project: c, kind: 'child' as const }))];
  });
}
