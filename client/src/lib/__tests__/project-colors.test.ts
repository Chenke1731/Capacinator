import { getContrastingTextColor } from '../project-colors';

// The old brightness threshold chose white on emerald (2.54:1). Compare actual
// contrast, including custom colors, rather than copying the production formula.
describe('project label foreground', () => {
  it.each([
    ['#10b981', '#000000'], ['#f59e0b', '#000000'], ['#06b6d4', '#000000'],
    ['#ffffff', '#000000'], ['#fff', '#000000'], ['#111827', '#ffffff'],
    ['#6b7280', '#ffffff'], ['#4f46e5', '#ffffff'], ['#000', '#ffffff']
  ])('chooses readable text for %s', (background, expected) => {
    expect(getContrastingTextColor(background)).toBe(expected);
  });
});
