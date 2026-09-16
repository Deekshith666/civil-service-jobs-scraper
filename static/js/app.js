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
    
    themeToggleBtn: document.getElementById('themeToggleBtn'),

    // Auth & Profile Header Elements
    openAuthModalBtn: document.getElementById('openAuthModalBtn'),
    loggedInUserPill: document.getElementById('loggedInUserPill'),
    userAvatarLetter: document.getElementById('userAvatarLetter'),
    headerUsername: document.getElementById('headerUsername'),
    headerResumeBadge: document.getElementById('headerResumeBadge'),
    openProfileModalBtn: document.getElementById('openProfileModalBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
    matchProfileBtn: document.getElementById('matchProfileBtn'),

    // Auth Modal Elements
    authModal: document.getElementById('authModal'),
    closeAuthModalBtn: document.getElementById('closeAuthModalBtn'),
    authTabLogin: document.getElementById('authTabLogin'),
    authTabRegister: document.getElementById('authTabRegister'),
    loginForm: document.getElementById('loginForm'),
    loginUsername: document.getElementById('loginUsername'),
    loginPassword: document.getElementById('loginPassword'),
    loginAlert: document.getElementById('loginAlert'),
    loginSubmitBtn: document.getElementById('loginSubmitBtn'),

    registerForm: document.getElementById('registerForm'),
    regUsername: document.getElementById('regUsername'),
    regEmail: document.getElementById('regEmail'),
    regPassword: document.getElementById('regPassword'),
    ruleMinLength: document.getElementById('ruleMinLength'),
    ruleUppercase: document.getElementById('ruleUppercase'),
    ruleLowercase: document.getElementById('ruleLowercase'),
    ruleNumber: document.getElementById('ruleNumber'),
    ruleSpecial: document.getElementById('ruleSpecial'),
    regResumeDropzone: document.getElementById('regResumeDropzone'),
    regResumeInput: document.getElementById('regResumeInput'),
    regDropzoneText: document.getElementById('regDropzoneText'),
    regResumeFilePreview: document.getElementById('regResumeFilePreview'),
    regFileName: document.getElementById('regFileName'),
    regRemoveFileBtn: document.getElementById('regRemoveFileBtn'),
    regResumeDesc: document.getElementById('regResumeDesc'),
    registerAlert: document.getElementById('registerAlert'),
    registerSubmitBtn: document.getElementById('registerSubmitBtn'),

    // Profile & Resume Modal Elements
    profileModal: document.getElementById('profileModal'),
    closeProfileModalBtn: document.getElementById('closeProfileModalBtn'),
    profileUserEmail: document.getElementById('profileUserEmail'),
    tabResumesBtn: document.getElementById('tabResumesBtn'),
    tabPreferencesBtn: document.getElementById('tabPreferencesBtn'),
    panelResumes: document.getElementById('panelResumes'),
    panelPreferences: document.getElementById('panelPreferences'),
    profileResumeTabCount: document.getElementById('profileResumeTabCount'),

    uploadResumeForm: document.getElementById('uploadResumeForm'),
    uploadResumeAlert: document.getElementById('uploadResumeAlert'),
    newResumeDesc: document.getElementById('newResumeDesc'),
    newResumeFile: document.getElementById('newResumeFile'),
    newResumePrimary: document.getElementById('newResumePrimary'),
    submitUploadResumeBtn: document.getElementById('submitUploadResumeBtn'),
    resumesListContainer: document.getElementById('resumesListContainer'),

    // Preferences Elements
    preferencesForm: document.getElementById('preferencesForm'),
    prefAlert: document.getElementById('prefAlert'),
    prefLocation: document.getElementById('prefLocation'),
    prefMinSalary: document.getElementById('prefMinSalary'),
    prefMaxSalary: document.getElementById('prefMaxSalary'),
    prefRoleType: document.getElementById('prefRoleType'),
    prefJobGrade: document.getElementById('prefJobGrade'),
    prefWorkingPattern: document.getElementById('prefWorkingPattern'),
    prefContractType: document.getElementById('prefContractType'),
    savePreferencesBtn: document.getElementById('savePreferencesBtn'),
    applyPreferencesToSearchBtn: document.getElementById('applyPreferencesToSearchBtn')
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
                    <div style="display:flex; align-items:center; gap:8px;">
                        <a href="${escapeHtml(job.job_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" style="padding: 5px 12px; font-size: 0.75rem;">
                            View Advert &rarr;
                        </a>
                        ${authState.user ? `
                        <a href="/tailor/${escapeHtml(job.reference_number)}" class="btn btn-primary" style="padding: 5px 12px; font-size: 0.75rem; display:inline-flex; align-items:center; gap:4px;" title="AI Tailor CV, Personal Statement & Cover Letter">
                            <span>Tailor Application</span> ✨
                        </a>
                        ` : ''}
                    </div>
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

    // Auth & Profile Event Listeners
    if (elements.openAuthModalBtn) {
        elements.openAuthModalBtn.addEventListener('click', () => openAuthModal('login'));
    }
    if (elements.closeAuthModalBtn) {
        elements.closeAuthModalBtn.addEventListener('click', closeAuthModal);
    }
    if (elements.authTabLogin) {
        elements.authTabLogin.addEventListener('click', () => switchAuthTab('login'));
    }
    if (elements.authTabRegister) {
        elements.authTabRegister.addEventListener('click', () => switchAuthTab('register'));
    }
    if (elements.loginForm) {
        elements.loginForm.addEventListener('submit', handleLogin);
    }
    if (elements.registerForm) {
        elements.registerForm.addEventListener('submit', handleRegister);
    }
    if (elements.regPassword) {
        elements.regPassword.addEventListener('input', (e) => {
            validatePasswordConditions(e.target.value);
        });
    }


    // Register Resume Dropzone
    if (elements.regResumeDropzone) {
        elements.regResumeDropzone.addEventListener('click', () => elements.regResumeInput.click());
        elements.regResumeDropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            elements.regResumeDropzone.classList.add('dragover');
        });
        elements.regResumeDropzone.addEventListener('dragleave', () => {
            elements.regResumeDropzone.classList.remove('dragover');
        });
        elements.regResumeDropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            elements.regResumeDropzone.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) {
                const file = e.dataTransfer.files[0];
                authState.regResumeFile = file;
                elements.regFileName.textContent = file.name;
                elements.regResumeFilePreview.classList.remove('hidden');
                elements.regDropzoneText.textContent = 'File attached';
            }
        });
        elements.regResumeInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                const file = e.target.files[0];
                authState.regResumeFile = file;
                elements.regFileName.textContent = file.name;
                elements.regResumeFilePreview.classList.remove('hidden');
                elements.regDropzoneText.textContent = 'File attached';
            }
        });
        elements.regRemoveFileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            resetRegDropzone();
        });
    }

    // Profile & Resume Modal Listeners
    if (elements.openProfileModalBtn) {
        elements.openProfileModalBtn.addEventListener('click', () => openProfileModal('resumes'));
    }
    if (elements.closeProfileModalBtn) {
        elements.closeProfileModalBtn.addEventListener('click', closeProfileModal);
    }
    if (elements.logoutBtn) {
        elements.logoutBtn.addEventListener('click', handleLogout);
    }
    if (elements.tabResumesBtn) {
        elements.tabResumesBtn.addEventListener('click', () => switchProfileTab('resumes'));
    }
    if (elements.tabPreferencesBtn) {
        elements.tabPreferencesBtn.addEventListener('click', () => switchProfileTab('preferences'));
    }
    if (elements.uploadResumeForm) {
        elements.uploadResumeForm.addEventListener('submit', handleUploadResume);
    }
    if (elements.preferencesForm) {
        elements.preferencesForm.addEventListener('submit', (e) => handleSavePreferences(e, false));
    }
    if (elements.applyPreferencesToSearchBtn) {
        elements.applyPreferencesToSearchBtn.addEventListener('click', () => handleSavePreferences(null, true));
    }
    if (elements.matchProfileBtn) {
        elements.matchProfileBtn.addEventListener('click', handleMatchProfile);
    }

    // Close on backdrop click
    window.addEventListener('click', (e) => {
        if (e.target === elements.authModal) closeAuthModal();
        if (e.target === elements.profileModal) closeProfileModal();
        if (e.target === elements.scrapeModal) closeScrapeModal();
        if (e.target === elements.enrichModal) closeEnrichModal();
    });

    // Close on Escape key
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeAuthModal();
            closeProfileModal();
            closeScrapeModal();
            closeEnrichModal();
        }
    });
}

