/**
 * Frontend logic for Civil Service Jobs Tracker Dashboard.
 * Supports multi-facet filtering (location, role type, department, salary scale, grade, working pattern, contract type).
 */

// Application State
const state = {
    page: 1,
    limit: 24,
    total: 0,
    search: '',
    department: '',
    location: '',
    minSalary: '',
    maxSalary: '',
    jobGrade: '',
    roleType: '',
    workingPattern: '',
    contractType: '',
    onlyNewToday: false,
    sortBy: 'first_seen_at',
    sortOrder: 'desc',
    isScraping: false,
    isEnriching: false,
    pollInterval: null,
    enrichPollInterval: null
};

// DOM Elements
const elements = {
    statTotalJobs: document.getElementById('statTotalJobs'),
    statNewToday: document.getElementById('statNewToday'),
    statDepartments: document.getElementById('statDepartments'),
    statLastRunTime: document.getElementById('statLastRunTime'),
    statLastRunMeta: document.getElementById('statLastRunMeta'),
    
    // Top Bar Controls
    searchInput: document.getElementById('searchInput'),
    clearSearchBtn: document.getElementById('clearSearchBtn'),
    sortOrderSelect: document.getElementById('sortOrderSelect'),
    onlyNewTodayCheckbox: document.getElementById('onlyNewTodayCheckbox'),
    
    // Sidebar Filter Accordions
    filterLocationInput: document.getElementById('filterLocationInput'),
    filterRoleSelect: document.getElementById('filterRoleSelect'),
    filterDeptSelect: document.getElementById('filterDeptSelect'),
    filterSalaryMin: document.getElementById('filterSalaryMin'),
    filterSalaryMax: document.getElementById('filterSalaryMax'),
    filterGradeSelect: document.getElementById('filterGradeSelect'),
    filterPatternSelect: document.getElementById('filterPatternSelect'),
    filterContractSelect: document.getElementById('filterContractSelect'),
    
    summaryLocation: document.getElementById('summaryLocation'),
    summaryRole: document.getElementById('summaryRole'),
    summaryDept: document.getElementById('summaryDept'),
    summarySalary: document.getElementById('summarySalary'),
    summaryGrade: document.getElementById('summaryGrade'),
    summaryPattern: document.getElementById('summaryPattern'),
    summaryContract: document.getElementById('summaryContract'),
    
    updateResultsBtn: document.getElementById('updateResultsBtn'),
    resetAllFiltersBtn: document.getElementById('resetAllFiltersBtn'),
    emptyResetBtn: document.getElementById('emptyResetBtn'),
    
    visibleJobsCount: document.getElementById('visibleJobsCount'),
    totalJobsCount: document.getElementById('totalJobsCount'),
    quickTags: document.getElementById('quickTags'),
    
    jobsGrid: document.getElementById('jobsGrid'),
    jobsLoading: document.getElementById('jobsLoadingIndicator'),
    jobsEmpty: document.getElementById('jobsEmptyState'),
    
    prevPageBtn: document.getElementById('prevPageBtn'),
    nextPageBtn: document.getElementById('nextPageBtn'),
    paginationInfo: document.getElementById('paginationInfo'),
    
    logsTableBody: document.getElementById('logsTableBody'),
    
    // Scraper status banner
    statusBanner: document.getElementById('scraperStatusBanner'),
    bannerTitle: document.getElementById('bannerTitle'),
    bannerDetails: document.getElementById('bannerDetails'),
    livePages: document.getElementById('livePages'),
    liveNew: document.getElementById('liveNew'),
    
    // Modals
    scrapeModal: document.getElementById('scrapeModal'),
    triggerScrapeBtn: document.getElementById('triggerScrapeBtn'),
    closeModalBtn: document.getElementById('closeModalBtn'),
    cancelModalBtn: document.getElementById('cancelModalBtn'),
    confirmScrapeBtn: document.getElementById('confirmScrapeBtn'),
    scrapeModeSelect: document.getElementById('scrapeModeSelect'),
    maxPagesInput: document.getElementById('maxPagesInput'),
    
    enrichModal: document.getElementById('enrichModal'),
    enrichBtn: document.getElementById('enrichBtn'),
    closeEnrichModalBtn: document.getElementById('closeEnrichModalBtn'),
    cancelEnrichModalBtn: document.getElementById('cancelEnrichModalBtn'),
    confirmEnrichBtn: document.getElementById('confirmEnrichBtn'),
    enrichLimitInput: document.getElementById('enrichLimitInput'),
    
    themeToggleBtn: document.getElementById('themeToggleBtn')
};

