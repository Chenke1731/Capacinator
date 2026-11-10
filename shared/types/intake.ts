/**
 * I01 需求收件箱（2026-11-10 设计稿 §3.3）。
 *
 * 来源渠道枚举是前后端单一真相：服务端校验、客户端 Select、i18n
 * 枚举标签都从这里取值，禁止各写一份字面量。
 */

export const INTAKE_SOURCE_CHANNELS = [
  'jdc_sr',
  'internal',
  'ticket',
  'product',
  'email',
  'other',
] as const;

export type IntakeSourceChannel = (typeof INTAKE_SOURCE_CHANNELS)[number];

export type IntakeStatus = 'new' | 'converted' | 'rejected';

/** 收件箱条目（捕获态的原始事实；转换为项目后 status=converted 并回链） */
export interface DemandIntake {
  id: string;
  title: string;
  raw_text: string | null;
  source_channel: IntakeSourceChannel;
  /** SR/AR 号、JDC 链接、工单号；整串匹配 ^(SR|AR)[-_ ]?\d+$ 时归一为大写 */
  source_ref: string | null;
  requester: string | null;
  /** 粘贴解析的 P1–P5 提示，仅用于分流预填，不是项目优先级 */
  priority_hint: number | null;
  expected_start: string | null;
  expected_finish: string | null;
  note: string | null;
  status: IntakeStatus;
  reject_reason: string | null;
  converted_project_id: string | null;
  converted_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** POST /api/intake 单条捕获载荷（批量为 items 数组逐项同构） */
export interface IntakeCaptureInput {
  title: string;
  raw_text?: string | null;
  source_channel: IntakeSourceChannel;
  source_ref?: string | null;
  requester?: string | null;
  priority_hint?: number | null;
  expected_start?: string | null;
  expected_finish?: string | null;
  note?: string | null;
}

/** POST /api/intake/:id/convert 载荷（title 提供且不同则同步改项目名） */
export interface IntakeConvertInput {
  title?: string;
  project_type_id: string;
  project_sub_type_id: string;
  priority?: number;
  owner_id?: string | null;
  expected_start?: string | null;
  expected_finish?: string | null;
}

/** 转换结果：baseline='unset' 时 phase_count 恒为 0 */
export interface IntakeConvertResult {
  project: Record<string, unknown>;
  intake: DemandIntake;
  baseline: 'set' | 'unset';
  baseline_reason: 'no_expected_start' | 'no_template' | null;
  phase_count: number;
  external_number_linked: string | null;
  baseline_warnings: string[];
}