// ==========================================
// Authentication & Candidate Profile Logic
// ==========================================

const authState = {
    token: localStorage.getItem('civil_auth_token') || null,
    user: null,
    resumes: [],
    regResumeFile: null
};

function getAuthHeaders(includeContentType = true) {
    const headers = {};
    if (includeContentType) {
        headers['Content-Type'] = 'application/json';
    }
    if (authState.token) {
        headers['Authorization'] = `Bearer ${authState.token}`;
    }
    return headers;
}

function formatBytes(bytes, decimals = 1) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

async function initAuth() {
    if (!authState.token) {
        renderAuthUI();
        return;
    }
    try {
        const res = await fetch('/api/auth/me', { headers: getAuthHeaders() });
        if (res.ok) {
            const data = await res.json();
            authState.user = data.user;
        } else {
            authState.token = null;
            authState.user = null;
            localStorage.removeItem('civil_auth_token');
        }
    } catch (err) {
        console.error('Auth check error:', err);
    }
    renderAuthUI();
}

function renderAuthUI() {
    if (authState.user) {
        elements.openAuthModalBtn.classList.add('hidden');
        elements.loggedInUserPill.classList.remove('hidden');
        const initial = (authState.user.username || 'U')[0].toUpperCase();
        elements.userAvatarLetter.textContent = initial;
        elements.headerUsername.textContent = authState.user.username;
        const cnt = authState.user.resume_count || 0;
        elements.headerResumeBadge.textContent = `${cnt} CV${cnt === 1 ? '' : 's'}`;
        elements.matchProfileBtn.classList.remove('hidden');
    } else {
        elements.openAuthModalBtn.classList.remove('hidden');
        elements.loggedInUserPill.classList.add('hidden');
        elements.matchProfileBtn.classList.add('hidden');
    }
    // Re-render job cards to reflect login state on Tailor buttons
    if (state.jobs && state.jobs.length > 0) {
        renderJobCards();
    }
}

