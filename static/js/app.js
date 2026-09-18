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
    minSalary: '',
    maxSalary: '',
    numJobs: '',
    onlyNewToday: false,
    sortBy: 'first_seen_at',
    sortOrder: 'desc',
    jobs: [],

    // Multi-select inclusion and exclusion Sets
    departments: new Set(),
    excludeDepartments: new Set(),
    roleTypes: new Set(),
    excludeRoleTypes: new Set(),
    locations: new Set(),
    excludeLocations: new Set(),
    jobGrades: new Set(),
    excludeJobGrades: new Set(),
    workingPatterns: new Set(),
    excludeWorkingPatterns: new Set(),
    contractTypes: new Set(),
    excludeContractTypes: new Set(),

    // Current tab mode per facet: 'include' or 'exclude'
    facetModes: {
        location: 'include',
        role: 'include',
        dept: 'include',
        grade: 'include',
        pattern: 'include',
        contract: 'include'
    },

    // Legacy string compatibility
    department: '',
    location: '',
    jobGrade: '',
    roleType: '',
    workingPattern: '',
    contractType: '',

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
    newTodayToggleLabel: document.getElementById('newTodayToggleLabel'),
    newTodayToggleBadge: document.getElementById('newTodayToggleBadge'),
    quickNewTodayBtn: document.getElementById('quickNewTodayBtn'),
    quickTodayPill: document.getElementById('quickTodayPill'),
    cardNewToday: document.getElementById('cardNewToday'),
    statNewTodaySub: document.getElementById('statNewTodaySub'),
    
    // Sidebar Filter Accordions & Facets
    filterLocationInput: document.getElementById('filterLocationInput'),
    addLocationBtn: document.getElementById('addLocationBtn'),
    quickLocChips: document.getElementById('quickLocChips'),
    selectedLocChips: document.getElementById('selectedLocChips'),

    roleChecklist: document.getElementById('roleChecklist'),
    deptChecklist: document.getElementById('deptChecklist'),
    gradeChecklist: document.getElementById('gradeChecklist'),
    patternChecklist: document.getElementById('patternChecklist'),
    contractChecklist: document.getElementById('contractChecklist'),

    filterSalaryMin: document.getElementById('filterSalaryMin'),
    filterSalaryMax: document.getElementById('filterSalaryMax'),
    filterNumJobsSelect: document.getElementById('filterNumJobsSelect'),
    
    summaryLocation: document.getElementById('summaryLocation'),
    summaryRole: document.getElementById('summaryRole'),
    summaryDept: document.getElementById('summaryDept'),
    summarySalary: document.getElementById('summarySalary'),
    summaryGrade: document.getElementById('summaryGrade'),
    summaryPattern: document.getElementById('summaryPattern'),
    summaryContract: document.getElementById('summaryContract'),
    summaryNumJobs: document.getElementById('summaryNumJobs'),

    badgesLocation: document.getElementById('badgesLocation'),
    badgesRole: document.getElementById('badgesRole'),
    badgesDept: document.getElementById('badgesDept'),
    badgesGrade: document.getElementById('badgesGrade'),
    badgesPattern: document.getElementById('badgesPattern'),
    badgesContract: document.getElementById('badgesContract'),
    
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
        
        const countToday = (data.new_jobs_today || 0).toLocaleString();
        elements.statTotalJobs.textContent = (data.total_jobs || 0).toLocaleString();
        elements.statNewToday.textContent = countToday;
        if (elements.newTodayToggleBadge) elements.newTodayToggleBadge.textContent = countToday;
        if (elements.quickTodayPill) elements.quickTodayPill.textContent = countToday;
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

