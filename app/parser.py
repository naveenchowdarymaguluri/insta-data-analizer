import os
import json
import re
from datetime import datetime
import pandas as pd

def unflatten_dict(d):
    """
    Unflattens a flat dictionary from Excel (with keys like 'latestPosts/0/likesCount')
    into a nested dictionary/list structure matching the JSON format.
    """
    result = {}
    for key, val in d.items():
        # Handle NaN values from pandas
        if pd.isna(val) or val == '':
            continue
        
        parts = key.split('/')
        curr = result
        for i, part in enumerate(parts):
            # If the part is digits, treat it as a list index
            if part.isdigit():
                part = int(part)
            
            next_part = parts[i+1] if i + 1 < len(parts) else None
            is_next_list = next_part is not None and next_part.isdigit()
            
            if isinstance(curr, list):
                while len(curr) <= part:
                    curr.append(None)
                if next_part is None:
                    curr[part] = val
                else:
                    if curr[part] is None:
                        curr[part] = [] if is_next_list else {}
                    curr = curr[part]
            else:
                if next_part is None:
                    curr[part] = val
                else:
                    if part not in curr or curr[part] is None:
                        curr[part] = [] if is_next_list else {}
                    curr = curr[part]
    
    # Clean up lists recursively (remove None elements)
    def clean(obj):
        if isinstance(obj, list):
            return [clean(x) for x in obj if x is not None]
        elif isinstance(obj, dict):
            return {k: clean(v) for k, v in obj.items() if v is not None}
        return obj
    
    return clean(result)

def extract_hashtags(caption):
    if not caption or not isinstance(caption, str):
        return []
    return re.findall(r'#(\w+)', caption.lower())

def parse_file(file_path):
    """
    Parses an Instagram scraper file (JSON or Excel) and returns a list of profiles.
    """
    _, ext = os.path.splitext(file_path.lower())
    
    if ext == '.json':
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            # Ensure it is a list of profiles
            if isinstance(data, dict):
                data = [data]
            return data
            
    elif ext in ['.xlsx', '.xls']:
        df = pd.read_excel(file_path)
        profiles = []
        for _, row in df.iterrows():
            row_dict = row.to_dict()
            unflattened = unflatten_dict(row_dict)
            profiles.append(unflattened)
        return profiles
    else:
        raise ValueError("Unsupported file format. Please upload .json or .xlsx")

