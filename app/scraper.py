import os
from apify_client import ApifyClient

def compile_apify_items(items):
    """
    Aggregates items returned by Apify Instagram Scraper into the nested profile structure.
    Supports:
      1. Profile-level items (from resultsType='details' runs) where latestPosts is nested.
      2. Post-level items (from resultsType='posts' runs) where owner metadata is nested inside each post.
    """
    creators = {}
    
    for item in items:
        # Resolve username (can be flat item 'username' or inside nested 'owner')
        username = item.get("username")
        owner = item.get("owner")
        
        if not username and owner:
            username = owner.get("username")
            
        if not username:
            # Skip items that have no creator metadata
            continue
            
        username = username.strip().lower()
        
        # Initialize creator profile if not yet created
        if username not in creators:
            # Look up metadata fields in root item, or fallback to owner dict
            fullName = item.get("fullName") or (owner.get("fullName") if owner else None) or username
            biography = item.get("biography") or (owner.get("biography") if owner else "") or ""
            followersCount = item.get("followersCount") or (owner.get("followersCount") if owner else 0) or 0
            followsCount = item.get("followsCount") or (owner.get("followsCount") if owner else 0) or 0
            verified = item.get("verified") or (owner.get("verified") if owner else False) or False
            isBusiness = item.get("isBusinessAccount") or False
            category = item.get("businessCategoryName")
            profilePic = item.get("profilePicUrlHD") or item.get("profilePicUrl") or (owner.get("profilePicUrl") if owner else None)
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
            if not creators[username]["biography"] and (item.get("biography") or (owner and owner.get("biography"))):
                creators[username]["biography"] = item.get("biography") or owner.get("biography")
            if creators[username]["followersCount"] == 0 and (item.get("followersCount") or (owner and owner.get("followersCount"))):
                creators[username]["followersCount"] = int(item.get("followersCount") or owner.get("followersCount"))
            if creators[username]["followsCount"] == 0 and (item.get("followsCount") or (owner and owner.get("followsCount"))):
                creators[username]["followsCount"] = int(item.get("followsCount") or owner.get("followsCount"))
            if not creators[username]["profilePicUrl"] and (item.get("profilePicUrlHD") or item.get("profilePicUrl") or (owner and owner.get("profilePicUrl"))):
                creators[username]["profilePicUrl"] = item.get("profilePicUrlHD") or item.get("profilePicUrl") or owner.get("profilePicUrl")
            if creators[username]["postsCount"] == 0 and item.get("postsCount"):
                creators[username]["postsCount"] = int(item.get("postsCount"))

        # Case A: Handle nested 'latestPosts' (e.g. resultsType='details' format)
        nested_posts = item.get("latestPosts", [])
        if isinstance(nested_posts, list) and len(nested_posts) > 0:
            for post in nested_posts:
                post_id = post.get("id")
                if post_id:
                    if not any(p["id"] == post_id for p in creators[username]["latestPosts"]):
                        # Map format type (Sidecar is Carousel, Video/Clip/Reel is Video)
                        post_type = post.get("type", "Image")
                        if post_type == "Sidecar":
                            post_type = "Sidecar"
                        elif post_type in ["Video", "Clip", "Reel"]:
                            post_type = "Video"
                        else:
                            post_type = "Image"
                        
                        creators[username]["latestPosts"].append({
                            "id": post_id,
                            "type": post_type,
                            "shortCode": post.get("shortCode"),
                            "caption": post.get("caption", ""),
                            "url": post.get("url"),
                            "likesCount": int(post.get("likesCount", 0)),
                            "commentsCount": int(post.get("commentsCount", 0)),
                            "timestamp": post.get("timestamp"),
                            "displayUrl": post.get("displayUrl"),
                            "videoUrl": post.get("videoUrl"),
                            "productType": post.get("productType")
                        })
                        
        # Case B: Handle flat post item (e.g. resultsType='posts' format)
        post_id = item.get("id")
        if post_id and ("likesCount" in item or "commentsCount" in item or "caption" in item):
            if not any(p["id"] == post_id for p in creators[username]["latestPosts"]):
                post_type = item.get("type", "Image")
                if post_type == "Sidecar":
                    post_type = "Sidecar"
                elif post_type in ["Video", "Clip", "Reel"]:
                    post_type = "Video"
                else:
                    post_type = "Image"
                
                creators[username]["latestPosts"].append({
                    "id": post_id,
                    "type": post_type,
                    "shortCode": item.get("shortCode"),
                    "caption": item.get("caption", ""),
                    "url": item.get("url"),
                    "likesCount": int(item.get("likesCount", 0)),
                    "commentsCount": int(item.get("commentsCount", 0)),
                    "timestamp": item.get("timestamp"),
                    "displayUrl": item.get("displayUrl"),
                    "videoUrl": item.get("videoUrl"),
                    "productType": item.get("productType")
                })
                
    return list(creators.values())

def run_apify_instagram_scraper(api_token, usernames, limit_per_creator=12):
    """
    Runs the apify/instagram-scraper actor for a list of usernames,
    waiting for completion and returning compiled profiles dataset.
    """
    if not api_token:
        raise ValueError("Apify API Token is required.")
        
    if not usernames:
        raise ValueError("At least one Instagram username must be provided.")
        
    client = ApifyClient(api_token)
    
    # Construct direct profile URLs
    direct_urls = []
    for username in usernames:
        clean_user = username.strip().replace("@", "").strip()
        if clean_user:
            direct_urls.append(f"https://www.instagram.com/{clean_user}/")
            
    if not direct_urls:
        raise ValueError("No valid Instagram handles found in input.")
        
    # Configure parameters. The standard actor is "apify/instagram-scraper"
    # To scrape the feed of posts correctly, resultsType must be 'posts' and 
    # resultsLimit is evaluated per URL (profile).
    run_input = {
        "directUrls": direct_urls,
        "resultsLimit": limit_per_creator,
        "resultsType": "posts",
        "searchLimit": 1
    }
    
    try:
        # Trigger the run and block until complete
        print(f"Triggering Apify Instagram Scraper run for URLs: {direct_urls}...")
        run = client.actor("apify/instagram-scraper").call(run_input=run_input)
        
        if not run:
            raise RuntimeError("Scraper run returned empty result.")
            
        # Extract default dataset ID supporting both object attributes and dict subscription
        dataset_id = getattr(run, "default_dataset_id", None) or (run.get("defaultDatasetId") if hasattr(run, "get") else None)
        if not dataset_id:
            raise RuntimeError("Could not locate defaultDatasetId in run details.")
            
        print(f"Fetch results from dataset ID: {dataset_id}...")
        items = client.dataset(dataset_id).list_items().items
        
        # Compile flat items into the aggregated profiles list
        compiled_profiles = compile_apify_items(items)
        return compiled_profiles
        
    except Exception as e:
        # Wrap Apify client errors into user friendly messages
        raise RuntimeError(f"Apify Scraper Run failed: {str(e)}")