const FACET_CONFIG = {
    dept: {
        incSet: 'departments',
        excSet: 'excludeDepartments',
        checklistId: 'deptChecklist',
        badgeIncId: 'badgeIncDept',
        badgeExcId: 'badgeExcDept',
        summaryId: 'summaryDept',
        headerBadgesId: 'badgesDept',
        title: 'Department'
    },
    role: {
        incSet: 'roleTypes',
        excSet: 'excludeRoleTypes',
        checklistId: 'roleChecklist',
        badgeIncId: 'badgeIncRole',
        badgeExcId: 'badgeExcRole',
        summaryId: 'summaryRole',
        headerBadgesId: 'badgesRole',
        title: 'Role'
    },
    grade: {
        incSet: 'jobGrades',
        excSet: 'excludeJobGrades',
        checklistId: 'gradeChecklist',
        badgeIncId: 'badgeIncGrade',
        badgeExcId: 'badgeExcGrade',
        summaryId: 'summaryGrade',
        headerBadgesId: 'badgesGrade',
        title: 'Grade'
    },
    pattern: {
        incSet: 'workingPatterns',
        excSet: 'excludeWorkingPatterns',
        checklistId: 'patternChecklist',
        badgeIncId: 'badgeIncPattern',
        badgeExcId: 'badgeExcPattern',
        summaryId: 'summaryPattern',
        headerBadgesId: 'badgesPattern',
        title: 'Pattern'
    },
    contract: {
        incSet: 'contractTypes',
        excSet: 'excludeContractTypes',
        checklistId: 'contractChecklist',
        badgeIncId: 'badgeIncContract',
        badgeExcId: 'badgeExcContract',
        summaryId: 'summaryContract',
        headerBadgesId: 'badgesContract',
        title: 'Contract'
    },
    location: {
        incSet: 'locations',
        excSet: 'excludeLocations',
        badgeIncId: 'badgeIncLocation',
        badgeExcId: 'badgeExcLocation',
        summaryId: 'summaryLocation',
        headerBadgesId: 'badgesLocation',
        title: 'Location'
    }
};

let cachedFilterData = null;

function renderFacetChecklist(facetKey, items) {
    const cfg = FACET_CONFIG[facetKey];
    if (!cfg || !cfg.checklistId) return;
    const container = document.getElementById(cfg.checklistId);
    if (!container) return;

    const currentMode = state.facetModes[facetKey] || 'include';
    container.classList.toggle('exclude-mode', currentMode === 'exclude');
    container.innerHTML = '';

    if (!items || items.length === 0) {
        container.innerHTML = '<div style="padding: 8px; color: var(--text-muted); font-size: 0.75rem;">No options found</div>';
        return;
    }

    const frag = document.createDocumentFragment();
    items.forEach(item => {
        if (!item) return;
        const isInc = state[cfg.incSet].has(item);
        const isExc = state[cfg.excSet].has(item);
        const isChecked = currentMode === 'include' ? isInc : isExc;

        const label = document.createElement('label');
        label.className = 'facet-item' + (isInc ? ' is-included' : '') + (isExc ? ' is-excluded' : '');
        label.dataset.val = item;

        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.value = item;
        chk.checked = isChecked;
        chk.addEventListener('change', (e) => {
            handleFacetCheckboxChange(facetKey, item, e.target.checked);
        });

        const span = document.createElement('span');
        span.className = 'facet-text';
        span.textContent = item;

        label.appendChild(chk);
        label.appendChild(span);
        frag.appendChild(label);
    });

    container.appendChild(frag);
    syncFacetBadges(facetKey);
}

function handleFacetCheckboxChange(facetKey, val, isChecked) {
    const cfg = FACET_CONFIG[facetKey];
    if (!cfg) return;
    const mode = state.facetModes[facetKey] || 'include';

    if (mode === 'include') {
        if (isChecked) {
            state[cfg.incSet].add(val);
            state[cfg.excSet].delete(val);
        } else {
            state[cfg.incSet].delete(val);
        }
    } else {
        if (isChecked) {
            state[cfg.excSet].add(val);
            state[cfg.incSet].delete(val);
        } else {
            state[cfg.excSet].delete(val);
        }
    }

    syncFacetUI(facetKey);
    state.page = 1;
    fetchJobs();
}

