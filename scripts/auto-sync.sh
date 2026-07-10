#!/bin/bash
# CampBrief RSS 同步定时任务
cd ~/projects/CampBrief
python scripts/sync-rss.py >> ~/projects/CampBrief/logs/sync.log 2>&1

# 自动提交到 Git
git add data/daily-news.json
git commit -m "🤖 自动更新 AI 资讯 $(date +%Y-%m-%d)" || true
git push origin main || true

