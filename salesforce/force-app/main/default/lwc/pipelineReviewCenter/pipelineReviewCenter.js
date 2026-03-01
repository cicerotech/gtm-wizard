import { LightningElement, wire, track } from 'lwc';
import getPipelineData from '@salesforce/apex/PipelineReviewController.getPipelineData';
import getProductLineOptions from '@salesforce/apex/PipelineReviewController.getProductLineOptions';
import updateOpportunityField from '@salesforce/apex/PipelineReviewController.updateOpportunityField';
import getClosedWonQTD from '@salesforce/apex/PipelineReviewController.getClosedWonQTD';

export default class PipelineReviewCenter extends LightningElement {
    // v2.2 - AI filter fix
    // Filters
    selectedPod = 'All';
    selectedStage = '';
    selectedProductLine = 'All';
    selectedTargetSign = 'All';
    changesOnly = false;
    changesTimeframe = '7d';

    get changesTimeframeOptions() {
        return [
            { label: 'Last 7 days', value: '7d' },
            { label: 'QTD', value: 'qtd' },
            { label: 'Last 14 days', value: '14d' },
            { label: 'Last 30 days', value: '30d' }
        ];
    }

    get changesTimeframeLabel() {
        const opt = this.changesTimeframeOptions.find(o => o.value === this.changesTimeframe);
        return opt ? opt.label : 'Last 7 days';
    }

    get changeColumnLabel() {
        if (this.changesTimeframe === 'qtd') return 'QTD';
        if (this.changesTimeframe === '14d') return '14d';
        if (this.changesTimeframe === '30d') return '30d';
        return 'WoW';
    }

    handleChangesTimeframeChange(event) {
        this.changesTimeframe = event.detail.value;
        this._loadData();
    }

    // Inline edit state
    isEditing = false;
    editOppId = null;
    editField = '';
    editValue = '';
    editFieldLabel = '';

    // Track recent local edits so _loadData doesn't overwrite them
    _recentEdits = new Map();
    _editVersion = 0;

    // Collapse/expand + sort per owner
    @track collapsedOwners = new Set();
    @track ownerSortField = {};
    @track ownerSortDir = {};

    // Data
    @track pipelineData = [];
    @track filteredData = [];
    @track ownerGroups = [];
    @track productLineOptions = [{ label: 'All Products', value: 'All' }];
    isLoading = true;
    error;

    // Client-computed summary (updates with every filter)
    @track _summary = {};

    // Closed Won QTD
    @track closedWonData = [];
    @track showClosedWon = false;
    closedWonLoaded = false;

    // Delta drill-down
    @track showCommitDelta = false;
    @track showWeightedDelta = false;

    // Quarter boundaries (computed once)
    _qtrStart;
    _qtrEnd;
    _nextQtrStart;
    _nextQtrEnd;
    _fyStart;
    _fyEnd;

    podOptions = [
        { label: 'All Pods', value: 'All' },
        { label: 'US', value: 'US' },
        { label: 'EU', value: 'EU' }
    ];

    stageOptions = [
        { label: 'All Stages', value: '' },
        { label: 'S1+', value: 'Stage 1' },
        { label: 'S2+', value: 'Stage 2' },
        { label: 'S3+', value: 'Stage 3' },
        { label: 'S4+', value: 'Stage 4' }
    ];

    targetSignOptions = [
        { label: 'All Dates', value: 'All' },
        { label: 'This Quarter', value: 'ThisQtr' },
        { label: 'Next Quarter', value: 'NextQtr' },
        { label: 'This FY', value: 'ThisFY' }
    ];

    connectedCallback() {
        this._computeDateBoundaries();
        this._loadProductLineOptions();
        this._loadData();
        this._loadClosedWon();
    }

    _computeDateBoundaries() {
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth(); // 0-indexed: Jan=0, Feb=1, ..., Dec=11

        // Fiscal year starts Feb 1. Quarters: Q1=Feb-Apr, Q2=May-Jul, Q3=Aug-Oct, Q4=Nov-Jan
        // Adjust month to fiscal calendar (Feb=0, Mar=1, ..., Jan=11)
        const fiscalMonth = (m + 11) % 12; // Feb→0, Mar→1, Apr→2, ..., Jan→11
        const fiscalQtr = Math.floor(fiscalMonth / 3); // 0=Q1, 1=Q2, 2=Q3, 3=Q4

        // Fiscal quarter start months: Q1=Feb(1), Q2=May(4), Q3=Aug(7), Q4=Nov(10)
        const qtrStartMonth = 1 + fiscalQtr * 3; // 1, 4, 7, 10
        const qtrStartYear = qtrStartMonth <= m ? y : y - 1; // Handle Jan (Q4 spans year)

        this._qtrStart = new Date(qtrStartYear, qtrStartMonth, 1);
        this._qtrEnd = new Date(qtrStartYear, qtrStartMonth + 3, 0); // Last day of quarter

        const nextQtrStartMonth = qtrStartMonth + 3;
        const nextQtrYear = nextQtrStartMonth > 11 ? qtrStartYear + 1 : qtrStartYear;
        this._nextQtrStart = new Date(nextQtrYear, nextQtrStartMonth % 12, 1);
        this._nextQtrEnd = new Date(nextQtrYear, (nextQtrStartMonth % 12) + 3, 0);

        // Fiscal year: Feb 1 of current FY to Jan 31 of next year
        const fyStartYear = m >= 1 ? y : y - 1; // If Jan, FY started previous year
        this._fyStart = new Date(fyStartYear, 1, 1); // Feb 1
        this._fyEnd = new Date(fyStartYear + 1, 0, 31); // Jan 31
    }

    // ── Data loading ──

    async _loadProductLineOptions() {
        try {
            const options = await getProductLineOptions();
            this.productLineOptions = [
                { label: 'All Products', value: 'All' },
                ...(options || []).map(p => ({ label: p, value: p }))
            ];
        } catch (err) {
            console.warn('Could not load product line options', err);
        }
    }

