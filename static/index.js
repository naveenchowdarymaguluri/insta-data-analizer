/**
 * InstaPulse - Upgraded Frontend Dashboard Controller & Charts
 * Manages global filtering, timezone-aware matrices, dual-metric leaderboards,
 * and rule-based insights generation.
 */

// Global App State
let rawDashboardData = null; // Unfiltered default response
let filteredPosts = [];      // Active subset of posts based on global filters
let filteredSummary = {};    // Computed KPIs for the active subset
let activeTab = 'overview';
let activeTheme = 'dark';
let currentTimezone = 'UTC';

// Active Filters State
let selectedCreator = 'all';
let selectedFormat = 'all';
let selectedCompetitors = [];
let filterStartDate = '';
let filterEndDate = '';

// Pagination state for the Posts Table
let currentPostsPage = 1;
const postsPerPage = 10;

// Chart.js instances
let charts = {};

// Timezone offsets options mapping
const timezoneNames = {
    'UTC': 'UTC',
    'local': 'Local Browser Time',
    'America/New_York': 'US Eastern Time',
    'Europe/London': 'London GMT/BST',
    'Asia/Kolkata': 'India Standard Time',
    'Asia/Tokyo': 'Tokyo Standard Time'
};

// Days of week index names
const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // 1. Setup floating tooltip for heatmap
    createHeatmapTooltip();
    
    // 2. Load default dataset
    fetchAnalyticsData('/api/analytics/default', 'Default Scrape Data');
    
    // 3. Initialize UI controls & events
    setupTabNavigation();
    setupThemeToggle();
    setupFileUpload();
    setupDragAndDrop();
    setupGlobalFilters();
    setupTimezoneToggle();
    setupDrawerControls();
    setupScraperTab();
    setupCompareTab();
    
    lucide.createIcons();
});

// Create Heatmap Tooltip DOM Element
function createHeatmapTooltip() {
    if (!document.getElementById('heatmap-tooltip')) {
        const tooltip = document.createElement('div');
        tooltip.id = 'heatmap-tooltip';
        tooltip.className = 'heatmap-tooltip';
        document.body.appendChild(tooltip);
    }
}

// ==========================================================================
// API & Data Fetching
// ==========================================================================

async function fetchAnalyticsData(url, sourceName, uploadFile = null) {
    showLoading(true);
    
    try {
        let response;
        if (uploadFile) {
            const formData = new FormData();
            formData.append('file', uploadFile);
            response = await fetch(url, {
                method: 'POST',
                body: formData
            });
        } else {
            response = await fetch(url);
        }
        
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.detail || 'Failed to analyze dataset.');
        }
        
        const data = await response.json();
        
        // Load raw dataset in memory
        rawDashboardData = data;
        
        // Reset local filter settings
        resetFilterInputs();
        
        // Populate creator dropdowns
        populateCreatorDropdowns();
        
        // Configure Date Bounds from dataset
        configureDateInputsBounds();
        
        // Update Dataset Name Indicator
        document.getElementById('active-dataset-name').textContent = sourceName;
        
        // Perform initial filters & render
        applyGlobalFilters();
        
        showToast('success', `Analyzed dataset successfully from ${sourceName}`);
    } catch (error) {
        console.error(error);
        showToast('error', error.message || 'Error occurred while loading data.');
    } finally {
        showLoading(false);
    }
}

function showLoading(visible) {
    document.getElementById('loading-overlay').style.display = visible ? 'flex' : 'none';
}

function resetFilterInputs() {
    selectedCreator = 'all';
    selectedFormat = 'all';
    filterStartDate = '';
    filterEndDate = '';
    
    document.getElementById('filter-global-creator').value = 'all';
    document.getElementById('filter-global-type').value = 'all';
    document.getElementById('filter-start-date').value = '';
    document.getElementById('filter-end-date').value = '';
}

function populateCreatorDropdowns() {
    const globalSelect = document.getElementById('filter-global-creator');
    const tableSelect = document.getElementById('filter-creator');
    
    // Save current values if they exist
    const prevGlobal = globalSelect.value;
    
    // Reset options
    globalSelect.innerHTML = '<option value="all">All Creators (Comparison Mode)</option>';
    if (tableSelect) tableSelect.innerHTML = '<option value="all">All Creators</option>';
    
    rawDashboardData.creators.forEach(c => {
        const optionText = `@${c.username} (${formatLargeNumber(c.followersCount)} followers)`;
        
        const optG = document.createElement('option');
        optG.value = c.username;
        optG.textContent = optionText;
        globalSelect.appendChild(optG);
        
        if (tableSelect) {
            const optT = document.createElement('option');
            optT.value = c.username;
            optT.textContent = `@${c.username}`;
            tableSelect.appendChild(optT);
        }
    });
    
    // Restore or select default
    globalSelect.value = prevGlobal && rawDashboardData.creators.some(c => c.username === prevGlobal) ? prevGlobal : 'all';
}

function configureDateInputsBounds() {
    if (rawDashboardData.allPosts.length === 0) return;
    
    const timestamps = rawDashboardData.allPosts
        .map(p => p.timestamp)
        .filter(t => t)
        .map(t => new Date(t).getTime());
        
    if (timestamps.length === 0) return;
    
    const minDate = new Date(Math.min(...timestamps)).toISOString().split('T')[0];
    const maxDate = new Date(Math.max(...timestamps)).toISOString().split('T')[0];
    
    const startInput = document.getElementById('filter-start-date');
    const endInput = document.getElementById('filter-end-date');
    
    startInput.min = minDate;
    startInput.max = maxDate;
    endInput.min = minDate;
    endInput.max = maxDate;
}

// ==========================================================================
// Global Filters & Computation Logic
// ==========================================================================

function setupGlobalFilters() {
    const creatorSelect = document.getElementById('filter-global-creator');
    const typeSelect = document.getElementById('filter-global-type');
    const startInput = document.getElementById('filter-start-date');
    const endInput = document.getElementById('filter-end-date');
    const resetBtn = document.getElementById('filter-reset-btn');
    
    const onChangeFilter = () => {
        selectedCreator = creatorSelect.value;
        selectedFormat = typeSelect.value;
        filterStartDate = startInput.value;
        filterEndDate = endInput.value;
        
        // Sync filter bar in Posts Tab if applicable
        const tableCreator = document.getElementById('filter-creator');
        const tableType = document.getElementById('filter-type');
        if (tableCreator) tableCreator.value = selectedCreator;
        if (tableType) tableType.value = selectedFormat;
        
        applyGlobalFilters();
    };
    
    creatorSelect.addEventListener('change', onChangeFilter);
    typeSelect.addEventListener('change', onChangeFilter);
    startInput.addEventListener('change', onChangeFilter);
    endInput.addEventListener('change', onChangeFilter);
    
    resetBtn.addEventListener('click', () => {
        resetFilterInputs();
        applyGlobalFilters();
    });
}

function applyGlobalFilters() {
    if (!rawDashboardData) return;
    
    // 1. Filter Posts
    filteredPosts = rawDashboardData.allPosts.filter(post => {
        // Filter by Creator
        if (selectedCreator !== 'all' && post.ownerUsername !== selectedCreator) {
            return false;
        }
        
        // Filter by Format
        if (selectedFormat !== 'all' && post.type !== selectedFormat) {
            return false;
        }
        
        // Filter by Date range
        if (post.timestamp) {
            const postDate = post.timestamp.split('T')[0];
            if (filterStartDate && postDate < filterStartDate) return false;
            if (filterEndDate && postDate > filterEndDate) return false;
        }
        
        return true;
    });
    
    // 2. Re-compute Metrics/KPIs for the subset
    computeFilteredAnalytics();
    
    // 3. Render Dashboard sections
    renderKPIs();
    renderInsightsBanner();
    refreshActiveView();
}

function computeFilteredAnalytics() {
    // Determine active creators
    let activeCreators = [];
    if (selectedCreator !== 'all') {
        activeCreators = rawDashboardData.creators.filter(c => c.username === selectedCreator);
    } else {
        // If "All", find creators who have posts in the filtered list
        const activeUsernames = new Set(filteredPosts.map(p => p.ownerUsername));
        activeCreators = rawDashboardData.creators.filter(c => activeUsernames.has(c.username));
        // Fallback to all creators if filtered list is empty
        if (activeCreators.length === 0) {
            activeCreators = rawDashboardData.creators;
        }
    }
    
    const totalCreators = activeCreators.length;
    const totalFollowers = activeCreators.reduce((sum, c) => sum + c.followersCount, 0);
    const totalScrapedPosts = filteredPosts.length;
    
    let totalLikes = 0;
    let totalComments = 0;
    let erSum = 0;
    
    filteredPosts.forEach(p => {
        totalLikes += p.likesCount;
        totalComments += p.commentsCount;
        erSum += p.engagementRate;
    });
    
    const averageEngagementRate = totalScrapedPosts > 0 ? (erSum / totalScrapedPosts) : 0;
    
    filteredSummary = {
        totalCreators,
        totalFollowers,
        totalScrapedPosts,
        totalLikes,
        totalComments,
        averageEngagementRate
    };
}

