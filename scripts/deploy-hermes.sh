#!/data/data/com.termux/files/usr/bin/bash
# -*- coding: utf-8 -*-
#
# CampBrief Hermes 自动化部署脚本
# 在手机 termux 里执行：bash scripts/deploy-hermes.sh
#
# 功能：检查环境 → 同步仓库 → 安装 skill → 测试采集 → 给出 cron 设置指引

set -e

# ---------- 配置 ----------
REPO_DEFAULT="$HOME/CampBrief"
HERMES_SKILLS_DIR="$HOME/.hermes/skills"
SKILL_REL="scripts/hermes/skills/CampBrief/campbrief-daily-news"
SKILL_TARGET="$HERMES_SKILLS_DIR/CampBrief/campbrief-daily-news"

# 颜色输出
G="\033[32m"; Y="\033[33m"; R="\033[31m"; B="\033[34m"; N="\033[0m"
ok()   { echo -e "${G}[OK]${N} $1"; }
warn() { echo -e "${Y}[!]${N} $1"; }
err()  { echo -e "${R}[X]${N} $1"; }
info() { echo -e "${B}[i]${N} $1"; }

echo -e "${B}========================================${N}"
echo -e "${B} CampBrief Hermes 自动化部署${N}"
echo -e "${B}========================================${N}"
echo

# ---------- 1. 检查依赖 ----------
info "检查依赖工具..."
command -v python3 >/dev/null 2>&1 && ok "python3: $(python3 --version)" || { err "缺少 python3，请执行 pkg install python"; exit 1; }
command -v git >/dev/null 2>&1 && ok "git: $(git --version)" || { err "缺少 git，请执行 pkg install git"; exit 1; }
echo

# ---------- 2. 定位 / 克隆仓库 ----------
info "定位 CampBrief 仓库..."
REPO="${1:-$REPO_DEFAULT}"
if [ -d "$REPO/.git" ]; then
  ok "已存在仓库: $REPO"
  info "拉取最新代码..."
  git -C "$REPO" pull --ff-only && ok "已更新" || warn "pull 失败（可能网络问题），继续使用本地版本"
else
  warn "未在 $REPO 找到仓库"
  read -rp "请输入 CampBrief 的 GitHub 仓库地址（HTTPS）: " GIT_URL
  if [ -z "$GIT_URL" ]; then err "未提供仓库地址，退出"; exit 1; fi
  info "克隆到 $REPO ..."
  git clone "$GIT_URL" "$REPO" && ok "克隆完成" || { err "克隆失败"; exit 1; }
fi
echo

# 验证关键文件存在
if [ ! -f "$REPO/scripts/collect-daily-news.py" ]; then
  err "未找到 scripts/collect-daily-news.py，请确认仓库内容完整"
  exit 1
fi
ok "采集脚本就位"

# ---------- 3. 安装 skill 到 Hermes ----------
echo
info "安装 Hermes skill..."
mkdir -p "$HERMES_SKILLS_DIR/CampBrief"

# 优先用软链接：仓库更新后 skill 自动同步
if [ -L "$SKILL_TARGET" ] || [ -d "$SKILL_TARGET" ]; then
  rm -rf "$SKILL_TARGET"
fi
ln -s "$REPO/$SKILL_REL" "$SKILL_TARGET" 2>/dev/null && ok "已软链接 skill -> $SKILL_TARGET" || {
  warn "软链接失败，改用复制"
  cp -r "$REPO/$SKILL_REL" "$SKILL_TARGET" && ok "已复制 skill -> $SKILL_TARGET" || { err "skill 安装失败"; exit 1; }
}

# 写入 repo_path 配置（若 Hermes 配置文件存在）
CONFIG_FILE="$HOME/.hermes/config.yaml"
if [ -f "$CONFIG_FILE" ]; then
  if ! grep -q "campbrief.repo_path" "$CONFIG_FILE" 2>/dev/null; then
    info "写入 campbrief.repo_path 配置..."
    {
      echo ""
      echo "skills:"
      echo "  config:"
      echo "    campbrief.repo_path: \"$REPO\""
    } >> "$CONFIG_FILE"
    ok "已写入 config: campbrief.repo_path = $REPO"
  else
    ok "config 中已存在 campbrief.repo_path"
  fi
else
  warn "未找到 $CONFIG_FILE，skill 将使用默认路径 ~/CampBrief"
  warn "若你的仓库不在 ~/CampBrief，请在 Hermes 里手动设置 campbrief.repo_path"
fi
echo

# ---------- 4. 测试采集 ----------
info "测试采集脚本（首次可能较慢）..."
if python3 "$REPO/scripts/collect-daily-news.py"; then
  echo
  if [ -f "$REPO/data/daily-news-raw.json" ]; then
    TOTAL=$(python3 -c "import json;print(json.load(open('$REPO/data/daily-news-raw.json'))['total'])" 2>/dev/null || echo "?")
    ok "采集成功，候选 $TOTAL 条 -> data/daily-news-raw.json"
  else
    warn "采集脚本执行完但未生成 raw.json，请检查输出"
  fi
else
  err "采集脚本执行失败，请检查上方报错"
  exit 1
fi
echo

# ---------- 5. git 推送凭据提示 ----------
info "检查 git 推送凭据..."
cd "$REPO"
REMOTE_URL=$(git config --get remote.origin.url 2>/dev/null || echo "")
if echo "$REMOTE_URL" | grep -q "^https"; then
  warn "远程地址是 HTTPS: $REMOTE_URL"
  warn "自动 push 需要凭据。建议在 termux 配置 git credential 或改用 SSH 地址："
  echo "    git remote set-url origin git@github.com:<user>/CampBrief.git"
  echo "  （需先在 termux 生成 SSH key 并添加到 GitHub）"
elif echo "$REMOTE_URL" | grep -q "git@github.com"; then
  ok "远程地址是 SSH，推送时应可免密"
else
  warn "未检测到远程仓库地址，请确认 git remote 已配置"
fi
echo

# ---------- 6. cron 设置指引 ----------
echo -e "${G}========================================${N}"
echo -e "${G} 部署完成！下一步：设置定时任务${N}"
echo -e "${G}========================================${N}"
echo
echo "在 Hermes 对话里直接说（任选一种频率）："
echo
echo -e "  ${Y}「每天早上 8 点执行 campbrief-daily-news skill」${N}"
echo -e "  ${Y}「每天 8 点和 20 点各跑一次 campbrief-daily-news」${N}"
echo
echo "Hermes 会自动创建 cron 任务。首次可手动触发一次验证完整流程："
echo -e "  ${Y}「现在执行一次 campbrief-daily-news」${N}"
echo
echo "仓库路径: $REPO"
echo "Skill 位置: $SKILL_TARGET"
echo
echo "想新增 RSS 源，编辑: $REPO/scripts/collect-daily-news.py 顶部 SOURCES 列表"
