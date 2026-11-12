/**
 * 生命周期门类型名——服务端（IntakeConversionService / 创建路径）与客户端
 * （收件箱转换弹窗的迭代字段可见性）同源，禁止各写一份字面量（I02h/D6）。
 */
export const LIFECYCLE_PROJECT_TYPE_NAMES = ['需求交付', '零星事项'] as const;

export function isLifecycleTypeName(name: string | null | undefined): boolean {
  return !!name && (LIFECYCLE_PROJECT_TYPE_NAMES as readonly string[]).includes(name);
}