    async _loadData() {
        this.isLoading = true;
        try {
            // Calculate daysBack from changesTimeframe
            let daysBack = 7;
            if (this.changesTimeframe === 'qtd') {
                const now = new Date();
                const m = now.getMonth() + 1;
                const qtrStartMonth = m === 1 ? 11 : (2 + Math.floor((m - 2) / 3) * 3);
                const qtrStartYear = m === 1 ? now.getFullYear() - 1 : now.getFullYear();
                const qtrStart = new Date(qtrStartYear, qtrStartMonth - 1, 1);
                daysBack = Math.ceil((now - qtrStart) / (1000 * 60 * 60 * 24));
            } else if (this.changesTimeframe === '14d') {
                daysBack = 14;
            } else if (this.changesTimeframe === '30d') {
                daysBack = 30;
            }

            const data = await getPipelineData({
                pod: this.selectedPod,
                stageMin: this.selectedStage,
                changesOnly: false,
                productLine: this.selectedProductLine,
                daysBack: daysBack
            });

            let rows = data || [];

            // Preserve any recent local edits that the server hasn't caught up to yet
            if (this._recentEdits.size > 0) {
                rows = rows.map(row => {
                    const edits = this._recentEdits.get(row.id);
                    if (edits) {
                        return { ...row, ...edits };
                    }
                    return row;
                });
            }

            this.pipelineData = rows;
            this._applyTargetSignFilter();
            this.error = undefined;
        } catch (err) {
            this.error = err?.body?.message || 'Error loading pipeline data';
            this.pipelineData = [];
            this.filteredData = [];
        } finally {
            this.isLoading = false;
        }
    }

    _applyTargetSignFilter() {
        let rows = this.pipelineData;
        if (this.selectedTargetSign !== 'All') {
            let start, end;
            if (this.selectedTargetSign === 'ThisQtr') {
                start = this._qtrStart; end = this._qtrEnd;
            } else if (this.selectedTargetSign === 'NextQtr') {
                start = this._nextQtrStart; end = this._nextQtrEnd;
            } else if (this.selectedTargetSign === 'ThisFY') {
                start = this._fyStart; end = this._fyEnd;
            }
            if (start && end) {
                rows = rows.filter(r => {
                    if (!r.targetSign) return false;
                    const d = this._parseLocalDate(r.targetSign);
                    return d >= start && d <= end;
                });
            }
        }
        this.filteredData = rows;
        this._computeSummary();
        this._buildOwnerGroups();
    }

    // ── Client-side summary (reflects current filters) ──

    // Q1 FY26 baseline constants by pod — verified from Q1_2026_Forecast_Workbook (Feb 2, 2026 snapshot).
    // Commit = Quarterly Commit Net (AI-Enabled). Weighted = Weighted ACV (AI-Enabled).
    // Update these at Q2 start with the new quarter's snapshot values.
    static Q1_BASELINES = {
        All:  { commit: 4172550, weighted: 5468165 },
        US:   { commit: 1935000, weighted: 3648000 },
        EU:   { commit: 2237550, weighted: 1820165 }
    };

    // Per-BL Q1 commit baselines (AI-Enabled Commit from Feb 2 workbook).
    static Q1_COMMIT_BY_BL = {
        'Ananth Cherukupally': 395000,
        'Asad Hussain': 180000,
        'Julie Stefanich': 650000,
        'Justin Hills': 120000,
        'Mike Masiello': 350000,
        'Olivia Jung': 240000,
        'Mitch Loquaci': 0,
        'Riley Stack': 0,
        'Rajeev Patel': 0,
        'Sean Boyd': 0,
        'Alex Fox': 235125,
        'Conor Molloy': 1280000,
        'Nathan Shine': 896550,
        'Nicola Fratini': 200000,
        'Tom Clancy': 0,
        'Emer Flynn': 0,
        'Greg MacHale': 0
    };

    _getQ1Baseline() {
        const pod = this.selectedPod || 'All';
        return PipelineReviewCenter.Q1_BASELINES[pod] || PipelineReviewCenter.Q1_BASELINES.All;
    }

    _computeSummary() {
        const baseline = this._getQ1Baseline();
        const s = {
            totalDeals: 0, totalACV: 0, weightedACV: 0,
            totalAIDeals: 0, totalAIACV: 0, weightedAIACV: 0,
            commitTotal: 0, commitInQtr: 0,
            commitAITotal: 0, commitAIInQtr: 0,
            originalCommitInQtr: baseline.commit,
            originalWeightedInQtr: baseline.weighted,
            stageAdvances: 0, stageRegressions: 0,
            acvIncreases: 0, acvDecreases: 0, netACVChange: 0,
            targetSlips: 0, movedToCommit: 0, movedFromCommit: 0, newDeals: 0, changedDeals: 0
        };

        for (const row of this.filteredData) {
            s.totalDeals++;
            const netAcv = row.netAcv || row.acv || 0;
            s.totalACV += netAcv;
            s.weightedACV += (row.weightedNetAI || 0);

            const isCommit = row.forecastCategory === 'Commit';
            const dealAcv = row.acv || 0;
            let isInQtr = false;
            if (row.targetSign) {
                const d = this._parseLocalDate(row.targetSign);
                isInQtr = d >= this._qtrStart && d <= this._qtrEnd;
            }

            if (isCommit) {
                s.commitTotal += dealAcv;
                if (isInQtr) s.commitInQtr += dealAcv;
            }

            if (row.aiEnabled) {
                s.totalAIDeals++;
                s.totalAIACV += netAcv;
                s.weightedAIACV += (row.aiQuarterlyForecastNet || 0);
                if (isCommit) {
                    s.commitAITotal += (row.commitNet || 0);
                    if (isInQtr) s.commitAIInQtr += (row.commitNet || 0);
                }
            }

            // WoW highlights from row-level data
            if (row.isNew) { s.newDeals++; }
            if (row.anyChange) {
                s.changedDeals++;
                if (row.acvDelta > 0) { s.acvIncreases++; s.netACVChange += row.acvDelta; }
                else if (row.acvDelta < 0) { s.acvDecreases++; s.netACVChange += row.acvDelta; }
                if (row.stageChanged && row.stageDir > 0) s.stageAdvances++;
                if (row.stageChanged && row.stageDir < 0) s.stageRegressions++;
                if (row.targetDeltaDays > 7) s.targetSlips++;
                if (row.fcChanged && row.forecastCategory === 'Commit') s.movedToCommit++;
                if (row.fcChanged && row.priorForecastCat === 'Commit' && row.forecastCategory !== 'Commit') s.movedFromCommit++;
            }
        }

        this._summary = s;
    }

