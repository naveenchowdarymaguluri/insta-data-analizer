import os
import json
import re
from datetime import datetime
import pandas as pd
import math

# Keywords for topic classification
CATEGORIES_KEYWORDS = {
    "Fitness": ["fitness", "workout", "gym", "exercise", "training", "weightloss", "cardio", "diet", "nutrition", "nutritionist", "fitfam"],
    "Food": ["food", "recipe", "cooking", "delicious", "yummy", "taste", "chef", "baking", "eat", "lunch", "dinner", "breakfast", "healthyfood", "yum", "kitchen"],
    "Travel": ["travel", "vacation", "wanderlust", "trip", "flight", "beach", "hotel", "explore", "tourism", "destination", "nature", "adventure", "vlog"],
    "Finance": ["finance", "money", "stock", "crypto", "trading", "investment", "wealth", "budget", "savings", "bitcoin", "passiveincome", "earnings", "business"],
    "Technology": ["technology", "tech", "gadget", "software", "coding", "programming", "developer", "ai", "artificial intelligence", "robotics", "laptop", "smartphone", "science"],
    "Comedy": ["comedy", "funny", "meme", "laugh", "joke", "humor", "hilarious", "fun", "prank", "lol", "laughing"],
    "Fashion": ["fashion", "style", "outfit", "model", "clothing", "apparel", "designer", "lookbook", "beauty", "makeup", "trend", "ootd"],
    "Healthcare": ["healthcare", "medicine", "doctor", "nurse", "clinic", "hospital", "wellbeing", "wellness", "health", "prevention", "medical", "mbbs", "physician"],
    "Motivation": ["motivation", "inspiration", "quote", "success", "dream", "goal", "hardwork", "mindset", "focus", "positive", "positivevibes", "inspire"],
    "Business": ["business", "entrepreneur", "marketing", "startup", "leadership", "sales", "strategy", "growth", "work", "office", "brand", "networking"],
    "Gaming": ["gaming", "gamer", "playstation", "xbox", "nintendo", "pc", "twitch", "stream", "game", "esports", "play"],
    "Sports": ["sports", "football", "soccer", "basketball", "cricket", "athlete", "tournament", "match", "team", "league", "win", "player"],
    "Lifestyle": ["lifestyle", "life", "vlog", "family", "morningroutine", "aesthetic", "home", "decor", "daily", "minimalism", "weekend"]
}

CTA_KEYWORDS = ["link in bio", "dm me", "comment below", "share this", "tag a friend", "click the link", "buy now", "register", "sign up", "follow me", "save this"]

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

def classify_post(caption, hashtags):
    text = (caption or "").lower() + " " + " ".join(hashtags or []).lower()
    scores = {cat: 0 for cat in CATEGORIES_KEYWORDS}
    for cat, keywords in CATEGORIES_KEYWORDS.items():
        for kw in keywords:
            if kw in text:
                scores[cat] += 1
    max_cat = max(scores, key=scores.get)
    if scores[max_cat] > 0:
        return max_cat
    return "Lifestyle"

def count_emojis(text):
    if not text:
        return 0
    emoji_count = 0
    for char in text:
        # High Unicode Planes (0x1f000+) contain Emojis. Standard symbols in 0x2600-0x27bf.
        if ord(char) > 0x1f000 or (0x2600 <= ord(char) <= 0x27bf):
            emoji_count += 1
    return emoji_count