function renderKPIs() {
    const s = filteredSummary;
    document.getElementById('kpi-total-creators').textContent = s.totalCreators.toLocaleString();
    document.getElementById('kpi-total-followers').textContent = formatLargeNumber(s.totalFollowers);
    document.getElementById('kpi-posts-scraped').textContent = s.totalScrapedPosts.toLocaleString();
    document.getElementById('kpi-avg-er').textContent = `${s.averageEngagementRate.toFixed(2)}%`;
}

// ==========================================================================
// Dynamic Key Insights Generator
// ==========================================================================

function renderInsightsBanner() {
    const container = document.getElementById('insights-grid-container');
    container.innerHTML = '';
    
    if (filteredPosts.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 12px 0;">
                No posts match your filters. Adjust filters to generate insights.
            </div>
        `;
        return;
    }
    
    // Insight 1: Best Posting Window (Timezone-adjusted)
    const optimalTime = calculateOptimalPostingTime();
    
    // Insight 2: Best Performing Format
    const optimalFormat = calculateOptimalFormat();
    
    // Insight 3: Top Performance Hashtag
    const optimalHashtag = calculateOptimalHashtag();
    
    const insights = [
        {
            icon: 'clock',
            type: 'time',
            label: 'Optimal Posting Window',
            value: optimalTime.timeString,
            text: optimalTime.recommendationText
        },
        {
            icon: 'layout',
            type: 'format',
            label: 'Top Performing Format',
            value: optimalFormat.formatType,
            text: optimalFormat.recommendationText
        },
        {
            icon: 'hash',
            type: 'hashtag',
            label: 'High Conversion Hashtag',
            value: optimalHashtag.hashtag,
            text: optimalHashtag.recommendationText
        }
    ];
    
    insights.forEach(ins => {
        const card = document.createElement('div');
        card.className = 'insight-card';
        card.innerHTML = `
            <div class="insight-icon-container ${ins.type}">
                <i data-lucide="${ins.icon}"></i>
            </div>
            <div class="insight-info">
                <span class="insight-label">${ins.label}</span>
                <span class="insight-value">${ins.value}</span>
                <span class="insight-text">${ins.text}</span>
            </div>
        `;
        container.appendChild(card);
    });
    
    lucide.createIcons();
}

function calculateOptimalPostingTime() {
    // Map of days and hours
    const cellStats = {};
    for (let d = 0; d < 7; d++) {
        for (let h = 0; h < 24; h++) {
            cellStats[`${d}-${h}`] = { count: 0, erSum: 0 };
        }
    }
    
    filteredPosts.forEach(post => {
        if (!post.timestamp) return;
        const dt = new Date(post.timestamp);
        const adj = getAdjustedDateTime(dt, currentTimezone);
        const key = `${adj.day}-${adj.hour}`;
        if (cellStats[key]) {
            cellStats[key].count++;
            cellStats[key].erSum += post.engagementRate;
        }
    });
    
    let bestKey = null;
    let maxScore = -1;
    
    Object.keys(cellStats).forEach(key => {
        const cell = cellStats[key];
        if (cell.count > 0) {
            // Score combined by density and ER spikes
            const avgEr = cell.erSum / cell.count;
            const score = avgEr * (1 + Math.log2(cell.count + 1));
            if (score > maxScore) {
                maxScore = score;
                bestKey = key;
            }
        }
    });
    
    if (!bestKey) {
        return {
            timeString: 'Varies',
            recommendationText: 'Insufficient timing data. Maintain a steady publishing rhythm.'
        };
    }
    
    const [dayIdx, hour] = bestKey.split('-').map(Number);
    const dayName = dayNames[dayIdx];
    
    // Formatting hour labels
    const startHour = `${hour % 12 || 12} ${hour >= 12 ? 'PM' : 'AM'}`;
    const endHour = `${(hour + 1) % 12 || 12} ${(hour + 1) >= 12 ? 'PM' : 'AM'}`;
    const timeString = `${dayName} at ${startHour}`;
    
    // Compute comparison with average
    const cell = cellStats[bestKey];
    const cellEr = cell.erSum / cell.count;
    const globalAvg = filteredSummary.averageEngagementRate;
    const erMultiplier = globalAvg > 0 ? (cellEr / globalAvg).toFixed(1) : '1.0';
    
    const creatorText = selectedCreator !== 'all' ? `@${selectedCreator}` : 'this group';
    
    return {
        timeString: timeString,
        recommendationText: `Posting at this hour generates ${erMultiplier}x higher engagement rates than the average post for ${creatorText}.`
    };
}

function calculateOptimalFormat() {
    const formats = {};
    filteredPosts.forEach(p => {
        const type = p.type;
        if (!formats[type]) formats[type] = { count: 0, erSum: 0 };
        formats[type].count++;
        formats[type].erSum += p.engagementRate;
    });
    
    let bestFormat = null;
    let maxEr = -1;
    
    Object.keys(formats).forEach(f => {
        const avgEr = formats[f].erSum / formats[f].count;
        if (avgEr > maxEr) {
            maxEr = avgEr;
            bestFormat = f;
        }
    });
    
    if (!bestFormat) {
        return {
            formatType: 'None',
            recommendationText: 'No post formats found in selection.'
        };
    }
    
    const formatNameMap = { 'Video': 'Video (Reel)', 'Image': 'Static Image', 'Sidecar': 'Carousel' };
    const friendlyName = formatNameMap[bestFormat] || bestFormat;
    
    // Calculate ratio compared to others
    const others = Object.keys(formats).filter(f => f !== bestFormat);
    let comparisonText = '';
    if (others.length > 0) {
        const nextBest = others.sort((a,b) => (formats[b].erSum/formats[b].count) - (formats[a].erSum/formats[a].count))[0];
        const nextBestEr = formats[nextBest].erSum / formats[nextBest].count;
        if (nextBestEr > 0) {
            const multiplier = (maxEr / nextBestEr).toFixed(1);
            comparisonText = `outperforming ${formatNameMap[nextBest] || nextBest} by ${multiplier}x.`;
        }
    } else {
        comparisonText = `achieving a healthy ${maxEr.toFixed(2)}% engagement rate.`;
    }
    
    return {
        formatType: friendlyName,
        recommendationText: `Prioritize publishing ${friendlyName} formats, ${comparisonText}`
    };
}

function calculateOptimalHashtag() {
    const hashtags = {};
    filteredPosts.forEach(post => {
        if (!post.caption) return;
        const words = post.caption.toLowerCase().match(/#\w+/g);
        if (words) {
            words.forEach(tag => {
                if (!hashtags[tag]) hashtags[tag] = { count: 0, erSum: 0 };
                hashtags[tag].count++;
                hashtags[tag].erSum += post.engagementRate;
            });
        }
    });
    
    // Filter to hashtags used at least twice to avoid statistical outliers
    const minUsage = filteredPosts.length > 15 ? 2 : 1;
    
    let bestTag = null;
    let maxEr = -1;
    
    Object.keys(hashtags).forEach(tag => {
        if (hashtags[tag].count >= minUsage) {
            const avgEr = hashtags[tag].erSum / hashtags[tag].count;
            if (avgEr > maxEr) {
                maxEr = avgEr;
                bestTag = tag;
            }
        }
    });
    
    if (!bestTag) {
        // Find single use fallback
        Object.keys(hashtags).forEach(tag => {
            const avgEr = hashtags[tag].erSum / hashtags[tag].count;
            if (avgEr > maxEr) {
                maxEr = avgEr;
                bestTag = tag;
            }
        });
    }
    
    if (!bestTag) {
        return {
            hashtag: 'None',
            recommendationText: 'No hashtags parsed in captions. Incorporate standard niches tags.'
        };
    }
    
    const count = hashtags[bestTag].count;
    return {
        hashtag: bestTag,
        recommendationText: `Posts incorporating ${bestTag} averaged ${maxEr.toFixed(2)}% engagement rate (used ${count} times).`
    };
}

// ==========================================================================
// Dashboard Tab Renderers
// ==========================================================================

function refreshActiveView() {
    switch (activeTab) {
        case 'overview':
            renderOverviewTab();
            break;
        case 'creators':
            renderCreatorsTab();
            break;
        case 'engagement':
            renderEngagementTab();
            break;
        case 'posts':
            filterAndRenderPosts();
            break;
    }
}

function renderOverviewTab() {
    renderFollowersChart();
    renderEngagementChart();
    renderContentTypeChart();
    
    // Creators leaderboards by ER (based on filtered active posts)
    const list = document.getElementById('top-creators-list');
    list.innerHTML = '';
    
    // Calculate active creator statistics
    const creatorStats = {};
    filteredPosts.forEach(p => {
        const username = p.ownerUsername;
        if (!creatorStats[username]) {
            creatorStats[username] = { likes: 0, comments: 0, count: 0 };
        }
        creatorStats[username].likes += p.likesCount;
        creatorStats[username].comments += p.commentsCount;
        creatorStats[username].count++;
    });
    
    const comparedCreators = [];
    rawDashboardData.creators.forEach(c => {
        const stats = creatorStats[c.username];
        if (stats) {
            const avgEr = (stats.likes + stats.comments) / stats.count / c.followersCount * 100;
            comparedCreators.push({
                ...c,
                avgEr: avgEr,
                scrapedCount: stats.count
            });
        }
    });
    
    comparedCreators.sort((a,b) => b.avgEr - a.avgEr);
    
    if (comparedCreators.length === 0) {
        list.innerHTML = '<div style="color:var(--text-muted); font-size:0.82rem; padding: 16px 0; text-align:center;">No active creators.</div>';
        return;
    }
    
    comparedCreators.slice(0, 5).forEach(c => {
        const item = document.createElement('div');
        item.className = 'summary-item';
        item.onclick = () => openCreatorDrawer(c.username);
        
        const avatar = c.profilePicUrl || 'https://images.unsplash.com/photo-1511367461989-f85a21fda167?w=150&auto=format&fit=crop&q=60';
        
        item.innerHTML = `
            <div class="summary-user">
                <img src="${avatar}" alt="${c.username}" class="summary-avatar" onerror="this.src='https://images.unsplash.com/photo-1511367461989-f85a21fda167?w=150&auto=format&fit=crop&q=60'">
                <div class="summary-user-info">
                    <span class="username">@${c.username}</span>
                    <span class="followers">${formatLargeNumber(c.followersCount)} followers</span>
                </div>
            </div>
            <div class="summary-metric">
                <span class="val">${c.avgEr.toFixed(2)}%</span>
                <div class="lbl">Avg ER</div>
            </div>
        `;
        list.appendChild(item);
    });
}

function renderCreatorsTab() {
    const grid = document.getElementById('creators-card-grid');
    grid.innerHTML = '';
    
    // Compute metrics for the active selection
    const creatorPostsCount = {};
    const creatorErMap = {};
    
    rawDashboardData.creators.forEach(c => {
        const posts = filteredPosts.filter(p => p.ownerUsername === c.username);
        creatorPostsCount[c.username] = posts.length;
        
        let likes = 0;
        let comments = 0;
        posts.forEach(p => {
            likes += p.likesCount;
            comments += p.commentsCount;
        });
        
        creatorErMap[c.username] = posts.length > 0 ? ((likes + comments) / posts.length / c.followersCount * 100) : 0;
    });
    
    rawDashboardData.creators.forEach(c => {
        const card = document.createElement('div');
        card.className = 'creator-profile-card';
        card.onclick = () => {
            // Set global filter creator
            selectedCreator = c.username;
            document.getElementById('filter-global-creator').value = c.username;
            applyGlobalFilters();
            // Go to overview
            switchTab('overview');
        };
        
        const avatar = c.profilePicUrl || 'https://images.unsplash.com/photo-1511367461989-f85a21fda167?w=150&auto=format&fit=crop&q=60';
        
        let verifiedBadge = c.verified ? '<span class="card-verified-badge"><i data-lucide="badge-check"></i></span>' : '';
        let count = creatorPostsCount[c.username];
        let er = creatorErMap[c.username];
        
        card.innerHTML = `
            ${verifiedBadge}
            <div class="card-avatar-wrapper">
                <img src="${avatar}" alt="${c.username}" class="card-avatar" onerror="this.src='https://images.unsplash.com/photo-1511367461989-f85a21fda167?w=150&auto=format&fit=crop&q=60'">
            </div>
            <div class="card-name-info">
                <h4>${c.fullName || c.username}</h4>
                <div class="username">@${c.username}</div>
            </div>
            <div class="card-bio">${c.biography || 'No biography details.'}</div>
            <div class="card-stats-row">
                <div class="card-stat">
                    <span class="val">${formatLargeNumber(c.followersCount)}</span>
                    <span class="lbl">Followers</span>
                </div>
                <div class="card-stat">
                    <span class="val">${count}</span>
                    <span class="lbl">Posts</span>
                </div>
                <div class="card-stat">
                    <span class="val">${er.toFixed(2)}%</span>
                    <span class="lbl">Avg ER</span>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
    
    lucide.createIcons();
}

function renderEngagementTab() {
    renderTimelineChart();
    renderHeatmapMatrix();
    renderHashtagsPerformanceTable();
}

// ==========================================================================
// Upgraded Analytics Component Renders
// ==========================================================================

function setupTimezoneToggle() {
    const tzSelect = document.getElementById('timezone-select');
    tzSelect.addEventListener('change', () => {
        currentTimezone = tzSelect.value;
        // Re-render components dependent on timing calculations
        renderHeatmapMatrix();
        renderInsightsBanner();
    });
}

function getAdjustedDateTime(dateObj, timezone) {
    if (timezone === 'UTC') {
        return {
            hour: dateObj.getUTCHours(),
            day: (dateObj.getUTCDay() + 6) % 7 // Convert Sunday=0 -> 6, Monday=1 -> 0
        };
    } else if (timezone === 'local') {
        return {
            hour: dateObj.getHours(),
            day: (dateObj.getDay() + 6) % 7
        };
    } else {
        try {
            // Native timezone converter
            const formatterH = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hour12: false });
            const formatterD = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' });
            
            const hourVal = parseInt(formatterH.format(dateObj)) % 24;
            const dayStr = formatterD.format(dateObj);
            
            const dayMap = { 'Mon': 0, 'Tue': 1, 'Wed': 2, 'Thu': 3, 'Fri': 4, 'Sat': 5, 'Sun': 6 };
            const dayIndex = dayMap[dayStr] !== undefined ? dayMap[dayStr] : (dateObj.getDay() + 6) % 7;
            
            return { hour: hourVal, day: dayIndex };
        } catch (e) {
            console.error("Timezone format conversion error, fallback to local:", e);
            return { hour: dateObj.getHours(), day: (dateObj.getDay() + 6) % 7 };
        }
    }
}