    _buildOwnerGroups() {
        const groups = {};

        for (const row of this.filteredData) {
            const owner = row.ownerName || 'Unassigned';
            if (!groups[owner]) {
                groups[owner] = {
                    key: owner, name: owner, pod: row.pod || '',
                    deals: [],
                    netAcv: 0,
                    acvDelta: 0,
                    weightedAcv: 0,
                    forecast: 0,
                    q1CommitOriginal: PipelineReviewCenter.Q1_COMMIT_BY_BL[owner] || 0,
                    currentCommit: 0,
                    inQtrForecast: 0,
                    aiInQtrForecast: 0,
                    wonQtdAcv: 0,
                    aiCount: 0
                };
            }
            const enriched = this._enrichRow(row);

            // changesOnly: only add deals to the visible table, but always accumulate metrics
            if (!this.changesOnly || row.anyChange || row.isNew) {
                groups[owner].deals.push(enriched);
            }

            // Pipeline = Net ACV (renewal net change for existing, ACV for new)
            groups[owner].netAcv += (row.netAcv || row.acv || 0);
            groups[owner].acvDelta += (row.acvDelta || 0);

            // Weighted = Weighted ACV (AI-Enabled) from SF formula field
            groups[owner].weightedAcv += (row.weightedNetAI || 0);

            // BL Forecast = Quarterly Forecast Net (BL_Quarterly_Forecast__c) for all deals.
            // Cascading: when target sign filter is applied, filteredData narrows and BL Forecast narrows with it.
            groups[owner].forecast += (row.quarterlyForecastNet || 0);

            // Current Commit = ACV for Commit-category deals targeting this fiscal quarter
            const dealAcv = row.acv || 0;
            if (row.forecastCategory === 'Commit' && enriched.isInQuarter) {
                groups[owner].currentCommit += dealAcv;
            }

            // In-Qtr = same field as BL Forecast but narrowed to deals targeting Q1.
            // AI = In-Qtr filtered to AI-enabled deals only (Eudia_Tech__c = true).
            if (enriched.isInQuarter) {
                groups[owner].inQtrForecast += (row.quarterlyForecastNet || 0);
                if (row.aiEnabled) {
                    groups[owner].aiInQtrForecast += (row.quarterlyForecastNet || 0);
                }
            }

            if (row.aiEnabled) {
                groups[owner].aiCount++;
            }
        }

        // Add per-BL closed won from already-loaded closedWonData
        for (const cw of this.closedWonData) {
            const cwOwner = cw.ownerName || 'Unassigned';
            if (groups[cwOwner]) {
                groups[cwOwner].wonQtdAcv += (cw.netAcv || cw.acv || 0);
            }
        }

        const BL_ORDER = [
            'Olivia Jung', 'Julie Stefanich', 'Asad Hussain', 'Ananth Cherukupally',
            'Mitch Loquaci', 'Mike Masiello', 'Riley Stack', 'Rajeev Patel', 'Sean Boyd',
            'Nathan Shine', 'Conor Molloy', 'Nicola Fratini', 'Greg MacHale',
        ];
        const orderIndex = (name) => {
            const idx = BL_ORDER.indexOf(name);
            return idx >= 0 ? idx : 100;
        };

        this.ownerGroups = Object.values(groups)
            .sort((a, b) => orderIndex(a.name) - orderIndex(b.name) || b.totalAcv - a.totalAcv)
            .map(g => {
                const isCollapsed = this.collapsedOwners.has(g.name);
                const sortField = this.ownerSortField[g.name] || 'acv';
                const sortDir = this.ownerSortDir[g.name] || 'desc';
                let sortedDeals = [...g.deals];
                const numericFields = new Set(['acv', 'acvDelta', 'targetDeltaDays', 'netAcv']);
                sortedDeals.sort((a, b) => {
                    let va = a[sortField];
                    let vb = b[sortField];
                    if (numericFields.has(sortField)) { va = va || 0; vb = vb || 0; }
                    else if (typeof va === 'string') { va = (va||'').toLowerCase(); vb = (vb||'').toLowerCase(); }
                    else { va = va || ''; vb = vb || ''; }
                    const dir = sortDir === 'asc' ? 1 : -1;
                    if (va < vb) return -1 * dir;
                    if (va > vb) return 1 * dir;
                    return 0;
                });
                return {
                    ...g,
                    deals: sortedDeals,
                    isCollapsed,
                    isExpanded: !isCollapsed,
                    chevron: isCollapsed ? '▸' : '▾',
                    totalAcvFormatted: this._fmtCurrency(g.netAcv),
                    acvDeltaFormatted: g.acvDelta !== 0 ? this._fmtCurrencyDelta(g.acvDelta) : '',
                    acvDeltaSentiment: g.acvDelta > 0 ? 'positive' : g.acvDelta < 0 ? 'negative' : 'neutral',
                    dealCount: g.deals.length,
                    hasDeals: g.deals.length > 0,
                    weightedAcvFormatted: this._fmtCurrency(g.weightedAcv),
                    forecastFormatted: this._fmtCurrency(g.forecast),
                    q1CommitFormatted: this._fmtCurrency(g.q1CommitOriginal),
                    currentCommitFormatted: this._fmtCurrency(g.currentCommit),
                    inQtrFormatted: this._fmtCurrency(g.inQtrForecast),
                    aiInQtrFormatted: this._fmtCurrency(g.aiInQtrForecast),
                    wonQtdFormatted: this._fmtCurrency(g.wonQtdAcv)
                };
            });
    }

