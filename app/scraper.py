import os
from apify_client import ApifyClient
from concurrent.futures import ThreadPoolExecutor

def compile_apify_items(items):
    """
    Aggregates items returned by Apify Instagram Scraper into the nested profile structure.
    Supports:
      1. Profile-level items (from resultsType='details' runs) where latestPosts is nested.
      2. Post-level items (from resultsType='posts' runs) where owner metadata is nested inside each post.
    """
    creators = {}
    
    for item in items:
        # Try all possible keys for username (both flat and nested under owner/user)
        username = (
            item.get("username") or 
            item.get("ownerUsername") or 
            item.get("userName") or
            (item.get("owner") and isinstance(item["owner"], dict) and item["owner"].get("username")) or
            (item.get("user") and isinstance(item["user"], dict) and item["user"].get("username"))
        )
        
        if not username:
            # Skip items that have no creator metadata
            continue
            
        username = username.strip().lower()
        owner = item.get("owner") if isinstance(item.get("owner"), dict) else None
        user = item.get("user") if isinstance(item.get("user"), dict) else None
        
        # Initialize creator profile if not yet created
        if username not in creators:
            # Look up metadata fields in root item, or fallback to owner/user dicts
            fullName = (
                item.get("fullName") or 
                item.get("ownerFullName") or 
                (owner and owner.get("fullName")) or
                (user and user.get("fullName")) or
                username
            )
            biography = (
                item.get("biography") or 
                item.get("ownerBiography") or 
                (owner and owner.get("biography")) or
                (user and user.get("biography")) or
                ""
            )
            followersCount = (
                item.get("followersCount") or 
                item.get("ownerFollowersCount") or 
                (owner and owner.get("followersCount")) or
                (user and user.get("followersCount")) or
                0
            )
            followsCount = (
                item.get("followsCount") or 
                item.get("ownerFollowsCount") or 
                (owner and owner.get("followsCount")) or
                (user and user.get("followsCount")) or
                0
            )
            verified = (
                item.get("verified") or 
                item.get("ownerVerified") or 
                (owner and owner.get("verified")) or
                (user and user.get("verified")) or
                False
            )
            isBusiness = item.get("isBusinessAccount") or False
            category = item.get("businessCategoryName")
            profilePic = (
                item.get("profilePicUrlHD") or 
                item.get("profilePicUrl") or 
                item.get("ownerProfilePicUrl") or 
                (owner and (owner.get("profilePicUrl") or owner.get("profilePicUrlHD"))) or
                (user and (user.get("profilePicUrl") or user.get("profilePicUrlHD"))) or
                None
            )
            postsCount = item.get("postsCount") or 0
            
            creators[username] = {
                "username": username,
                "fullName": fullName,
                "biography": biography,
                "followersCount": int(followersCount),
                "followsCount": int(followsCount),
                "verified": bool(verified),
                "isBusinessAccount": bool(isBusiness),
                "businessCategoryName": category,
                "profilePicUrl": profilePic,
                "postsCount": int(postsCount),
                "latestPosts": []
            }
        else:
            # Enrich profile details if missing and present in current item
            if not creators[username]["biography"]:
                creators[username]["biography"] = (
                    item.get("biography") or 
                    item.get("ownerBiography") or 
                    (owner and owner.get("biography")) or
                    (user and user.get("biography")) or
                    ""
                )
            if creators[username]["followersCount"] == 0:
                creators[username]["followersCount"] = int(
                    item.get("followersCount") or 
                    item.get("ownerFollowersCount") or 
                    (owner and owner.get("followersCount")) or
                    (user and user.get("followersCount")) or
                    0
                )
            if creators[username]["followsCount"] == 0:
                creators[username]["followsCount"] = int(
                    item.get("followsCount") or 
                    item.get("ownerFollowsCount") or 
                    (owner and owner.get("followsCount")) or
                    (user and user.get("followsCount")) or
                    0
                )
            if not creators[username]["profilePicUrl"]:
                creators[username]["profilePicUrl"] = (
                    item.get("profilePicUrlHD") or 
                    item.get("profilePicUrl") or 
                    item.get("ownerProfilePicUrl") or 
                    (owner and (owner.get("profilePicUrl") or owner.get("profilePicUrlHD"))) or
                    (user and (user.get("profilePicUrl") or user.get("profilePicUrlHD"))) or
                    None
                )
            if creators[username]["postsCount"] == 0 and item.get("postsCount"):
                creators[username]["postsCount"] = int(item.get("postsCount"))

        # Case A: Handle nested 'latestPosts' (e.g. resultsType='details' format)
        nested_posts = item.get("latestPosts", [])
        if isinstance(nested_posts, list) and len(nested_posts) > 0:
            for post in nested_posts:
                post_id = post.get("id")
                if post_id:
                    if not any(p["id"] == post_id for p in creators[username]["latestPosts"]):
                        post_type = post.get("type", "Image")
                        if post_type == "Sidecar":
                            post_type = "Sidecar"
                        elif post_type in ["Video", "Clip", "Reel"]:
                            post_type = "Video"
                        else:
                            post_type = "Image"
                        
                        likes = post.get("likesCount") or post.get("likeCount") or post.get("likes", 0)
                        comments = post.get("commentsCount") or post.get("commentCount") or post.get("comments", 0)
                        caption = post.get("caption") or post.get("captionText") or post.get("text", "")
                        timestamp = post.get("timestamp") or post.get("datetime") or post.get("createdAt")
                        post_url = post.get("url") or post.get("postUrl") or post.get("link")
                        
                        creators[username]["latestPosts"].append({
                            "id": post_id,
                            "type": post_type,
                            "shortCode": post.get("shortCode"),
                            "caption": caption,
                            "url": post_url,
                            "likesCount": int(likes),
                            "commentsCount": int(comments),
                            "timestamp": timestamp,
                            "displayUrl": post.get("displayUrl") or post.get("imageUrl"),
                            "videoUrl": post.get("videoUrl"),
                            "productType": post.get("productType")
                        })
                        
        # Case B: Handle flat post item (e.g. resultsType='posts' format)
        post_id = item.get("id")
        has_post_fields = any(x in item for x in ["likesCount", "likeCount", "commentsCount", "commentCount", "caption", "captionText"])
        if post_id and has_post_fields:
            if not any(p["id"] == post_id for p in creators[username]["latestPosts"]):
                post_type = item.get("type", "Image")
                if post_type == "Sidecar":
                    post_type = "Sidecar"
                elif post_type in ["Video", "Clip", "Reel"]:
                    post_type = "Video"
                else:
                    post_type = "Image"
                
                likes = item.get("likesCount") or item.get("likeCount") or item.get("likes", 0)
                comments = item.get("commentsCount") or item.get("commentCount") or item.get("comments", 0)
                caption = item.get("caption") or item.get("captionText") or item.get("text", "")
                timestamp = item.get("timestamp") or item.get("datetime") or item.get("createdAt")
                post_url = item.get("url") or item.get("postUrl") or item.get("link")
                
                creators[username]["latestPosts"].append({
                    "id": post_id,
                    "type": post_type,
                    "shortCode": item.get("shortCode"),
                    "caption": caption,
                    "url": post_url,
                    "likesCount": int(likes),
                    "commentsCount": int(comments),
                    "timestamp": timestamp,
                    "displayUrl": item.get("displayUrl") or item.get("imageUrl"),
                    "videoUrl": item.get("videoUrl"),
                    "productType": item.get("productType")
                })
                
    return list(creators.values())