// Utilities
function getTodayIsoPrefix() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    try {
        const d = new Date(dateString);
        if (isNaN(d.getTime())) return dateString;
        return d.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return dateString;
    }
}

function formatSalary(num) {
    if (!num) return '';
    return '£' + Number(num).toLocaleString();
}

function debounce(func, delay = 300) {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func(...args), delay);
    };
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// API Calls
async function fetchStats() {
    try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        
        elements.statTotalJobs.textContent = (data.total_jobs || 0).toLocaleString();
        elements.statNewToday.textContent = (data.new_jobs_today || 0).toLocaleString();
        elements.statDepartments.textContent = (data.departments_count || 0).toLocaleString();
        
        if (data.last_run) {
            elements.statLastRunTime.textContent = formatDate(data.last_run.run_at);
            elements.statLastRunMeta.textContent = `Mode: ${data.last_run.mode} • +${data.last_run.new_jobs_added} (${data.last_run.duration_seconds}s)`;
        } else {
            elements.statLastRunTime.textContent = 'Never';
            elements.statLastRunMeta.textContent = 'No scrape runs yet';
        }
    } catch (err) {
        console.error('Error fetching stats:', err);
    }
}

async function fetchFilterOptions() {
    try {
        const res = await fetch('/api/filters');
        const data = await res.json();

        // Departments
        populateSelect(elements.filterDeptSelect, data.departments, 'All Departments', state.department);
        
        // Roles
        populateSelect(elements.filterRoleSelect, data.role_types, 'All Types of Role', state.roleType);
        
        // Grades
        if (data.job_grades && data.job_grades.length > 0) {
            populateSelect(elements.filterGradeSelect, data.job_grades, 'All Job Grades', state.jobGrade);
        }

        // Patterns
        if (data.working_patterns && data.working_patterns.length > 0) {
            populateSelect(elements.filterPatternSelect, data.working_patterns, 'All Working Patterns', state.workingPattern);
        }

        // Contracts
        if (data.contract_types && data.contract_types.length > 0) {
            populateSelect(elements.filterContractSelect, data.contract_types, 'All Contract Types', state.contractType);
        }
    } catch (err) {
        console.error('Error fetching filter options:', err);
    }
}

function populateSelect(selectElem, items, defaultLabel, currentValue) {
    if (!selectElem || !items) return;
    const current = currentValue || selectElem.value;
    selectElem.innerHTML = `<option value="">${defaultLabel}</option>`;
    items.forEach(item => {
        if (!item) return;
        const opt = document.createElement('option');
        opt.value = item;
        opt.textContent = item;
        if (item === current) opt.selected = true;
        selectElem.appendChild(opt);
    });
}

function updateAccordionSummaries() {
    elements.summaryLocation.textContent = state.location ? state.location : 'Any location';
    elements.summaryRole.textContent = state.roleType ? state.roleType : 'No filters selected';
    elements.summaryDept.textContent = state.department ? state.department : 'No filters selected';
    
    if (state.minSalary && state.maxSalary) {
        elements.summarySalary.textContent = `${formatSalary(state.minSalary)} to ${formatSalary(state.maxSalary)}`;
    } else if (state.minSalary) {
        elements.summarySalary.textContent = `from ${formatSalary(state.minSalary)}`;
    } else if (state.maxSalary) {
        elements.summarySalary.textContent = `up to ${formatSalary(state.maxSalary)}`;
    } else {
        elements.summarySalary.textContent = 'no minimum, no maximum';
    }

    elements.summaryGrade.textContent = state.jobGrade ? state.jobGrade : 'No filters selected';
    elements.summaryPattern.textContent = state.workingPattern ? state.workingPattern : 'No filters selected';
    elements.summaryContract.textContent = state.contractType ? state.contractType : 'No filters selected';
}

