#!/usr/bin/env python3
"""
CampBrief RSS 同步脚本
从橘鸦AI早报 RSS 获取数据，生成 CampBrief 需要的 JSON 格式
同时生成内嵌数据的 JS 文件，供前端直接使用（兼容 GitHub Pages）
"""

import json
import xml.etree.ElementTree as ET
from datetime import datetime
from urllib.request import urlopen, Request
from pathlib import Path
import re

# RSS 源地址
RSS_URL = "https://daily.juya.uk/rss.xml"

# 输出路径
JSON_OUTPUT = "data/daily-news.json"
JS_OUTPUT = "assets/js/news-data.js"

def fetch_rss(url):
    """获取 RSS 内容"""
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
    req = Request(url, headers=headers)
    with urlopen(req, timeout=30) as response:
        return response.read().decode('utf-8')

def extract_title_from_description(description):
    """从描述中提取真正的标题"""
    if not description:
        return "AI 早报"
    
    text = ' '.join(description.split('\n'))
    
    patterns = [
        r'要闻\s+(.+?)\s*↗',
        r'模型发布\s+(.+?)\s*↗',
        r'开发生态\s+(.+?)\s*↗',
        r'技术与洞察\s+(.+?)\s*↗',
        r'行业动态\s+(.+?)\s*↗',
        r'前瞻与传闻\s+(.+?)\s*↗',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            title = match.group(1).strip()
            title = re.sub(r'\s*\d+$', '', title)
            return title
    
    match = re.search(r'概览\s+要闻\s+(.+?)\s*↗', text)
    if match:
        return match.group(1).strip()
    
    date_match = re.search(r'AI 早报 (\d{4} \d{2} \d{2})', text)
    if date_match:
        return f"AI 早报 {date_match.group(1)}"
    
    return "AI 早报"

def extract_summary(description):
    """从描述中提取摘要"""
    if not description:
        return ""
    
    text = description
    match = re.search(r'要闻\s+(.+)', text, re.DOTALL)
    if match:
        text = match.group(1)
    
    summary = text[:200].strip()
    if len(text) > 200:
        summary += '...'
    
    return summary

def parse_rss(xml_content):
    """解析 RSS XML"""
    root = ET.fromstring(xml_content)
    
    items = []
    channel = root.find('channel')
    
    for item in channel.findall('item'):
        title = item.find('title').text if item.find('title') is not None else ''
        link = item.find('link').text if item.find('link') is not None else ''
        description = item.find('description').text if item.find('description') is not None else ''
        pub_date = item.find('pubDate').text if item.find('pubDate') is not None else ''
        
        image = ''
        if item.find('enclosure') is not None:
            image = item.find('enclosure').get('url', '')
        
        try:
            dt = datetime.strptime(pub_date[:25], '%a, %d %b %Y %H:%M:%S')
            formatted_date = dt.strftime('%Y-%m-%d')
            iso_date = dt.strftime('%Y-%m-%dT%H:%M:%S+08:00')
        except:
            formatted_date = pub_date[:10]
            iso_date = pub_date
        
        real_title = extract_title_from_description(description)
        summary = extract_summary(description)
        
        items.append({
            'title': real_title,
            'date_title': title,
            'url': link,
            'date': formatted_date,
            'published': iso_date,
            'summary': summary,
            'image': image,
            'category': 'ai',
            'source': '橘鸦AI早报'
        })
    
    return items

def save_json(items, output_path):
    """保存为 JSON 文件"""
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    
    data = {
        'last_updated': datetime.now().strftime('%Y-%m-%dT%H:%M:%S+08:00'),
        'source': '橘鸦AI早报',
        'total': len(items),
        'items': items
    }
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"✅ 已保存 JSON 到 {output_path}")

def save_js(items, output_path):
    """生成内嵌数据的 JS 文件（兼容 GitHub Pages）"""
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    
    data = {
        'last_updated': datetime.now().strftime('%Y-%m-%dT%H:%M:%S+08:00'),
        'source': '橘鸦AI早报',
        'total': len(items),
        'items': items
    }
    
    js_content = f"""// CampBrief 每日资讯数据
// 自动生成于 {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
// 请勿手动修改此文件

const NEWS_DATA = {json.dumps(data, ensure_ascii=False, indent=2)};
"""
    
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(js_content)
    
    print(f"✅ 已保存 JS 到 {output_path}")

def main():
    print("🔄 正在获取橘鸦AI早报...")
    xml_content = fetch_rss(RSS_URL)
    
    print("📰 正在解析 RSS...")
    items = parse_rss(xml_content)
    
    print(f"📊 获取到 {len(items)} 条资讯")
    
    # 保存两种格式
    save_json(items, JSON_OUTPUT)
    save_js(items, JS_OUTPUT)
    
    # 打印最新3条
    print("\n📋 最新资讯预览：")
    for item in items[:3]:
        print(f"  [{item['date']}] {item['title']}")

if __name__ == '__main__':
    main()