    _enrichRow(row) {
        const targetDate = row.targetSign
            ? this._parseLocalDate(row.targetSign).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : '—';

        let isInQuarter = false;
        if (row.targetSign) {
            const d = this._parseLocalDate(row.targetSign);
            isInQuarter = d >= this._qtrStart && d <= this._qtrEnd;
        }

        let acvDeltaDisplay = '';
        let acvSentiment = 'neutral';
        if (row.acvDelta > 0) {
            acvDeltaDisplay = '+' + this._fmtCurrency(row.acvDelta);
            acvSentiment = 'positive';
        } else if (row.acvDelta < 0) {
            acvDeltaDisplay = this._fmtCurrency(row.acvDelta);
            acvSentiment = 'negative';
        }

        let targetDeltaDisplay = '';
        let targetSentiment = 'neutral';
        if (row.targetDeltaDays > 7) {
            targetDeltaDisplay = '+' + row.targetDeltaDays + 'd';
            targetSentiment = 'negative';
        } else if (row.targetDeltaDays > 0) {
            targetDeltaDisplay = '+' + row.targetDeltaDays + 'd';
            targetSentiment = 'warning';
        } else if (row.targetDeltaDays < -3) {
            targetDeltaDisplay = row.targetDeltaDays + 'd';
            targetSentiment = 'positive';
        }

        let stageBadge = '';
        if (row.stageChanged) {
            stageBadge = row.stageDir > 0 ? '↑' : '↓';
        }

        let fcShort = row.forecastCategory || '—';
        if (row.forecastCategory === 'Commit') fcShort = 'Commit';

        let wowIcon = '—';
        if (row.isNew) wowIcon = 'NEW';
        else if (row.fcChanged && row.priorForecastCat === 'Commit' && row.forecastCategory !== 'Commit') wowIcon = '▼FC';
        else if (row.stageChanged && row.stageDir > 0 && (row.stageShort === 'S2' || row.stage === 'Stage 2 - SQO')) wowIcon = 'S2↑';
        else if (row.forecastCategory === 'Commit' && row.fcChanged) wowIcon = '★';
        else if (row.changeScore < -2) wowIcon = '⚠';
        else if (row.changeScore > 0) wowIcon = '✓';

        // Product lines: show all abbreviated, joined by " / "
        let productsDisplay = '—';
        let productsTooltip = '';
        if (row.productLine) {
            const prods = row.productLine.split(';').map(p => p.trim()).filter(p => p);
            const shortProds = prods.map(p => this._shortProduct(p));
            productsTooltip = shortProds.join(', ');
            productsDisplay = shortProds.join(' / ');
        }

        // Next Steps: show more context
        const nextSteps = row.nextSteps || '';
        const nextStepsShort = nextSteps || '—';

        return {
            ...row,
            key: row.id + '_v' + this._editVersion,
            acvFormatted: this._fmtCurrency(row.acv || 0),
            acvDeltaDisplay,
            acvSentiment,
            targetDate,
            targetRaw: row.targetSign || '',
            targetDeltaDisplay,
            targetSentiment,
            stageDisplay: row.stageShort || row.stage,
            stageBadge,
            stageSentiment: row.stageChanged ? (row.stageDir > 0 ? 'positive' : 'negative') : 'neutral',
            fcShort,
            fcSentiment: row.fcChanged ? 'changed' : 'neutral',
            wowIcon,
            rowClass: 'table-row',
            customerLabel: row.customerType ? `${row.customerType}${row.customerSubtype ? ' · ' + row.customerSubtype : ''}` : '',
            aiFlag: row.aiEnabled ? 'AI' : '',
            hasAiFlag: row.aiEnabled === true,
            productsDisplay,
            productsTooltip,
            nextSteps,
            nextStepsShort,
            isInQuarter,
            oppUrl: '/' + row.id
        };
    }

    // ── Filter handlers ──

    handlePodChange(event) {
        this.selectedPod = event.detail.value;
        this._loadData();
    }

    handleStageChange(event) {
        this.selectedStage = event.detail.value;
        this._loadData();
    }

    handleProductLineChange(event) {
        this.selectedProductLine = event.detail.value;
        this._loadData();
    }

    handleTargetSignChange(event) {
        this.selectedTargetSign = event.detail.value;
        // No Apex re-call needed — just re-filter client-side
        this._applyTargetSignFilter();
    }

    handleChangesToggle(event) {
        this.changesOnly = event.target.checked;
        // No Apex re-call needed — just rebuild owner groups with the display filter
        this._buildOwnerGroups();
    }

    handleRefresh() {
        this._loadData();
    }

    // ── Summary getters (all from client-side _summary) ──

    get weekLabel() {
        const d = new Date();
        return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }

    get highlightItems() {
        const s = this._summary;
        if (!s || !s.totalDeals) return [];
        const items = [];
        if (s.stageAdvances > 0) items.push({ key: 'sa', icon: '↑', text: `${s.stageAdvances} advanced stage` });
        if (s.stageRegressions > 0) items.push({ key: 'sr', icon: '↓', text: `${s.stageRegressions} stage regression${s.stageRegressions > 1 ? 's' : ''}` });
        if (s.acvIncreases > 0 || s.acvDecreases > 0) {
            const parts = [];
            if (s.acvIncreases > 0) parts.push(`${s.acvIncreases} ACV increase${s.acvIncreases > 1 ? 's' : ''}`);
            if (s.acvDecreases > 0) parts.push(`${s.acvDecreases} ACV decrease${s.acvDecreases > 1 ? 's' : ''}`);
            items.push({ key: 'ai', icon: '↑', text: `${parts.join(', ')} (${this._fmtCurrencyDelta(s.netACVChange)} net)` });
        }
        if (s.targetSlips > 0) items.push({ key: 'ts', icon: '⚠', text: `${s.targetSlips} target date slip${s.targetSlips > 1 ? 's' : ''}` });
        if (s.movedToCommit > 0) items.push({ key: 'mc', icon: '★', text: `${s.movedToCommit} moved to Commit` });
        if (s.movedFromCommit > 0) items.push({ key: 'mfc', icon: '▼', text: `${s.movedFromCommit} moved from Commit` });
        if (s.newDeals > 0) items.push({ key: 'nd', icon: '●', text: `${s.newDeals} new deal${s.newDeals > 1 ? 's' : ''}` });
        return items;
    }

    get hasHighlights() { return this.highlightItems.length > 0; }

    get totalDeals() { return this._summary?.totalDeals || 0; }
    get totalAcvFormatted() { return this._fmtCurrency(this._summary?.totalACV || 0); }
    get weightedAcvFormatted() { return this._fmtCurrency(this._summary?.weightedACV || 0); }
    get commitTotalFormatted() { return this._fmtCurrency(this._summary?.commitTotal || 0); }
    get commitInQtrFormatted() { return this._fmtCurrency(this._summary?.commitInQtr || 0); }
    get hasCommitSummary() { return (this._summary?.commitTotal || 0) > 0; }

