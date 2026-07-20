# InstaPulse - Instagram Scraper Data Analytics Dashboard

InstaPulse is an end-to-end data analytics dashboard designed to process and visualize outputs from Instagram scrapers (e.g., Apify Instagram Scraper). It accepts both `.json` and flattened `.xlsx` files, computes profile reach, engagement metrics, posting frequency schedules, weekly publishing patterns, and presents detailed creator analysis cards alongside post list tables.

## 🚀 Key Features

* **Instant Out-of-the-Box Analytics**: Preloads default scraped profiles.
* **Drag-and-Drop Uploader**: Upload any new `.json` or `.xlsx` export from an Instagram scraper, and watch all metrics and charts update dynamically in real-time.
* **Core Analytics**:
  * **Summary Metrics**: Total reach (followers), total posts analyzed, average engagement rates.
  * **Format Metrics**: Performance comparison between Videos, Images, and Carousels.
  * **Timing Matrix**: Breakdown of posts by hour (UTC) and day of the week to pinpoint peak posting times.
  * **Hashtag Analytics**: Frequency check for the most recurring hashtags.
  * **Trends**: Engagement rate averages tracked over a consecutive daily timeline.
* **Creator Deep-Dive Panels**: Click on any creator to slide out a profile card displaying their biography, business categories, verified status, and an interactive list of their recent posts.
* **Posts Viewer**: Sort, paginate, and search captions, creators, and format categories.

---

## 🛠️ Local Setup

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/naveenchowdarymaguluri/insta-data-analizer.git
   cd insta-data-analizer
   ```

2. **Run Server**:
   You only need Python installed. Run the convenient bootstrapper script:
   ```bash
   python run.py
   ```
   *This automatically checks, installs missing dependencies (`fastapi`, `uvicorn`, `pandas`, `openpyxl`, `python-multipart`, `jinja2`), and launches the server.*

3. **Open Browser**:
   Open **[http://localhost:8000](http://localhost:8000)** in your web browser.

---

## ☁️ Deployment on Render

To deploy this application on Render as a Python Web Service:

### 1. Create a Render Web Service
1. Sign in to your [Render Dashboard](https://dashboard.render.com).
2. Click **New +** and select **Web Service**.
3. Connect your GitHub repository: `insta-data-analizer`.

### 2. Configure Web Service Settings
Provide the following configuration settings during creation:

* **Name**: `insta-data-analizer` (or your choice)
* **Region**: Choose the region closest to your users.
* **Branch**: `main`
* **Runtime**: `Python` (or `Python 3`)
* **Build Command**: 
  ```bash
  pip install -r requirements.txt
  ```
* **Start Command**: 
  ```bash
  uvicorn app.main:app --host 0.0.0.0 --port $PORT
  ```
* **Instance Type**: Select **Free** (or any tier).

### 3. Click Deploy!
Render will fetch the repository, install pandas, openpyxl, fastapi, and launch the server. It will supply a public URL (e.g., `https://insta-data-analizer.onrender.com`) where the dashboard is live.
