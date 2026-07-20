/**
 * InstaPulse - Frontend Dashboard Logic & Charts
 * Coordinates API calls, handles file uploads, renders DOM components, and runs Chart.js instances.
 */

// Global State
let dashboardData = null;
let activeTab = 'overview';
let activeTheme = 'dark';
let charts = {}; // Dictionary of Chart.js instances

// Table Pagination state
let currentPostsPage = 1;
const postsPerPage = 10;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // 1. Load default data
    fetchAnalyticsData('/api/analytics/default', 'Default Scrape Data');
    
    // 2. Setup Events
    setupTabNavigation();
    setupThemeToggle();
    setupFileUpload();
    setupDragAndDrop();
    setupTableControls();
    setupDrawerControls();
    
    // 3. Initialize Icons
    lucide.createIcons();
});

// ==========================================================================
// API & Data Handlers
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
            throw new Error(errData.detail || 'Failed to process dataset.');
        }
        
        const data = await response.json();
        
        // Update State
        dashboardData = data;
        
        // Update Dataset Active Label
        document.getElementById('active-dataset-name').textContent = sourceName;
        
        // Refresh UI components
        renderDashboard();
        showToast('success', `Successfully analyzed data from ${sourceName}`);
        
    } catch (error) {
        console.error(error);
        showToast('error', error.message || 'An error occurred during parsing.');
    } finally {
        showLoading(false);
    }
}

function showLoading(visible) {
    const loader = document.getElementById('loading-overlay');
    loader.style.display = visible ? 'flex' : 'none';
}

// ==========================================================================
// Dashboard Render Coordinator
// ==========================================================================

function renderDashboard() {
    if (!dashboardData) return;
    
    // 1. KPI Cards
    renderKPIs();
    
    // 2. Update current active view
    refreshActiveView();
    
    // 3. Re-initialize Lucide Icons for dynamic content
    lucide.createIcons();
}

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
            currentPostsPage = 1; // reset page
            renderPostsTab();
            break;
    }
}

// ==========================================================================
// Tab 1: Overview Render Functions
// ==========================================================================

function renderKPIs() {
    const s = dashboardData.summary;
    document.getElementById('kpi-total-creators').textContent = s.totalCreators.toLocaleString();
    document.getElementById('kpi-total-followers').textContent = formatLargeNumber(s.totalFollowers);
    document.getElementById('kpi-posts-scraped').textContent = s.totalScrapedPosts.toLocaleString();
    document.getElementById('kpi-avg-er').textContent = `${s.averageEngagementRate.toFixed(2)}%`;
}

