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
        activeResumeType: 'docx',
        activeResumeId: null,
        activeResumeRawUrl: '',
        viewMode: 'edit',
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

        // 3-Mode View Switcher & Preview Elements
        viewModeTabs: document.getElementById('viewModeTabs'),
        viewModeEdit: document.getElementById('viewModeEdit'),
        viewModeSplit: document.getElementById('viewModeSplit'),
        viewModePreview: document.getElementById('viewModePreview'),
        editorWorkspaceBody: document.getElementById('editorWorkspaceBody'),
        originalPreviewPane: document.getElementById('originalPreviewPane'),
        originalPreviewFrame: document.getElementById('originalPreviewFrame'),
        previewDocIcon: document.getElementById('previewDocIcon'),
        previewDocName: document.getElementById('previewDocName'),
        previewOpenTabLink: document.getElementById('previewOpenTabLink'),
        previewFallbackMsg: document.getElementById('previewFallbackMsg'),

        // Doc Editor Canvas & Tools
        cvDocumentCanvas: document.getElementById('cvDocumentCanvas'),
        docTypeBadge: document.getElementById('docTypeBadge'),
        toolFormatBlock: document.getElementById('toolFormatBlock'),
        toolBold: document.getElementById('toolBold'),
        toolItalic: document.getElementById('toolItalic'),
        toolUnderline: document.getElementById('toolUnderline'),
        toolBullet: document.getElementById('toolBullet'),
        toolNumbered: document.getElementById('toolNumbered'),
        toolInsertSection: document.getElementById('toolInsertSection'),
        uploadCvFileBtn: document.getElementById('uploadCvFileBtn'),
        cvFileInput: document.getElementById('cvFileInput'),
        cleanFormatCvBtn: document.getElementById('cleanFormatCvBtn'),
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
            state.activeResumeType = data.active_resume_type || 'docx';
            state.activeResumeId = data.active_resume_id || null;
            state.activeResumeRawUrl = data.active_resume_raw_url || '';

            applyDocumentTheme(state.activeResumeType, data.active_resume_name || 'Document');
            setOriginalPreview(state.activeResumeRawUrl, data.active_resume_name || 'Document');

            if (data.initial_cv_html && data.initial_cv_html.trim().length > 30) {
                renderCvInCanvas(data.initial_cv_html, true);
            } else {
                renderCvInCanvas(data.initial_cv_text || data.default_cv_template, false);
            }

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
    // Document Theme & Preview Handlers
    // ==========================================

    function applyDocumentTheme(fileType, filename = '') {
        const type = (fileType || '').toLowerCase();
        const canvas = elements.cvDocumentCanvas;
        if (!canvas) return;

        if (type.includes('doc')) {
            canvas.classList.add('doc-style-word');
            canvas.classList.remove('doc-style-pdf');
            elements.docTypeBadge.textContent = filename ? `${filename}` : 'Word Document (.docx)';
            if (elements.previewDocIcon) elements.previewDocIcon.textContent = '📝';
        } else if (type.includes('pdf')) {
            canvas.classList.add('doc-style-pdf');
            canvas.classList.remove('doc-style-word');
            elements.docTypeBadge.textContent = filename ? `${filename}` : 'PDF Document (.pdf)';
            if (elements.previewDocIcon) elements.previewDocIcon.textContent = '📄';
        } else {
            canvas.classList.add('doc-style-word');
            canvas.classList.remove('doc-style-pdf');
            elements.docTypeBadge.textContent = filename || 'Civil Service CV';
            if (elements.previewDocIcon) elements.previewDocIcon.textContent = '📋';
        }
    }

    function setOriginalPreview(rawUrl, filename = '') {
        state.activeResumeRawUrl = rawUrl || '';
        if (elements.previewDocName) {
            elements.previewDocName.textContent = filename || 'Original Uploaded Document';
        }
        if (elements.previewOpenTabLink) {
            elements.previewOpenTabLink.href = rawUrl || '#';
            elements.previewOpenTabLink.style.display = rawUrl ? 'inline-flex' : 'none';
        }
        if (rawUrl && elements.originalPreviewFrame) {
            elements.originalPreviewFrame.src = rawUrl;
            elements.originalPreviewFrame.classList.remove('hidden');
            if (elements.previewFallbackMsg) elements.previewFallbackMsg.classList.add('hidden');
        } else {
            if (elements.originalPreviewFrame) {
                elements.originalPreviewFrame.src = 'about:blank';
                elements.originalPreviewFrame.classList.add('hidden');
            }
            if (elements.previewFallbackMsg) elements.previewFallbackMsg.classList.remove('hidden');
        }
    }

    function setViewMode(mode) {
        state.viewMode = mode;
        if (elements.editorWorkspaceBody) {
            elements.editorWorkspaceBody.className = `editor-workspace-body mode-${mode}`;
        }
        if (elements.viewModeEdit) elements.viewModeEdit.classList.toggle('active', mode === 'edit');
        if (elements.viewModeSplit) elements.viewModeSplit.classList.toggle('active', mode === 'split');
        if (elements.viewModePreview) elements.viewModePreview.classList.toggle('active', mode === 'preview');

        // Ensure preview iframe src is loaded if in split or preview mode
        if ((mode === 'split' || mode === 'preview') && state.activeResumeRawUrl && elements.originalPreviewFrame) {
            if (!elements.originalPreviewFrame.src || elements.originalPreviewFrame.src.endsWith('blank')) {
                elements.originalPreviewFrame.src = state.activeResumeRawUrl;
            }
        }
    }

    // ==========================================
    // Document Canvas & Formatting
    // ==========================================

    function reconstructCvHtml(text) {
        if (!text) return '';
        const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        // Standardize bullet markers
        const bulletStandardized = normalized.replace(/^[ \t]*[●•■▪◦○\*\-][ \t]*/gm, '● ');

        const MAIN_HEADINGS = [
            'SUMMARY', 'PROFESSIONAL SUMMARY', 'PROFILE', 'PERSONAL STATEMENT', 'EXECUTIVE SUMMARY',
            'EDUCATION', 'ACADEMIC BACKGROUND', 'QUALIFICATIONS', 'EDUCATION & QUALIFICATIONS',
            'SKILLS', 'TECHNICAL SKILLS', 'KEY SKILLS', 'CORE COMPETENCIES', 'CORE SKILLS', 'TOOLS',
            'EXPERIENCE', 'WORK EXPERIENCE', 'EMPLOYMENT HISTORY', 'CAREER HISTORY', 'PROFESSIONAL EXPERIENCE',
            'CIVIL SERVICE BEHAVIOURS', 'BEHAVIOURS', 'PROJECTS', 'KEY ACHIEVEMENTS',
            'CERTIFICATIONS', 'PUBLICATIONS', 'LANGUAGES', 'INTERESTS', 'REFERENCES'
        ];

        const rawLines = bulletStandardized.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (rawLines.length === 0) return '';

        const htmlOut = [];
        let idx = 0;
        const total = rawLines.length;

        // 1. Header: Candidate Name & Contact Details
        const first = rawLines[0];
        const contactMatch = first.match(/(\+?\d[\d\s\-\(\)]{8,}\d|[\w\.-]+@[\w\.-]+\.\w+)/);
        if (contactMatch) {
            const namePart = first.substring(0, contactMatch.index).replace(/[|\-,]+$/, '').trim();
            const contactPart = first.substring(contactMatch.index).trim();
            if (namePart) htmlOut.push(`<h1>${escapeHtml(namePart)}</h1>`);
            if (contactPart) htmlOut.push(`<p class="cv-contact">${escapeHtml(contactPart)}</p>`);
            idx = 1;
        } else if (total > 1 && (rawLines[1].includes('@') || /\+?\d{8,}/.test(rawLines[1]) || rawLines[1].includes('|'))) {
            htmlOut.push(`<h1>${escapeHtml(first)}</h1>`);
            htmlOut.push(`<p class="cv-contact">${escapeHtml(rawLines[1])}</p>`);
            idx = 2;
        } else {
            htmlOut.push(`<h1>${escapeHtml(first)}</h1>`);
            idx = 1;
        }

        let currentBlockType = null;
        let currentTextParts = [];

        function flushBlock() {
            if (!currentTextParts || currentTextParts.length === 0) return;
            let joined = currentTextParts.join(' ');
            joined = joined.replace(/(\w+)-\s+(\w+)/g, '$1-$2');
            joined = joined.replace(/\s+([,.:;?!|])/g, '$1');
            joined = joined.replace(/\|\s*\|/g, '|');
            joined = joined.replace(/\s+/g, ' ').trim();
            if (!joined) return;

            const formatted = escapeHtml(joined)
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>');

            if (currentBlockType === 'h2') {
                htmlOut.push(`<h2>${formatted}</h2>`);
            } else if (currentBlockType === 'h3') {
                htmlOut.push(`<h3>${formatted}</h3>`);
            } else if (currentBlockType === 'h4') {
                htmlOut.push(`<h4>${formatted}</h4>`);
            } else if (currentBlockType === 'li') {
                if (htmlOut.length === 0 || (!htmlOut[htmlOut.length - 1].startsWith('<li>') && htmlOut[htmlOut.length - 1] !== '<ul>')) {
                    htmlOut.push('<ul>');
                }
                htmlOut.push(`<li>${formatted}</li>`);
            } else {
                if (htmlOut.length > 0 && htmlOut[htmlOut.length - 1].startsWith('<li>')) {
                    htmlOut.push('</ul>');
                }
                if (joined.startsWith('(') && joined.endsWith(')')) {
                    htmlOut.push(`<p class="cv-meta"><em>${formatted}</em></p>`);
                } else {
                    htmlOut.push(`<p>${formatted}</p>`);
                }
            }

            currentTextParts = [];
            currentBlockType = null;
        }

        while (idx < total) {
            const line = rawLines[idx];

            if (line === '●') {
                flushBlock();
                currentBlockType = 'li';
                idx++;
                continue;
            } else if (line.startsWith('●')) {
                flushBlock();
                currentBlockType = 'li';
                const content = line.substring(1).trim();
                if (content) currentTextParts.push(content);
                idx++;
                continue;
            }

            let matchedHeading = null;
            const upper = line.toUpperCase();
            for (const mh of MAIN_HEADINGS) {
                if (upper === mh) {
                    matchedHeading = [mh, ''];
                    break;
                } else if (upper.startsWith(mh + ' ') || upper.startsWith(mh + ':')) {
                    matchedHeading = [mh, line.substring(mh.length).replace(/^[:\s]+/, '')];
                    break;
                }
            }

            if (matchedHeading) {
                flushBlock();
                if (htmlOut.length > 0 && htmlOut[htmlOut.length - 1].startsWith('<li>')) {
                    htmlOut.push('</ul>');
                }
                htmlOut.push(`<h2>${escapeHtml(matchedHeading[0])}</h2>`);
                const rest = matchedHeading[1];
                if (rest) {
                    currentBlockType = 'p';
                    currentTextParts.push(rest);
                }
                idx++;
                continue;
            }

            const hasDates = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|20\d\d|19\d\d|Present|Secondment)/i.test(line);
            const isTitleOrRole = (line.includes('|') && (hasDates || line.length < 90)) ||
                (/^(Master of|Bachelor of|BSc|MSc|MBA|BA|BEng|PhD)/i.test(line) && hasDates);

            if (isTitleOrRole) {
                flushBlock();
                if (htmlOut.length > 0 && htmlOut[htmlOut.length - 1].startsWith('<li>')) {
                    htmlOut.push('</ul>');
                }
                htmlOut.push(`<h3>${escapeHtml(line)}</h3>`);
                idx++;
                continue;
            }

            if (line.endsWith(':') && line.length < 70) {
                flushBlock();
                if (htmlOut.length > 0 && htmlOut[htmlOut.length - 1].startsWith('<li>')) {
                    htmlOut.push('</ul>');
                }
                htmlOut.push(`<h4>${escapeHtml(line)}</h4>`);
                idx++;
                continue;
            }

            if (line.startsWith('(Visa Status') && line.endsWith(')')) {
                flushBlock();
                if (htmlOut.length > 0 && htmlOut[htmlOut.length - 1].startsWith('<li>')) {
                    htmlOut.push('</ul>');
                }
                htmlOut.push(`<p class="cv-meta"><em>${escapeHtml(line)}</em></p>`);
                idx++;
                continue;
            }

            if (!currentBlockType) currentBlockType = 'p';
            currentTextParts.push(line);
            idx++;
        }

        flushBlock();
        if (htmlOut.length > 0 && htmlOut[htmlOut.length - 1].startsWith('<li>')) {
            htmlOut.push('</ul>');
        }

        return htmlOut.join('\n');
    }

    function renderCvInCanvas(content, isHtml = false) {
        if (!elements.cvDocumentCanvas) return;

        if (isHtml) {
            elements.cvDocumentCanvas.innerHTML = content;
            state.cvText = getCanvasPlainText();
        } else {
            state.cvText = content || '';
            elements.cvDocumentCanvas.innerHTML = reconstructCvHtml(state.cvText);
        }
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

        const isDocx = file.name.endsWith('.docx');
        const isPdf = file.name.endsWith('.pdf');
        const fileType = isDocx ? 'docx' : (isPdf ? 'pdf' : 'doc');

        applyDocumentTheme(fileType, file.name);
        elements.docTypeBadge.textContent = `Extracting ${file.name}...`;

        // Create local preview blob URL immediately so split view works without waiting
        const localBlobUrl = URL.createObjectURL(file);
        setOriginalPreview(localBlobUrl, file.name);

        // Client-side quick conversion for DOCX with Mammoth if available
        let clientHtml = null;
        if (isDocx && window.mammoth) {
            try {
                const arrayBuffer = await file.arrayBuffer();
                const result = await window.mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
                if (result && result.value && result.value.trim().length > 30) {
                    clientHtml = result.value;
                    renderCvInCanvas(clientHtml, true);
                }
            } catch (mErr) {
                console.warn('Client mammoth conversion note:', mErr);
            }
        }

        const formData = new FormData();
        formData.append('file', file);

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

            state.activeResumeType = data.file_type || fileType;
            if (data.raw_url) {
                setOriginalPreview(data.raw_url, file.name);
            }

            // Prefer rich HTML from backend or mammoth
            if (data.html && data.html.trim().length > 30) {
                renderCvInCanvas(data.html, true);
            } else if (!clientHtml) {
                renderCvInCanvas(data.text || '', false);
            }

            elements.docTypeBadge.textContent = file.name;
            await analyzeCvContent();

        } catch (err) {
            console.error('File reading error:', err);
            alert(`File reading error: ${err.message}`);
            if (!clientHtml) {
                elements.docTypeBadge.textContent = 'Civil Service Template';
            }
        }
    }

    function insertSectionTemplate(type) {
        const templates = {
            summary: `<h2>Professional Summary</h2><p>Experienced professional with a proven track record in delivering high-impact initiatives across government and private sector environments, aligned with Civil Service standards.</p>`,
            skills: `<h2>Core Competencies & Technical Skills</h2><ul><li><strong>Cloud & Infrastructure:</strong> CI/CD pipelines, Docker, Kubernetes, AWS/Azure, automated deployments.</li><li><strong>Agile Delivery:</strong> Scrum, Kanban, cross-functional collaboration, stakeholder management.</li><li><strong>Governance & Security:</strong> Adherence to GDS Service Standards, ISO 27001, data protection.</li></ul>`,
            experience: `<h2>Employment History</h2><h3>Senior Practitioner | Department / Organization Name</h3><p><em>Month Year – Present | London, UK (Hybrid)</em></p><ul><li>Spearheaded critical digital transformation project, improving system reliability by 35%.</li><li>Collaborated with multi-disciplinary squads to deliver user-centred government services.</li><li>Mentored junior team members and championed continuous integration best practices.</li></ul>`,
            behaviours: `<h2>Civil Service Behaviours</h2><h3>Delivering at Pace</h3><p>Successfully managed tight delivery schedules under pressure, prioritising critical deliverables and ensuring full alignment with Service Assessments.</p><h3>Making Effective Decisions</h3><p>Analysed complex technical trade-offs and operational risks to guide architecture selection, reducing downtime and saving £50,000 annually.</p>`,
            education: `<h2>Education & Professional Qualifications</h2><h3>BSc (Hons) in Relevant Discipline</h3><p><em>University Name | Graduated with First Class Honours</em></p><ul><li>Relevant Coursework: Distributed Systems, Software Engineering, Agile Methodologies.</li><li>Certifications: AWS Certified Solutions Architect, Agile Project Management (AgilePM).</li></ul>`
        };

        const html = templates[type];
        if (!html) return;

        elements.cvDocumentCanvas.focus();
        // Try inserting at cursor position
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            if (elements.cvDocumentCanvas.contains(range.commonAncestorContainer)) {
                range.deleteContents();
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = html;
                const frag = document.createDocumentFragment();
                let node;
                while ((node = tempDiv.firstChild)) {
                    frag.appendChild(node);
                }
                range.insertNode(frag);
                updateWordAndCharCount();
                triggerDebouncedAnalysis();
                return;
            }
        }

        // Otherwise append to bottom
        elements.cvDocumentCanvas.innerHTML += `<br>${html}`;
        updateWordAndCharCount();
        triggerDebouncedAnalysis();
    }

    // ==========================================
    // Export Handlers (PDF, DOCX, Copy)
    // ==========================================

    function exportAsPdf() {
        elements.exportMenu.classList.add('hidden');
        const element = elements.cvDocumentCanvas;
        if (window.html2pdf) {
            const opt = {
                margin: [10, 10, 10, 10],
                filename: `Tailored_CV_${state.jobRef || 'Application'}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, letterRendering: true },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };
            window.html2pdf().set(opt).from(element).save();
        } else {
            window.print();
        }
    }

    async function exportAsDocx() {
        elements.exportMenu.classList.add('hidden');
        const html = elements.cvDocumentCanvas.innerHTML;
        const originalText = elements.exportDocxBtn.innerHTML;
        elements.exportDocxBtn.innerHTML = `<span>⏳ Generating Word .docx...</span>`;

        try {
            const token = localStorage.getItem('civil_auth_token');
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch('/api/cv/export-docx', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    html: html,
                    filename: `Tailored_CV_${state.jobRef || 'Application'}.docx`
                })
            });

            if (!res.ok) throw new Error(`DOCX export server error (${res.status})`);
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Tailored_CV_${state.jobRef || 'Application'}.docx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.warn('Backend DOCX export error, using client fallback:', err);
            fallbackClientExportDoc(html);
        } finally {
            elements.exportDocxBtn.innerHTML = originalText;
        }
    }

    function fallbackClientExportDoc(content) {
        const htmlDoc = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>CV Document</title>
                <style>
                    body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #111; }
                    h1 { font-size: 18pt; color: #000; text-transform: uppercase; margin-bottom: 2pt; }
                    h2 { font-size: 13pt; color: #004f9e; border-bottom: 1.5pt solid #004f9e; margin-top: 14pt; margin-bottom: 6pt; }
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
            alert('CV text copied to clipboard!');
        });
    }

    // ==========================================
    // Event Listeners Setup
    // ==========================================

    function setupEventListeners() {
        // View Mode Switcher
        if (elements.viewModeEdit) {
            elements.viewModeEdit.addEventListener('click', () => setViewMode('edit'));
        }
        if (elements.viewModeSplit) {
            elements.viewModeSplit.addEventListener('click', () => setViewMode('split'));
        }
        if (elements.viewModePreview) {
            elements.viewModePreview.addEventListener('click', () => setViewMode('preview'));
        }

        // Canvas Live Input
        elements.cvDocumentCanvas.addEventListener('input', () => {
            updateWordAndCharCount();
            triggerDebouncedAnalysis();
        });

        // Formatting Tools
        if (elements.toolFormatBlock) {
            elements.toolFormatBlock.addEventListener('change', (e) => {
                const val = e.target.value;
                if (!val) return;
                document.execCommand('formatBlock', false, `<${val}>`);
                e.target.value = '';
                elements.cvDocumentCanvas.focus();
            });
        }
        if (elements.toolBold) elements.toolBold.addEventListener('click', () => { document.execCommand('bold', false, null); });
        if (elements.toolItalic) elements.toolItalic.addEventListener('click', () => { document.execCommand('italic', false, null); });
        if (elements.toolUnderline) elements.toolUnderline.addEventListener('click', () => { document.execCommand('underline', false, null); });
        if (elements.toolH2) elements.toolH2.addEventListener('click', () => { document.execCommand('formatBlock', false, '<h2>'); });
        if (elements.toolH3) elements.toolH3.addEventListener('click', () => { document.execCommand('formatBlock', false, '<h3>'); });
        if (elements.toolBullet) elements.toolBullet.addEventListener('click', () => { document.execCommand('insertUnorderedList', false, null); });
        if (elements.toolNumbered) elements.toolNumbered.addEventListener('click', () => { document.execCommand('insertOrderedList', false, null); });
        if (elements.toolInsertSection) {
            elements.toolInsertSection.addEventListener('change', (e) => {
                const val = e.target.value;
                if (!val) return;
                insertSectionTemplate(val);
                e.target.value = '';
            });
        }

        // File Upload
        elements.uploadCvFileBtn.addEventListener('click', () => { elements.cvFileInput.click(); });
        elements.cvFileInput.addEventListener('change', handleCvFileUpload);

        // Auto-Fix Spacing & Clean Formatting
        if (elements.cleanFormatCvBtn) {
            elements.cleanFormatCvBtn.addEventListener('click', () => {
                const rawText = getCanvasPlainText();
                if (!rawText || rawText.trim().length < 10) return;
                const cleanedHtml = reconstructCvHtml(rawText);
                renderCvInCanvas(cleanedHtml, true);
                triggerDebouncedAnalysis();
                if (elements.editorSyncStatus) {
                    elements.editorSyncStatus.innerHTML = '<span class="sync-dot" style="background:#10b981;"></span> Spacing & headings auto-fixed!';
                    setTimeout(() => {
                        elements.editorSyncStatus.innerHTML = '<span class="sync-dot"></span> Live ATS Sync Active';
                    }, 2500);
                }
            });
        }

        // Reset to Default Template
        elements.resetToDefaultCvBtn.addEventListener('click', async () => {
            if (confirm('Reset CV to default Civil Service template?')) {
                const res = await fetch('/api/cv/default-template');
                const data = await res.json();
                applyDocumentTheme('word', 'Civil Service Template');
                renderCvInCanvas(data.template, false);
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
                    const res = await fetch(`/api/profile/resumes/${resumeId}/content`, {
                        headers: getAuthHeaders(true)
                    });
                    if (res.ok) {
                        const rData = await res.json();
                        state.activeResumeType = rData.file_type || 'docx';
                        state.activeResumeId = rData.id;
                        state.activeResumeRawUrl = rData.raw_url || '';
                        applyDocumentTheme(rData.file_type, rData.filename);
                        setOriginalPreview(rData.raw_url, rData.filename);
                        if (rData.html && rData.html.trim().length > 30) {
                            renderCvInCanvas(rData.html, true);
                        } else {
                            renderCvInCanvas(rData.text || '', false);
                        }
                        elements.docTypeBadge.textContent = rData.filename;
                        await analyzeCvContent();
                    }
                } catch (err) {
                    console.error('Failed to load resume content:', err);
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