function renderHeatmapMatrix() {
    const grid = document.getElementById('heatmap-grid');
    grid.innerHTML = '';
    
    // 1. Initialize Cell structures
    const cellsData = {};
    for (let d = 0; d < 7; d++) {
        for (let h = 0; h < 24; h++) {
            cellsData[`${d}-${h}`] = { posts: [], count: 0, erSum: 0 };
        }
    }
    
    // 2. Map Posts to timezone cells
    filteredPosts.forEach(post => {
        if (!post.timestamp) return;
        const dt = new Date(post.timestamp);
        const adj = getAdjustedDateTime(dt, currentTimezone);
        
        const key = `${adj.day}-${adj.hour}`;
        if (cellsData[key]) {
            cellsData[key].posts.push(post);
            cellsData[key].count++;
            cellsData[key].erSum += post.engagementRate;
        }
    });
    
    // 3. Find thresholds for intensity coloring
    const cellCounts = Object.values(cellsData).map(c => c.count);
    const maxCount = Math.max(...cellCounts, 1);
    
    const cellErs = Object.values(cellsData).map(c => c.count > 0 ? (c.erSum / c.count) : 0);
    const maxEr = Math.max(...cellErs, 0.001);
    
    // 4. Render Hours header row
    const headerRow = document.createElement('div');
    headerRow.className = 'heatmap-row hours-header';
    headerRow.innerHTML = '<div class="heatmap-day-label"></div>';
    
    const cellHeaderContainer = document.createElement('div');
    cellHeaderContainer.className = 'heatmap-cells-container';
    
    for (let h = 0; h < 24; h++) {
        const hourLabel = document.createElement('div');
        hourLabel.className = 'heatmap-hour-label';
        hourLabel.textContent = `${h.toString().padStart(2, '0')}h`;
        cellHeaderContainer.appendChild(hourLabel);
    }
    headerRow.appendChild(cellHeaderContainer);
    grid.appendChild(headerRow);
    
    // 5. Render Day Rows
    for (let d = 0; d < 7; d++) {
        const row = document.createElement('div');
        row.className = 'heatmap-row';
        
        const dayLabel = document.createElement('div');
        dayLabel.className = 'heatmap-day-label';
        dayLabel.textContent = dayNames[d].substring(0, 3); // Mon, Tue, etc.
        row.appendChild(dayLabel);
        
        const cellsContainer = document.createElement('div');
        cellsContainer.className = 'heatmap-cells-container';
        
        for (let h = 0; h < 24; h++) {
            const cell = document.createElement('div');
            const dataKey = `${d}-${h}`;
            const cellStats = cellsData[dataKey];
            
            // Weight scale calculations (0 to 4)
            let weight = 0;
            if (cellStats.count > 0) {
                const avgEr = cellStats.erSum / cellStats.count;
                // High density OR high relative engagement rate spikes
                if (cellStats.count >= 8 || avgEr >= (maxEr * 0.75)) {
                    weight = 4;
                } else if (cellStats.count >= 5 || avgEr >= (maxEr * 0.5)) {
                    weight = 3;
                } else if (cellStats.count >= 3 || avgEr >= (maxEr * 0.25)) {
                    weight = 2;
                } else {
                    weight = 1;
                }
            }
            
            cell.className = `heatmap-cell w-${weight}`;
            
            // Tooltip events
            cell.addEventListener('mouseenter', (e) => {
                showHeatmapTooltip(e, d, h, cellStats);
            });
            cell.addEventListener('mousemove', (e) => {
                positionHeatmapTooltip(e);
            });
            cell.addEventListener('mouseleave', () => {
                hideHeatmapTooltip();
            });
            
            cell.addEventListener('click', () => {
                // Focus table on posts matching this hour and day
                document.getElementById('posts-search').value = '';
                switchTab('posts');
                
                // Perform filtering in Posts table for this specific cell
                filterPostsByHeatmapCell(d, h);
            });
            
            cellsContainer.appendChild(cell);
        }
        
        row.appendChild(cellsContainer);
        grid.appendChild(row);
    }
}