def run_apify_instagram_scraper(api_token, usernames, limit_per_creator=12):
    """
    Runs the apify/instagram-scraper actor for a list of usernames,
    fetching both details and posts concurrently to compile a perfect dataset.
    """
    if not api_token:
        raise ValueError("Apify API Token is required.")
        
    if not usernames:
        raise ValueError("At least one Instagram username must be provided.")
        
    client = ApifyClient(api_token)
    
    # Construct direct profile URLs
    direct_urls = []
    for username in usernames:
        clean_user = username.strip()
        # Parse username from URL if necessary
        if "instagram.com" in clean_user:
            clean_user = clean_user.rstrip("/")
            clean_user = clean_user.split("/")[-1]
            if "?" in clean_user:
                clean_user = clean_user.split("?")[0]
                
        clean_user = clean_user.replace("@", "").strip()
        if clean_user:
            direct_urls.append(f"https://www.instagram.com/{clean_user}/")
            
    if not direct_urls:
        raise ValueError("No valid Instagram handles found in input.")
        
    # We will trigger details and posts runs concurrently to compile a perfect dataset
    def fetch_details_run():
        print(f"Triggering details scrape for: {direct_urls}...")
        run = client.actor("apify/instagram-scraper").call(run_input={
            "directUrls": direct_urls,
            "resultsType": "details",
            "proxyConfiguration": {
                "useApifyProxy": True
            }
        })
        dataset_id = getattr(run, "default_dataset_id", None) or (run.get("defaultDatasetId") if hasattr(run, "get") else None)
        if dataset_id:
            return client.dataset(dataset_id).list_items().items
        return []

    def fetch_posts_run():
        print(f"Triggering posts scrape for: {direct_urls}...")
        run = client.actor("apify/instagram-scraper").call(run_input={
            "directUrls": direct_urls,
            "resultsLimit": limit_per_creator,
            "resultsType": "posts",
            "searchLimit": 1,
            "proxyConfiguration": {
                "useApifyProxy": True
            }
        })
        dataset_id = getattr(run, "default_dataset_id", None) or (run.get("defaultDatasetId") if hasattr(run, "get") else None)
        if dataset_id:
            return client.dataset(dataset_id).list_items().items
        return []

    try:
        print(f"Starting concurrent Apify scraping (details + posts) for: {direct_urls}...")
        with ThreadPoolExecutor(max_workers=2) as executor:
            future_details = executor.submit(fetch_details_run)
            future_posts = executor.submit(fetch_posts_run)
            
            details_items = future_details.result()
            posts_items = future_posts.result()
            
        all_items = details_items + posts_items
        if not all_items:
            raise RuntimeError("Scraper returned empty dataset for both details and posts runs.")
            
        # Compile flat items into the aggregated profiles list
        compiled_profiles = compile_apify_items(all_items)
        return compiled_profiles
        
    except Exception as e:
        # Wrap Apify client errors into user friendly messages
        raise RuntimeError(f"Apify Scraper Run failed: {str(e)}")
