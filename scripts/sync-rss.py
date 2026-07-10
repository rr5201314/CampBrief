#!/usr/bin/env python3
"""
CampBrief RSS 同步脚本
从橘鸦AI早报 RSS 获取数据，生成 CampBrief 需要的 JSON 格式
"""

import json
import xml.etree.ElementTree as ET
from datetime import datetime
from urllib.request import urlopen, Request
from pathlib import Path
import re

# RSS 源地址
RSS_URL = "https://daily.juya.uk/rss.xml"

# 输出路径（相对于项目根目录）
OUTPUT_FILE = "data/daily-news.json"

def fetch_rss(url):
    """获取 RSS 内容"""
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
    req = Request(url, headers=headers)
    with urlopen(req, timeout=30) as response:
        return response.read().decode('utf-8')

def parse_rss(xml_content):
    """解析 RSS XML"""
    root = ET.fromstring(xml_content)
    
    # 定义命名空间
    namespaces = {
        'content': 'http://purl.org/rss/1.0/modules/content/',
        'dc': 'http://purl.org/dc/elements/1.1/',
    }
    
    items = []
    channel = root.find('channel')
    
    for item in channel.findall('item'):
        title = item.find('title').text if item.find('title') is not None else ''
        link = item.find('link').text if item.find('link') is not None else ''
        description = item.find('description').text if item.find('description') is not None else ''
        pub_date = item.find('pubDate').text if item.find('pubDate') is not None else ''
        
        # 提取封面图
        image = ''
        if item.find('enclosure') is not None:
            image = item.find('enclosure').get('url', '')
        
        # 解析日期
        try:
            # RSS 日期格式: Thu, 10 Jul 2026 01:17:05 GMT
            dt = datetime.strptime(pub_date[:25], '%a, %d %b %Y %H:%M:%S')
            formatted_date = dt.strftime('%Y-%m-%d')
            iso_date = dt.strftime('%Y-%m-%dT%H:%M:%S+08:00')
        except:
            formatted_date = pub_date[:10]
            iso_date = pub_date
        
        # 清理描述（提取摘要）
        summary = description[:200] if description else ''
        if len(description) > 200:
            summary += '...'
        
        items.append({
            'title': title,
            'url': link,
            'date': formatted_date,
            'published': iso_date,
            'summary': summary,
            'image': image,
            'category': 'ai',  # 橘鸦早报都是 AI 资讯
            'source': '橘鸦AI早报'
        })
    
    return items

def save_json(items, output_path):
    """保存为 JSON 文件"""
    # 确保目录存在
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    
    # 构建数据结构
    data = {
        'last_updated': datetime.now().strftime('%Y-%m-%dT%H:%M:%S+08:00'),
        'source': '橘鸦AI早报',
        'total': len(items),
        'items': items
    }
    
    # 写入文件
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"✅ 已保存 {len(items)} 条资讯到 {output_path}")

def main():
    print("🔄 正在获取橘鸦AI早报...")
    xml_content = fetch_rss(RSS_URL)
    
    print("📰 正在解析 RSS...")
    items = parse_rss(xml_content)
    
    print(f"📊 获取到 {len(items)} 条资讯")
    save_json(items, OUTPUT_FILE)
    
    # 打印最新3条
    print("\n📋 最新资讯预览：")
    for item in items[:3]:
        print(f"  [{item['date']}] {item['title']}")

if __name__ == '__main__':
    main()
