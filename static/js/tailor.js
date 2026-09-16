/**
 * Civil Service Jobs Explorer - Application Studio & CV Tailor Controller
 * 
 * Features:
 * - Real-time ATS Compatibility Scoring (Targeting 90%+)
 * - Interactive Keyword Q&A Interviewer & Bullet Point Synthesis
 * - Civil Service Success Profiles Personal Statement Generator
 * - Tailored Cover Letter Generator
 * - Realistic Document Canvas with Formatting & PDF/Word Export
 * - OpenAI ChatGPT, Google Gemini & Smart Heuristic Engine Support
 */

(function () {
    'use strict';

    // Application State
    const state = {
        jobRef: '',
        jobData: null,
        cvText: '',
        analysis: null,
        activeTab: 'keywordsTab',
        activeFilter: 'all',
        activeKeywordForQa: null,
        aiProvider: localStorage.getItem('ai_provider') || 'openai',
        aiApiKey: localStorage.getItem('ai_api_key') || '',
        isAnalyzing: false,
        debounceTimer: null
    };

    // DOM Elements
    const elements = {
        // Job Header
        studioJobTitle: document.getElementById('studioJobTitle'),
        studioJobRef: document.getElementById('studioJobRef'),
        studioDept: document.getElementById('studioDept'),
        studioSalary: document.getElementById('studioSalary'),
        studioLocation: document.getElementById('studioLocation'),
        
        // ATS Gauge Header
        atsGaugeContainer: document.getElementById('atsGaugeContainer'),
        atsCircleProgress: document.getElementById('atsCircleProgress'),
        atsPercentValue: document.getElementById('atsPercentValue'),
        atsStatusLabel: document.getElementById('atsStatusLabel'),
        atsSubHint: document.getElementById('atsSubHint'),

        // AI Settings
        openAiSettingsBtn: document.getElementById('openAiSettingsBtn'),
        aiProviderLabel: document.getElementById('aiProviderLabel'),
        aiSettingsModal: document.getElementById('aiSettingsModal'),
        closeAiSettingsBtn: document.getElementById('closeAiSettingsBtn'),
        aiProviderSelect: document.getElementById('aiProviderSelect'),
        aiApiKeyInput: document.getElementById('aiApiKeyInput'),
        saveAiSettingsBtn: document.getElementById('saveAiSettingsBtn'),

        // Export Dropdown
        exportCvBtn: document.getElementById('exportCvBtn'),
        exportMenu: document.getElementById('exportMenu'),
        exportPdfBtn: document.getElementById('exportPdfBtn'),
        exportDocxBtn: document.getElementById('exportDocxBtn'),
        copyCvTextBtn: document.getElementById('copyCvTextBtn'),

        // Doc Editor Canvas & Tools
        cvDocumentCanvas: document.getElementById('cvDocumentCanvas'),
        docTypeBadge: document.getElementById('docTypeBadge'),
        toolBold: document.getElementById('toolBold'),
        toolItalic: document.getElementById('toolItalic'),
        toolH2: document.getElementById('toolH2'),
        toolH3: document.getElementById('toolH3'),
        toolBullet: document.getElementById('toolBullet'),
        uploadCvFileBtn: document.getElementById('uploadCvFileBtn'),
        cvFileInput: document.getElementById('cvFileInput'),
        resetToDefaultCvBtn: document.getElementById('resetToDefaultCvBtn'),
        editorWordCount: document.getElementById('editorWordCount'),
        editorCharCount: document.getElementById('editorCharCount'),
        editorSyncStatus: document.getElementById('editorSyncStatus'),

        // Tab Panels
        tabs: document.querySelectorAll('.copilot-tab'),
        tabPanels: document.querySelectorAll('.copilot-tab-panel'),

        // Tab 1: Keywords & ATS
        panelAtsScore: document.getElementById('panelAtsScore'),
        panelAtsBadge: document.getElementById('panelAtsBadge'),
        reanalyzeBtn: document.getElementById('reanalyzeBtn'),
        scoreKeywordsVal: document.getElementById('scoreKeywordsVal'),
        barKeywords: document.getElementById('barKeywords'),
        scoreBehavioursVal: document.getElementById('scoreBehavioursVal'),
        barBehaviours: document.getElementById('barBehaviours'),
        scoreMetricsVal: document.getElementById('scoreMetricsVal'),
        barMetrics: document.getElementById('barMetrics'),
        scoreFormattingVal: document.getElementById('scoreFormattingVal'),
        barFormatting: document.getElementById('barFormatting'),
        atsTipsList: document.getElementById('atsTipsList'),
        countAllKw: document.getElementById('countAllKw'),
        countMissingKw: document.getElementById('countMissingKw'),
        countMatchedKw: document.getElementById('countMatchedKw'),
        chipFilters: document.querySelectorAll('.chip-filter'),
        keywordsListContainer: document.getElementById('keywordsListContainer'),

        // Tab 2: Personal Statement
        statementWordCountSelect: document.getElementById('statementWordCountSelect'),
        behavioursCheckboxes: document.getElementById('behavioursCheckboxes'),
        generateStatementBtn: document.getElementById('generateStatementBtn'),
        statementOutputText: document.getElementById('statementOutputText'),
        statementActualWords: document.getElementById('statementActualWords'),
        copyStatementBtn: document.getElementById('copyStatementBtn'),
        downloadStatementBtn: document.getElementById('downloadStatementBtn'),

        // Tab 3: Cover Letter
        generateCoverLetterBtn: document.getElementById('generateCoverLetterBtn'),
        letterOutputText: document.getElementById('letterOutputText'),
        letterActualWords: document.getElementById('letterActualWords'),
        copyLetterBtn: document.getElementById('copyLetterBtn'),
        downloadLetterBtn: document.getElementById('downloadLetterBtn'),

        // Tab 4: Advert Details
        advertTitleDisplay: document.getElementById('advertTitleDisplay'),
        viewOriginalGovUkLink: document.getElementById('viewOriginalGovUkLink'),
        advertMetaGrid: document.getElementById('advertMetaGrid'),
        advertJobSummary: document.getElementById('advertJobSummary'),
        advertJobDesc: document.getElementById('advertJobDesc'),
        advertPersonSpec: document.getElementById('advertPersonSpec'),
        advertBehaviours: document.getElementById('advertBehaviours'),
        advertTechnical: document.getElementById('advertTechnical'),

        // Modal 1: Keyword QA
        keywordQaModal: document.getElementById('keywordQaModal'),
        closeQaModalBtn: document.getElementById('closeQaModalBtn'),
        qaModalKeywordTitle: document.getElementById('qaModalKeywordTitle'),
        qaCategoryPill: document.getElementById('qaCategoryPill'),
        qaQuestionText: document.getElementById('qaQuestionText'),
        qaUserExperienceInput: document.getElementById('qaUserExperienceInput'),
        qaGenerateBulletBtn: document.getElementById('qaGenerateBulletBtn'),
        qaQuickAddDefaultBtn: document.getElementById('qaQuickAddDefaultBtn'),
        qaSuggestionResult: document.getElementById('qaSuggestionResult'),
        qaPlacementText: document.getElementById('qaPlacementText'),
        qaSuggestedBulletBox: document.getElementById('qaSuggestedBulletBox'),
        qaExplanationText: document.getElementById('qaExplanationText'),
        qaInsertIntoCvBtn: document.getElementById('qaInsertIntoCvBtn'),

        // User Resumes & Auth Gate
        userResumeSelect: document.getElementById('userResumeSelect'),
        authGateModal: document.getElementById('authGateModal')
    };

    function getAuthHeaders(includeContentType = true) {
        const headers = {};
        if (includeContentType) {
            headers['Content-Type'] = 'application/json';
        }
        const token = localStorage.getItem('civil_auth_token');
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        return headers;
    }

    // ==========================================
    // Initialization & Job Loading
    // ==========================================

    async function init() {
        parseJobReference();
        initUiSettings();
        setupEventListeners();

        if (state.jobRef) {
            await loadJobAdvertData(state.jobRef);
        } else {
            // Default reference from screenshot if none in URL
            state.jobRef = '481446';
            await loadJobAdvertData(state.jobRef);
        }
    }

    function parseJobReference() {
        const pathSegments = window.location.pathname.split('/').filter(Boolean);
        if (pathSegments.length >= 2 && pathSegments[0] === 'tailor') {
            state.jobRef = pathSegments[1];
        } else {
            const params = new URLSearchParams(window.location.search);
            state.jobRef = params.get('ref') || params.get('job_ref') || '';
        }
    }

    function initUiSettings() {
        if (state.aiProvider === 'gemini') {
            elements.aiProviderLabel.textContent = 'Gemini AI';
        } else if (state.aiProvider === 'offline') {
            elements.aiProviderLabel.textContent = 'Smart Offline';
        } else {
            elements.aiProviderLabel.textContent = 'ChatGPT AI';
        }

        elements.aiProviderSelect.value = state.aiProvider;
        elements.aiApiKeyInput.value = state.aiApiKey;
    }

    async function loadJobAdvertData(ref) {
        const token = localStorage.getItem('civil_auth_token');
        if (!token) {
            if (elements.authGateModal) {
                elements.authGateModal.classList.remove('hidden');
            }
            return;
        }

        try {
            elements.studioJobTitle.textContent = `Loading vacancy #${ref}...`;
            const response = await fetch(`/api/jobs/${encodeURIComponent(ref)}/full-advert`, {
                headers: getAuthHeaders(false)
            });
            if (!response.ok) {
                if (response.status === 401 && elements.authGateModal) {
                    elements.authGateModal.classList.remove('hidden');
                    return;
                }
                throw new Error(`Vacancy #${ref} could not be retrieved.`);
            }

            const data = await response.json();
            if (!data.user && elements.authGateModal) {
                elements.authGateModal.classList.remove('hidden');
                return;
            }

            state.jobData = data.job;

            // Render Header
            elements.studioJobTitle.textContent = state.jobData.title || 'Civil Service Role';
            elements.studioJobRef.textContent = `REF: ${state.jobData.reference_number || ref}`;
            elements.studioDept.textContent = state.jobData.department || 'HM Government';
            elements.studioSalary.textContent = state.jobData.salary || 'Competitive';
            elements.studioLocation.textContent = state.jobData.location || 'United Kingdom';

            // Populate Full Advert Tab
            renderAdvertTab(state.jobData);

            // Populate Multiple Resumes Select if available
            if (elements.userResumeSelect && data.user_resumes && data.user_resumes.length > 0) {
                elements.userResumeSelect.innerHTML = data.user_resumes.map(r => 
                    `<option value="${r.id}" ${r.is_primary ? 'selected' : ''}>${escapeHtml(r.filename)}</option>`
                ).join('');
                elements.userResumeSelect.classList.remove('hidden');
            } else if (elements.userResumeSelect) {
                elements.userResumeSelect.classList.add('hidden');
            }

            // Populate Document Canvas with User's Uploaded CV!
            const initialCv = data.initial_cv_text || data.default_cv_template;
            elements.docTypeBadge.textContent = data.user_has_custom_cv 
                ? (data.active_resume_name || 'Your Uploaded CV') 
                : 'Civil Service Template';
            renderCvInCanvas(initialCv);

            // Run initial ATS analysis
            await analyzeCvContent();

        } catch (error) {
            console.error('Failed to load advert:', error);
            elements.studioJobTitle.textContent = 'Civil Service Application Studio';
            elements.keywordsListContainer.innerHTML = `
                <div class="empty-state-loading text-danger">
                    <p>Failed to load vacancy details: ${escapeHtml(error.message)}</p>
                </div>
            `;
        }
    }

    function renderAdvertTab(job) {
        elements.advertTitleDisplay.textContent = job.title;
        if (job.job_url) {
            elements.viewOriginalGovUkLink.href = job.job_url;
        }

        // Meta Grid
        elements.advertMetaGrid.innerHTML = `
            <div class="meta-chip">
                <span class="meta-chip-label">Department</span>
                <div class="meta-chip-val">${escapeHtml(job.department || 'Civil Service')}</div>
            </div>
            <div class="meta-chip">
                <span class="meta-chip-label">Salary</span>
                <div class="meta-chip-val">${escapeHtml(job.salary || 'Competitive')}</div>
            </div>
            <div class="meta-chip">
                <span class="meta-chip-label">Grade</span>
                <div class="meta-chip-val">${escapeHtml(job.job_grade || 'Executive Officer')}</div>
            </div>
            <div class="meta-chip">
                <span class="meta-chip-label">Working Pattern</span>
                <div class="meta-chip-val">${escapeHtml(job.working_pattern || 'Full-time / Flexible')}</div>
            </div>
        `;

        elements.advertJobSummary.textContent = job.job_summary || 'Please refer to job description.';
        elements.advertJobDesc.textContent = job.job_description || 'Detailed responsibilities listed in advert.';
        elements.advertPersonSpec.textContent = job.person_specification || 'Success Profiles Essential Criteria.';
        elements.advertBehaviours.textContent = job.behaviours || 'Communicating and Influencing, Delivering at Pace, Making Effective Decisions.';
        elements.advertTechnical.textContent = job.technical_skills || 'Relevant professional qualifications or demonstrated practical experience.';
    }

    // ==========================================
    // Document Canvas & Formatting
    // ==========================================

    function renderCvInCanvas(markdownText) {
        state.cvText = markdownText;
        // Simple Markdown to semantic HTML converter for realistic doc viewing
        let html = escapeHtml(markdownText);

        // H1
        html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');
        // H2
        html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
        // H3
        html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
        // Bold
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        // Italic
        html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
        // Bullets
        html = html.replace(/^- (.*?)$/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*?<\/li>)/s, '<ul>$1</ul>');
        // Clean linebreaks
        html = html.replace(/\n\n/g, '<p></p>');

        elements.cvDocumentCanvas.innerHTML = html;
        updateWordAndCharCount();
    }

    function getCanvasPlainText() {
        return elements.cvDocumentCanvas.innerText || elements.cvDocumentCanvas.textContent || '';
    }

    function updateWordAndCharCount() {
        const text = getCanvasPlainText().trim();
        const words = text ? text.split(/\s+/).length : 0;
        elements.editorWordCount.textContent = words;
        elements.editorCharCount.textContent = text.length;
    }

    function triggerDebouncedAnalysis() {
        clearTimeout(state.debounceTimer);
        elements.editorSyncStatus.innerHTML = '<span class="sync-dot" style="background:#f59e0b; box-shadow:0 0 6px #f59e0b;"></span> Recalculating ATS...';
        state.debounceTimer = setTimeout(async () => {
            await analyzeCvContent();
            elements.editorSyncStatus.innerHTML = '<span class="sync-dot"></span> Live ATS Sync Active';
        }, 500);
    }

    // ==========================================
    // ATS Compatibility Analysis
    // ==========================================

    async function analyzeCvContent() {
        if (!state.jobData) return;
        state.isAnalyzing = true;

        const cvContent = getCanvasPlainText();

        try {
            const payload = {
                cv_text: cvContent,
                job_data: state.jobData,
                api_key: state.aiApiKey,
                provider: state.aiProvider
            };

            const res = await fetch('/api/ai/analyze', {
                method: 'POST',
                headers: getAuthHeaders(true),
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error('Analysis failed');

            const data = await res.json();
            state.analysis = data.analysis;
            renderAtsResults(state.analysis);

        } catch (err) {
            console.error('ATS Analysis error:', err);
        } finally {
            state.isAnalyzing = false;
        }
    }

    function renderAtsResults(analysis) {
        const score = analysis.ats_score || 0;
        const details = analysis.ats_details || {};
        const breakdown = details.breakdown || {};

        // Update Circular Gauge in Header
        elements.atsPercentValue.textContent = `${score}%`;
        elements.atsCircleProgress.setAttribute('stroke-dasharray', `${score}, 100`);

        if (score >= 90) {
            elements.atsCircleProgress.style.stroke = 'var(--ats-green)';
            elements.atsStatusLabel.textContent = 'ATS Ready (90%+)';
            elements.atsStatusLabel.style.color = 'var(--ats-green)';
            elements.atsGaugeContainer.className = 'ats-gauge-container ats-green';
            elements.panelAtsBadge.className = 'ats-status-badge text-success';
            elements.panelAtsBadge.textContent = 'ATS Ready (90%+)';
        } else if (score >= 75) {
            elements.atsCircleProgress.style.stroke = 'var(--ats-amber)';
            elements.atsStatusLabel.textContent = 'Strong Match';
            elements.atsStatusLabel.style.color = 'var(--ats-amber)';
            elements.atsGaugeContainer.className = 'ats-gauge-container';
            elements.panelAtsBadge.className = 'ats-status-badge';
            elements.panelAtsBadge.style.color = 'var(--ats-amber)';
            elements.panelAtsBadge.textContent = 'Good Match (Near 90%)';
        } else {
            elements.atsCircleProgress.style.stroke = 'var(--ats-red)';
            elements.atsStatusLabel.textContent = 'Needs Keywords';
            elements.atsStatusLabel.style.color = 'var(--ats-red)';
            elements.atsGaugeContainer.className = 'ats-gauge-container';
            elements.panelAtsBadge.className = 'ats-status-badge';
            elements.panelAtsBadge.style.color = 'var(--ats-red)';
            elements.panelAtsBadge.textContent = 'Missing Keywords';
        }

        // Tab 1 Large Score
        elements.panelAtsScore.textContent = score;
        elements.panelAtsScore.style.color = score >= 90 ? 'var(--ats-green)' : (score >= 75 ? 'var(--ats-amber)' : 'var(--ats-red)');

        // 4 Pillars Breakdown
        elements.scoreKeywordsVal.textContent = `${breakdown.keywords || 0}/40`;
        elements.barKeywords.style.width = `${((breakdown.keywords || 0) / 40) * 100}%`;

        elements.scoreBehavioursVal.textContent = `${breakdown.behaviours || 0}/20`;
        elements.barBehaviours.style.width = `${((breakdown.behaviours || 0) / 20) * 100}%`;

        elements.scoreMetricsVal.textContent = `${breakdown.metrics || 0}/20`;
        elements.barMetrics.style.width = `${((breakdown.metrics || 0) / 20) * 100}%`;

        elements.scoreFormattingVal.textContent = `${breakdown.formatting || 0}/20`;
        elements.barFormatting.style.width = `${((breakdown.formatting || 0) / 20) * 100}%`;

        // Tips List
        const tips = details.tips || [];
        if (tips.length > 0) {
            elements.atsTipsList.innerHTML = tips.map(t => `<li>${escapeHtml(t)}</li>`).join('');
        } else {
            elements.atsTipsList.innerHTML = `<li>Outstanding! Your CV covers essential criteria and scores 90%+ ATS ready.</li>`;
        }

        // Keywords Counts & Render Cards
        const matched = analysis.matched_keywords || [];
        const missing = analysis.missing_keywords || [];
        const total = matched.length + missing.length;

        elements.countAllKw.textContent = total;
        elements.countMissingKw.textContent = missing.length;
        elements.countMatchedKw.textContent = matched.length;

        renderKeywordCards(matched, missing);
    }

    function renderKeywordCards(matched, missing) {
        let itemsToShow = [];

        if (state.activeFilter === 'missing') {
            itemsToShow = missing.map(m => ({ ...m, status: 'missing' }));
        } else if (state.activeFilter === 'matched') {
            itemsToShow = matched.map(m => ({ ...m, status: 'matched' }));
        } else {
            // Missing first, then matched
            itemsToShow = [
                ...missing.map(m => ({ ...m, status: 'missing' })),
                ...matched.map(m => ({ ...m, status: 'matched' }))
            ];
        }

        if (itemsToShow.length === 0) {
            elements.keywordsListContainer.innerHTML = `
                <div class="empty-state-loading">
                    <p>No keywords found matching current filter.</p>
                </div>
            `;
            return;
        }

        elements.keywordsListContainer.innerHTML = itemsToShow.map(item => {
            const isMissing = item.status === 'missing';
            return `
                <div class="keyword-card ${isMissing ? 'is-missing' : 'is-matched'}" data-kw="${escapeHtml(item.keyword)}">
                    <div class="keyword-info">
                        <div class="keyword-title-row">
                            <span class="keyword-name">${escapeHtml(item.keyword)}</span>
                            <span class="keyword-cat-tag">${escapeHtml(item.category || 'Skill')}</span>
                        </div>
                        <span class="keyword-status-text ${isMissing ? 'missing' : 'matched'}">
                            ${isMissing ? '⚠️ Missing in your CV' : '✅ Included & Matched'}
                        </span>
                    </div>
                    ${isMissing ? `
                        <button class="btn-add-keyword" data-keyword="${escapeHtml(item.keyword)}" data-category="${escapeHtml(item.category || 'technical')}">
                            <span>Add with AI</span>
                            <span>✨</span>
                        </button>
                    ` : `
                        <span class="badge badge-success" style="font-size:0.7rem;">Covered</span>
                    `}
                </div>
            `;
        }).join('');

        // Wire up "Add with AI" buttons
        elements.keywordsListContainer.querySelectorAll('.btn-add-keyword').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const kw = btn.getAttribute('data-keyword');
                const cat = btn.getAttribute('data-category');
                openKeywordQaModal(kw, cat);
            });
        });
    }

    // ==========================================
    // Modal 1: Interactive Keyword Clarifier Q&A
    // ==========================================

    async function openKeywordQaModal(keyword, category) {
        state.activeKeywordForQa = { keyword, category };
        elements.qaModalKeywordTitle.textContent = `Add "${keyword}" to Your CV`;
        elements.qaCategoryPill.textContent = category.toUpperCase();
        elements.qaQuestionText.innerHTML = '<div class="spinner"></div> Formulating contextual interview question...';
        elements.qaUserExperienceInput.value = '';
        elements.qaSuggestionResult.classList.add('hidden');
        elements.keywordQaModal.classList.remove('hidden');

        try {
            const res = await fetch('/api/ai/ask-keyword-question', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    keyword: keyword,
                    category: category,
                    job_title: state.jobData ? state.jobData.title : 'Civil Service Position',
                    api_key: state.aiApiKey,
                    provider: state.aiProvider
                })
            });

            if (!res.ok) throw new Error('Could not generate question');
            const data = await res.json();
            elements.qaQuestionText.textContent = data.result.question || `How have you demonstrated ${keyword} in your recent work?`;

        } catch (e) {
            elements.qaQuestionText.textContent = `Do you have practical experience with ${keyword}? Please share a 1-2 sentence example or accomplishment.`;
        }
    }

    async function handleGenerateBulletSuggestion(useDefault = false) {
        if (!state.activeKeywordForQa) return;

        const userInput = useDefault ? '' : elements.qaUserExperienceInput.value.trim();
        elements.qaGenerateBulletBtn.disabled = true;
        elements.qaGenerateBulletBtn.innerHTML = '<div class="spinner"></div> Synthesizing...';

        try {
            const res = await fetch('/api/ai/integrate-keyword', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    keyword: state.activeKeywordForQa.keyword,
                    user_experience: userInput || `Demonstrated competency in ${state.activeKeywordForQa.keyword}`,
                    cv_text: getCanvasPlainText(),
                    job_title: state.jobData ? state.jobData.title : 'Civil Service Position',
                    api_key: state.aiApiKey,
                    provider: state.aiProvider
                })
            });

            if (!res.ok) throw new Error('Failed to generate suggestion');
            const data = await res.json();
            const sug = data.suggestion;

            elements.qaSuggestedBulletBox.textContent = sug.suggested_bullet;
            elements.qaPlacementText.textContent = `Placement: ${sug.placement}`;
            elements.qaExplanationText.textContent = sug.explanation;
            elements.qaSuggestionResult.classList.remove('hidden');

        } catch (e) {
            console.error('Suggestion generation error:', e);
            elements.qaSuggestedBulletBox.textContent = `Applied ${state.activeKeywordForQa.keyword} across operational tasks, ensuring high-quality standards and timely delivery.`;
            elements.qaPlacementText.textContent = 'Placement: Professional Experience';
            elements.qaSuggestionResult.classList.remove('hidden');
        } finally {
            elements.qaGenerateBulletBtn.disabled = false;
            elements.qaGenerateBulletBtn.innerHTML = `
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                </svg>
                <span>Craft Humanized CV Bullet Point</span>
            `;
        }
    }

    function insertSuggestedBulletIntoCv() {
        const bulletText = elements.qaSuggestedBulletBox.textContent.trim();
        if (!bulletText) return;

        // Find insertion point in canvas: after an existing <li> in Experience, or append
        const lis = elements.cvDocumentCanvas.querySelectorAll('li');
        const newLi = document.createElement('li');
        newLi.className = 'highlight-added';
        newLi.textContent = bulletText;

        if (lis.length > 0) {
            // Insert under first experience block
            lis[0].parentNode.insertBefore(newLi, lis[0].nextSibling);
        } else {
            const ul = document.createElement('ul');
            ul.appendChild(newLi);
            elements.cvDocumentCanvas.appendChild(ul);
        }

        // Close modal
        elements.keywordQaModal.classList.add('hidden');

        // Scroll to inserted item
        newLi.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Recalculate word count & ATS score
        updateWordAndCharCount();
        triggerDebouncedAnalysis();
    }

    // ==========================================
    // Personal Statement Generator
    // ==========================================

    async function handleGeneratePersonalStatement() {
        if (!state.jobData) return;

        const targetWords = parseInt(elements.statementWordCountSelect.value, 10) || 750;
        const selectedBehaviours = [];
        elements.behavioursCheckboxes.querySelectorAll('input:checked').forEach(cb => {
            selectedBehaviours.push(cb.value);
        });

        elements.generateStatementBtn.disabled = true;
        elements.generateStatementBtn.innerHTML = '<div class="spinner"></div> Drafting Personal Statement with Success Profiles...';
        elements.statementOutputText.value = 'Analyzing your CV and structuring Evidence using Situation, Task, Action, Result (STAR)...';

        try {
            const res = await fetch('/api/ai/personal-statement', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cv_text: getCanvasPlainText(),
                    job_data: state.jobData,
                    target_words: targetWords,
                    focus_behaviours: selectedBehaviours,
                    api_key: state.aiApiKey,
                    provider: state.aiProvider
                })
            });

            if (!res.ok) throw new Error('Personal statement generation failed');
            const data = await res.json();
            elements.statementOutputText.value = data.result.statement;
            elements.statementActualWords.textContent = data.result.word_count;

        } catch (e) {
            console.error('Statement error:', e);
            elements.statementOutputText.value = `Error drafting statement: ${e.message}. Please verify API settings.`;
        } finally {
            elements.generateStatementBtn.disabled = false;
            elements.generateStatementBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                </svg>
                <span>Generate Tailored Personal Statement</span>
            `;
        }
    }

    // ==========================================
    // Cover Letter Generator
    // ==========================================

    async function handleGenerateCoverLetter() {
        if (!state.jobData) return;

        elements.generateCoverLetterBtn.disabled = true;
        elements.generateCoverLetterBtn.innerHTML = '<div class="spinner"></div> Crafting UK Civil Service Cover Letter...';
        elements.letterOutputText.value = 'Synthesizing covering letter addressed to the department...';

        try {
            const res = await fetch('/api/ai/cover-letter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cv_text: getCanvasPlainText(),
                    job_data: state.jobData,
                    api_key: state.aiApiKey,
                    provider: state.aiProvider
                })
            });

            if (!res.ok) throw new Error('Cover letter generation failed');
            const data = await res.json();
            elements.letterOutputText.value = data.result.cover_letter;
            const words = data.result.cover_letter.trim().split(/\s+/).length;
            elements.letterActualWords.textContent = words;

        } catch (e) {
            console.error('Cover letter error:', e);
            elements.letterOutputText.value = `Error generating letter: ${e.message}.`;
        } finally {
            elements.generateCoverLetterBtn.disabled = false;
            elements.generateCoverLetterBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                    <polyline points="22,6 12,13 2,6"></polyline>
                </svg>
                <span>Generate Covering Letter</span>
            `;
        }
    }

    // ==========================================
    // File Upload & CV Text Extraction
    // ==========================================

    async function handleCvFileUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        elements.docTypeBadge.textContent = 'Extracting...';

        try {
            const token = localStorage.getItem('civil_auth_token');
            const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

            const res = await fetch('/api/cv/extract-text', {
                method: 'POST',
                headers: headers,
                body: formData
            });

            if (!res.ok) throw new Error('Failed to extract text from document');
            const data = await res.json();

            renderCvInCanvas(data.text);
            elements.docTypeBadge.textContent = file.name;
            await analyzeCvContent();

        } catch (err) {
            alert(`File reading error: ${err.message}`);
            elements.docTypeBadge.textContent = 'Civil Service Template';
        }
    }

    // ==========================================
    // Export Handlers (PDF, DOCX, Copy)
    // ==========================================

    function exportAsPdf() {
        elements.exportMenu.classList.add('hidden');
        window.print();
    }

    function exportAsDocx() {
        elements.exportMenu.classList.add('hidden');
        const content = elements.cvDocumentCanvas.innerHTML;
        const htmlDoc = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>CV Document</title>
                <style>
                    body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #111; }
                    h1 { font-size: 18pt; color: #000; text-transform: uppercase; margin-bottom: 2pt; }
                    h2 { font-size: 13pt; color: #111; border-bottom: 1.5pt solid #000; margin-top: 14pt; margin-bottom: 6pt; }
                    h3 { font-size: 11pt; font-weight: bold; margin-top: 8pt; margin-bottom: 2pt; }
                    ul { margin-top: 4pt; margin-bottom: 8pt; }
                    li { margin-bottom: 3pt; }
                </style>
            </head>
            <body>
                ${content}
            </body>
            </html>
        `;

        const blob = new Blob([htmlDoc], { type: 'application/msword;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Tailored_CV_${state.jobRef || 'Application'}.doc`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function copyCanvasContent() {
        elements.exportMenu.classList.add('hidden');
        const plain = getCanvasPlainText();
        navigator.clipboard.writeText(plain).then(() => {
            alert('CV copied to clipboard!');
        });
    }

    // ==========================================
    // Event Listeners Setup
    // ==========================================

    function setupEventListeners() {
        // Canvas Live Input
        elements.cvDocumentCanvas.addEventListener('input', () => {
            updateWordAndCharCount();
            triggerDebouncedAnalysis();
        });

        // Formatting Tools
        elements.toolBold.addEventListener('click', () => { document.execCommand('bold', false, null); });
        elements.toolItalic.addEventListener('click', () => { document.execCommand('italic', false, null); });
        elements.toolH2.addEventListener('click', () => { document.execCommand('formatBlock', false, '<h2>'); });
        elements.toolH3.addEventListener('click', () => { document.execCommand('formatBlock', false, '<h3>'); });
        elements.toolBullet.addEventListener('click', () => { document.execCommand('insertUnorderedList', false, null); });

        // File Upload
        elements.uploadCvFileBtn.addEventListener('click', () => { elements.cvFileInput.click(); });
        elements.cvFileInput.addEventListener('change', handleCvFileUpload);

        // Reset to Default Template
        elements.resetToDefaultCvBtn.addEventListener('click', async () => {
            if (confirm('Reset CV to default Civil Service template?')) {
                const res = await fetch('/api/cv/default-template');
                const data = await res.json();
                renderCvInCanvas(data.template);
                elements.docTypeBadge.textContent = 'Civil Service Template';
                await analyzeCvContent();
            }
        });

        // Tab Switching
        elements.tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetId = tab.getAttribute('data-tab');
                elements.tabs.forEach(t => t.classList.remove('active'));
                elements.tabPanels.forEach(p => p.classList.remove('active'));

                tab.classList.add('active');
                document.getElementById(targetId).classList.add('active');
                state.activeTab = targetId;
            });
        });

        // Keyword Filter Chips
        elements.chipFilters.forEach(chip => {
            chip.addEventListener('click', () => {
                elements.chipFilters.forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                state.activeFilter = chip.getAttribute('data-filter');
                if (state.analysis) {
                    renderKeywordCards(state.analysis.matched_keywords, state.analysis.missing_keywords);
                }
            });
        });

        // Re-analyze Button
        elements.reanalyzeBtn.addEventListener('click', () => {
            analyzeCvContent();
        });

        // User Resume Switcher
        if (elements.userResumeSelect) {
            elements.userResumeSelect.addEventListener('change', async (e) => {
                const resumeId = e.target.value;
                if (!resumeId) return;
                try {
                    elements.docTypeBadge.textContent = 'Loading CV...';
                    const res = await fetch(`/api/profile/resumes/${resumeId}/text`, {
                        headers: getAuthHeaders(true)
                    });
                    if (res.ok) {
                        const rData = await res.json();
                        renderCvInCanvas(rData.text);
                        elements.docTypeBadge.textContent = rData.filename;
                        await analyzeCvContent();
                    }
                } catch (err) {
                    console.error('Failed to load resume text:', err);
                }
            });
        }

        // Export Dropdown
        elements.exportCvBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            elements.exportMenu.classList.toggle('hidden');
        });

        document.addEventListener('click', (e) => {
            if (!elements.exportDropdownWrapper || !elements.exportDropdownWrapper.contains(e.target)) {
                elements.exportMenu.classList.add('hidden');
            }
        });

        elements.exportPdfBtn.addEventListener('click', exportAsPdf);
        elements.exportDocxBtn.addEventListener('click', exportAsDocx);
        elements.copyCvTextBtn.addEventListener('click', copyCanvasContent);

        // Modal 1: Keyword QA
        elements.closeQaModalBtn.addEventListener('click', () => {
            elements.keywordQaModal.classList.add('hidden');
        });
        elements.qaGenerateBulletBtn.addEventListener('click', () => handleGenerateBulletSuggestion(false));
        elements.qaQuickAddDefaultBtn.addEventListener('click', () => handleGenerateBulletSuggestion(true));
        elements.qaInsertIntoCvBtn.addEventListener('click', insertSuggestedBulletIntoCv);

        // Tab 2: Statement
        elements.generateStatementBtn.addEventListener('click', handleGeneratePersonalStatement);
        elements.copyStatementBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(elements.statementOutputText.value).then(() => alert('Personal statement copied!'));
        });
        elements.downloadStatementBtn.addEventListener('click', () => {
            downloadTextFile(elements.statementOutputText.value, `Personal_Statement_${state.jobRef}.txt`);
        });

        // Tab 3: Cover Letter
        elements.generateCoverLetterBtn.addEventListener('click', handleGenerateCoverLetter);
        elements.copyLetterBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(elements.letterOutputText.value).then(() => alert('Cover letter copied!'));
        });
        elements.downloadLetterBtn.addEventListener('click', () => {
            downloadTextFile(elements.letterOutputText.value, `Cover_Letter_${state.jobRef}.txt`);
        });

        // Modal 2: AI Settings
        elements.openAiSettingsBtn.addEventListener('click', () => {
            elements.aiSettingsModal.classList.remove('hidden');
        });
        elements.closeAiSettingsBtn.addEventListener('click', () => {
            elements.aiSettingsModal.classList.add('hidden');
        });
        elements.saveAiSettingsBtn.addEventListener('click', () => {
            state.aiProvider = elements.aiProviderSelect.value;
            state.aiApiKey = elements.aiApiKeyInput.value.trim();
            localStorage.setItem('ai_provider', state.aiProvider);
            localStorage.setItem('ai_api_key', state.aiApiKey);
            initUiSettings();
            elements.aiSettingsModal.classList.add('hidden');
            analyzeCvContent();
        });
    }

    function downloadTextFile(text, filename) {
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Start on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