// Tooltip Overlay Controls
function showHeatmapTooltip(e, dayIdx, hour, stats) {
    const tooltip = document.getElementById('heatmap-tooltip');
    const dayName = dayNames[dayIdx];
    const hourLabelStr = `${hour % 12 || 12}:00 ${hour >= 12 ? 'PM' : 'AM'} - ${(hour + 1) % 12 || 12}:00 ${(hour + 1) >= 12 ? 'PM' : 'AM'}`;
    
    const count = stats.count;
    const avgEr = count > 0 ? (stats.erSum / count).toFixed(2) : '0.00';
    const tzLabel = timezoneNames[currentTimezone] || currentTimezone;
    
    tooltip.innerHTML = `
        <div class="tooltip-header">${dayName} | ${hourLabelStr}</div>
        <div class="tooltip-row">
            <span class="lbl">Posts density:</span>
            <span class="val">${count} ${count === 1 ? 'post' : 'posts'}</span>
        </div>
        <div class="tooltip-row">
            <span class="lbl">Avg Engagement:</span>
            <span class="val">${avgEr}%</span>
        </div>
        <div class="tooltip-row" style="font-size:0.6rem; color:var(--text-muted); margin-top:2px;">
            <span>Display offset: ${tzLabel}</span>
        </div>
    `;
    
    tooltip.style.opacity = '1';
    positionHeatmapTooltip(e);
}

function positionHeatmapTooltip(e) {
    const tooltip = document.getElementById('heatmap-tooltip');
    
    // Position slightly offset from cursor, within window bounds
    let x = e.clientX + 14;
    let y = e.clientY + 14;
    
    const width = tooltip.offsetWidth;
    const height = tooltip.offsetHeight;
    
    if (x + width > window.innerWidth) {
        x = e.clientX - width - 14;
    }
    if (y + height > window.innerHeight) {
        y = e.clientY - height - 14;
    }
    
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
}

function hideHeatmapTooltip() {
    const tooltip = document.getElementById('heatmap-tooltip');
    tooltip.style.opacity = '0';
}

