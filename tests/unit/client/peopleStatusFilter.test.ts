/**
 * I02f：Dashboard 利用率柱点击的落地路径映射。
 *
 * 三档可映射状态直达 People 筛选；People 页尚未支持的状态
 * （Partially-allocated/Unavailable/NO_DATA）回落全量目录，禁止发假筛选。
 */
import { describe, test, expect } from '@jest/globals';
import {
  peopleStatusPathForUtilization,
  statusParamForUtilization,
} from '../../../client/src/lib/peopleStatusFilter';

describe('peopleStatusPathForUtilization（I02f）', () => {
  test.each([
    ['Over-allocated', '/people?status=over-allocated'],
    ['Fully-allocated', '/people?status=fully-allocated'],
    ['Available', '/people?status=available'],
  ])('%s → %s', (status, expected) => {
    expect(peopleStatusPathForUtilization(status)).toBe(expected);
  });

  test.each([
    ['Partially-allocated'],
    ['Unavailable'],
    ['NO_DATA'],
    [null],
    [undefined],
  ])('不可映射状态 %s 回落 /people', (status) => {
    expect(statusParamForUtilization(status as string | null | undefined)).toBeNull();
    expect(peopleStatusPathForUtilization(status as string | null | undefined)).toBe('/people');
  });
});