function renderOverviewTab() {
    // 1. Render charts
    renderFollowersChart();
    renderEngagementChart();
    renderContentTypeChart();
    
    // 2. Render creators list sorted by ER
    const creatorsListContainer = document.getElementById('top-creators-list');
    creatorsListContainer.innerHTML = '';
    
    // Sort creators by ER for the overview leaderboard
    const sortedCreators = [...dashboardData.creators].sort((a, b) => b.averageEngagementRate - a.averageEngagementRate);
    
    sortedCreators.slice(0, 5).forEach((creator, index) => {
        const item = document.createElement('div');
        item.className = 'summary-item';
        item.onclick = () => openCreatorDrawer(creator.username);
        
        // Default avatar fallback
        const avatar = creator.profilePicUrl || 'https://images.unsplash.com/photo-1511367461989-f85a21fda167?w=150&auto=format&fit=crop&q=60';
        
        item.innerHTML = `
            <div class="summary-user">
                <img src="${avatar}" alt="${creator.username}" class="summary-avatar" onerror="this.src='https://images.unsplash.com/photo-1511367461989-f85a21fda167?w=150&auto=format&fit=crop&q=60'">
                <div class="summary-user-info">
                    <span class="username">@${creator.username}</span>
                    <span class="followers">${formatLargeNumber(creator.followersCount)} followers</span>
                </div>
            </div>
            <div class="summary-metric">
                <span class="val">${creator.averageEngagementRate.toFixed(2)}%</span>
                <div class="lbl">Avg ER</div>
            </div>
        `;
        creatorsListContainer.appendChild(item);
    });
    
    // 3. Render quick insights/highlights
    const highlightsContainer = document.getElementById('highlights-container');
    highlightsContainer.innerHTML = '';
    
    // Find highest followers
    const maxFollowerCreator = dashboardData.creators[0]; // Already sorted by followers desc
    // Find highest ER
    const maxErCreator = sortedCreators[0];
    // Find most active creator
    const mostActiveCreator = [...dashboardData.creators].sort((a, b) => b.scrapedPostsCount - a.scrapedPostsCount)[0];
    
    const highlights = [
        {
            icon: 'award',
            color: 'success',
            heading: 'Highest Engagement',
            detail: `@${maxErCreator.username} leads with an impressive ${maxErCreator.averageEngagementRate.toFixed(2)}% average engagement rate.`
        },
        {
            icon: 'users',
            color: 'info',
            heading: 'Largest Audience',
            detail: `@${maxFollowerCreator.username} commands the largest reach with ${formatLargeNumber(maxFollowerCreator.followersCount)} followers.`
        },
        {
            icon: 'video',
            color: 'warning',
            heading: 'Most Active',
            detail: `@${mostActiveCreator.username} has the most posts in this batch (${mostActiveCreator.scrapedPostsCount} posts analyzed).`
        }
    ];
    
    highlights.forEach(h => {
        const row = document.createElement('div');
        row.className = 'highlight-row';
        row.innerHTML = `
            <div class="highlight-icon ${h.color}">
                <i data-lucide="${h.icon}"></i>
            </div>
            <div class="highlight-desc">
                <span class="heading">${h.heading}</span>
                <span class="detail">${h.detail}</span>
            </div>
        `;
        highlightsContainer.appendChild(row);
    });
}

// ==========================================================================
// Tab 2: Creators Tab
// ==========================================================================