async function fetchJobs() {
    elements.jobsLoading.classList.remove('hidden');
    elements.jobsEmpty.classList.add('hidden');
    elements.jobsGrid.innerHTML = '';

    const offset = (state.page - 1) * state.limit;
    const params = new URLSearchParams();
    if (state.search) params.append("search", state.search);
    if (state.department) params.append("department", state.department);
    if (state.location) params.append("location", state.location);
    if (state.minSalary) params.append("min_salary", state.minSalary);
    if (state.maxSalary) params.append("max_salary", state.maxSalary);
    if (state.jobGrade) params.append("job_grade", state.jobGrade);
    if (state.roleType) params.append("role_type", state.roleType);
    if (state.workingPattern) params.append("working_pattern", state.workingPattern);
    if (state.contractType) params.append("contract_type", state.contractType);
    if (state.onlyNewToday) params.append("only_new_today", "true");
    params.append("limit", state.limit);
    params.append("offset", offset);
    params.append("sort_by", state.sortBy);
    params.append("sort_order", state.sortOrder);

    try {
        const res = await fetch(`/api/jobs?${params.toString()}`);
        const data = await res.json();
        
        state.total = data.total || 0;
        renderJobs(data.jobs || []);
        updatePagination();
        updateToolbarSummary(data.jobs?.length || 0);
        updateAccordionSummaries();
    } catch (err) {
        console.error('Error fetching jobs:', err);
        elements.jobsGrid.innerHTML = `<div class="empty-state"><p>Error loading jobs: ${err.message}</p></div>`;
    } finally {
        elements.jobsLoading.classList.add('hidden');
    }
}