    get totalAIDeals() { return this._summary?.totalAIDeals || 0; }
    get totalAIAcvFormatted() { return this._fmtCurrency(this._summary?.totalAIACV || 0); }
    get weightedAIAcvFormatted() { return this._fmtCurrency(this._summary?.weightedAIACV || 0); }
    get commitAITotalFormatted() { return this._fmtCurrency(this._summary?.commitAITotal || 0); }
    get commitAIInQtrFormatted() { return this._fmtCurrency(this._summary?.commitAIInQtr || 0); }
    get hasAISummary() { return (this._summary?.totalAIDeals || 0) > 0; }

    // ── WoW time label ──

    get wowSinceLabel() {
        const since = new Date();
        if (this.changesTimeframe === 'qtd') {
            const m = since.getMonth() + 1;
            const qtrStartMonth = m === 1 ? 11 : (2 + Math.floor((m - 2) / 3) * 3);
            const qtrStartYear = m === 1 ? since.getFullYear() - 1 : since.getFullYear();
            return new Date(qtrStartYear, qtrStartMonth - 1, 1).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
        const days = this.changesTimeframe === '14d' ? 14 : this.changesTimeframe === '30d' ? 30 : 7;
        since.setDate(since.getDate() - days);
        return since.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    // ── Q1 Forecast Tracking getters ──

    get hasQ1Tracking() {
        const s = this._summary;
        return s && (s.originalCommitInQtr > 0 || s.originalWeightedInQtr > 0);
    }

    // Commit In-Qtr getters
    get origCommitInQtrFormatted() { return this._fmtCurrency(this._summary?.originalCommitInQtr || 0); }
    get todayCommitInQtrFormatted() { return this._fmtCurrency(this._summary?.commitAIInQtr || 0); }
    get commitInQtrDeltaFormatted() {
        const d = (this._summary?.commitAIInQtr || 0) - (this._summary?.originalCommitInQtr || 0);
        return this._fmtCurrencyDelta(d);
    }
    get commitInQtrDeltaSentiment() {
        const d = (this._summary?.commitAIInQtr || 0) - (this._summary?.originalCommitInQtr || 0);
        return d > 0 ? 'positive' : d < 0 ? 'negative' : 'neutral';
    }
    get commitInQtrDealCount() {
        let count = 0;
        for (const row of this.filteredData) {
            if (!row.aiEnabled || row.forecastCategory !== 'Commit' || !row.targetSign) continue;
            const d = this._parseLocalDate(row.targetSign);
            if (d >= this._qtrStart && d <= this._qtrEnd) count++;
        }
        return count;
    }

    // Weighted (AI-Enabled) In-Qtr getters — uses Weighted_ACV_AI_Enabled__c
    get origWeightedInQtrFormatted() { return this._fmtCurrency(this._summary?.originalWeightedInQtr || 0); }
    get todayWeightedInQtrFormatted() {
        let total = 0;
        for (const row of this.filteredData) {
            if (!row.aiEnabled || !row.targetSign) continue;
            const d = this._parseLocalDate(row.targetSign);
            if (d >= this._qtrStart && d <= this._qtrEnd) {
                total += (row.weightedNetAI || 0);
            }
        }
        return this._fmtCurrency(total);
    }
    get weightedInQtrDeltaFormatted() {
        let todayInQtr = 0;
        for (const row of this.filteredData) {
            if (!row.aiEnabled || !row.targetSign) continue;
            const d = this._parseLocalDate(row.targetSign);
            if (d >= this._qtrStart && d <= this._qtrEnd) {
                todayInQtr += (row.weightedNetAI || 0);
            }
        }
        const delta = todayInQtr - (this._summary?.originalWeightedInQtr || 0);
        return this._fmtCurrencyDelta(delta);
    }
    get weightedInQtrDeltaSentiment() {
        let todayInQtr = 0;
        for (const row of this.filteredData) {
            if (!row.aiEnabled || !row.targetSign) continue;
            const d = this._parseLocalDate(row.targetSign);
            if (d >= this._qtrStart && d <= this._qtrEnd) {
                todayInQtr += (row.weightedNetAI || 0);
            }
        }
        const d = todayInQtr - (this._summary?.originalWeightedInQtr || 0);
        return d > 0 ? 'positive' : d < 0 ? 'negative' : 'neutral';
    }
    get weightedInQtrDealCount() {
        let count = 0;
        for (const row of this.filteredData) {
            if (!row.aiEnabled || !row.targetSign) continue;
            const d = this._parseLocalDate(row.targetSign);
            if (d >= this._qtrStart && d <= this._qtrEnd) count++;
        }
        return count;
    }

    // ── Delta drill-down ──

    handleCommitDeltaClick(e) {
        e.stopPropagation();
        this.showCommitDelta = !this.showCommitDelta;
    }
    handleWeightedDeltaClick(e) {
        e.stopPropagation();
        this.showWeightedDelta = !this.showWeightedDelta;
    }

    get commitDeltaDeals() {
        const deals = [];

        // Open pipeline deals
        for (const row of this.filteredData) {
            if (!row.aiEnabled) continue;
            const isInQtr = row.targetSign && (() => {
                const d = this._parseLocalDate(row.targetSign);
                return d >= this._qtrStart && d <= this._qtrEnd;
            })();
            const isCommit = row.forecastCategory === 'Commit';
            const snapCommit = row.q1CommitSnapshot || 0;
            const wasCommit = row.q1FcSnapshot === 'Commit';
            const snapAcv = row.q1AcvSnapshot || 0;
            const currentCommit = (isCommit && isInQtr) ? (row.commitNet || 0) : 0;
            if (snapCommit === 0 && currentCommit === 0) continue;
            const delta = currentCommit - snapCommit;
            if (delta === 0) continue;

            let changeLabel = '';
            let changeDetail = '';

            if (snapCommit === 0 && currentCommit > 0) {
                changeLabel = 'New to Commit';
                if (row.q1FcSnapshot) changeDetail = `was ${row.q1FcSnapshot}`;
            } else if (wasCommit && !isCommit) {
                changeLabel = `Commit → ${row.forecastCategory || 'Pipeline'}`;
                changeDetail = 'Forecast category changed';
            } else if (wasCommit && !isInQtr) {
                changeLabel = 'Target moved out of Q1';
                if (row.targetSign) changeDetail = `now ${row.targetSign}`;
            } else if (wasCommit && isCommit && snapAcv > 0 && row.acv !== snapAcv) {
                const fromStr = this._fmtCurrency(snapAcv);
                const toStr = this._fmtCurrency(row.acv || 0);
                changeLabel = delta > 0 ? 'ACV increased' : 'ACV decreased';
                changeDetail = `${fromStr} → ${toStr}`;
            } else if (delta > 0) {
                changeLabel = 'ACV increased';
            } else {
                changeLabel = 'Left Commit';
            }

            deals.push({
                key: row.id,
                accountName: row.accountName || row.name,
                rawDelta: delta,
                acvFormatted: this._fmtCurrency(Math.abs(delta)),
                deltaFormatted: this._fmtCurrencyDelta(delta),
                sentiment: delta > 0 ? 'positive' : 'negative',
                changeLabel,
                changeDetail,
                hasDetail: !!changeDetail
            });
        }

        // Closed Won deals that were in Commit at quarter start
        for (const cw of this.closedWonData) {
            if (!cw.aiEnabled) continue;
            const wasCommit = cw.q1FcSnapshot === 'Commit';
            const snapCommit = cw.q1CommitSnapshot || 0;
            if (!wasCommit && snapCommit === 0) continue;
            const cwAcv = cw.netAcv || cw.acv || 0;
            const delta = -snapCommit;
            if (delta === 0 && !wasCommit) continue;
            deals.push({
                key: cw.id || cw.key,
                accountName: cw.accountName,
                rawDelta: delta,
                acvFormatted: this._fmtCurrency(Math.abs(delta || cwAcv)),
                deltaFormatted: this._fmtCurrencyDelta(delta || -cwAcv),
                sentiment: 'positive',
                changeLabel: 'Closed Won',
                changeDetail: cw.closeDateFormatted ? `Signed ${cw.closeDateFormatted}` : '',
                hasDetail: !!cw.closeDateFormatted
            });
        }

        deals.sort((a, b) => Math.abs(b.rawDelta) - Math.abs(a.rawDelta));
        return deals;
    }

    get weightedDeltaDeals() {
        const allDeals = [];
        for (const row of this.filteredData) {
            if (!row.aiEnabled) continue;
            const isInQtr = row.targetSign && (() => {
                const d = this._parseLocalDate(row.targetSign);
                return d >= this._qtrStart && d <= this._qtrEnd;
            })();
            const snapWeighted = (row.q1AcvSnapshot || 0) * ((row.probability || 0) / 100);
            const currentWeighted = isInQtr ? (row.weightedNetAI || 0) : 0;
            if (snapWeighted === 0 && currentWeighted === 0) continue;
            const delta = currentWeighted - snapWeighted;
            if (Math.abs(delta) < 100) continue;
            let changeLabel = '';
            if (snapWeighted === 0 && currentWeighted > 0) changeLabel = 'New deal';
            else if (snapWeighted > 0 && currentWeighted === 0 && !isInQtr) changeLabel = 'Moved out of Q1';
            else if (snapWeighted > 0 && currentWeighted === 0) changeLabel = 'Stage/prob changed';
            else if (delta > 0) changeLabel = 'Weighted up';
            else changeLabel = 'Weighted down';
            const acctName = row.accountName || row.name;
            if (acctName && (acctName.includes('Wellspring') || acctName.includes('Sequoia'))) {
                changeLabel += ' (Sequoia opp combined with Wellspring)';
            }
            allDeals.push({
                key: row.id,
                accountName: acctName,
                rawDelta: delta,
                acvFormatted: this._fmtCurrency(Math.abs(delta)),
                deltaFormatted: this._fmtCurrencyDelta(delta),
                sentiment: delta > 0 ? 'positive' : 'negative',
                changeLabel
            });
        }
        allDeals.sort((a, b) => Math.abs(b.rawDelta) - Math.abs(a.rawDelta));

        // Show top 10 most impactful changes; roll up the rest
        const MAX_DISPLAY = 10;
        const deals = allDeals.length > MAX_DISPLAY ? allDeals.slice(0, MAX_DISPLAY) : [...allDeals];
        if (allDeals.length > MAX_DISPLAY) {
            const extraDeals = allDeals.slice(MAX_DISPLAY);
            const extraNet = extraDeals.reduce((s, d) => s + d.rawDelta, 0);
            deals.push({
                key: '_more_changes',
                accountName: `${extraDeals.length} more smaller changes`,
                rawDelta: extraNet,
                acvFormatted: this._fmtCurrency(Math.abs(extraNet)),
                deltaFormatted: this._fmtCurrencyDelta(extraNet),
                sentiment: extraNet > 0 ? 'positive' : extraNet < 0 ? 'negative' : 'neutral',
                changeLabel: ''
            });
        }

        return deals;
    }

    get hasCommitDeltaDeals() { return this.commitDeltaDeals.length > 0; }
    get hasWeightedDeltaDeals() { return this.weightedDeltaDeals.length > 0; }

    // ── Closed Won QTD ──

    async _loadClosedWon() {
        try {
            const data = await getClosedWonQTD();
            this.closedWonData = (data || []).map(row => ({
                ...row,
                key: row.id,
                acvFormatted: this._fmtCurrency(row.netAcv || row.acv || 0),
                closeDateFormatted: row.closeDate
                    ? this._parseLocalDate(row.closeDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : '—',
                revenueLabel: row.revenueType || '—',
                productShort: row.productLine
                    ? row.productLine.split(';').map(p => this._shortProduct(p.trim())).join(' / ')
                    : '—',
                oppUrl: '/' + row.id
            }));
            this.closedWonLoaded = true;
        } catch (err) {
            console.warn('Failed to load Closed Won data', err);
            this.closedWonData = [];
        }
    }

    handleClosedWonToggle() {
        this.showClosedWon = !this.showClosedWon;
    }

    get closedWonTotal() {
        return this.closedWonData.reduce((sum, r) => sum + (r.netAcv || r.acv || 0), 0);
    }
    get closedWonTotalFormatted() { return this._fmtCurrency(this.closedWonTotal); }
    get closedWonRecurring() {
        return this.closedWonData.filter(r => r.revenueType === 'Recurring').reduce((sum, r) => sum + (r.netAcv || r.acv || 0), 0);
    }
    get closedWonRecurringFormatted() { return this._fmtCurrency(this.closedWonRecurring); }
    get closedWonProject() {
        return this.closedWonData.filter(r => r.revenueType === 'Project').reduce((sum, r) => sum + (r.netAcv || r.acv || 0), 0);
    }
    get closedWonProjectFormatted() { return this._fmtCurrency(this.closedWonProject); }
    get closedWonOther() {
        return this.closedWonData.filter(r => r.revenueType !== 'Recurring' && r.revenueType !== 'Project').reduce((sum, r) => sum + (r.netAcv || r.acv || 0), 0);
    }
    get closedWonOtherFormatted() { return this._fmtCurrency(this.closedWonOther); }
    get hasClosedWonOther() { return this.closedWonOther > 0; }
    get closedWonDealCount() { return this.closedWonData.length; }
    get hasClosedWonData() { return this.closedWonData.length > 0; }
    get closedWonChevron() { return this.showClosedWon ? '▾' : '▸'; }

    // ── Export ──

    handleExport() {
        let md = `# Pipeline Review — Week of ${this.weekLabel}\n\n`;
        if (this.hasHighlights) {
            md += '## This Week\'s Highlights\n\n';
            for (const h of this.highlightItems) { md += `- ${h.icon} ${h.text}\n`; }
            md += '\n';
        }
        md += '## Pipeline by Owner\n\n';
        for (const group of this.ownerGroups) {
            md += `### ${group.name} | Pipeline: ${group.totalAcvFormatted}${group.acvDeltaFormatted ? ' | WoW: ' + group.acvDeltaFormatted : ''}\n\n`;
            md += '| Account | ACV | Δ ACV | Target | Δ Days | Stage | FC | WoW |\n';
            md += '|---------|-----|-------|--------|--------|-------|----|-----|\n';
            for (const d of group.deals) {
                md += `| ${d.accountName || '—'} | ${d.acvFormatted} | ${d.acvDeltaDisplay || '—'} | ${d.targetDate} | ${d.targetDeltaDisplay || '—'} | ${d.stageDisplay} | ${d.fcShort} | ${d.wowIcon} |\n`;
            }
            md += '\n';
        }
        if (navigator.clipboard) {
            navigator.clipboard.writeText(md).then(() => {
                this._showToast('Copied', 'Pipeline review copied to clipboard', 'success');
            });
        }
    }

    _shortProduct(name) {
        if (!name) return '—';
        const map = {
            'AI Contracting - Technology': 'AI Contract',
            'AI Contracting - Managed Services': 'AI Contract MS',
            'Contracting - Secondee': 'Secondee',
            'Contracting-BAU': 'Contract BAU',
            'AI Compliance - Technology': 'AI Compliance',
            'AI M&A - Managed Services': 'AI M&A',
            'AI Platform - Sigma': 'Sigma',
            'AI Platform - Insights': 'Insights',
            'AI Platform - Litigation': 'Litigation',
            'FDE - Custom AI Solution': 'FDE',
            'Other - Managed Service': 'Other MS',
            'Other - Secondee': 'Other Sec',
            'Undetermined': 'TBD',
            'Other': 'Other',
            'DSAR': 'DSAR',
        };
        // Check exact match first
        if (map[name]) return map[name];
        // Check partial match for variants
        const lower = name.toLowerCase();
        if (lower.includes('augmented') && lower.includes('compliance')) return 'AI Compliance';
        if (lower.includes('augmented') && lower.includes('contract')) return 'AI Contract';
        if (lower.includes('augmented') && lower.includes('m&a')) return 'AI M&A';
        if (lower.includes('sigma')) return 'Sigma';
        if (lower.includes('secondee')) return 'Secondee';
        if (lower.includes('litigation')) return 'Litigation';
        if (lower.includes('compliance')) return 'AI Compliance';
        if (lower.includes('contract')) return 'AI Contracting';
        // Truncate long names
        return name.length > 15 ? name.substring(0, 13) + '…' : name;
    }

    // ── Collapse/Expand Owner Sections ──
    handleOwnerToggle(e) {
        const owner = e.currentTarget.dataset.owner;
        const newSet = new Set(this.collapsedOwners);
        if (newSet.has(owner)) {
            newSet.delete(owner);
        } else {
            newSet.add(owner);
        }
        this.collapsedOwners = newSet;
        this._buildOwnerGroups();
    }

    handleNavClick(e) {
        const owner = e.currentTarget.dataset.owner;
        if (!owner) return;
        // Expand the section if collapsed
        const newSet = new Set(this.collapsedOwners);
        if (newSet.has(owner)) {
            newSet.delete(owner);
            this.collapsedOwners = newSet;
            this._buildOwnerGroups();
        }
        // Scroll to the section after a brief render delay
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        setTimeout(() => {
            const section = this.template.querySelector(`[data-owner-section="${owner}"]`);
            if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
    }

    handleOwnerSort(e) {
        const owner = e.currentTarget.dataset.owner;
        const field = e.currentTarget.dataset.field;
        if (!owner || !field) return;
        const currentField = this.ownerSortField[owner] || 'acv';
        const currentDir = this.ownerSortDir[owner] || 'desc';
        if (currentField === field) {
            this.ownerSortDir = { ...this.ownerSortDir, [owner]: currentDir === 'asc' ? 'desc' : 'asc' };
        } else {
            this.ownerSortField = { ...this.ownerSortField, [owner]: field };
            const numSortFields = new Set(['acv', 'acvDelta', 'targetDeltaDays', 'netAcv']);
            this.ownerSortDir = { ...this.ownerSortDir, [owner]: numSortFields.has(field) ? 'desc' : 'asc' };
        }
        this._buildOwnerGroups();
    }

    // ── Inline Edit ──
    static FIELD_LABELS = {
        'ACV__c': 'ACV ($)',
        'Target_LOI_Date__c': 'Target Sign Date',
        'StageName': 'Stage',
        'BL_Forecast_Category__c': 'Forecast Category',
        'Product_Lines_Multi__c': 'Products',
        'Next_Steps__c': 'Next Steps',
    };

    static STAGE_OPTIONS = [
        { label: 'S0 - Prospecting', value: 'Stage 0 - Prospecting' },
        { label: 'S1 - Discovery', value: 'Stage 1 - Discovery' },
        { label: 'S2 - SQO', value: 'Stage 2 - SQO' },
        { label: 'S3 - Pilot', value: 'Stage 3 - Pilot' },
        { label: 'S4 - Proposal', value: 'Stage 4 - Proposal' },
        { label: 'S5 - Negotiation', value: 'Stage 5 - Negotiation' },
        { label: 'Nurture', value: 'Nurture' },
        { label: 'Disqualified', value: 'Disqualified' },
        { label: 'Lost', value: 'Lost' },
    ];

    static FC_OPTIONS = [
        { label: 'Pipeline', value: 'Pipeline' },
        { label: 'Gut', value: 'Gut' },
        { label: 'Commit', value: 'Commit' },
    ];

    static PRODUCT_OPTIONS = [
        { label: 'AI Compliance - Technology', value: 'AI Compliance - Technology' },
        { label: 'AI Contracting - Technology', value: 'AI Contracting - Technology' },
        { label: 'AI Contracting - Managed Services', value: 'AI Contracting - Managed Services' },
        { label: 'AI M&A - Managed Services', value: 'AI M&A - Managed Services' },
        { label: 'AI Platform - Sigma', value: 'AI Platform - Sigma' },
        { label: 'AI Platform - Insights', value: 'AI Platform - Insights' },
        { label: 'AI Platform - Litigation', value: 'AI Platform - Litigation' },
        { label: 'FDE - Custom AI Solution', value: 'FDE - Custom AI Solution' },
        { label: 'Other - Managed Service', value: 'Other - Managed Service' },
        { label: 'Other - Secondee', value: 'Other - Secondee' },
        { label: 'Contracting - Secondee', value: 'Contracting - Secondee' },
        { label: 'Undetermined', value: 'Undetermined' },
    ];

    handleEditClick(e) {
        const oppId = e.currentTarget.dataset.opp;
        const field = e.currentTarget.dataset.field;
        const value = e.currentTarget.dataset.value || '';
        if (!oppId || !field) return;
        this.editOppId = oppId;
        this.editField = field;
        this.editValue = value === 'undefined' ? '' : value;
        this.editFieldLabel = PipelineReviewCenter.FIELD_LABELS[field] || field;
        this.isEditing = true;
    }

    get editIsText() { return this.editField === 'ACV__c'; }
    get editIsDate() { return this.editField === 'Target_LOI_Date__c'; }
    get editIsPicklist() { return this.editField === 'StageName' || this.editField === 'BL_Forecast_Category__c'; }
    get editIsTextarea() { return this.editField === 'Next_Steps__c'; }
    get editIsMultiSelect() { return this.editField === 'Product_Lines_Multi__c'; }

    get editPicklistOptions() {
        if (this.editField === 'StageName') return PipelineReviewCenter.STAGE_OPTIONS;
        if (this.editField === 'BL_Forecast_Category__c') return PipelineReviewCenter.FC_OPTIONS;
        return [];
    }

    get editMultiSelectOptions() {
        return PipelineReviewCenter.PRODUCT_OPTIONS;
    }

    get editMultiSelectValue() {
        if (!this.editValue) return [];
        return this.editValue.split(';').map(v => v.trim()).filter(v => v);
    }

    handleEditValueChange(e) {
        if (this.editIsMultiSelect) {
            this.editValue = e.detail.value.join(';');
        } else {
            this.editValue = e.detail ? e.detail.value : e.target.value;
        }
    }

    handleEditCancel() {
        this.isEditing = false;
        this.editOppId = null;
    }

    async handleEditSave() {
        if (!this.editOppId || !this.editField) return;

        const savedOppId = this.editOppId;
        const savedField = this.editField;
        const savedValue = this.editValue;
        const savedLabel = this.editFieldLabel;

        this.isEditing = false;
        this.editOppId = null;

        try {
            const result = await updateOpportunityField({
                oppId: savedOppId,
                fieldName: savedField,
                fieldValue: savedValue
            });
            if (result === 'OK') {
                this._applyLocalUpdate(savedOppId, savedField, savedValue);
                this._forceRerender();
                this._showToast('Saved', `${savedLabel} updated`, 'success');
            } else {
                this._showToast('Error', result, 'error');
            }
        } catch (err) {
            this._showToast('Error', 'Failed to save: ' + (err.body?.message || err.message || ''), 'error');
        }
    }

    _forceRerender() {
        const saved = this.ownerGroups;
        this.ownerGroups = [];
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        Promise.resolve().then(() => {
            this.ownerGroups = saved;
        });
    }

    _applyLocalUpdate(oppId, fieldName, newValue) {
        const fieldMap = {
            'ACV__c': 'acv',
            'Target_LOI_Date__c': 'targetSign',
            'StageName': 'stage',
            'BL_Forecast_Category__c': 'forecastCategory',
            'Product_Lines_Multi__c': 'productLine',
            'Next_Steps__c': 'nextSteps',
        };
        const localKey = fieldMap[fieldName];
        if (!localKey) return;

        this._editVersion++;

        this.pipelineData = this.pipelineData.map(row => {
            if (row.id === oppId) {
                const updated = { ...row, [localKey]: newValue };
                if (localKey === 'acv') {
                    updated.acv = parseFloat(newValue) || 0;
                    updated.weightedAcv = updated.acv * (updated.probability || 10) / 100;
                }
                if (localKey === 'productLine') {
                    updated.aiEnabled = this._hasAiProduct(newValue);
                }
                if (localKey === 'stage') {
                    updated.stageShort = newValue.replace(/Stage\s*/, 'S').split(' -')[0];
                }
                return updated;
            }
            return row;
        });
        this._applyTargetSignFilter();
    }

    _hasAiProduct(productLine) {
        if (!productLine) return false;
        const aiProducts = ['AI Contracting', 'AI Compliance', 'AI M&A', 'AI Platform'];
        return aiProducts.some(p => productLine.includes(p));
    }

    _showToast(title, message, variant) {
        this.dispatchEvent(new CustomEvent('showtoast', {
            detail: { title, message, variant },
            bubbles: true, composed: true
        }));
    }

    // ── Date parsing ──

    _parseLocalDate(dateStr) {
        if (!dateStr) return null;
        return new Date(dateStr + 'T00:00:00');
    }

    // ── Formatting ──

    _fmtCurrency(val) {
        if (val == null || val === 0) return '$0';
        if (Math.abs(val) >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
        if (Math.abs(val) >= 1000) return `$${Math.round(val / 1000)}k`;
        return `$${Math.round(val)}`;
    }

    _fmtCurrencyDelta(val) {
        if (!val) return '';
        const fmt = this._fmtCurrency(Math.abs(val));
        return val > 0 ? `+${fmt}` : `-${fmt}`;
    }
}