def detect_cta(caption):
    text = (caption or "").lower()
    return any(cta in text for cta in CTA_KEYWORDS)

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
    Computes comprehensive data analytics for a list of Instagram profiles,
    incorporating content classification, creator/brand scoring, caption styles,
    and media audits.
    """
    if not profiles:
        return {}
    
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
        username = profile.get("username", "unknown").lower()
        followers = int(profile.get("followersCount", 0))
        posts_count = int(profile.get("postsCount", 0))
        
        total_followers += followers
        total_posts_all_time += posts_count
        
        # Scraped posts for this creator
        latest_posts = profile.get("latestPosts", [])
        creator_posts_count = len(latest_posts)
        total_scraped_posts += creator_posts_count
        
        creator_likes = 0
        creator_comments = 0
        
        # Caption and CTA indicators
        caption_lens = []
        emoji_counts = []
        cta_count = 0
        question_count = 0
        
        # Content categories distribution for this creator
        creator_categories = {cat: 0 for cat in CATEGORIES_KEYWORDS}
        creator_timestamps = []
        music_tracks = set()
        
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
            
            # Caption metrics
            caption_lens.append(len(caption))
            emoji_counts.append(count_emojis(caption))
            
            has_cta = detect_cta(caption)
            if has_cta:
                cta_count += 1
                
            has_question = "?" in caption
            if has_question:
                question_count += 1
                
            # Classify content
            category = classify_post(caption, hashtags)
            creator_categories[category] += 1
            
            # Parse music / audio
            audio_title = (
                post.get("audioName") or 
                (post.get("musicInfo") and isinstance(post["musicInfo"], dict) and post["musicInfo"].get("title"))
            )
            audio_artist = (
                post.get("audioArtist") or 
                (post.get("musicInfo") and isinstance(post["musicInfo"], dict) and post["musicInfo"].get("artist"))
            )
            audio_str = f"{audio_title} - {audio_artist}" if (audio_title and audio_artist) else (audio_title or audio_artist)
            if audio_str:
                music_tracks.add(audio_str)
                
            # Aspect ratio
            width = post.get("dimensionsWidth")
            height = post.get("dimensionsHeight")
            aspect_ratio = "4:5"
            if width and height:
                w_val = int(width)
                h_val = int(height)
                # Simplify typical aspect ratios
                if w_val == h_val:
                    aspect_ratio = "1:1"
                elif w_val > h_val:
                    aspect_ratio = "16:9" if (w_val / h_val > 1.5) else "4:3"
                else:
                    aspect_ratio = "9:16" if (h_val / w_val > 1.5) else "4:5"
            
            # Parse timestamp for timeline analytics
            ts_str = post.get("timestamp")
            dt_obj = None
            date_str = None
            hour = None
            day_of_week = None
            
            if ts_str:
                try:
                    # Parse ISO timestamps (handling fractional seconds)
                    clean_ts = ts_str.split(".")[0].replace("Z", "")
                    dt_obj = datetime.strptime(clean_ts, "%Y-%m-%dT%H:%M:%S")
                    date_str = dt_obj.strftime("%Y-%m-%d")
                    hour = dt_obj.hour
                    day_of_week = dt_obj.weekday()
                    
                    post_hours[hour] += 1
                    post_days[day_of_week] += 1
                    creator_timestamps.append(dt_obj)
                except Exception:
                    pass
            
            all_posts.append({
                "id": post.get("id"),
                "shortCode": post.get("shortCode"),
                "url": post.get("url"),
                "type": post.get("type", "Image"),
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
                "productType": post.get("productType"),
                "category": category,
                "hasCTA": has_cta,
                "hasQuestion": has_question,
                "emojiCount": count_emojis(caption),
                "aspectRatio": aspect_ratio,
                "audioTrack": audio_str,
                "duration": post.get("videoDuration")
            })
            
        # Creator level metrics
        avg_creator_er = ((creator_likes + creator_comments) / creator_posts_count / followers * 100) if (followers > 0 and creator_posts_count > 0) else 0
        
        # Calculate posting frequency (posts per week)
        posts_per_week = 2.0  # default
        if len(creator_timestamps) >= 2:
            min_date = min(creator_timestamps)
            max_date = max(creator_timestamps)
            days_diff = (max_date - min_date).days
            if days_diff > 0:
                posts_per_week = (creator_posts_count / days_diff) * 7.0
                
        # Calculate Creator Score (0-100)
        # Weightage: 45% ER, 25% frequency, 20% Followers size, 10% Verified status
        er_score = min(avg_creator_er / 4.0, 1.0) * 100  # 4% or higher gives 100% of ER component
        freq_score = min(posts_per_week / 4.0, 1.0) * 100  # 4 posts per week gives 100%
        followers_log = math.log10(max(followers, 1))
        followers_score = min(followers_log / 6.0, 1.0) * 100  # 1,000,000 followers gives 100%
        verified_score = 100 if bool(profile.get("verified", False)) else 0
        creator_score = round(0.45 * er_score + 0.25 * freq_score + 0.20 * followers_score + 0.10 * verified_score)
        
        # Calculate Brand Score (0-100)
        # Weightage: 30% CTA rate, 30% External links, 20% Verified status, 20% Business account
        cta_rate = (cta_count / creator_posts_count) if creator_posts_count > 0 else 0
        cta_score = cta_rate * 100
        has_links = bool(profile.get("externalUrl") or profile.get("externalUrls"))
        link_score = 100 if has_links else 0
        business_score = 100 if bool(profile.get("isBusinessAccount", False)) else 0
        brand_score = round(0.30 * cta_score + 0.30 * link_score + 0.20 * verified_score + 0.20 * business_score)
        
        # Calculate Posting Consistency (variance index: high values mean consistent spacing)
        # We check gaps between subsequent post timestamps
        consistency_rating = "Medium"
        if len(creator_timestamps) >= 3:
            sorted_dates = sorted(creator_timestamps)
            gaps = [(sorted_dates[i+1] - sorted_dates[i]).days for i in range(len(sorted_dates)-1)]
            avg_gap = sum(gaps) / len(gaps)
            if avg_gap > 0:
                variance = sum((g - avg_gap) ** 2 for g in gaps) / len(gaps)
                std_dev = math.sqrt(variance)
                # Low standard deviation in gaps means high consistency
                if std_dev < 2.0:
                    consistency_rating = "High"
                elif std_dev > 5.0:
                    consistency_rating = "Low"
        
        # Find dominant category
        dominant_cat = max(creator_categories, key=creator_categories.get)
        if creator_categories[dominant_cat] == 0:
            dominant_cat = "Lifestyle"
            
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
            "averageEngagementRate": round(avg_creator_er, 4),
            
            # Enriched Metrics
            "creatorScore": creator_score,
            "brandScore": brand_score,
            "postingFrequency": round(posts_per_week, 1),
            "postingConsistency": consistency_rating,
            "dominantCategory": dominant_cat,
            "categoryDistribution": creator_categories,
            "captionMetrics": {
                "averageLength": round(sum(caption_lens) / len(caption_lens)) if caption_lens else 0,
                "averageEmojis": round(sum(emoji_counts) / len(emoji_counts), 1) if emoji_counts else 0,
                "ctaRate": round(cta_rate * 100, 1),
                "questionRate": round((question_count / creator_posts_count) * 100, 1) if creator_posts_count > 0 else 0
            },
            "topHashtags": sorted(
                [{"hashtag": f"#{k}", "count": v} for k, v in hashtag_counts.items()],
                key=lambda x: x["count"],
                reverse=True
            )[:5],
            "audioTracks": list(music_tracks)[:5]
        })
        
    num_creators = len(profiles)
    avg_followers = total_followers / num_creators if num_creators > 0 else 0
    
    total_likes_scraped = sum(p["likesCount"] for p in all_posts)
    total_comments_scraped = sum(p["commentsCount"] for p in all_posts)
    
    avg_engagement_rate = sum(p["engagementRate"] for p in all_posts) / len(all_posts) if all_posts else 0
    
    top_liked_posts = sorted(all_posts, key=lambda x: x["likesCount"], reverse=True)[:10]
    top_commented_posts = sorted(all_posts, key=lambda x: x["commentsCount"], reverse=True)[:10]
    top_engaged_posts = sorted(all_posts, key=lambda x: x["engagementRate"], reverse=True)[:10]
    
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
        
    # Global Categories distribution
    global_categories = {cat: 0 for cat in CATEGORIES_KEYWORDS}
    for post in all_posts:
        global_categories[post["category"]] += 1
        
    category_summary = [
        {"category": cat, "count": count, "share": round(count / len(all_posts) * 100, 1) if all_posts else 0}
        for cat, count in global_categories.items() if count > 0
    ]
    category_summary = sorted(category_summary, key=lambda x: x["count"], reverse=True)
        
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
        
    hour_analysis = [{"hour": f"{h:02d}:00", "count": count} for h, count in post_hours.items()]
    day_analysis = [{"day": day_names[d], "count": count} for d, count in post_days.items()]
    
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
        "categoryDistribution": category_summary,
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