function openAuthModal(tab = 'login') {
    elements.authModal.classList.remove('hidden');
    switchAuthTab(tab);
}

function closeAuthModal() {
    elements.authModal.classList.add('hidden');
    elements.loginAlert.classList.add('hidden');
    elements.registerAlert.classList.add('hidden');
}

function switchAuthTab(tab) {
    if (tab === 'login') {
        elements.authTabLogin.classList.add('active');
        elements.authTabRegister.classList.remove('active');
        elements.loginForm.classList.remove('hidden');
        elements.registerForm.classList.add('hidden');
    } else {
        elements.authTabRegister.classList.add('active');
        elements.authTabLogin.classList.remove('active');
        elements.registerForm.classList.remove('hidden');
        elements.loginForm.classList.add('hidden');
    }
}

async function handleLogin(e) {
    e.preventDefault();
    elements.loginAlert.classList.add('hidden');
    elements.loginSubmitBtn.disabled = true;
    elements.loginSubmitBtn.textContent = 'Signing in...';

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username_or_email: elements.loginUsername.value,
                password: elements.loginPassword.value
            })
        });
        const data = await res.json();
        if (res.ok && data.status === 'success') {
            authState.token = data.token;
            authState.user = data.user;
            localStorage.setItem('civil_auth_token', data.token);
            renderAuthUI();
            closeAuthModal();
            elements.loginForm.reset();
        } else {
            elements.loginAlert.textContent = data.detail || data.message || 'Login failed.';
            elements.loginAlert.classList.remove('hidden');
        }
    } catch (err) {
        elements.loginAlert.textContent = 'Connection error. Please try again.';
        elements.loginAlert.classList.remove('hidden');
    } finally {
        elements.loginSubmitBtn.disabled = false;
        elements.loginSubmitBtn.textContent = 'Sign In';
    }
}