function renderCreatorsTab() {
    const grid = document.getElementById('creators-card-grid');
    grid.innerHTML = '';
    
    dashboardData.creators.forEach(c => {
        const card = document.createElement('div');
        card.className = 'creator-profile-card';
        card.onclick = () => openCreatorDrawer(c.username);
        
        const avatar = c.profilePicUrl || 'https://images.unsplash.com/photo-1511367461989-f85a21fda167?w=150&auto=format&fit=crop&q=60';
        
        let businessBadge = '';
        if (c.isBusinessAccount && c.businessCategoryName) {
            businessBadge = `<span class="card-verified-badge" style="color:var(--accent-primary);" title="Business: ${c.businessCategoryName}"><i data-lucide="briefcase" style="fill:none; width: 14px; height: 14px;"></i></span>`;
        }
        
        let verifiedBadge = '';
        if (c.verified) {
            verifiedBadge = `
                <span class="card-verified-badge" title="Verified Account">
                    <i data-lucide="badge-check"></i>
                </span>
            `;
        }
        
        card.innerHTML = `
            ${verifiedBadge || businessBadge}
            <div class="card-avatar-wrapper">
                <img src="${avatar}" alt="${c.username}" class="card-avatar" onerror="this.src='https://images.unsplash.com/photo-1511367461989-f85a21fda167?w=150&auto=format&fit=crop&q=60'">
            </div>
            <div class="card-name-info">
                <h4>${c.fullName || c.username}</h4>
                <div class="username">@${c.username}</div>
            </div>
            <div class="card-bio" title="${c.biography || ''}">${c.biography || 'No biography text.'}</div>
            <div class="card-stats-row">
                <div class="card-stat">
                    <span class="val">${formatLargeNumber(c.followersCount)}</span>
                    <span class="lbl">Followers</span>
                </div>
                <div class="card-stat">
                    <span class="val">${c.scrapedPostsCount}</span>
                    <span class="lbl">Posts</span>
                </div>
                <div class="card-stat">
                    <span class="val">${c.averageEngagementRate.toFixed(2)}%</span>
                    <span class="lbl">Avg ER</span>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

// ==========================================================================
// Tab 3: Engagement View Render
// ==========================================================================

function renderEngagementTab() {
    renderHourlyScheduleChart();
    renderDailyScheduleChart();
    renderTimelineChart();
    
    // Hashtags cloud
    const cloud = document.getElementById('hashtag-container');
    cloud.innerHTML = '';
    
    if (dashboardData.topHashtags.length === 0) {
        cloud.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem;">No hashtags detected in captions.</p>';
        return;
    }
    
    dashboardData.topHashtags.forEach(tag => {
        const badge = document.createElement('div');
        badge.className = 'hashtag-badge';
        badge.onclick = (e) => {
            e.stopPropagation();
            // Go to posts tab and search for this hashtag
            document.getElementById('posts-search').value = tag.hashtag;
            switchTab('posts');
            filterAndRenderPosts();
        };
        badge.innerHTML = `
            <span>${tag.hashtag}</span>
            <span class="count">${tag.count}</span>
        `;
        cloud.appendChild(badge);
    });
}

// ==========================================================================
// Tab 4: Posts Viewer Tab
// ==========================================================================

function setupTableControls() {
    const search = document.getElementById('posts-search');
    const filterCreator = document.getElementById('filter-creator');
    const filterType = document.getElementById('filter-type');
    const sortPosts = document.getElementById('sort-posts');
    
    const triggerFilter = () => {
        currentPostsPage = 1;
        filterAndRenderPosts();
    };
    
    search.addEventListener('input', triggerFilter);
    filterCreator.addEventListener('change', triggerFilter);
    filterType.addEventListener('change', triggerFilter);
    sortPosts.addEventListener('change', triggerFilter);
}

function renderPostsTab() {
    // Populate the creators filter option
    const select = document.getElementById('filter-creator');
    const prevValue = select.value;
    select.innerHTML = '<option value="all">All Creators</option>';
    
    dashboardData.creators.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.username;
        opt.textContent = `@${c.username}`;
        select.appendChild(opt);
    });
    
    select.value = prevValue || 'all';
    
    filterAndRenderPosts();
}

function filterAndRenderPosts() {
    const query = document.getElementById('posts-search').value.toLowerCase().trim();
    const creatorFilter = document.getElementById('filter-creator').value;
    const typeFilter = document.getElementById('filter-type').value;
    const sortVal = document.getElementById('sort-posts').value;
    
    let filtered = [...dashboardData.allPosts];
    
    // Apply filters
    if (creatorFilter !== 'all') {
        filtered = filtered.filter(p => p.ownerUsername === creatorFilter);
    }
    if (typeFilter !== 'all') {
        filtered = filtered.filter(p => p.type === typeFilter);
    }
    if (query) {
        filtered = filtered.filter(p => 
            (p.caption && p.caption.toLowerCase().includes(query)) ||
            (p.ownerUsername && p.ownerUsername.toLowerCase().includes(query)) ||
            (p.ownerFullName && p.ownerFullName.toLowerCase().includes(query))
        );
    }
    
    // Apply Sorting
    const [sortField, sortOrder] = sortVal.split('-');
    filtered.sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];
        
        // Handle dates/timestamps
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
    
    // Pagination slicing
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / postsPerPage) || 1;
    
    if (currentPostsPage > totalPages) currentPostsPage = totalPages;
    
    const startIndex = (currentPostsPage - 1) * postsPerPage;
    const pageItems = filtered.slice(startIndex, startIndex + postsPerPage);
    
    // Render Table Rows
    const tbody = document.getElementById('posts-table-body');
    tbody.innerHTML = '';
    
    if (pageItems.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 32px 0;">
                    No posts matched the active search filters.
                </td>
            </tr>
        `;
        document.getElementById('posts-pagination').innerHTML = '';
        return;
    }
    
    pageItems.forEach(p => {
        const tr = document.createElement('tr');
        
        // Format date
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
        
        // Format tag class
        let tagClass = 'image';
        if (p.type === 'Video') tagClass = 'video';
        if (p.type === 'Sidecar') tagClass = 'carousel';
        
        // Creator avatar lookup
        const creatorObj = dashboardData.creators.find(c => c.username === p.ownerUsername);
        const avatar = creatorObj ? creatorObj.profilePicUrl : '';
        
        // Image thumbnail fallback
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
                    <span class="table-caption-text" title="${p.caption || ''}">${p.caption || 'No caption text.'}</span>
                </div>
            </td>
            <td><span class="format-tag ${tagClass}">${p.type}</span></td>
            <td class="likes-count">${p.likesCount.toLocaleString()}</td>
            <td class="comments-count">${p.commentsCount.toLocaleString()}</td>
            <td><span class="er-badge">${p.engagementRate.toFixed(2)}%</span></td>
            <td>${dateDisplay}</td>
            <td>
                <a href="${p.url || '#'}" target="_blank" class="table-link-btn" title="View post on Instagram">
                    <i data-lucide="external-link"></i>
                </a>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    lucide.createIcons();
    
    // Render Pagination Controls
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

// ==========================================================================
// Creator Deep-Dive Drawer
// ==========================================================================

function setupDrawerControls() {
    document.getElementById('close-drawer').onclick = closeCreatorDrawer;
    
    // Close on escape key
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeCreatorDrawer();
        }
    });
    
    // Close on overlay click
    const drawer = document.getElementById('creator-drawer');
    drawer.onclick = (e) => {
        if (e.target === drawer) {
            closeCreatorDrawer();
        }
    };
}

function openCreatorDrawer(username) {
    const creator = dashboardData.creators.find(c => c.username === username);
    if (!creator) return;
    
    const drawer = document.getElementById('creator-drawer');
    const body = document.getElementById('creator-drawer-body');
    
    // Filter posts for this creator
    const creatorPosts = dashboardData.allPosts.filter(p => p.ownerUsername === username);
    
    // Build list of posts
    let postsHtml = '';
    if (creatorPosts.length === 0) {
        postsHtml = '<p style="color:var(--text-muted); font-size:0.85rem; padding: 12px 0;">No posts analyzed for this creator.</p>';
    } else {
        // Sort posts by date for this creator list
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
        
        <h4 class="drawer-section-title">Published Content List</h4>
        <div class="drawer-posts-list">
            ${postsHtml}
        </div>
    `;
    
    drawer.style.display = 'flex';
    lucide.createIcons();
}

function closeCreatorDrawer() {
    document.getElementById('creator-drawer').style.display = 'none';
}

// ==========================================================================
// Chart.js Implementations
// ==========================================================================

function getChartColors() {
    const isDark = activeTheme === 'dark';
    return {
        text: isDark ? '#9ca3af' : '#475569',
        grid: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
        accent1: '#8b5cf6', // Violet
        accent2: '#ec4899', // Pink
    };
}

// Destroy existing chart if it exists
function destroyChart(name) {
    if (charts[name]) {
        charts[name].destroy();
        delete charts[name];
    }
}

function renderFollowersChart() {
    destroyChart('followers');
    const ctx = document.getElementById('followersChart').getContext('2d');
    
    // Sort creators by followers count for clean chart display
    const sorted = [...dashboardData.creators].sort((a,b) => b.followersCount - a.followersCount);
    
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
    
    // Sort creators by ER for clean chart representation
    const sorted = [...dashboardData.creators].sort((a,b) => b.averageEngagementRate - a.averageEngagementRate);
    
    const labels = sorted.map(c => c.username);
    const datasetData = sorted.map(c => c.averageEngagementRate);
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
    
    const labels = dashboardData.contentTypeDistribution.map(d => d.type);
    const datasetData = dashboardData.contentTypeDistribution.map(d => d.count);
    const colors = getChartColors();
    
    charts.contentType = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
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

function renderHourlyScheduleChart() {
    destroyChart('hourlySchedule');
    const ctx = document.getElementById('hourlyScheduleChart').getContext('2d');
    
    const labels = dashboardData.hourlyDistribution.map(d => d.hour);
    const datasetData = dashboardData.hourlyDistribution.map(d => d.count);
    const colors = getChartColors();
    
    charts.hourlySchedule = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Posts Count',
                data: datasetData,
                backgroundColor: colors.accent1,
                borderRadius: 4
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
                    ticks: { color: colors.text, stepSize: 1 }
                }
            }
        }
    });
}

function renderDailyScheduleChart() {
    destroyChart('dailySchedule');
    const ctx = document.getElementById('dailyScheduleChart').getContext('2d');
    
    const labels = dashboardData.dailyDistribution.map(d => d.day);
    const datasetData = dashboardData.dailyDistribution.map(d => d.count);
    const colors = getChartColors();
    
    charts.dailySchedule = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Posts Count',
                data: datasetData,
                backgroundColor: colors.accent2,
                borderRadius: 4
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
                    ticks: { color: colors.text }
                },
                y: {
                    grid: { color: colors.grid },
                    ticks: { color: colors.text, stepSize: 1 }
                }
            }
        }
    });
}

function renderTimelineChart() {
    destroyChart('timeline');
    const ctx = document.getElementById('timelineChart').getContext('2d');
    
    const labels = dashboardData.timeline.map(d => d.date);
    const datasetData = dashboardData.timeline.map(d => d.averageEngagementRate);
    const colors = getChartColors();
    
    charts.timeline = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Average Engagement Rate %',
                data: datasetData,
                borderColor: colors.accent1,
                backgroundColor: 'rgba(139, 92, 246, 0.1)',
                fill: true,
                tension: 0.35,
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
    // Update active class on tab buttons
    document.querySelectorAll('.nav-item').forEach(btn => {
        if (btn.getAttribute('data-tab') === tabName) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    // Toggle active panel viewport
    document.querySelectorAll('.tab-panel').forEach(panel => {
        if (panel.id === `tab-${tabName}`) {
            panel.classList.add('active');
        } else {
            panel.classList.remove('active');
        }
    });
    
    // Update active state
    activeTab = tabName;
    
    // Update Topbar titles
    const title = document.getElementById('current-view-title');
    const desc = document.getElementById('current-view-desc');
    
    switch (tabName) {
        case 'overview':
            title.textContent = 'Overview Dashboard';
            desc.textContent = 'High level statistics and comparative analysis';
            break;
        case 'creators':
            title.textContent = 'Creators Matrix';
            desc.textContent = 'Profile profiles details and deep-dives';
            break;
        case 'engagement':
            title.textContent = 'Engagement & Times';
            desc.textContent = 'Posting schedules, formats share, and hashtags';
            break;
        case 'posts':
            title.textContent = 'Posts Table Grid';
            desc.textContent = 'Search, sort, filter, and inspect individual posts';
            break;
    }
    
    // Render the newly visible tab content
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
        
        // Re-render dashboard to refresh chart themes (grid colors, line colors, etc.)
        renderDashboard();
    });
}

// ==========================================================================
// File Upload Logic
// ==========================================================================

function setupFileUpload() {
    const input = document.getElementById('file-upload');
    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            handleFile(file);
        }
    });
}

function setupDragAndDrop() {
    const main = document.querySelector('.main-content');
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
        if (dragCounter === 0) {
            zone.classList.remove('active');
        }
    });
    
    window.addEventListener('dragover', (e) => {
        e.preventDefault();
    });
    
    window.addEventListener('drop', (e) => {
        e.preventDefault();
        dragCounter = 0;
        zone.classList.remove('active');
        
        const file = e.dataTransfer.files[0];
        if (file) {
            handleFile(file);
        }
    });
}

function handleFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['json', 'xlsx', 'xls'].includes(ext)) {
        showToast('error', 'Unsupported file type! Upload a .json or .xlsx file.');
        return;
    }
    
    fetchAnalyticsData('/api/analytics/upload', file.name, file);
}

// ==========================================================================
// Utilities & Toast Notifications
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
    
    // Remove toast after 4 seconds
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s forwards';
        toast.addEventListener('animationend', () => {
            toast.remove();
        });
    }, 4000);
}

// Keyframe fading support for toast exit
const style = document.createElement('style');
style.innerHTML = `
    @keyframes fadeOut {
        from { opacity: 1; transform: translateX(0); }
        to { opacity: 0; transform: translateX(100%); }
    }
`;
document.head.appendChild(style);