def run_analytics(profiles):
    """
    Computes comprehensive data analytics for a list of Instagram profiles.
    """
    if not profiles:
        return {}
    
    # 1. Profile Summary & Metric Accumulators
    total_followers = 0
    total_posts_all_time = 0
    total_scraped_posts = 0
    
    creators_list = []
    all_posts = []
    hashtag_counts = {}
    
    # Time distributions
    post_hours = {i: 0 for i in range(24)}
    post_days = {i: 0 for i in range(7)} # 0 = Monday, 6 = Sunday
    day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    
    for profile in profiles:
        username = profile.get("username", "unknown")
        followers = int(profile.get("followersCount", 0))
        posts_count = int(profile.get("postsCount", 0))
        
        total_followers += followers
        total_posts_all_time += posts_count
        
        # Scraped posts for this creator
        latest_posts = profile.get("latestPosts", [])
        creator_posts_count = len(latest_posts)
        total_scraped_posts += creator_posts_count
        
        # Creator engagement calculations
        creator_likes = 0
        creator_comments = 0
        
        for post in latest_posts:
            likes = int(post.get("likesCount", 0))
            comments = int(post.get("commentsCount", 0))
            creator_likes += likes
            creator_comments += comments
            
            # Post engagement rate
            er = ((likes + comments) / followers * 100) if followers > 0 else 0
            
            # Extract hashtags
            caption = post.get("caption", "")
            hashtags = extract_hashtags(caption)
            for ht in hashtags:
                hashtag_counts[ht] = hashtag_counts.get(ht, 0) + 1
            
            # Parse timestamp for timeline analytics
            ts_str = post.get("timestamp")
            dt_obj = None
            date_str = None
            hour = None
            day_of_week = None
            
            if ts_str:
                try:
                    # Typical format: 2026-07-19T11:49:56.000Z
                    # Stripping fractional seconds if needed or using general parser
                    clean_ts = ts_str.split(".")[0].replace("Z", "")
                    dt_obj = datetime.strptime(clean_ts, "%Y-%m-%dT%H:%M:%S")
                    date_str = dt_obj.strftime("%Y-%m-%d")
                    hour = dt_obj.hour
                    day_of_week = dt_obj.weekday()
                    
                    post_hours[hour] += 1
                    post_days[day_of_week] += 1
                except Exception:
                    pass
            
            # Append post to list of all posts
            all_posts.append({
                "id": post.get("id"),
                "shortCode": post.get("shortCode"),
                "url": post.get("url"),
                "type": post.get("type", "Post"),
                "caption": caption,
                "likesCount": likes,
                "commentsCount": comments,
                "engagementRate": round(er, 4),
                "timestamp": ts_str,
                "date": date_str,
                "hour": hour,
                "dayOfWeek": day_names[day_of_week] if day_of_week is not None else None,
                "ownerUsername": username,
                "ownerFullName": profile.get("fullName", ""),
                "displayUrl": post.get("displayUrl"),
                "videoUrl": post.get("videoUrl"),
                "productType": post.get("productType")
            })
            
        # Creator level metrics
        avg_creator_er = ((creator_likes + creator_comments) / creator_posts_count / followers * 100) if (followers > 0 and creator_posts_count > 0) else 0
        
        creators_list.append({
            "username": username,
            "fullName": profile.get("fullName", ""),
            "biography": profile.get("biography", ""),
            "followersCount": followers,
            "followsCount": int(profile.get("followsCount", 0)),
            "postsCount": posts_count,
            "scrapedPostsCount": creator_posts_count,
            "profilePicUrl": profile.get("profilePicUrlHD") or profile.get("profilePicUrl"),
            "verified": bool(profile.get("verified", False)),
            "isBusinessAccount": bool(profile.get("isBusinessAccount", False)),
            "businessCategoryName": profile.get("businessCategoryName"),
            "averageLikes": round(creator_likes / creator_posts_count, 1) if creator_posts_count > 0 else 0,
            "averageComments": round(creator_comments / creator_posts_count, 1) if creator_posts_count > 0 else 0,
            "averageEngagementRate": round(avg_creator_er, 4)
        })
        
    # Global averages & details
    num_creators = len(profiles)
    avg_followers = total_followers / num_creators if num_creators > 0 else 0
    
    total_likes_scraped = sum(p["likesCount"] for p in all_posts)
    total_comments_scraped = sum(p["commentsCount"] for p in all_posts)
    
    # Calculate average engagement rate across all posts
    avg_engagement_rate = sum(p["engagementRate"] for p in all_posts) / len(all_posts) if all_posts else 0
    
    # Top Posts Rankings
    top_liked_posts = sorted(all_posts, key=lambda x: x["likesCount"], reverse=True)[:10]
    top_commented_posts = sorted(all_posts, key=lambda x: x["commentsCount"], reverse=True)[:10]
    top_engaged_posts = sorted(all_posts, key=lambda x: x["engagementRate"], reverse=True)[:10]
    
    # Content type distribution and performance
    content_types = {}
    for post in all_posts:
        ptype = post["type"]
        if ptype not in content_types:
            content_types[ptype] = {"count": 0, "likes": 0, "comments": 0, "er_sum": 0}
        content_types[ptype]["count"] += 1
        content_types[ptype]["likes"] += post["likesCount"]
        content_types[ptype]["comments"] += post["commentsCount"]
        content_types[ptype]["er_sum"] += post["engagementRate"]
        
    content_type_summary = []
    for ptype, metrics in content_types.items():
        cnt = metrics["count"]
        content_type_summary.append({
            "type": ptype,
            "count": cnt,
            "share": round(cnt / len(all_posts) * 100, 2) if all_posts else 0,
            "averageLikes": round(metrics["likes"] / cnt, 1),
            "averageComments": round(metrics["comments"] / cnt, 1),
            "averageEngagementRate": round(metrics["er_sum"] / cnt, 4)
        })
        
    # Timeline analysis (engagement by date)
    timeline_dict = {}
    for post in all_posts:
        date_str = post["date"]
        if not date_str:
            continue
        if date_str not in timeline_dict:
            timeline_dict[date_str] = {"likes": 0, "comments": 0, "er_sum": 0, "count": 0}
        timeline_dict[date_str]["likes"] += post["likesCount"]
        timeline_dict[date_str]["comments"] += post["commentsCount"]
        timeline_dict[date_str]["er_sum"] += post["engagementRate"]
        timeline_dict[date_str]["count"] += 1
        
    timeline_summary = []
    for date_str in sorted(timeline_dict.keys()):
        metrics = timeline_dict[date_str]
        cnt = metrics["count"]
        timeline_summary.append({
            "date": date_str,
            "postsCount": cnt,
            "likes": metrics["likes"],
            "comments": metrics["comments"],
            "averageEngagementRate": round(metrics["er_sum"] / cnt, 4)
        })
        
    # Formatting day/hour charts
    hour_analysis = [{"hour": f"{h:02d}:00", "count": count} for h, count in post_hours.items()]
    day_analysis = [{"day": day_names[d], "count": count} for d, count in post_days.items()]
    
    # Top hashtags sorted
    top_hashtags = sorted(
        [{"hashtag": f"#{k}", "count": v} for k, v in hashtag_counts.items()],
        key=lambda x: x["count"],
        reverse=True
    )[:15]
    
    return {
        "summary": {
            "totalCreators": num_creators,
            "totalFollowers": total_followers,
            "averageFollowers": round(avg_followers, 1),
            "totalPostsAllTime": total_posts_all_time,
            "totalScrapedPosts": total_scraped_posts,
            "totalLikes": total_likes_scraped,
            "totalComments": total_comments_scraped,
            "averageEngagementRate": round(avg_engagement_rate, 4)
        },
        "creators": sorted(creators_list, key=lambda x: x["followersCount"], reverse=True),
        "contentTypeDistribution": content_type_summary,
        "timeline": timeline_summary,
        "hourlyDistribution": hour_analysis,
        "dailyDistribution": day_analysis,
        "topHashtags": top_hashtags,
        "topPosts": {
            "byLikes": top_liked_posts,
            "byComments": top_commented_posts,
            "byEngagement": top_engaged_posts
        },
        "allPosts": all_posts
    }