function validatePasswordConditions(pwd) {
    if (!pwd) pwd = '';
    const hasMinLength = pwd.length >= 8;
    const hasUpper = /[A-Z]/.test(pwd);
    const hasLower = /[a-z]/.test(pwd);
    const hasNumber = /[0-9]/.test(pwd);
    const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(pwd);

    updateRuleItem(elements.ruleMinLength, hasMinLength);
    updateRuleItem(elements.ruleUppercase, hasUpper);
    updateRuleItem(elements.ruleLowercase, hasLower);
    updateRuleItem(elements.ruleNumber, hasNumber);
    updateRuleItem(elements.ruleSpecial, hasSpecial);

    return hasMinLength && hasUpper && hasLower && hasNumber && hasSpecial;
}

function updateRuleItem(el, isValid) {
    if (!el) return;
    const icon = el.querySelector('.rule-icon');
    if (isValid) {
        el.classList.add('valid');
        if (icon) icon.textContent = '✓';
    } else {
        el.classList.remove('valid');
        if (icon) icon.textContent = '○';
    }
}

async function handleRegister(e) {
    e.preventDefault();
    elements.registerAlert.classList.add('hidden');

    const pwd = (elements.regPassword && elements.regPassword.value) || '';
    if (!validatePasswordConditions(pwd)) {
        elements.registerAlert.textContent = 'Password must meet all complexity requirements (8+ characters, uppercase, lowercase, number, and special character).';
        elements.registerAlert.classList.remove('hidden');
        if (elements.regPassword) elements.regPassword.focus();
        return;
    }

    elements.registerSubmitBtn.disabled = true;
    elements.registerSubmitBtn.textContent = 'Creating account...';

    const formData = new FormData();
    formData.append('username', elements.regUsername.value);
    formData.append('email', elements.regEmail.value);
    formData.append('password', pwd);

    if (authState.regResumeFile) {
        formData.append('resume', authState.regResumeFile);
        formData.append('resume_description', elements.regResumeDesc.value || 'Primary Resume');
    }

    try {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        if (res.ok && data.status === 'success') {
            authState.token = data.token;
            authState.user = data.user;
            localStorage.setItem('civil_auth_token', data.token);
            renderAuthUI();
            closeAuthModal();
            elements.registerForm.reset();
            validatePasswordConditions('');
            resetRegDropzone();
            openProfileModal('preferences');
        } else {
            elements.registerAlert.textContent = data.detail || data.message || 'Registration failed.';
            elements.registerAlert.classList.remove('hidden');
        }
    } catch (err) {
        elements.registerAlert.textContent = 'Connection error. Please try again.';
        elements.registerAlert.classList.remove('hidden');
    } finally {
        elements.registerSubmitBtn.disabled = false;
        elements.registerSubmitBtn.textContent = 'Create Account & Save Profile';
    }
}

function resetRegDropzone() {
    authState.regResumeFile = null;
    if (elements.regResumeInput) elements.regResumeInput.value = '';
    if (elements.regResumeFilePreview) elements.regResumeFilePreview.classList.add('hidden');
    if (elements.regDropzoneText) elements.regDropzoneText.textContent = 'Click to upload your resume';
}

async function handleLogout() {
    try {
        await fetch('/api/auth/logout', {
            method: 'POST',
            headers: getAuthHeaders()
        });
    } catch (err) {
        console.warn('Logout request failed:', err);
    }
    authState.token = null;
    authState.user = null;
    localStorage.removeItem('civil_auth_token');
    renderAuthUI();
    closeProfileModal();
}

function openProfileModal(tab = 'resumes') {
    if (!authState.user) {
        openAuthModal('login');
        return;
    }
    elements.profileUserEmail.textContent = `Signed in as @${authState.user.username} (${authState.user.email})`;
    elements.profileModal.classList.remove('hidden');
    switchProfileTab(tab);
}

function closeProfileModal() {
    elements.profileModal.classList.add('hidden');
    elements.uploadResumeAlert.classList.add('hidden');
    elements.prefAlert.classList.add('hidden');
}

function switchProfileTab(tab) {
    if (tab === 'resumes') {
        elements.tabResumesBtn.classList.add('active');
        elements.tabPreferencesBtn.classList.remove('active');
        elements.panelResumes.classList.remove('hidden');
        elements.panelPreferences.classList.add('hidden');
        loadResumes();
    } else {
        elements.tabPreferencesBtn.classList.add('active');
        elements.tabResumesBtn.classList.remove('active');
        elements.panelPreferences.classList.remove('hidden');
        elements.panelResumes.classList.add('hidden');
        loadPreferences();
    }
}