function syncFacetUI(facetKey) {
    const cfg = FACET_CONFIG[facetKey];
    if (!cfg) return;
    const mode = state.facetModes[facetKey] || 'include';

    if (cfg.checklistId) {
        const container = document.getElementById(cfg.checklistId);
        if (container) {
            container.classList.toggle('exclude-mode', mode === 'exclude');
            container.querySelectorAll('.facet-item').forEach(label => {
                const val = label.dataset.val;
                const isInc = state[cfg.incSet].has(val);
                const isExc = state[cfg.excSet].has(val);
                label.classList.toggle('is-included', isInc);
                label.classList.toggle('is-excluded', isExc);
                const chk = label.querySelector('input[type="checkbox"]');
                if (chk) {
                    chk.checked = mode === 'include' ? isInc : isExc;
                }
            });
        }
    }

    if (facetKey === 'location') {
        syncLocationUI();
    }

    syncFacetBadges(facetKey);
}

function syncLocationUI() {
    // Quick chips update
    document.querySelectorAll('#quickLocChips .chip-sm').forEach(chip => {
        const loc = chip.dataset.loc;
        chip.classList.remove('active', 'chip-include', 'chip-exclude');
        if (state.locations.has(loc)) {
            chip.classList.add('chip-include');
        } else if (state.excludeLocations.has(loc)) {
            chip.classList.add('chip-exclude');
        }
    });

    // Custom selected chips update
    if (elements.selectedLocChips) {
        elements.selectedLocChips.innerHTML = '';
        const allLocs = [
            ...Array.from(state.locations).map(l => ({ val: l, type: 'include' })),
            ...Array.from(state.excludeLocations).map(l => ({ val: l, type: 'exclude' }))
        ];
        allLocs.forEach(item => {
            const span = document.createElement('span');
            span.className = `selected-chip chip-${item.type}`;
            span.innerHTML = `<span>${item.type === 'include' ? '✓' : '⊘'} ${escapeHtml(item.val)}</span><span class="chip-remove">&times;</span>`;
            span.addEventListener('click', () => {
                if (item.type === 'include') {
                    state.locations.delete(item.val);
                } else {
                    state.excludeLocations.delete(item.val);
                }
                syncFacetUI('location');
                state.page = 1;
                fetchJobs();
            });
            elements.selectedLocChips.appendChild(span);
        });
    }
}

function syncFacetBadges(facetKey) {
    const cfg = FACET_CONFIG[facetKey];
    if (!cfg) return;
    const incCount = state[cfg.incSet].size;
    const excCount = state[cfg.excSet].size;

    const bInc = document.getElementById(cfg.badgeIncId);
    if (bInc) bInc.textContent = incCount;

    const bExc = document.getElementById(cfg.badgeExcId);
    if (bExc) bExc.textContent = excCount;

    const hBadges = document.getElementById(cfg.headerBadgesId);
    if (hBadges) {
        let html = '';
        if (incCount > 0) html += `<span class="badge-inc-mini">✓ ${incCount}</span>`;
        if (excCount > 0) html += `<span class="badge-exc-mini">⊘ ${excCount}</span>`;
        hBadges.innerHTML = html;
    }

    const sumElem = document.getElementById(cfg.summaryId);
    if (sumElem) {
        if (incCount === 0 && excCount === 0) {
            sumElem.textContent = facetKey === 'location' ? 'Any location' : 'No filters selected';
        } else if (incCount > 0 && excCount === 0) {
            sumElem.textContent = `${incCount} included`;
        } else if (incCount === 0 && excCount > 0) {
            sumElem.textContent = `${excCount} excluded`;
        } else {
            sumElem.textContent = `${incCount} included, ${excCount} excluded`;
        }
    }
}

