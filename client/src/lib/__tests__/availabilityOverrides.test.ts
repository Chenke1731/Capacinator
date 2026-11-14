/**
 * F3：approved-only 覆盖窗口读取原语（DeepSeek P2 #3）。
 * 服务端查询参数正确（person + approved + 窗口）；映射逐字段归一；
 * 未批准/畸形行被显式过滤（服务端已过滤，客户端再门一次防信封漂移）。
 */
import { fetchApprovedAvailabilityOverrides } from '../availabilityOverrides';
import { api } from '../api-client';

jest.mock('../api-client', () => ({
  api: {
    availability: { list: jest.fn() },
  },
}));

describe('fetchApprovedAvailabilityOverrides', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('按 person+approved+窗口 查询并映射为 workloadTimeline override 输入', async () => {
    (api.availability.list as jest.Mock).mockResolvedValue({
      data: {
        data: [
          {
            id: 'ov1',
            person_id: 'p1',
            start_date: '2026-12-01',
            end_date: '2026-12-07',
            availability_percentage: 0,
            is_approved: 1,
          },
          {
            id: 'ov2',
            person_id: 'p1',
            start_date: '2027-01-10',
            end_date: '2027-01-20',
            availability_percentage: 50,
            is_approved: true,
          },
        ],
      },
    });

    const result = await fetchApprovedAvailabilityOverrides('p1', '2026-11-14', '2027-11-14');

    expect(api.availability.list).toHaveBeenCalledWith(
      expect.objectContaining({
        person_id: 'p1',
        is_approved: true,
        start_date: '2026-11-14',
        end_date: '2027-11-14',
      })
    );
    expect(result).toEqual([
      { start: '2026-12-01', end: '2026-12-07', percentage: 0, isApproved: true },
      { start: '2027-01-10', end: '2027-01-20', percentage: 50, isApproved: true },
    ]);
  });

  test('未批准/畸形/倒置窗口行被过滤（不进入容量线）', async () => {
    (api.availability.list as jest.Mock).mockResolvedValue({
      data: {
        data: [
          { start_date: '2026-12-01', end_date: '2026-12-07', availability_percentage: 30, is_approved: 0 },
          { start_date: null, end_date: '2026-12-07', availability_percentage: 30, is_approved: 1 },
          { start_date: '2026-12-10', end_date: '2026-12-01', availability_percentage: 30, is_approved: 1 },
          { start_date: '2026-12-01', end_date: '2026-12-07', availability_percentage: Number.NaN, is_approved: 1 },
        ],
      },
    });

    const result = await fetchApprovedAvailabilityOverrides('p1', '2026-11-14', '2027-11-14');
    expect(result).toEqual([]);
  });
});