async function loadResumes() {
    elements.resumesListContainer.innerHTML = '<div class="empty-resumes">Loading stored resumes...</div>';
    try {
        const res = await fetch('/api/profile/resumes', { headers: getAuthHeaders() });
        const data = await res.json();
        const resumes = data.resumes || [];
        authState.resumes = resumes;
        elements.profileResumeTabCount.textContent = resumes.length;
        if (authState.user) {
            authState.user.resume_count = resumes.length;
            elements.headerResumeBadge.textContent = `${resumes.length} CV${resumes.length === 1 ? '' : 's'}`;
        }

        if (resumes.length === 0) {
            elements.resumesListContainer.innerHTML = `
                <div class="empty-resumes">
                    <p>No resumes uploaded yet.</p>
                    <span class="text-muted">Use the form above to upload your first resume (PDF, DOCX, TXT).</span>
                </div>
            `;
            return;
        }

        elements.resumesListContainer.innerHTML = resumes.map(r => `
            <div class="resume-card ${r.is_primary ? 'is-primary' : ''}">
                <div class="resume-card-left">
                    <div class="resume-icon-badge">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                        </svg>
                    </div>
                    <div class="resume-title-group">
                        <div class="resume-desc-title">
                            <span>${escapeHtml(r.description)}</span>
                            ${r.is_primary ? '<span class="badge badge-success badge-sm">Active / Primary</span>' : ''}
                        </div>
                        <div class="resume-meta-sub">
                            <span>${escapeHtml(r.filename)}</span> &bull; 
                            <span>${formatBytes(r.file_size)}</span> &bull; 
                            <span>Uploaded ${formatDate(r.uploaded_at)}</span>
                        </div>
                    </div>
                </div>
                <div class="resume-card-actions">
                    <button class="btn btn-secondary btn-sm" onclick="downloadResumeFile(${r.id}, '${escapeHtml(r.filename)}')">
                        Download
                    </button>
                    ${!r.is_primary ? `<button class="btn btn-outline btn-sm" onclick="setPrimaryResumeAction(${r.id})">Set Active</button>` : ''}
                    <button class="btn btn-danger btn-sm" onclick="deleteResumeAction(${r.id})">
                        Delete
                    </button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        elements.resumesListContainer.innerHTML = '<div class="empty-resumes text-danger">Failed to load resumes.</div>';
    }
}

async function handleUploadResume(e) {
    e.preventDefault();
    elements.uploadResumeAlert.classList.add('hidden');
    const file = elements.newResumeFile.files[0];
    if (!file) {
        elements.uploadResumeAlert.textContent = 'Please select a document to upload.';
        elements.uploadResumeAlert.classList.remove('hidden');
        return;
    }

    elements.submitUploadResumeBtn.disabled = true;
    elements.submitUploadResumeBtn.textContent = 'Uploading...';

    const formData = new FormData();
    formData.append('file', file);
    formData.append('description', elements.newResumeDesc.value || 'My Resume');
    formData.append('is_primary', elements.newResumePrimary.checked);

    try {
        const res = await fetch('/api/profile/resumes', {
            method: 'POST',
            headers: getAuthHeaders(false),
            body: formData
        });
        const data = await res.json();
        if (res.ok && data.status === 'success') {
            elements.uploadResumeForm.reset();
            loadResumes();
        } else {
            elements.uploadResumeAlert.textContent = data.detail || data.message || 'Upload failed.';
            elements.uploadResumeAlert.classList.remove('hidden');
        }
    } catch (err) {
        elements.uploadResumeAlert.textContent = 'Upload failed. Please try again.';
        elements.uploadResumeAlert.classList.remove('hidden');
    } finally {
        elements.submitUploadResumeBtn.disabled = false;
        elements.submitUploadResumeBtn.textContent = 'Upload Resume';
    }
}

window.downloadResumeFile = async function(resumeId, filename) {
    try {
        const res = await fetch(`/api/profile/resumes/${resumeId}/download`, {
            headers: getAuthHeaders(false)
        });
        if (!res.ok) throw new Error('Download failed');
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || 'resume.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
    } catch (err) {
        alert('Could not download resume file.');
    }
};

window.setPrimaryResumeAction = async function(resumeId) {
    try {
        const res = await fetch(`/api/profile/resumes/${resumeId}/primary`, {
            method: 'PUT',
            headers: getAuthHeaders()
        });
        if (res.ok) {
            loadResumes();
        }
    } catch (err) {
        console.error('Failed to set primary resume:', err);
    }
};

window.deleteResumeAction = async function(resumeId) {
    if (!confirm('Are you sure you want to delete this resume?')) return;
    try {
        const res = await fetch(`/api/profile/resumes/${resumeId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        if (res.ok) {
            loadResumes();
        }
    } catch (err) {
        console.error('Failed to delete resume:', err);
    }
};

async function loadPreferences() {
    elements.prefAlert.classList.add('hidden');
    
    // Populate role options from filter options
    if (elements.filterRoleSelect && elements.filterRoleSelect.options.length > 1) {
        elements.prefRoleType.innerHTML = elements.filterRoleSelect.innerHTML;
    }

    try {
        const res = await fetch('/api/profile/preferences', { headers: getAuthHeaders() });
        const data = await res.json();
        const prefs = data.preferences || {};
        
        elements.prefLocation.value = (prefs.locations || []).join(', ');
        elements.prefMinSalary.value = prefs.min_salary || '';
        elements.prefMaxSalary.value = prefs.max_salary || '';
        elements.prefRoleType.value = prefs.role_type || '';
        elements.prefJobGrade.value = prefs.job_grade || '';
        elements.prefWorkingPattern.value = prefs.working_pattern || '';
        elements.prefContractType.value = prefs.contract_type || '';
    } catch (err) {
        console.error('Failed to load preferences:', err);
    }
}

async function handleSavePreferences(e, applyToSearch = false) {
    if (e) e.preventDefault();
    elements.savePreferencesBtn.disabled = true;
    elements.savePreferencesBtn.textContent = 'Saving...';

    const locArr = elements.prefLocation.value
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

    const payload = {
        locations: locArr,
        min_salary: elements.prefMinSalary.value ? parseInt(elements.prefMinSalary.value, 10) : null,
        max_salary: elements.prefMaxSalary.value ? parseInt(elements.prefMaxSalary.value, 10) : null,
        role_type: elements.prefRoleType.value,
        job_grade: elements.prefJobGrade.value,
        working_pattern: elements.prefWorkingPattern.value,
        contract_type: elements.prefContractType.value
    };

    try {
        const res = await fetch('/api/profile/preferences', {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok) {
            if (authState.user) {
                authState.user.preferences = data.preferences;
            }
            elements.prefAlert.textContent = 'Career preferences saved successfully!';
            elements.prefAlert.classList.remove('hidden');

            if (applyToSearch) {
                applyPreferencesToDashboard(payload);
                closeProfileModal();
            }
        }
    } catch (err) {
        alert('Failed to save preferences.');
    } finally {
        elements.savePreferencesBtn.disabled = false;
        elements.savePreferencesBtn.textContent = 'Save Career Preferences';
    }
}

function applyPreferencesToDashboard(prefs) {
    if (!prefs) return;
    if (prefs.locations && prefs.locations.length > 0) {
        elements.filterLocationInput.value = prefs.locations[0];
    }
    if (prefs.min_salary) {
        elements.filterSalaryMin.value = prefs.min_salary;
    }
    if (prefs.max_salary) {
        elements.filterSalaryMax.value = prefs.max_salary;
    }
    if (prefs.job_grade) {
        elements.filterGradeSelect.value = prefs.job_grade;
    }
    if (prefs.role_type) {
        elements.filterRoleSelect.value = prefs.role_type;
    }
    if (prefs.working_pattern) {
        elements.filterPatternSelect.value = prefs.working_pattern;
    }
    if (prefs.contract_type) {
        elements.filterContractSelect.value = prefs.contract_type;
    }
    applySidebarFilters();
    elements.matchProfileBtn.classList.add('active');
}

function handleMatchProfile() {
    if (!authState.user) {
        openAuthModal('login');
        return;
    }
    const prefs = authState.user.preferences;
    if (!prefs || (!prefs.locations?.length && !prefs.min_salary && !prefs.max_salary && !prefs.job_grade && !prefs.role_type)) {
        openProfileModal('preferences');
        return;
    }
    applyPreferencesToDashboard(prefs);
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
    initAuth();
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
