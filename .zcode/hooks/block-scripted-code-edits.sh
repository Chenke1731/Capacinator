#!/usr/bin/env bash
# PreToolUse(Bash) 拦截器: 禁止用 python/perl/sed 就地改 TS/TSX/JSX 源码。
#
# 为什么是 hook 而不是记忆/CLAUDE.md: 该禁令在 CLAUDE.md:276 常驻上下文,
# 2026-10-11 会话仍在执行中被违反(规则在上下文里也竞争不过行动惯性)。
# 只有在工具调用的物理路径上拦截(exit 2 = deny)才是可靠的。
# 读类分析(python 处理 png/json/探针)不受影响——仅当命令同时含
# 解释器/就地编辑标志 与 .ts/.tsx/.jsx 后缀时拦截。
input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)
[ -z "$cmd" ] && exit 0

if printf '%s' "$cmd" | grep -qE '\.(tsx?|jsx)\b' && printf '%s' "$cmd" | grep -qE '(python3?|perl|ruby) |sed -i|sed .*-i'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "禁止用脚本解释器就地修改 TS/TSX/JSX(三次炸 JSX 的教训+2026-10-11 再犯)。改用 Edit 工具;若只是读取/分析,改用 grep/node。"
    }
  }'
  exit 0
fi
exit 0
