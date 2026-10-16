# 身份与信任链盘点（IP-08b / S03 / D12 待裁决范围）

日期：2026-10-16。本文是"联网模式统一可信身份"的盘点基线——按 D12 约定，
部署环境与身份来源未裁决前**不自建账户体系**，只列清现状与边界。

## 当前信任链（唯一可信来源 = JWT 载荷）

| 环节 | 现状 | 边界 |
|---|---|---|
| 令牌签发 | 本地登录按人员选择签发 JWT（AuthService，personId → token） | 单人桌面模式适用；令牌本身不证明"人是谁"，只证明"持有该令牌的会话选择了该人员" |
| 令牌校验 | `authService.verifyAccessToken`（JWT_SECRET 签名验证，生产环境强制非默认密钥） | 有效 |
| 权限中间件 | `requirePermission` / `requireSystemAdmin` / `optionalPermission`（middleware/permissions.ts） | **2026-10-16 起 x-user-id 头 / query.userId 自报身份回退已移除**——旧回退允许任何客户端宣称任意 userId，权限检查形同虚设 |
| 审计归属 | enhancedAuditMiddleware 从 `req.user`（JWT 注入）取操作者 | 可信来源随身份链一致 |

## 已知边界与开放项（等 D12 裁决）

1. **本地单人模式**：人员选择即登录是产品有意设计（桌面单用户），适用范围
   =单机使用。当前 JWT_SECRET 生产强制、令牌签名验证已闭环。
2. **联网多人模式**（未部署）：需要 D12 裁决——外部 IdP（OIDC/LDAP）还是
   内建账户密码。裁决前：`requirePermission` 只保护 notifications 与
   user-permissions 两组路由；核心业务路由（projects/people/assignments…）
   依赖网络边界（0.0.0.0 监听是 owner 记录在案的推迟项）而非鉴权。
3. **0.0.0.0 监听**：owner 决定推迟（见记忆 owner-security-deferral），
   功能优先。联网部署前必须 revisit。
4. **令牌生命周期**：access 15m + refresh 机制已实现（AuthService）；
   refresh 轮换/撤销清单未审计，联网化时一并处理。

## 验证入口

- `src/server/middleware/__tests__/permissions.identity.test.ts`：
  x-user-id 拒绝 / query.userId 拒绝 / 有效 JWT 放行 / 过期令牌 401 不回退。
