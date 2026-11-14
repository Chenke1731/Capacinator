---
name: security
description: Capacinator 安全与供应链检查。提交前查 secret、依赖漏洞、签名与加密密钥轮换；发现泄漏时先撤销再清理，不把 baseline 改绿当修复。
---

# /security 调度

规则正本：`CLAUDE.md`、`docs/plans/2026-11-14-tooling-efficiency-plan.md` §P0-1；本 skill 只做调度。

## 命令

```bash
npm run security:secrets -- --staged   # pre-commit 同款；无 staged 时跑全史
npm run security:deps                  # OSV vs security/osv-baseline.json（只拦新增 critical/high）
npm run security:signatures            # npm audit signatures + 例外文件
npm run security:audit                 # 三项一起
node scripts/rotate-encryption-key.mjs --check [--db <path>]
```

## 泄漏处置（顺序不可反）

1. **先撤销/轮换**真实凭证（Jenkins/GitHub/JWT/ENCRYPTION_KEY），再谈历史清理。
2. 从 HEAD 删除明文；历史重写单独立项（需用户批准）。
3. 已撤销/删除的历史 finding 用 `.gitleaksignore` 的 fingerprint 记录，不把 secret 写进配置。
4. 新依赖先查 license/精确版本/provenance；hooks 禁止 `npx -y` 拉最新。

## ENCRYPTION_KEY

- 它加密 `github_connections` 的 token，不是登录密钥。
- `--check` 为 0 行才可直接 `--rotate`；>0 行先 `--re-encrypt` 或暂缓。
- 开发库已实测 0 行；生产在部署机跑同一 `--check`，不得自动生成生产 key。