function filterPostsByHeatmapCell(dayIdx, hour) {
    // Modify Posts search inputs
    const creatorSelect = document.getElementById('filter-creator');
    creatorSelect.value = selectedCreator;
    
    const tbody = document.getElementById('posts-table-body');
    tbody.innerHTML = '';
    
    // Filter matching posts (using adjusted day and hour)
    const matchingPosts = filteredPosts.filter(p => {
        if (!p.timestamp) return false;
        const dt = new Date(p.timestamp);
        const adj = getAdjustedDateTime(dt, currentTimezone);
        return adj.day === dayIdx && adj.hour === hour;
    });
    
    // Render list
    if (matchingPosts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 32px 0;">No posts in this cell.</td></tr>';
        document.getElementById('posts-pagination').innerHTML = '';
        return;
    }
    
    matchingPosts.forEach(p => {
        const tr = document.createElement('tr');
        let dateDisplay = p.timestamp ? new Date(p.timestamp).toLocaleDateString() : 'Unknown';
        let tagClass = p.type === 'Video' ? 'video' : p.type === 'Sidecar' ? 'carousel' : 'image';
        
        const creatorObj = rawDashboardData.creators.find(c => c.username === p.ownerUsername);
        const avatar = creatorObj ? creatorObj.profilePicUrl : '';
        const thumbUrl = p.displayUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&auto=format&fit=crop&q=60';
        
        tr.innerHTML = `
            <td>
                <div class="table-creator-cell" onclick="openCreatorDrawer('${p.ownerUsername}')" style="cursor:pointer;">
                    <img src="${avatar}" class="table-creator-avatar" onerror="this.src='https://images.unsplash.com/photo-1511367461989-f85a21fda167?w=50&auto=format&fit=crop&q=60'">
                    <span class="table-creator-name">@${p.ownerUsername}</span>
                </div>
            </td>
            <td>
                <div class="table-preview-cell">
                    <img src="${thumbUrl}" class="table-thumbnail" onerror="this.src='https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&auto=format&fit=crop&q=60'">
                    <span class="table-caption-text" title="${p.caption || ''}">${p.caption || 'No caption.'}</span>
                </div>
            </td>
            <td><span class="format-tag ${tagClass}">${p.type}</span></td>
            <td class="likes-count">${p.likesCount.toLocaleString()}</td>
            <td class="comments-count">${p.commentsCount.toLocaleString()}</td>
            <td><span class="er-badge">${p.engagementRate.toFixed(2)}%</span></td>
            <td>${dateDisplay}</td>
            <td>
                <a href="${p.url || '#'}" target="_blank" class="table-link-btn"><i data-lucide="external-link"></i></a>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    // Clear pagination controls for direct filtering view
    document.getElementById('posts-pagination').innerHTML = `
        <div class="pagination-info">Showing cell specific results (<b>${matchingPosts.length}</b> posts found)</div>
        <div class="pagination-controls">
            <button class="page-btn" onclick="applyGlobalFilters(); switchTab('posts');">Show All Posts</button>
        </div>
    `;
    lucide.createIcons();
}

function renderHashtagsPerformanceTable() {
    const tbody = document.getElementById('hashtag-performance-body');
    tbody.innerHTML = '';
    
    const hashtags = {};
    filteredPosts.forEach(post => {
        if (!post.caption) return;
        const tags = post.caption.toLowerCase().match(/#\w+/g);
        if (tags) {
            tags.forEach(tag => {
                if (!hashtags[tag]) hashtags[tag] = { count: 0, erSum: 0 };
                hashtags[tag].count++;
                hashtags[tag].erSum += post.engagementRate;
            });
        }
    });
    
    const dataList = Object.keys(hashtags).map(tag => {
        const stats = hashtags[tag];
        return {
            name: tag,
            count: stats.count,
            avgEr: stats.erSum / stats.count
        };
    });
    
    // Sort by count (frequency) descending
    dataList.sort((a,b) => b.count - a.count);
    const topTags = dataList.slice(0, 10);
    
    if (topTags.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--text-muted); padding: 32px 0;">No hashtags parsed in selection.</td></tr>';
        return;
    }
    
    // Find maximums to normalize bar widths
    const maxCount = Math.max(...topTags.map(t => t.count), 1);
    const maxEr = Math.max(...topTags.map(t => t.avgEr), 0.001);
    
    topTags.forEach(tag => {
        const tr = document.createElement('tr');
        
        // Percentages for bars
        const freqPct = (tag.count / maxCount) * 100;
        const erPct = (tag.avgEr / maxEr) * 100;
        
        tr.innerHTML = `
            <td class="hashtag-name-cell">${tag.name}</td>
            <td>
                <div class="hashtag-bar-container">
                    <div class="hashtag-bar-wrapper">
                        <div class="hashtag-bar">
                            <div class="hashtag-bar-fill frequency" style="width: ${freqPct}%"></div>
                        </div>
                        <span class="val">${tag.count}</span>
                    </div>
                </div>
            </td>
            <td>
                <div class="hashtag-bar-container">
                    <div class="hashtag-bar-wrapper">
                        <div class="hashtag-bar">
                            <div class="hashtag-bar-fill engagement" style="width: ${erPct}%"></div>
                        </div>
                        <span class="val">${tag.avgEr.toFixed(2)}%</span>
                    </div>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ==========================================================================
// Chart.js Visualizations (Upgraded with Filter Support)
// ==========================================================================

function getChartColors() {
    const isDark = activeTheme === 'dark';
    return {
        text: isDark ? '#9ca3af' : '#475569',
        grid: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
        accent1: '#8b5cf6',
        accent2: '#ec4899',
    };
}

function destroyChart(name) {
    if (charts[name]) {
        charts[name].destroy();
        delete charts[name];
    }
}

function renderFollowersChart() {
    destroyChart('followers');
    const ctx = document.getElementById('followersChart').getContext('2d');
    
    let activeCreators = [];
    if (selectedCreator !== 'all') {
        activeCreators = rawDashboardData.creators.filter(c => c.username === selectedCreator);
    } else {
        // If "All", find creators who have posts in the filtered list
        const activeUsernames = new Set(filteredPosts.map(p => p.ownerUsername));
        activeCreators = rawDashboardData.creators.filter(c => activeUsernames.has(c.username));
        if (activeCreators.length === 0) activeCreators = rawDashboardData.creators;
    }
    
    // Sort creators by followers count
    const sorted = [...activeCreators].sort((a,b) => b.followersCount - a.followersCount);
    
    const labels = sorted.map(c => c.username);
    const datasetData = sorted.map(c => c.followersCount);
    const colors = getChartColors();
    
    charts.followers = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Followers Count',
                data: datasetData,
                backgroundColor: colors.accent1,
                borderColor: colors.accent1,
                borderRadius: 8,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    padding: 10,
                    callbacks: {
                        label: function(context) {
                            return `Followers: ${context.parsed.y.toLocaleString()}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: colors.text }
                },
                y: {
                    grid: { color: colors.grid },
                    ticks: {
                        color: colors.text,
                        callback: function(value) {
                            return formatLargeNumber(value);
                        }
                    }
                }
            }
        }
    });
}

function renderEngagementChart() {
    destroyChart('engagement');
    const ctx = document.getElementById('engagementChart').getContext('2d');
    
    // Calculate ER per active creator
    const creatorStats = {};
    filteredPosts.forEach(p => {
        const username = p.ownerUsername;
        if (!creatorStats[username]) {
            creatorStats[username] = { likes: 0, comments: 0, count: 0 };
        }
        creatorStats[username].likes += p.likesCount;
        creatorStats[username].comments += p.commentsCount;
        creatorStats[username].count++;
    });
    
    const compared = [];
    rawDashboardData.creators.forEach(c => {
        const stats = creatorStats[c.username];
        if (stats) {
            const avgEr = (stats.likes + stats.comments) / stats.count / c.followersCount * 100;
            compared.push({ username: c.username, er: avgEr });
        }
    });
    
    compared.sort((a,b) => b.er - a.er);
    
    const labels = compared.map(c => c.username);
    const datasetData = compared.map(c => c.er);
    const colors = getChartColors();
    
    charts.engagement = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Engagement Rate %',
                data: datasetData,
                backgroundColor: colors.accent2,
                borderColor: colors.accent2,
                borderRadius: 8,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    padding: 10,
                    callbacks: {
                        label: function(context) {
                            return `Engagement Rate: ${context.parsed.y.toFixed(2)}%`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: colors.text }
                },
                y: {
                    grid: { color: colors.grid },
                    ticks: {
                        color: colors.text,
                        callback: function(value) {
                            return value + '%';
                        }
                    }
                }
            }
        }
    });
}

function renderContentTypeChart() {
    destroyChart('contentType');
    const ctx = document.getElementById('contentTypeChart').getContext('2d');
    
    const formats = {};
    filteredPosts.forEach(p => {
        const type = p.type;
        formats[type] = (formats[type] || 0) + 1;
    });
    
    const labels = Object.keys(formats);
    const datasetData = Object.values(formats);
    const colors = getChartColors();
    
    const formatLabelsMap = { 'Video': 'Video (Reels)', 'Image': 'Static Images', 'Sidecar': 'Carousels' };
    const friendlyLabels = labels.map(l => formatLabelsMap[l] || l);
    
    charts.contentType = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: friendlyLabels,
            datasets: [{
                data: datasetData,
                backgroundColor: [colors.accent1, colors.accent2, '#3b82f6', '#10b981'],
                borderWidth: 2,
                borderColor: activeTheme === 'dark' ? '#161621' : '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: colors.text,
                        padding: 12,
                        font: { size: 10 }
                    }
                }
            }
        }
    });
}

function renderTimelineChart() {
    destroyChart('timeline');
    const ctx = document.getElementById('timelineChart').getContext('2d');
    
    // Group filtered posts by date
    const dateStats = {};
    filteredPosts.forEach(post => {
        if (!post.timestamp) return;
        const dateStr = post.timestamp.split('T')[0];
        if (!dateStats[dateStr]) {
            dateStats[dateStr] = { erSum: 0, count: 0 };
        }
        dateStats[dateStr].erSum += post.engagementRate;
        dateStats[dateStr].count++;
    });
    
    const sortedDates = Object.keys(dateStats).sort();
    const datasetData = sortedDates.map(d => dateStats[d].erSum / dateStats[d].count);
    const colors = getChartColors();
    
    charts.timeline = new Chart(ctx, {
        type: 'line',
        data: {
            labels: sortedDates,
            datasets: [{
                label: 'Average Engagement Rate %',
                data: datasetData,
                borderColor: colors.accent1,
                backgroundColor: 'rgba(139, 92, 246, 0.08)',
                fill: true,
                tension: 0.3,
                borderWidth: 3,
                pointBackgroundColor: colors.accent1,
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: colors.text, font: { size: 9 } }
                },
                y: {
                    grid: { color: colors.grid },
                    ticks: {
                        color: colors.text,
                        callback: function(value) {
                            return value.toFixed(1) + '%';
                        }
                    }
                }
            }
        }
    });
}

// ==========================================================================
// Posts Viewer rendering (Supports sync with Global Filters)
// ==========================================================================

function renderPostsTab() {
    filterAndRenderPosts();
}

function filterAndRenderPosts() {
    const query = document.getElementById('posts-search').value.toLowerCase().trim();
    
    // Filter Posts: First apply the global filters, then local searches
    let filtered = [...filteredPosts];
    
    if (query) {
        filtered = filtered.filter(p => 
            (p.caption && p.caption.toLowerCase().includes(query)) ||
            (p.ownerUsername && p.ownerUsername.toLowerCase().includes(query)) ||
            (p.ownerFullName && p.ownerFullName.toLowerCase().includes(query))
        );
    }
    
    // Sort
    const sortVal = document.getElementById('sort-posts').value;
    const [sortField, sortOrder] = sortVal.split('-');
    
    filtered.sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];
        
        if (sortField === 'timestamp') {
            valA = valA ? new Date(valA).getTime() : 0;
            valB = valB ? new Date(valB).getTime() : 0;
        }
        
        if (valA === undefined || valA === null) return 1;
        if (valB === undefined || valB === null) return -1;
        
        if (sortOrder === 'desc') {
            return valB > valA ? 1 : valB < valA ? -1 : 0;
        } else {
            return valA > valB ? 1 : valA < valB ? -1 : 0;
        }
    });
    
    // Slice for Pagination
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / postsPerPage) || 1;
    
    if (currentPostsPage > totalPages) currentPostsPage = totalPages;
    
    const startIndex = (currentPostsPage - 1) * postsPerPage;
    const pageItems = filtered.slice(startIndex, startIndex + postsPerPage);
    
    const tbody = document.getElementById('posts-table-body');
    tbody.innerHTML = '';
    
    if (pageItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 32px 0;">No posts matched active filters.</td></tr>';
        document.getElementById('posts-pagination').innerHTML = '';
        return;
    }
    
    pageItems.forEach(p => {
        const tr = document.createElement('tr');
        
        let dateDisplay = 'Unknown';
        if (p.timestamp) {
            try {
                dateDisplay = new Date(p.timestamp).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                });
            } catch (_) {}
        }
        
        let tagClass = p.type === 'Video' ? 'video' : p.type === 'Sidecar' ? 'carousel' : 'image';
        
        const creatorObj = rawDashboardData.creators.find(c => c.username === p.ownerUsername);
        const avatar = creatorObj ? creatorObj.profilePicUrl : '';
        const thumbUrl = p.displayUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&auto=format&fit=crop&q=60';
        
        tr.innerHTML = `
            <td>
                <div class="table-creator-cell" onclick="openCreatorDrawer('${p.ownerUsername}')" style="cursor:pointer;">
                    <img src="${avatar}" class="table-creator-avatar" onerror="this.src='https://images.unsplash.com/photo-1511367461989-f85a21fda167?w=50&auto=format&fit=crop&q=60'">
                    <span class="table-creator-name">@${p.ownerUsername}</span>
                </div>
            </td>
            <td>
                <div class="table-preview-cell">
                    <img src="${thumbUrl}" class="table-thumbnail" onerror="this.src='https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&auto=format&fit=crop&q=60'">
                    <span class="table-caption-text" title="${p.caption || ''}">${p.caption || 'No caption.'}</span>
                </div>
            </td>
            <td><span class="format-tag ${tagClass}">${p.type}</span></td>
            <td class="likes-count">${p.likesCount.toLocaleString()}</td>
            <td class="comments-count">${p.commentsCount.toLocaleString()}</td>
            <td><span class="er-badge">${p.engagementRate.toFixed(2)}%</span></td>
            <td>${dateDisplay}</td>
            <td>
                <a href="${p.url || '#'}" target="_blank" class="table-link-btn"><i data-lucide="external-link"></i></a>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    lucide.createIcons();
    renderPagination(totalItems, totalPages);
}

function renderPagination(totalItems, totalPages) {
    const pag = document.getElementById('posts-pagination');
    
    const startRange = (currentPostsPage - 1) * postsPerPage + 1;
    const endRange = Math.min(currentPostsPage * postsPerPage, totalItems);
    
    pag.innerHTML = `
        <div class="pagination-info">
            Showing <b>${startRange}-${endRange}</b> of <b>${totalItems}</b> posts
        </div>
        <div class="pagination-controls">
            <button class="page-btn" id="pagination-prev" ${currentPostsPage === 1 ? 'disabled' : ''}>Prev</button>
            <button class="page-btn active">${currentPostsPage}</button>
            <button class="page-btn" id="pagination-next" ${currentPostsPage === totalPages ? 'disabled' : ''}>Next</button>
        </div>
    `;
    
    document.getElementById('pagination-prev').onclick = () => {
        if (currentPostsPage > 1) {
            currentPostsPage--;
            filterAndRenderPosts();
        }
    };
    
    document.getElementById('pagination-next').onclick = () => {
        if (currentPostsPage < totalPages) {
            currentPostsPage++;
            filterAndRenderPosts();
        }
    };
}

function setupTableControls() {
    // Keep filter listeners in synchronization with Global Filter Bar values
    const search = document.getElementById('posts-search');
    const tableCreator = document.getElementById('filter-creator');
    const tableType = document.getElementById('filter-type');
    const sortPosts = document.getElementById('sort-posts');
    
    const triggerLocalFilter = () => {
        currentPostsPage = 1;
        filterAndRenderPosts();
    };
    
    search.addEventListener('input', triggerLocalFilter);
    sortPosts.addEventListener('change', triggerLocalFilter);
    
    // Sync Creator and Type selects back to global filter bar
    tableCreator.addEventListener('change', () => {
        selectedCreator = tableCreator.value;
        document.getElementById('filter-global-creator').value = selectedCreator;
        applyGlobalFilters();
    });
    
    tableType.addEventListener('change', () => {
        selectedFormat = tableType.value;
        document.getElementById('filter-global-type').value = selectedFormat;
        applyGlobalFilters();
    });
}

// ==========================================================================
// Creator Deep-Dive Drawer
// ==========================================================================

function setupDrawerControls() {
    document.getElementById('close-drawer').onclick = closeCreatorDrawer;
    
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeCreatorDrawer();
    });
    
    const drawer = document.getElementById('creator-drawer');
    drawer.onclick = (e) => {
        if (e.target === drawer) closeCreatorDrawer();
    };
}

function openCreatorDrawer(username) {
    const creator = rawDashboardData.creators.find(c => c.username === username);
    if (!creator) return;
    
    const drawer = document.getElementById('creator-drawer');
    const body = document.getElementById('creator-drawer-body');
    
    // Filter posts for this creator
    const creatorPosts = rawDashboardData.allPosts.filter(p => p.ownerUsername === username);
    
    let postsHtml = '';
    if (creatorPosts.length === 0) {
        postsHtml = '<p style="color:var(--text-muted); font-size:0.85rem; padding: 12px 0;">No posts analyzed for this creator.</p>';
    } else {
        creatorPosts.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        creatorPosts.forEach(p => {
            const thumbUrl = p.displayUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&auto=format&fit=crop&q=60';
            let dateStr = 'Unknown';
            if (p.timestamp) {
                dateStr = new Date(p.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
            }
            
            postsHtml += `
                <div class="drawer-post-item">
                    <img src="${thumbUrl}" class="drawer-post-thumb" onerror="this.src='https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&auto=format&fit=crop&q=60'">
                    <div class="drawer-post-details">
                        <div class="drawer-post-caption" title="${p.caption || ''}">${p.caption || 'No caption.'}</div>
                        <div class="drawer-post-metrics">
                            <span><i data-lucide="thumbs-up" style="width:11px; height:11px;"></i> ${p.likesCount.toLocaleString()}</span>
                            <span><i data-lucide="message-square" style="width:11px; height:11px;"></i> ${p.commentsCount.toLocaleString()}</span>
                            <span class="er">ER: ${p.engagementRate.toFixed(2)}%</span>
                            <span style="margin-left:auto">${dateStr}</span>
                            <a href="${p.url || '#'}" target="_blank" style="color:var(--accent-primary); margin-left:8px;" title="Open link"><i data-lucide="external-link" style="width:11px; height:11px;"></i></a>
                        </div>
                    </div>
                </div>
            `;
        });
    }
    
    const avatar = creator.profilePicUrl || 'https://images.unsplash.com/photo-1511367461989-f85a21fda167?w=150&auto=format&fit=crop&q=60';
    
    let infoBadge = '';
    if (creator.verified) {
        infoBadge = '<i data-lucide="badge-check" style="color:var(--info); fill:currentColor; width:18px; height:18px;"></i>';
    } else if (creator.isBusinessAccount && creator.businessCategoryName) {
        infoBadge = `<span class="category" style="margin-left:8px;">${creator.businessCategoryName}</span>`;
    }
    
    body.innerHTML = `
        <div class="drawer-header">
            <img src="${avatar}" alt="${creator.username}" class="drawer-avatar" onerror="this.src='https://images.unsplash.com/photo-1511367461989-f85a21fda167?w=150&auto=format&fit=crop&q=60'">
            <div class="drawer-title-info">
                <h3>${creator.fullName || creator.username} ${infoBadge}</h3>
                <span class="username">@${creator.username}</span>
                <span class="category">${creator.isBusinessAccount ? 'Business Account' : 'Personal Account'}</span>
            </div>
        </div>
        
        <div class="drawer-bio">${creator.biography || 'No biography details provided.'}</div>
        
        <div class="drawer-stats-grid">
            <div class="drawer-stat-card">
                <span class="val">${formatLargeNumber(creator.followersCount)}</span>
                <div class="lbl">Followers</div>
            </div>
            <div class="drawer-stat-card">
                <span class="val">${creator.scrapedPostsCount}</span>
                <div class="lbl">Scraped Posts</div>
            </div>
            <div class="drawer-stat-card">
                <span class="val">${creator.averageEngagementRate.toFixed(2)}%</span>
                <div class="lbl">Avg Engagement</div>
            </div>
        </div>

        <!-- Circular rating gauges for Creator and Brand indexes -->
        <div class="drawer-scores-wrapper">
            <div class="drawer-score-card">
                <div class="score-circle-container creator">
                    <span class="score-val creator">${creator.creatorScore}</span>
                </div>
                <h5>Creator Score</h5>
                <span>ER & Consistency Index</span>
            </div>
            <div class="drawer-score-card">
                <div class="score-circle-container brand">
                    <span class="score-val brand">${creator.brandScore}</span>
                </div>
                <h5>Brand Score</h5>
                <span>CTA & Integrations Index</span>
            </div>
        </div>

        <!-- Topic Categories & Distributions -->
        <h4 class="drawer-section-title">Content Classification</h4>
        <div class="drawer-caption-stat" style="margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
            <span class="topic-badge ${creator.dominantCategory.toLowerCase()}">${creator.dominantCategory}</span>
            <span style="font-size: 0.75rem; color: var(--text-muted);">Dominant Category</span>
        </div>
        
        <div class="chart-container" style="position: relative; height: 180px; margin-bottom: 24px; padding: 10px;">
            <canvas id="drawer-categories-chart"></canvas>
        </div>

        <!-- Caption styling analysis -->
        <h4 class="drawer-section-title">Caption & Writing Style Analysis</h4>
        <div class="drawer-caption-analysis">
            <div class="drawer-caption-stat">
                <div class="stat-num">${creator.captionMetrics.averageLength}</div>
                <div class="stat-lbl">Avg Characters</div>
            </div>
            <div class="drawer-caption-stat">
                <div class="stat-num">${creator.captionMetrics.averageEmojis}</div>
                <div class="stat-lbl">Emojis Per Post</div>
            </div>
            <div class="drawer-caption-stat">
                <div class="stat-num">${creator.captionMetrics.ctaRate}%</div>
                <div class="stat-lbl">CTA Frequency Rate</div>
            </div>
            <div class="drawer-caption-stat">
                <div class="stat-num">${creator.captionMetrics.questionRate}%</div>
                <div class="stat-lbl">Questions Rate</div>
            </div>
        </div>

        <!-- Soundtracks used -->
        ${creator.audioTracks && creator.audioTracks.length > 0 ? `
            <h4 class="drawer-section-title">Reels & Audio Soundtracks</h4>
            <div class="audio-list">
                ${creator.audioTracks.map(audio => `
                    <div class="audio-item">
                        <i data-lucide="music"></i>
                        <span>${audio}</span>
                    </div>
                `).join('')}
            </div>
        ` : ''}
        
        <h4 class="drawer-section-title">Published Content List</h4>
        <div class="drawer-posts-list">
            ${postsHtml}
        </div>
    `;
    
    drawer.style.display = 'flex';
    lucide.createIcons();

    // Render drawer categories Doughnut chart
    const catsData = creator.categoryDistribution || {};
    const catLabels = Object.keys(catsData).filter(c => catsData[c] > 0);
    const catValues = catLabels.map(c => catsData[c]);

    const ctx = document.getElementById('drawer-categories-chart').getContext('2d');
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: catLabels,
            datasets: [{
                data: catValues,
                backgroundColor: [
                    '#10b981', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', 
                    '#14b8a6', '#ef4444', '#6366f1', '#a855f7', '#6b7280', 
                    '#4b5563', '#9ca3af'
                ],
                borderWidth: 1,
                borderColor: 'var(--border-color)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: 'var(--text-secondary)',
                        font: { size: 9 }
                    }
                }
            }
        }
    });
}

