import os
import shutil
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from pydantic import BaseModel
from typing import List
from app.parser import parse_file, run_analytics
from app.scraper import run_apify_instagram_scraper

class ScrapeRequest(BaseModel):
    api_token: str
    usernames: List[str]
    posts_limit: int = 12

# Initialize FastAPI App
app = FastAPI(
    title="Instagram Data Analytics API",
    description="Backend API for parsing and analyzing Instagram scraper data.",
    version="1.0.0"
)

# Enable CORS (Cross-Origin Resource Sharing)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure data and temp upload directories exist
os.makedirs("data", exist_ok=True)
os.makedirs("temp_uploads", exist_ok=True)

# Default data path
DEFAULT_DATA_PATH = os.path.join("data", "default_dataset.json")

# In-memory cache for default analytics
cached_default_analytics = None

def get_default_analytics():
    global cached_default_analytics
    if cached_default_analytics is not None:
        return cached_default_analytics
    
    if os.path.exists(DEFAULT_DATA_PATH):
        try:
            profiles = parse_file(DEFAULT_DATA_PATH)
            cached_default_analytics = run_analytics(profiles)
            return cached_default_analytics
        except Exception as e:
            print(f"Error parsing default dataset: {e}")
            return {"error": f"Failed to parse default dataset: {str(e)}"}
    else:
        return {"error": "Default dataset file not found."}

@app.get("/api/analytics/default")
def read_default_analytics():
    """
    Returns pre-computed analytics for the default Instagram dataset.
    """
    analytics = get_default_analytics()
    if "error" in analytics:
        raise HTTPException(status_code=500, detail=analytics["error"])
    return analytics

@app.post("/api/analytics/upload")
async def upload_dataset(file: UploadFile = File(...)):
    """
    Uploads a new Instagram scraper JSON or Excel file, runs analytics, and returns the results.
    """
    _, ext = os.path.splitext(file.filename.lower())
    if ext not in [".json", ".xlsx", ".xls"]:
        raise HTTPException(
            status_code=400, 
            detail="Invalid file format. Only Instagram scraper output files (.json, .xlsx, .xls) are supported."
        )
    
    # Save the file temporarily
    temp_file_path = os.path.join("temp_uploads", f"upload_{file.filename}")
    try:
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Parse and analyze the uploaded file
        profiles = parse_file(temp_file_path)
        analytics_result = run_analytics(profiles)
        
        return analytics_result
        
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to process dataset: {str(e)}")
    finally:
        # Clean up the temporary file
        if os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
            except Exception:
                pass

@app.post("/api/analytics/scrape")
def scrape_and_analyze(request: ScrapeRequest):
    """
    Triggers live scraping from Apify for one or more profiles,
    processes the datasets, and returns the computed analytics.
    """
    try:
        # Call scraper helper
        profiles = run_apify_instagram_scraper(
            api_token=request.api_token,
            usernames=request.usernames,
            limit_per_creator=request.posts_limit
        )
        
        if not profiles:
            raise HTTPException(
                status_code=400, 
                detail="Scraper returned an empty dataset. Make sure the Instagram handles are public and valid."
            )
            
        # Analyze scraped profiles
        analytics_result = run_analytics(profiles)
        return analytics_result
        
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except RuntimeError as run_err:
        raise HTTPException(status_code=502, detail=str(run_err))
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Scraping analysis failed: {str(e)}")

# Serve static frontend files
@app.get("/")
def read_root():
    """
    Serves the dashboard index.html.
    """
    index_path = os.path.join("static", "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return JSONResponse(
        status_code=404,
        content={"message": "Frontend static folder is missing or index.html not found. Run deployment steps."}
    )

# Mount the static directory for index.css, index.js and assets
# Make sure the folder exists first
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")