function syncAllFacetUI() {
    ['dept', 'role', 'grade', 'pattern', 'contract', 'location'].forEach(k => {
        syncFacetUI(k);
    });
}

function switchFacetMode(facetKey, newMode) {
    state.facetModes[facetKey] = newMode;
    const tabs = document.querySelectorAll(`.facet-tab[data-facet="${facetKey}"]`);
    tabs.forEach(tab => {
        const mode = tab.dataset.mode;
        tab.classList.toggle('active-include', mode === 'include' && newMode === 'include');
        tab.classList.toggle('active-exclude', mode === 'exclude' && newMode === 'exclude');
    });
    syncFacetUI(facetKey);
}

function clearFacet(facetKey) {
    const cfg = FACET_CONFIG[facetKey];
    if (!cfg) return;
    state[cfg.incSet].clear();
    state[cfg.excSet].clear();
    syncFacetUI(facetKey);
    state.page = 1;
    fetchJobs();
}

async function fetchFilterOptions() {
    try {
        const res = await fetch('/api/filters');
        const data = await res.json();
        cachedFilterData = data;

        // Populate checklists
        renderFacetChecklist('dept', data.departments || []);
        renderFacetChecklist('role', data.role_types || []);
        renderFacetChecklist('grade', (data.job_grades && data.job_grades.length > 0) ? data.job_grades : [
            "Administrative Assistant",
            "Administrative Officer",
            "Executive Officer",
            "Higher Executive Officer",
            "Senior Executive Officer",
            "Grade 7",
            "Grade 6",
            "SCS Pay Band 1",
            "SCS Pay Band 2",
            "SCS Pay Band 3",
            "Other"
        ]);
        renderFacetChecklist('pattern', (data.working_patterns && data.working_patterns.length > 0) ? data.working_patterns : [
            "Full-time",
            "Part-time",
            "Flexible working",
            "Job share",
            "Compressed hours",
            "Homeworking",
            "Shift working"
        ]);
        renderFacetChecklist('contract', (data.contract_types && data.contract_types.length > 0) ? data.contract_types : [
            "Permanent",
            "Fixed term",
            "Temporary",
            "Loan",
            "Secondment",
            "Apprenticeship",
            "Internship"
        ]);

        syncAllFacetUI();
    } catch (err) {
        console.error('Error fetching filter options:', err);
    }
}

function updateAccordionSummaries() {
    syncAllFacetUI();

    if (state.minSalary && state.maxSalary) {
        elements.summarySalary.textContent = `${formatSalary(state.minSalary)} to ${formatSalary(state.maxSalary)}`;
    } else if (state.minSalary) {
        elements.summarySalary.textContent = `from ${formatSalary(state.minSalary)}`;
    } else if (state.maxSalary) {
        elements.summarySalary.textContent = `up to ${formatSalary(state.maxSalary)}`;
    } else {
        elements.summarySalary.textContent = 'no minimum, no maximum';
    }

    if (elements.summaryNumJobs) {
        elements.summaryNumJobs.textContent = state.numJobs ? (state.numJobs === '1' ? 'Single post (1)' : `${state.numJobs} posts`) : 'No filters selected';
    }
}

