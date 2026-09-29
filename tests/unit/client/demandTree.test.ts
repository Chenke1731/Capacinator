/**
 * flattenTrees contract (P5+P6): the virtualized board's correctness
 * lives in this projection — tree/collapse semantics are pinned here
 * because the e2e world never grows past a handful of rows and never
 * exercises deep virtual scrolling.
 *
 * Mirror of the pre-virtualization rendering contract:
 *   - a standalone item renders exactly one 'plain' row
 *   - an SR with children renders its 'sr' head row
 *   - children render as 'child' rows ONLY while expanded
 *   - a collapsed SR contributes no child rows
 *   - the sr row carries agg + children for the summary cells
 */
import { flattenTrees } from '../../../client/src/lib/demandTree';

const p = (id: string, parent?: string) => ({ id, name: id, parent_id: parent ?? null });

describe('flattenTrees', () => {
  it('renders a childless item as a single plain row', () => {
    const out = flattenTrees([{ project: p('a'), children: [], agg: null }], new Set());
    expect(out).toEqual([{ project: p('a'), kind: 'plain' }]);
  });

  it('renders an expanded SR as head row followed by its children', () => {
    const out = flattenTrees(
      [{ project: p('sr'), children: [p('c1', 'sr'), p('c2', 'sr')], agg: { kloc: 1 } }],
      new Set()
    );
    expect(out.map((r) => [r.kind, r.project.id])).toEqual([
      ['sr', 'sr'],
      ['child', 'c1'],
      ['child', 'c2'],
    ]);
    expect(out[0].agg).toEqual({ kloc: 1 });
    expect(out[0].children).toHaveLength(2);
  });

  it('a collapsed SR contributes only its head row', () => {
    const out = flattenTrees(
      [{ project: p('sr'), children: [p('c1', 'sr')], agg: null }],
      new Set(['sr'])
    );
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('sr');
  });

  it('keeps sibling subtrees independent — collapsing one leaves the other intact', () => {
    const out = flattenTrees(
      [
        { project: p('sr1'), children: [p('a', 'sr1')], agg: null },
        { project: p('plain'), children: [], agg: null },
        { project: p('sr2'), children: [p('b', 'sr2')], agg: null },
      ],
      new Set(['sr1'])
    );
    expect(out.map((r) => r.project.id)).toEqual(['sr1', 'plain', 'sr2', 'b']);
  });
});