async function fetchLogs() {
    try {
        const res = await fetch('/api/logs?limit=8');
        const logs = await res.json();
        
        if (!logs.length) {
            elements.logsTableBody.innerHTML = '<tr><td colspan="7" class="text-center">No scrape runs recorded yet.</td></tr>';
            return;
        }

        elements.logsTableBody.innerHTML = logs.map(log => {
            const badgeClass = log.status === 'success' ? 'badge-success' : 'badge-danger';
            return `
                <tr>
                    <td><strong>${formatDate(log.run_at)}</strong></td>
                    <td><span class="badge badge-info">${escapeHtml(log.mode)}</span></td>
                    <td>${log.pages_scraped}</td>
                    <td>${log.jobs_found}</td>
                    <td><strong class="text-gradient-success">+${log.new_jobs_added}</strong></td>
                    <td>${log.duration_seconds}s</td>
                    <td><span class="badge ${badgeClass}">${escapeHtml(log.status)}</span></td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error('Error fetching logs:', err);
    }
}

// Rendering
function renderJobs(jobs) {
    if (!jobs || jobs.length === 0) {
        elements.jobsEmpty.classList.remove('hidden');
        return;
    }

    const todayPrefix = getTodayIsoPrefix();

    elements.jobsGrid.innerHTML = jobs.map(job => {
        const isNewToday = job.first_seen_at && job.first_seen_at.startsWith(todayPrefix);
        const logoHtml = job.logo_url 
            ? `<img class="job-card-logo" src="${escapeHtml(job.logo_url)}" alt="Logo" loading="lazy">` 
            : `<div class="job-card-logo" style="display:flex;align-items:center;justify-content:center;color:#6366f1;font-weight:bold;font-size:11px;">GOV</div>`;

        // Generate facet badges if populated
        const gradeBadge = job.job_grade ? `<span class="facet-pill pill-grade">${escapeHtml(job.job_grade)}</span>` : '';
        const contractBadge = job.contract_type ? `<span class="facet-pill pill-contract">${escapeHtml(job.contract_type)}</span>` : '';
        const patternBadge = job.working_pattern ? `<span class="facet-pill pill-pattern">${escapeHtml(job.working_pattern)}</span>` : '';
        const roleBadge = job.role_type ? `<span class="facet-pill pill-role">${escapeHtml(job.role_type)}</span>` : '';

        return `
            <article class="job-card ${isNewToday ? 'is-new' : ''}">
                <div class="job-card-header">
                    <div>
                        <a href="${escapeHtml(job.job_url)}" target="_blank" rel="noopener noreferrer" class="job-title-link">
                            ${escapeHtml(job.title)}
                        </a>
                        <div class="job-department">${escapeHtml(job.department || 'Civil Service Agency')}</div>
                    </div>
                    ${logoHtml}
                </div>

                ${(gradeBadge || contractBadge || patternBadge || roleBadge) ? `
                    <div class="job-facets">
                        ${gradeBadge}
                        ${contractBadge}
                        ${patternBadge}
                        ${roleBadge}
                    </div>
                ` : ''}

                <div class="job-details-list">
                    <div class="job-detail-item">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="12" y1="1" x2="12" y2="23"></line>
                            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                        </svg>
                        <strong>${escapeHtml(job.salary || 'Salary not disclosed')}</strong>
                    </div>
                    <div class="job-detail-item">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                            <circle cx="12" cy="10" r="3"></circle>
                        </svg>
                        <span title="${escapeHtml(job.location || '')}">${escapeHtml(job.location || 'United Kingdom')}</span>
                    </div>
                    <div class="job-detail-item">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 14 14"></polyline>
                        </svg>
                        <span>Closes: ${escapeHtml(job.closing_date || 'See advert')}</span>
                    </div>
                </div>

                <div class="job-card-footer">
                    <div style="display:flex; align-items:center; gap:6px;">
                        <span class="ref-code">REF: ${escapeHtml(job.reference_number)}</span>
                        ${isNewToday ? '<span class="badge badge-success">New Today</span>' : ''}
                    </div>
                    <a href="${escapeHtml(job.job_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" style="padding: 5px 12px; font-size: 0.75rem;">
                        View Advert &rarr;
                    </a>
                </div>
            </article>
        `;
    }).join('');
}

function updatePagination() {
    const totalPages = Math.max(1, Math.ceil(state.total / state.limit));
    elements.paginationInfo.textContent = `Page ${state.page} of ${totalPages}`;
    elements.prevPageBtn.disabled = state.page <= 1;
    elements.nextPageBtn.disabled = state.page >= totalPages;
}

function updateToolbarSummary(visibleCount) {
    elements.visibleJobsCount.textContent = visibleCount;
    elements.totalJobsCount.textContent = state.total;

    // Active filter tag chips
    elements.quickTags.innerHTML = '';

    const addTag = (label, onRemove) => {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.innerHTML = `${escapeHtml(label)} &times;`;
        chip.onclick = onRemove;
        elements.quickTags.appendChild(chip);
    };

    if (state.search) {
        addTag(`Search: "${state.search}"`, () => {
            state.search = '';
            elements.searchInput.value = '';
            elements.clearSearchBtn.classList.add('hidden');
            state.page = 1;
            fetchJobs();
        });
    }
    if (state.location) {
        addTag(`Location: ${state.location}`, () => {
            state.location = '';
            elements.filterLocationInput.value = '';
            document.querySelectorAll('.chip-sm').forEach(c => c.classList.remove('active'));
            state.page = 1;
            fetchJobs();
        });
    }
    if (state.roleType) {
        addTag(`Role: ${state.roleType}`, () => {
            state.roleType = '';
            elements.filterRoleSelect.value = '';
            state.page = 1;
            fetchJobs();
        });
    }
    if (state.department) {
        addTag(`Dept: ${state.department}`, () => {
            state.department = '';
            elements.filterDeptSelect.value = '';
            state.page = 1;
            fetchJobs();
        });
    }
    if (state.minSalary || state.maxSalary) {
        const sLabel = `Salary: ${state.minSalary ? formatSalary(state.minSalary) : '£0'} - ${state.maxSalary ? formatSalary(state.maxSalary) : 'Any'}`;
        addTag(sLabel, () => {
            state.minSalary = '';
            state.maxSalary = '';
            elements.filterSalaryMin.value = '';
            elements.filterSalaryMax.value = '';
            state.page = 1;
            fetchJobs();
        });
    }
    if (state.jobGrade) {
        addTag(`Grade: ${state.jobGrade}`, () => {
            state.jobGrade = '';
            elements.filterGradeSelect.value = '';
            state.page = 1;
            fetchJobs();
        });
    }
    if (state.workingPattern) {
        addTag(`Pattern: ${state.workingPattern}`, () => {
            state.workingPattern = '';
            elements.filterPatternSelect.value = '';
            state.page = 1;
            fetchJobs();
        });
    }
    if (state.contractType) {
        addTag(`Contract: ${state.contractType}`, () => {
            state.contractType = '';
            elements.filterContractSelect.value = '';
            state.page = 1;
            fetchJobs();
        });
    }
    if (state.onlyNewToday) {
        addTag(`New Today Only`, () => {
            state.onlyNewToday = false;
            elements.onlyNewTodayCheckbox.checked = false;
            state.page = 1;
            fetchJobs();
        });
    }
}

function applySidebarFilters() {
    state.location = elements.filterLocationInput.value.trim();
    state.roleType = elements.filterRoleSelect.value;
    state.department = elements.filterDeptSelect.value;
    state.minSalary = elements.filterSalaryMin.value;
    state.maxSalary = elements.filterSalaryMax.value;
    state.jobGrade = elements.filterGradeSelect.value;
    state.workingPattern = elements.filterPatternSelect.value;
    state.contractType = elements.filterContractSelect.value;
    state.page = 1;
    fetchJobs();
}

function resetAllFilters() {
    state.search = '';
    state.location = '';
    state.roleType = '';
    state.department = '';
    state.minSalary = '';
    state.maxSalary = '';
    state.jobGrade = '';
    state.workingPattern = '';
    state.contractType = '';
    state.onlyNewToday = false;
    state.page = 1;

    elements.searchInput.value = '';
    elements.clearSearchBtn.classList.add('hidden');
    elements.filterLocationInput.value = '';
    elements.filterRoleSelect.value = '';
    elements.filterDeptSelect.value = '';
    elements.filterSalaryMin.value = '';
    elements.filterSalaryMax.value = '';
    elements.filterGradeSelect.value = '';
    elements.filterPatternSelect.value = '';
    elements.filterContractSelect.value = '';
    elements.onlyNewTodayCheckbox.checked = false;

    document.querySelectorAll('.chip-sm').forEach(c => c.classList.remove('active'));

    fetchJobs();
}

// Scraper Trigger & Polling
function openScrapeModal() {
    elements.scrapeModal.classList.remove('hidden');
}

function closeScrapeModal() {
    elements.scrapeModal.classList.add('hidden');
}

async function triggerScraper() {
    const mode = elements.scrapeModeSelect.value;
    const maxPagesVal = elements.maxPagesInput.value.trim();
    const maxPages = maxPagesVal ? parseInt(maxPagesVal, 10) : null;

    closeScrapeModal();
    showScraperBanner(mode);

    try {
        const res = await fetch('/api/scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode, max_pages: maxPages })
        });
        const data = await res.json();
        if (data.status === 'started') {
            startScraperPolling();
        } else if (data.status === 'busy') {
            alert('A scraper run is already in progress.');
            hideScraperBanner();
        } else if (data.status === 'disabled') {
            alert(data.message || 'Live scraping is disabled in the Vercel serverless environment.');
            hideScraperBanner();
        } else {
            alert(data.message || 'Could not start scrape run.');
            hideScraperBanner();
        }
    } catch (err) {
        console.error('Error starting scrape:', err);
        hideScraperBanner();
    }
}

function showScraperBanner(mode) {
    state.isScraping = true;
    elements.triggerScrapeBtn.disabled = true;
    elements.statusBanner.classList.remove('hidden');
    elements.bannerTitle.textContent = `Running ${mode.toUpperCase()} Scrape...`;
    elements.bannerDetails.textContent = 'Connecting to Civil Service portal, solving proof-of-work challenge...';
    elements.livePages.textContent = '0';
    elements.liveNew.textContent = '0';
}

function hideScraperBanner() {
    state.isScraping = false;
    elements.triggerScrapeBtn.disabled = false;
    elements.statusBanner.classList.add('hidden');
}

function startScraperPolling() {
    if (state.pollInterval) clearInterval(state.pollInterval);

    state.pollInterval = setInterval(async () => {
        try {
            const res = await fetch('/api/scrape/status');
            const status = await res.json();

            if (status.is_running) {
                elements.bannerDetails.textContent = `Scraping page ${status.pages_scraped + 1}... Found ${status.jobs_found} vacancies so far.`;
                elements.livePages.textContent = status.pages_scraped;
                elements.liveNew.textContent = status.new_jobs_added;
            } else {
                clearInterval(state.pollInterval);
                state.pollInterval = null;
                hideScraperBanner();

                fetchStats();
                fetchFilterOptions();
                fetchJobs();
                fetchLogs();

                if (status.last_result) {
                    const r = status.last_result;
                    alert(`Scrape Completed!\nPages: ${r.pages_scraped}\nJobs Found: ${r.jobs_found}\nNew Jobs Added: ${r.new_jobs_added}\nDuration: ${r.duration_seconds}s`);
                } else if (status.error) {
                    alert(`Scrape encountered an error: ${status.error}`);
                }
            }
        } catch (err) {
            console.error('Error checking scrape status:', err);
        }
    }, 1500);
}

// Enrichment Modal & Polling
function openEnrichModal() {
    elements.enrichModal.classList.remove('hidden');
}

function closeEnrichModal() {
    elements.enrichModal.classList.add('hidden');
}

async function triggerEnrichment() {
    const limit = parseInt(elements.enrichLimitInput.value, 10) || 100;
    closeEnrichModal();

    elements.enrichBtn.disabled = true;
    elements.statusBanner.classList.remove('hidden');
    elements.bannerTitle.textContent = 'Enriching Vacancy Details...';
    elements.bannerDetails.textContent = `Fetching Job Grade, Contract, Pattern, and Role Type for ${limit} vacancies...`;

    try {
        const res = await fetch('/api/enrich', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ limit, max_workers: 8 })
        });
        const data = await res.json();
        if (data.status === 'started') {
            startEnrichPolling();
        } else {
            alert(data.message || 'Could not start enrichment');
            elements.enrichBtn.disabled = false;
            elements.statusBanner.classList.add('hidden');
        }
    } catch (err) {
        console.error('Error triggering enrichment:', err);
        elements.enrichBtn.disabled = false;
        elements.statusBanner.classList.add('hidden');
    }
}

function startEnrichPolling() {
    if (state.enrichPollInterval) clearInterval(state.enrichPollInterval);

    state.enrichPollInterval = setInterval(async () => {
        try {
            const res = await fetch('/api/enrich/status');
            const status = await res.json();

            if (status.is_running) {
                elements.bannerDetails.textContent = `Enriched ${status.enriched} of ${status.total} vacancies...`;
            } else {
                clearInterval(state.enrichPollInterval);
                state.enrichPollInterval = null;
                elements.enrichBtn.disabled = false;
                elements.statusBanner.classList.add('hidden');

                fetchFilterOptions();
                fetchJobs();
                alert(`Enrichment Complete! Filter options and vacancy badges updated.`);
            }
        } catch (err) {
            console.error('Error checking enrichment status:', err);
        }
    }, 2000);
}

// Event Listeners
function setupEventListeners() {
    // Search input
    elements.searchInput.addEventListener('input', debounce((e) => {
        state.search = e.target.value.trim();
        elements.clearSearchBtn.classList.toggle('hidden', !state.search);
        state.page = 1;
        fetchJobs();
    }, 350));

    elements.clearSearchBtn.addEventListener('click', () => {
        elements.searchInput.value = '';
        state.search = '';
        elements.clearSearchBtn.classList.add('hidden');
        state.page = 1;
        fetchJobs();
    });

    // Update Results button
    elements.updateResultsBtn.addEventListener('click', applySidebarFilters);
    
    // Direct change on selects also immediately updates results
    [
        elements.filterRoleSelect,
        elements.filterDeptSelect,
        elements.filterSalaryMin,
        elements.filterSalaryMax,
        elements.filterGradeSelect,
        elements.filterPatternSelect,
        elements.filterContractSelect
    ].forEach(select => {
        select.addEventListener('change', applySidebarFilters);
    });

    // Location text input (enter key or debounce)
    elements.filterLocationInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            applySidebarFilters();
        }
    });

    // Quick location chips
    document.querySelectorAll('.chip-sm').forEach(chip => {
        chip.addEventListener('click', () => {
            const loc = chip.dataset.loc;
            if (chip.classList.contains('active')) {
                chip.classList.remove('active');
                elements.filterLocationInput.value = '';
            } else {
                document.querySelectorAll('.chip-sm').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                elements.filterLocationInput.value = loc;
            }
            applySidebarFilters();
        });
    });

    // Reset buttons
    elements.resetAllFiltersBtn.addEventListener('click', resetAllFilters);
    elements.emptyResetBtn.addEventListener('click', resetAllFilters);

    // Sort order
    elements.sortOrderSelect.addEventListener('change', (e) => {
        const [field, order] = e.target.value.split(':');
        state.sortBy = field;
        state.sortOrder = order;
        state.page = 1;
        fetchJobs();
    });

    // Only New Today toggle
    elements.onlyNewTodayCheckbox.addEventListener('change', (e) => {
        state.onlyNewToday = e.target.checked;
        state.page = 1;
        fetchJobs();
    });

    // Pagination buttons
    elements.prevPageBtn.addEventListener('click', () => {
        if (state.page > 1) {
            state.page--;
            fetchJobs();
            window.scrollTo({ top: 300, behavior: 'smooth' });
        }
    });

    elements.nextPageBtn.addEventListener('click', () => {
        const totalPages = Math.ceil(state.total / state.limit);
        if (state.page < totalPages) {
            state.page++;
            fetchJobs();
            window.scrollTo({ top: 300, behavior: 'smooth' });
        }
    });

    // Modal triggers
    elements.triggerScrapeBtn.addEventListener('click', openScrapeModal);
    elements.closeModalBtn.addEventListener('click', closeScrapeModal);
    elements.cancelModalBtn.addEventListener('click', closeScrapeModal);
    elements.confirmScrapeBtn.addEventListener('click', triggerScraper);

    // Enrich triggers
    elements.enrichBtn.addEventListener('click', openEnrichModal);
    elements.closeEnrichModalBtn.addEventListener('click', closeEnrichModal);
    elements.cancelEnrichModalBtn.addEventListener('click', closeEnrichModal);
    elements.confirmEnrichBtn.addEventListener('click', triggerEnrichment);

    // Theme toggle
    elements.themeToggleBtn.addEventListener('click', () => {
        const isDark = document.body.classList.contains('dark-theme');
        if (isDark) {
            document.body.classList.remove('dark-theme');
            document.body.classList.add('light-theme');
            elements.themeToggleBtn.innerHTML = '<span>☀️</span>';
            localStorage.setItem('theme', 'light');
        } else {
            document.body.classList.remove('light-theme');
            document.body.classList.add('dark-theme');
            elements.themeToggleBtn.innerHTML = '<span>🌙</span>';
            localStorage.setItem('theme', 'dark');
        }
    });
}

// Initial Boot
document.addEventListener('DOMContentLoaded', () => {
    // Restore theme
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
        elements.themeToggleBtn.innerHTML = '<span>☀️</span>';
    }

    setupEventListeners();
    fetchStats();
    fetchFilterOptions();
    fetchJobs();
    fetchLogs();

    // Check ongoing scrape or enrichment
    fetch('/api/scrape/status')
        .then(r => r.json())
        .then(status => {
            if (status.is_running) {
                showScraperBanner(status.mode || 'active');
                startScraperPolling();
            }
        })
        .catch(err => console.error('Status check error:', err));
});