function closeCreatorDrawer() {
    document.getElementById('creator-drawer').style.display = 'none';
}

// ==========================================================================
// Theme Toggles & Sidebar Navigation
// ==========================================================================

function setupTabNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const tabName = item.getAttribute('data-tab');
            switchTab(tabName);
        });
    });
}

function switchTab(tabName) {
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
    });
    
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === `tab-${tabName}`);
    });
    
    activeTab = tabName;
    
    const title = document.getElementById('current-view-title');
    const desc = document.getElementById('current-view-desc');
    
    switch (tabName) {
        case 'overview':
            title.textContent = 'Overview Dashboard';
            desc.textContent = 'High level statistics and comparative analysis';
            break;
        case 'creators':
            title.textContent = 'Creators Matrix';
            desc.textContent = 'Profile profiles details and comparison insights';
            break;
        case 'engagement':
            title.textContent = 'Engagement & Timings';
            desc.textContent = '7x24 Matrix posting heatmap and hashtags analysis';
            break;
        case 'posts':
            title.textContent = 'Posts Table Grid';
            desc.textContent = 'Search, sort, filter, and inspect individual posts';
            setupTableControls();
            break;
        case 'compare':
            title.textContent = 'Competitor Comparison';
            desc.textContent = 'Evaluate multiple creator accounts side-by-side';
            initCompareTab();
            break;
        case 'scrape':
            title.textContent = 'Live Scraper Audit';
            desc.textContent = 'Trigger real-time scrapes using Apify APIs';
            initScraperTab();
            break;
    }
    
    refreshActiveView();
}