async function fetchJobs() {
    elements.jobsLoading.classList.remove('hidden');
    elements.jobsEmpty.classList.add('hidden');
    elements.jobsGrid.innerHTML = '';

    const offset = (state.page - 1) * state.limit;
    const params = new URLSearchParams();
    if (state.search) params.append("search", state.search);

    // Multi-select inclusion & exclusion lists
    state.departments.forEach(d => params.append("departments", d));
    state.excludeDepartments.forEach(d => params.append("exclude_departments", d));
    state.roleTypes.forEach(r => params.append("role_types", r));
    state.excludeRoleTypes.forEach(r => params.append("exclude_role_types", r));
    state.locations.forEach(l => params.append("locations", l));
    state.excludeLocations.forEach(l => params.append("exclude_locations", l));
    state.jobGrades.forEach(g => params.append("job_grades", g));
    state.excludeJobGrades.forEach(g => params.append("exclude_job_grades", g));
    state.workingPatterns.forEach(p => params.append("working_patterns", p));
    state.excludeWorkingPatterns.forEach(p => params.append("exclude_working_patterns", p));
    state.contractTypes.forEach(c => params.append("contract_types", c));
    state.excludeContractTypes.forEach(c => params.append("exclude_contract_types", c));

    if (state.minSalary) params.append("min_salary", state.minSalary);
    if (state.maxSalary) params.append("max_salary", state.maxSalary);
    if (state.numJobs) params.append("number_of_jobs", state.numJobs);
    if (state.onlyNewToday) params.append("only_new_today", "true");
    params.append("limit", state.limit);
    params.append("offset", offset);
    params.append("sort_by", state.sortBy);
    params.append("sort_order", state.sortOrder);

    try {
        const res = await fetch(`/api/jobs?${params.toString()}`);
        const data = await res.json();
        
        state.total = data.total || 0;
        state.jobs = data.jobs || [];
        renderJobs(state.jobs);
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
    const isUserLoggedIn = Boolean(authState.user || authState.token || localStorage.getItem('civil_auth_token'));

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
                    <div class="job-detail-item" title="Number of vacancies available for this role">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                            <circle cx="9" cy="7" r="4"></circle>
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                        </svg>
                        <span>Number of jobs: <strong>${job.number_of_jobs || 1}</strong> ${(job.number_of_jobs || 1) === 1 ? 'post' : 'posts'}</span>
                    </div>
                </div>

                <div class="job-card-footer">
                    <div style="display:flex; align-items:center; gap:6px; flex-wrap: wrap;">
                        <span class="ref-code">REF: ${escapeHtml(job.reference_number)}</span>
                        ${isNewToday ? '<span class="badge badge-success">New Today</span>' : ''}
                        ${(job.number_of_jobs && job.number_of_jobs > 1) ? `<span class="badge badge-warning" style="background: rgba(245, 158, 11, 0.18); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.35); font-size: 0.72rem; padding: 2px 7px;">${job.number_of_jobs} Posts Available</span>` : ''}
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <a href="${escapeHtml(job.job_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" style="padding: 5px 12px; font-size: 0.75rem;">
                            View Advert &rarr;
                        </a>
                        ${isUserLoggedIn ? `
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
    // Departments
    state.departments.forEach(dept => {
        addTag(`Dept: ${dept}`, () => {
            state.departments.delete(dept);
            syncFacetUI('dept');
            state.page = 1;
            fetchJobs();
        }, 'include');
    });
    state.excludeDepartments.forEach(dept => {
        addTag(`Exclude Dept: ${dept}`, () => {
            state.excludeDepartments.delete(dept);
            syncFacetUI('dept');
            state.page = 1;
            fetchJobs();
        }, 'exclude');
    });

    // Roles
    state.roleTypes.forEach(role => {
        addTag(`Role: ${role}`, () => {
            state.roleTypes.delete(role);
            syncFacetUI('role');
            state.page = 1;
            fetchJobs();
        }, 'include');
    });
    state.excludeRoleTypes.forEach(role => {
        addTag(`Exclude Role: ${role}`, () => {
            state.excludeRoleTypes.delete(role);
            syncFacetUI('role');
            state.page = 1;
            fetchJobs();
        }, 'exclude');
    });

    // Locations
    state.locations.forEach(loc => {
        addTag(`Location: ${loc}`, () => {
            state.locations.delete(loc);
            syncFacetUI('location');
            state.page = 1;
            fetchJobs();
        }, 'include');
    });
    state.excludeLocations.forEach(loc => {
        addTag(`Exclude Location: ${loc}`, () => {
            state.excludeLocations.delete(loc);
            syncFacetUI('location');
            state.page = 1;
            fetchJobs();
        }, 'exclude');
    });

    // Grades
    state.jobGrades.forEach(grade => {
        addTag(`Grade: ${grade}`, () => {
            state.jobGrades.delete(grade);
            syncFacetUI('grade');
            state.page = 1;
            fetchJobs();
        }, 'include');
    });
    state.excludeJobGrades.forEach(grade => {
        addTag(`Exclude Grade: ${grade}`, () => {
            state.excludeJobGrades.delete(grade);
            syncFacetUI('grade');
            state.page = 1;
            fetchJobs();
        }, 'exclude');
    });

    // Patterns
    state.workingPatterns.forEach(pattern => {
        addTag(`Pattern: ${pattern}`, () => {
            state.workingPatterns.delete(pattern);
            syncFacetUI('pattern');
            state.page = 1;
            fetchJobs();
        }, 'include');
    });
    state.excludeWorkingPatterns.forEach(pattern => {
        addTag(`Exclude Pattern: ${pattern}`, () => {
            state.excludeWorkingPatterns.delete(pattern);
            syncFacetUI('pattern');
            state.page = 1;
            fetchJobs();
        }, 'exclude');
    });

    // Contracts
    state.contractTypes.forEach(contract => {
        addTag(`Contract: ${contract}`, () => {
            state.contractTypes.delete(contract);
            syncFacetUI('contract');
            state.page = 1;
            fetchJobs();
        }, 'include');
    });
    state.excludeContractTypes.forEach(contract => {
        addTag(`Exclude Contract: ${contract}`, () => {
            state.excludeContractTypes.delete(contract);
            syncFacetUI('contract');
            state.page = 1;
            fetchJobs();
        }, 'exclude');
    });

    if (state.minSalary || state.maxSalary) {
        const sLabel = `Salary: ${state.minSalary ? formatSalary(state.minSalary) : '£0'} - ${state.maxSalary ? formatSalary(state.maxSalary) : 'Any'}`;
        addTag(sLabel, () => {
            state.minSalary = '';
            state.maxSalary = '';
            if (elements.filterSalaryMin) elements.filterSalaryMin.value = '';
            if (elements.filterSalaryMax) elements.filterSalaryMax.value = '';
            state.page = 1;
            fetchJobs();
        });
    }

    if (state.numJobs) {
        addTag(`Posts: ${state.numJobs}`, () => {
            state.numJobs = '';
            if (elements.filterNumJobsSelect) elements.filterNumJobsSelect.value = '';
            state.page = 1;
            fetchJobs();
        });
    }

    if (state.onlyNewToday) {
        addTag(`New Today Only`, () => {
            state.onlyNewToday = false;
            elements.onlyNewTodayCheckbox.checked = false;
            updateNewTodayVisuals(false);
            state.page = 1;
            fetchJobs();
        });
    }
}

function applySidebarFilters() {
    state.minSalary = elements.filterSalaryMin ? elements.filterSalaryMin.value : '';
    state.maxSalary = elements.filterSalaryMax ? elements.filterSalaryMax.value : '';
    state.numJobs = elements.filterNumJobsSelect ? elements.filterNumJobsSelect.value : '';
    state.page = 1;
    fetchJobs();
}

function resetAllFilters() {
    state.search = '';
    state.minSalary = '';
    state.maxSalary = '';
    state.numJobs = '';
    state.onlyNewToday = false;
    state.page = 1;

    state.departments.clear();
    state.excludeDepartments.clear();
    state.roleTypes.clear();
    state.excludeRoleTypes.clear();
    state.locations.clear();
    state.excludeLocations.clear();
    state.jobGrades.clear();
    state.excludeJobGrades.clear();
    state.workingPatterns.clear();
    state.excludeWorkingPatterns.clear();
    state.contractTypes.clear();
    state.excludeContractTypes.clear();

    if (elements.searchInput) elements.searchInput.value = '';
    if (elements.clearSearchBtn) elements.clearSearchBtn.classList.add('hidden');
    if (elements.filterLocationInput) elements.filterLocationInput.value = '';
    if (elements.filterSalaryMin) elements.filterSalaryMin.value = '';
    if (elements.filterSalaryMax) elements.filterSalaryMax.value = '';
    if (elements.filterNumJobsSelect) elements.filterNumJobsSelect.value = '';
    if (elements.onlyNewTodayCheckbox) elements.onlyNewTodayCheckbox.checked = false;
    updateNewTodayVisuals(false);

    document.querySelectorAll('.facet-search-box').forEach(inp => {
        inp.value = '';
    });
    document.querySelectorAll('.facet-checklist .facet-item').forEach(item => {
        item.style.display = 'flex';
    });

    syncAllFacetUI();
    fetchJobs();
}

function toggleNewTodayFilter(forceState = null) {
    const newState = forceState !== null ? forceState : !state.onlyNewToday;
    state.onlyNewToday = newState;
    if (elements.onlyNewTodayCheckbox) {
        elements.onlyNewTodayCheckbox.checked = newState;
    }
    updateNewTodayVisuals(newState);
    state.page = 1;
    fetchJobs();
}

function updateNewTodayVisuals(isActive) {
    if (elements.cardNewToday) {
        if (isActive) {
            elements.cardNewToday.style.borderColor = '#10b981';
            elements.cardNewToday.style.boxShadow = '0 0 16px rgba(16, 185, 129, 0.35)';
            if (elements.statNewTodaySub) elements.statNewTodaySub.textContent = 'Active filter • Click to show all';
        } else {
            elements.cardNewToday.style.borderColor = '';
            elements.cardNewToday.style.boxShadow = '';
            if (elements.statNewTodaySub) elements.statNewTodaySub.textContent = 'Click card to filter today\'s jobs';
        }
    }
    if (elements.quickNewTodayBtn) {
        if (isActive) {
            elements.quickNewTodayBtn.style.background = '#10b981';
            elements.quickNewTodayBtn.style.color = '#ffffff';
            elements.quickNewTodayBtn.style.borderColor = '#10b981';
        } else {
            elements.quickNewTodayBtn.style.background = 'rgba(16, 185, 129, 0.08)';
            elements.quickNewTodayBtn.style.color = '#10b981';
            elements.quickNewTodayBtn.style.borderColor = 'rgba(16, 185, 129, 0.4)';
        }
    }
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
    const syncCheckbox = document.getElementById('syncToLiveCheckbox');
    const syncToLive = syncCheckbox ? syncCheckbox.checked : true;

    closeScrapeModal();
    showScraperBanner(mode);

    try {
        const res = await fetch('/api/scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode, max_pages: maxPages, sync_to_live: syncToLive })
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
    if (elements.updateResultsBtn) {
        elements.updateResultsBtn.addEventListener('click', applySidebarFilters);
    }
    
    // Direct change on salary and post count selects
    [
        elements.filterSalaryMin,
        elements.filterSalaryMax,
        elements.filterNumJobsSelect
    ].filter(Boolean).forEach(select => {
        select.addEventListener('change', applySidebarFilters);
    });

    // Facet Tab switching (Include vs Exclude)
    document.querySelectorAll('.facet-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const facet = tab.dataset.facet;
            const mode = tab.dataset.mode;
            if (facet && mode) {
                switchFacetMode(facet, mode);
            }
        });
    });

    // In-facet search filtering
    document.querySelectorAll('.facet-search-box').forEach(box => {
        box.addEventListener('input', (e) => {
            const targetId = box.dataset.target;
            const term = e.target.value.toLowerCase().trim();
            const target = document.getElementById(targetId);
            if (target) {
                target.querySelectorAll('.facet-item').forEach(item => {
                    const text = item.textContent.toLowerCase();
                    item.style.display = text.includes(term) ? 'flex' : 'none';
                });
            }
        });
    });

    // Facet Clear buttons
    document.querySelectorAll('.facet-clear-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const facet = btn.dataset.facet;
            if (facet) {
                clearFacet(facet);
            }
        });
    });

    // Quick location chips
    document.querySelectorAll('#quickLocChips .chip-sm').forEach(chip => {
        chip.addEventListener('click', () => {
            const loc = chip.dataset.loc;
            if (!loc) return;
            const mode = state.facetModes.location || 'include';
            if (mode === 'include') {
                if (state.locations.has(loc)) {
                    state.locations.delete(loc);
                } else {
                    state.locations.add(loc);
                    state.excludeLocations.delete(loc);
                }
            } else {
                if (state.excludeLocations.has(loc)) {
                    state.excludeLocations.delete(loc);
                } else {
                    state.excludeLocations.add(loc);
                    state.locations.delete(loc);
                }
            }
            syncFacetUI('location');
            state.page = 1;
            fetchJobs();
        });
    });

    // Location text input and Add button
    const handleAddLocation = () => {
        if (!elements.filterLocationInput) return;
        const val = elements.filterLocationInput.value.trim();
        if (!val) return;
        const mode = state.facetModes.location || 'include';
        if (mode === 'include') {
            state.locations.add(val);
            state.excludeLocations.delete(val);
        } else {
            state.excludeLocations.add(val);
            state.locations.delete(val);
        }
        elements.filterLocationInput.value = '';
        syncFacetUI('location');
        state.page = 1;
        fetchJobs();
    };

    if (elements.addLocationBtn) {
        elements.addLocationBtn.addEventListener('click', handleAddLocation);
    }
    if (elements.filterLocationInput) {
        elements.filterLocationInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleAddLocation();
            }
        });
    }

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

    // Only New Today toggle & quick filters
    elements.onlyNewTodayCheckbox.addEventListener('change', (e) => {
        state.onlyNewToday = e.target.checked;
        updateNewTodayVisuals(state.onlyNewToday);
        state.page = 1;
        fetchJobs();
    });

    if (elements.cardNewToday) {
        elements.cardNewToday.addEventListener('click', () => {
            toggleNewTodayFilter();
        });
    }

    if (elements.quickNewTodayBtn) {
        elements.quickNewTodayBtn.addEventListener('click', () => {
            toggleNewTodayFilter();
        });
    }

    if (elements.newTodayToggleLabel) {
        elements.newTodayToggleLabel.addEventListener('click', () => {
            toggleNewTodayFilter();
        });
    }

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
        renderJobs(state.jobs);
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
    if (prefs.locations && Array.isArray(prefs.locations)) {
        prefs.locations.forEach(loc => state.locations.add(loc));
    }
    if (prefs.min_salary) {
        state.minSalary = String(prefs.min_salary);
        if (elements.filterSalaryMin) elements.filterSalaryMin.value = state.minSalary;
    }
    if (prefs.max_salary) {
        state.maxSalary = String(prefs.max_salary);
        if (elements.filterSalaryMax) elements.filterSalaryMax.value = state.maxSalary;
    }
    if (prefs.job_grade) {
        state.jobGrades.add(prefs.job_grade);
    }
    if (prefs.role_type) {
        state.roleTypes.add(prefs.role_type);
    }
    if (prefs.working_pattern) {
        state.workingPatterns.add(prefs.working_pattern);
    }
    if (prefs.contract_type) {
        state.contractTypes.add(prefs.contract_type);
    }
    syncAllFacetUI();
    state.page = 1;
    fetchJobs();
    if (elements.matchProfileBtn) elements.matchProfileBtn.classList.add('active');
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
document.addEventListener('DOMContentLoaded', async () => {
    // Restore theme
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
        elements.themeToggleBtn.innerHTML = '<span>☀️</span>';
    }

    setupEventListeners();
    await initAuth();
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