function setupThemeToggle() {
    const themeBtn = document.getElementById('theme-switch');
    const sun = document.getElementById('sun-icon');
    const moon = document.getElementById('moon-icon');
    
    themeBtn.addEventListener('click', () => {
        if (activeTheme === 'dark') {
            document.body.classList.remove('dark-theme');
            document.body.classList.add('light-theme');
            sun.style.display = 'none';
            moon.style.display = 'block';
            activeTheme = 'light';
        } else {
            document.body.classList.remove('light-theme');
            document.body.classList.add('dark-theme');
            sun.style.display = 'block';
            moon.style.display = 'none';
            activeTheme = 'dark';
        }
        
        applyGlobalFilters();
    });
}

// ==========================================================================
// File Upload & Drag and Drop Handlers
// ==========================================================================

function setupFileUpload() {
    const input = document.getElementById('file-upload');
    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) handleFile(file);
    });
}

function setupDragAndDrop() {
    const zone = document.getElementById('drag-drop-zone');
    let dragCounter = 0;
    
    window.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dragCounter++;
        zone.classList.add('active');
    });
    
    window.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dragCounter--;
        if (dragCounter === 0) zone.classList.remove('active');
    });
    
    window.addEventListener('dragover', (e) => {
        e.preventDefault();
    });
    
    window.addEventListener('drop', (e) => {
        e.preventDefault();
        dragCounter = 0;
        zone.classList.remove('active');
        
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    });
}

function handleFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['json', 'xlsx', 'xls'].includes(ext)) {
        showToast('error', 'Unsupported file format! Upload a .json or .xlsx file.');
        return;
    }
    
    fetchAnalyticsData('/api/analytics/upload', file.name, file);
}

// ==========================================================================
// Utility functions & Toast Notifications
// ==========================================================================

function formatLargeNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
}

function showToast(type, message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'info';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'alert-triangle';
    
    toast.innerHTML = `
        <i data-lucide="${icon}" style="width: 16px; height: 16px;"></i>
        <span>${message}</span>
    `;
    container.appendChild(toast);
    lucide.createIcons();
    
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s forwards';
        toast.addEventListener('animationend', () => {
            toast.remove();
        });
    }, 4000);
}

// Exit animation stylesheet trigger for toasts
const styleElement = document.createElement('style');
styleElement.innerHTML = `
    @keyframes fadeOut {
        from { opacity: 1; transform: translateX(0); }
        to { opacity: 0; transform: translateX(100%); }
    }
`;
document.head.appendChild(styleElement);

// ==========================================================================
// Live Apify Instagram Scraper Integration Features
// ==========================================================================

function setupScraperTab() {
    const form = document.getElementById('scraper-form');
    const peekBtn = document.getElementById('btn-peek-token');
    const usernamesArea = document.getElementById('scrape-usernames');
    const limitInput = document.getElementById('scrape-posts-limit');
    
    if (!form) return;
    
    // 1. Peek API token toggle
    peekBtn.addEventListener('click', () => {
        const tokenInput = document.getElementById('scrape-api-token');
        const eyeOpen = document.getElementById('peek-eye-open');
        const eyeClosed = document.getElementById('peek-eye-closed');
        
        if (tokenInput.type === 'password') {
            tokenInput.type = 'text';
            eyeOpen.style.display = 'none';
            eyeClosed.style.display = 'block';
        } else {
            tokenInput.type = 'password';
            eyeOpen.style.display = 'block';
            eyeClosed.style.display = 'none';
        }
    });
    
    // 2. Cost estimator calculations
    const onChangeCostParams = () => {
        updateCostEstimate();
    };
    
    usernamesArea.addEventListener('input', onChangeCostParams);
    limitInput.addEventListener('input', onChangeCostParams);
    limitInput.addEventListener('change', onChangeCostParams);
    
    // 3. Handle Scraper Form Submit
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        triggerApifyScrape();
    });
}

function initScraperTab() {
    // Load cached API Token
    const cachedToken = localStorage.getItem('apify_api_token');
    if (cachedToken) {
        document.getElementById('scrape-api-token').value = cachedToken;
    }
    updateCostEstimate();
}

function updateCostEstimate() {
    const usernamesVal = document.getElementById('scrape-usernames').value;
    const limitVal = parseInt(document.getElementById('scrape-posts-limit').value) || 12;
    const costBox = document.getElementById('scrape-cost-estimate').querySelector('span b');
    
    // Parse usernames count
    const usernames = usernamesVal.split(',')
        .map(u => u.trim().replace('@', ''))
        .filter(u => u.length > 0);
        
    const profilesCount = usernames.length;
    
    if (profilesCount === 0) {
        costBox.textContent = '~$0.00 USD';
        return;
    }
    
    // Cost coefficients based on Apify rates supplied:
    // Profiles: ~$1.55 per 1,000 profiles (i.e. $0.00155 per profile)
    // Posts: ~$1.50 per 1,000 posts (i.e. $0.00150 per post)
    const costPerProfile = 0.00155;
    const costPerPost = 0.00150;
    
    const totalPostsToScrape = profilesCount * limitVal;
    const estimatedCost = (profilesCount * costPerProfile) + (totalPostsToScrape * costPerPost);
    
    costBox.textContent = `~$${estimatedCost.toFixed(4)} USD`;
    
    // Add breakdown tooltips
    const countLabel = `${profilesCount} ${profilesCount === 1 ? 'profile' : 'profiles'}`;
    const postsLabel = `${totalPostsToScrape} total posts`;
    document.getElementById('scrape-cost-estimate').setAttribute('title', `Breakdown: ${countLabel} @ $1.55/k + ${postsLabel} @ $1.50/k`);
}

function triggerApifyScrape() {
    const apiToken = document.getElementById('scrape-api-token').value.trim();
    const usernamesVal = document.getElementById('scrape-usernames').value;
    const limit = parseInt(document.getElementById('scrape-posts-limit').value) || 12;
    
    const usernames = usernamesVal.split(',')
        .map(u => u.trim().replace('@', ''))
        .filter(u => u.length > 0);
        
    if (!apiToken) {
        showToast('error', 'Apify API Token is required to launch scraper.');
        return;
    }
    
    if (usernames.length === 0) {
        showToast('error', 'Please enter at least one Instagram handle.');
        return;
    }
    
    // Save Token locally
    localStorage.setItem('apify_api_token', apiToken);
    
    // Show Progress overlay
    const progressOverlay = document.getElementById('scraper-progress');
    const progressBar = document.getElementById('scrape-progress-bar');
    const statusTitle = document.getElementById('scrape-status-title');
    const statusDesc = document.getElementById('scrape-status-desc');
    
    progressOverlay.style.display = 'flex';
    progressBar.style.width = '10%';
    statusTitle.textContent = 'Connecting to Apify';
    statusDesc.textContent = 'Initializing Apify Client and checking compute quota...';
    
    // Progressive progress ticker
    let secondsElapsed = 0;
    const progressInterval = setInterval(() => {
        secondsElapsed++;
        
        if (secondsElapsed <= 4) {
            progressBar.style.width = '20%';
            statusTitle.textContent = 'Spawning Actor';
            statusDesc.textContent = 'Launching instagram-scraper Actor in Apify container...';
        } else if (secondsElapsed <= 12) {
            progressBar.style.width = '40%';
            statusTitle.textContent = 'Bypassing Anti-Bot';
            statusDesc.textContent = 'Navigating Instagram pages via proxy configuration...';
        } else if (secondsElapsed <= 28) {
            progressBar.style.width = '60%';
            statusTitle.textContent = 'Extracting Profiles';
            statusDesc.textContent = `Scraping details for: ${usernames.join(', ')}...`;
        } else if (secondsElapsed <= 55) {
            progressBar.style.width = '80%';
            statusTitle.textContent = 'Downloading Post Data';
            statusDesc.textContent = `Retrieving last ${limit} posts per creator, comments, and reels...`;
        } else if (secondsElapsed > 55) {
            progressBar.style.width = '90%';
            statusTitle.textContent = 'Structuring JSON Schema';
            statusDesc.textContent = 'Aggregating posts list and compiling engagement rates...';
        }
    }, 1000);
    
    // Dispatch request to FastAPI backend
    fetch('/api/analytics/scrape', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            api_token: apiToken,
            usernames: usernames,
            posts_limit: limit
        })
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(err => {
                throw new Error(err.detail || 'Scraping run failed.');
            });
        }
        return response.json();
    })
    .then(data => {
        // Success
        clearInterval(progressInterval);
        progressBar.style.width = '100%';
        statusTitle.textContent = 'Success!';
        statusDesc.textContent = 'InstaPulse metrics compiled. Updating dashboards...';
        
        setTimeout(() => {
            // Cache scraper results in state
            rawDashboardData = data;
            
            // Clear inputs
            document.getElementById('scrape-usernames').value = '';
            
            // Hide progress overlays
            progressOverlay.style.display = 'none';
            
            // Refresh creator dropdown and execute analytics
            populateCreatorDropdowns();
            configureDateInputsBounds();
            
            // Reset active filters
            resetFilterInputs();
            applyGlobalFilters();
            
            // Navigate back to overview page
            switchTab('overview');
            
            showToast('success', `Live scrape complete! Loaded fresh data for: ${usernames.join(', ')}`);
        }, 800);
    })
    .catch(error => {
        clearInterval(progressInterval);
        progressOverlay.style.display = 'none';
        console.error(error);
        showToast('error', error.message || 'Scraper run failed. Check API key and profile handle.');
    });
}

// ==========================================================================
// Upgrades: Competitor Comparison Tab Functions
// ==========================================================================

function setupCompareTab() {
    const selectAllBtn = document.getElementById('btn-compare-select-all');
    const clearAllBtn = document.getElementById('btn-compare-clear-all');
    
    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', () => {
            if (!rawDashboardData || !rawDashboardData.creators) return;
            selectedCompetitors = rawDashboardData.creators.map(c => c.username);
            
            document.querySelectorAll('.compare-selection-item').forEach(item => {
                item.classList.add('selected');
                const cb = item.querySelector('input');
                if (cb) cb.checked = true;
            });
            
            renderCompareDashboard();
        });
    }
    
    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', () => {
            selectedCompetitors = [];
            
            document.querySelectorAll('.compare-selection-item').forEach(item => {
                item.classList.remove('selected');
                const cb = item.querySelector('input');
                if (cb) cb.checked = false;
            });
            
            renderCompareDashboard();
        });
    }
}

function initCompareTab() {
    const grid = document.getElementById('compare-selection-grid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    if (!rawDashboardData || !rawDashboardData.creators || rawDashboardData.creators.length === 0) {
        grid.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem;">No creator profiles loaded in active dataset.</p>';
        return;
    }
    
    // Set default selected competitors (all)
    if (selectedCompetitors.length === 0) {
        selectedCompetitors = rawDashboardData.creators.map(c => c.username);
    }
    
    rawDashboardData.creators.forEach(creator => {
        const isChecked = selectedCompetitors.includes(creator.username);
        const item = document.createElement('label');
        item.className = `compare-selection-item ${isChecked ? 'selected' : ''}`;
        
        item.innerHTML = `
            <input type="checkbox" value="${creator.username}" ${isChecked ? 'checked' : ''}>
            <span>@${creator.username}</span>
        `;
        
        const checkbox = item.querySelector('input');
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                if (!selectedCompetitors.includes(creator.username)) {
                    selectedCompetitors.push(creator.username);
                }
                item.classList.add('selected');
            } else {
                selectedCompetitors = selectedCompetitors.filter(u => u !== creator.username);
                item.classList.remove('selected');
            }
            renderCompareDashboard();
        });
        
        grid.appendChild(item);
    });
    
    renderCompareDashboard();
}

function renderCompareDashboard() {
    const emptyState = document.getElementById('compare-empty-state');
    const contentArea = document.getElementById('compare-content-area');
    
    if (selectedCompetitors.length < 2) {
        emptyState.style.display = 'block';
        contentArea.style.display = 'none';
        return;
    }
    
    emptyState.style.display = 'none';
    contentArea.style.display = 'block';
    
    const selectedCreators = rawDashboardData.creators.filter(c => selectedCompetitors.includes(c.username));
    
    // 1. Headers Columns
    const headersTr = document.getElementById('compare-table-headers');
    headersTr.innerHTML = '<th>Performance Metric</th>';
    selectedCreators.forEach(creator => {
        headersTr.innerHTML += `
            <th style="text-align: center; vertical-align: middle;">
                <div style="display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 4px 10px;">
                    <img src="${creator.profilePicUrl || 'https://images.unsplash.com/photo-1511367461989-f85a21fda167?w=50&auto=format&fit=crop&q=60'}" style="width: 32px; height: 32px; border-radius: 50%; border: 1px solid var(--border-color);" onerror="this.src='https://images.unsplash.com/photo-1511367461989-f85a21fda167?w=50&auto=format&fit=crop&q=60'">
                    <span>@${creator.username}</span>
                </div>
            </th>
        `;
    });
    
    // 2. Metrics Rows Def
    const metricsDef = [
        { key: 'followersCount', label: 'Followers Size', format: val => formatLargeNumber(val), isNumeric: true },
        { key: 'postsCount', label: 'Total Posts (All Time)', format: val => val.toLocaleString(), isNumeric: true },
        { key: 'scrapedPostsCount', label: 'Timeline Audited Posts', format: val => val.toLocaleString(), isNumeric: true },
        { key: 'averageLikes', label: 'Average Post Likes', format: val => val.toLocaleString(), isNumeric: true },
        { key: 'averageComments', label: 'Average Post Comments', format: val => val.toLocaleString(), isNumeric: true },
        { key: 'averageEngagementRate', label: 'Engagement Rate (ER)', format: val => `${val.toFixed(2)}%`, isNumeric: true },
        { key: 'creatorScore', label: 'Influencer Rating Score', format: val => `${val}/100`, isNumeric: true },
        { key: 'brandScore', label: 'Brand Suitability Score', format: val => `${val}/100`, isNumeric: true },
        { key: 'postingFrequency', label: 'Posting Frequency (posts/wk)', format: val => `${val} posts`, isNumeric: true },
        { key: 'postingConsistency', label: 'Posting Consistency', format: val => val, isNumeric: false },
        { key: 'dominantCategory', label: 'Dominant Category', format: val => `<span class="topic-badge ${val.toLowerCase()}">${val}</span>`, isNumeric: false },
        { key: 'topHashtags', label: 'Dominant Hashtags', format: val => (val && val.length > 0) ? val.map(t => t.hashtag).join(' ') : 'None', isNumeric: false }
    ];
    
    const body = document.getElementById('compare-table-body');
    body.innerHTML = '';
    
    metricsDef.forEach(metric => {
        const row = document.createElement('tr');
        row.innerHTML = `<td><b>${metric.label}</b></td>`;
        
        let bestVal = -1;
        if (metric.isNumeric) {
            bestVal = Math.max(...selectedCreators.map(c => c[metric.key] || 0));
        }
        
        selectedCreators.forEach(creator => {
            const rawVal = creator[metric.key];
            const isBest = metric.isNumeric && rawVal === bestVal && bestVal > 0;
            row.innerHTML += `
                <td style="text-align: center;" class="${isBest ? 'best-value' : ''}">
                    ${metric.format(rawVal)}
                </td>
            `;
        });
        
        body.appendChild(row);
    });
    
    renderCompareCharts(selectedCreators);
}

function renderCompareCharts(selectedCreators) {
    const labels = selectedCreators.map(c => `@${c.username}`);
    const followersData = selectedCreators.map(c => c.followersCount);
    const erData = selectedCreators.map(c => c.averageEngagementRate);
    
    if (charts.compareFollowers) charts.compareFollowers.destroy();
    if (charts.compareEr) charts.compareEr.destroy();
    
    const ctxFollowers = document.getElementById('chart-compare-followers').getContext('2d');
    charts.compareFollowers = new Chart(ctxFollowers, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Followers Size',
                data: followersData,
                backgroundColor: 'rgba(139, 92, 246, 0.45)',
                borderColor: 'var(--accent-primary)',
                borderWidth: 1.5,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: 'var(--text-secondary)' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: 'var(--text-secondary)' }
                }
            }
        }
    });
    
    const ctxEr = document.getElementById('chart-compare-er').getContext('2d');
    charts.compareEr = new Chart(ctxEr, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Average Engagement Rate (%)',
                data: erData,
                backgroundColor: 'rgba(236, 72, 153, 0.45)',
                borderColor: 'var(--accent-secondary)',
                borderWidth: 1.5,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: {
                        color: 'var(--text-secondary)',
                        callback: function(value) { return value + '%'; }
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: 'var(--text-secondary)' }
                }
            }
        }
    });
}
