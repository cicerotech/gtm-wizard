import { LightningElement, wire, track } from 'lwc';
import getPipelineData from '@salesforce/apex/PipelineReviewController.getPipelineData';
import getProductLineOptions from '@salesforce/apex/PipelineReviewController.getProductLineOptions';
import updateOpportunityField from '@salesforce/apex/PipelineReviewController.updateOpportunityField';

export default class PipelineReviewCenter extends LightningElement {

    // Filters
    selectedPod = 'All';
    selectedStage = '';
    selectedProductLine = 'All';
    selectedTargetSign = 'All';
    changesOnly = false;

    // Inline edit state
    isEditing = false;
    editOppId = null;
    editField = '';
    editValue = '';
    editFieldLabel = '';

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
            const data = await getPipelineData({
                pod: this.selectedPod,
                stageMin: this.selectedStage,
                changesOnly: this.changesOnly,
                productLine: this.selectedProductLine
            });

            this.pipelineData = data || [];
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
                    const d = new Date(r.targetSign);
                    return d >= start && d <= end;
                });
            }
        }
        this.filteredData = rows;
        this._computeSummary();
        this._buildOwnerGroups();
    }

    // ── Client-side summary (reflects current filters) ──

    _computeSummary() {
        const s = {
            totalDeals: 0, totalACV: 0, weightedACV: 0,
            totalAIDeals: 0, totalAIACV: 0, weightedAIACV: 0,
            commitTotal: 0, commitInQtr: 0,
            commitAITotal: 0, commitAIInQtr: 0,
            stageAdvances: 0, stageRegressions: 0,
            acvIncreases: 0, acvDecreases: 0, netACVChange: 0,
            targetSlips: 0, movedToCommit: 0, newDeals: 0, changedDeals: 0
        };

        for (const row of this.filteredData) {
            s.totalDeals++;
            const acv = row.acv || 0;
            const wtd = row.weightedAcv || 0;
            s.totalACV += acv;
            s.weightedACV += wtd;

            const isCommit = row.forecastCategory === 'Commit';
            let isInQtr = false;
            if (row.targetSign) {
                const d = new Date(row.targetSign);
                isInQtr = d >= this._qtrStart && d <= this._qtrEnd;
            }

            if (isCommit) {
                s.commitTotal += acv;
                if (isInQtr) s.commitInQtr += acv;
            }

            if (row.aiEnabled) {
                s.totalAIDeals++;
                // Use Net ACV formula fields for AI-enabled metrics
                s.totalAIACV += (row.netAcv || acv);
                s.weightedAIACV += (row.weightedNetAI || wtd);
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
                    deals: [], totalAcv: 0, acvDelta: 0, weightedAcv: 0,
                    commitTotal: 0, commitInQtr: 0,
                    blForecast: 0, aiEnabledAcv: 0, aiEnabledCount: 0
                };
            }
            const enriched = this._enrichRow(row);
            groups[owner].deals.push(enriched);
            groups[owner].totalAcv += (row.acv || 0);
            groups[owner].acvDelta += (row.acvDelta || 0);
            groups[owner].weightedAcv += (row.weightedAcv || 0);
            // BL Forecast = Commit + Gut (Pipeline with BL confidence)
            if (row.forecastCategory === 'Commit' || row.forecastCategory === 'Gut') {
                groups[owner].blForecast += (row.acv || 0);
            }
            if (row.forecastCategory === 'Commit') {
                groups[owner].commitTotal += (row.acv || 0);
                if (enriched.isInQuarter) {
                    groups[owner].commitInQtr += (row.acv || 0);
                }
            }
            // AI-Enabled tracking (Net ACV)
            if (row.aiEnabled) {
                groups[owner].aiEnabledAcv += (row.netAcv || row.acv || 0);
                groups[owner].aiEnabledCount++;
            }
        }

        this.ownerGroups = Object.values(groups)
            .sort((a, b) => b.totalAcv - a.totalAcv)
            .map(g => {
                const isCollapsed = this.collapsedOwners.has(g.name);
                const sortField = this.ownerSortField[g.name] || 'acv';
                const sortDir = this.ownerSortDir[g.name] || 'desc';
                let sortedDeals = [...g.deals];
                sortedDeals.sort((a, b) => {
                    let va = a[sortField] || '';
                    let vb = b[sortField] || '';
                    if (sortField === 'acv') { va = va || 0; vb = vb || 0; }
                    else if (typeof va === 'string') { va = va.toLowerCase(); vb = (vb||'').toLowerCase(); }
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
                    totalAcvFormatted: this._fmtCurrency(g.totalAcv),
                    acvDeltaFormatted: g.acvDelta !== 0 ? this._fmtCurrencyDelta(g.acvDelta) : '',
                    acvDeltaSentiment: g.acvDelta > 0 ? 'positive' : g.acvDelta < 0 ? 'negative' : 'neutral',
                    dealCount: g.deals.length,
                    hasDeals: g.deals.length > 0,
                    weightedAcvFormatted: this._fmtCurrency(g.weightedAcv),
                    commitTotalFormatted: this._fmtCurrency(g.commitTotal),
                    commitInQtrFormatted: this._fmtCurrency(g.commitInQtr),
                    hasCommit: g.commitTotal > 0,
                    hasCommitInQtr: g.commitInQtr > 0,
                    blForecastFormatted: this._fmtCurrency(g.blForecast),
                    hasBlForecast: g.blForecast > 0,
                    aiEnabledAcvFormatted: this._fmtCurrency(g.aiEnabledAcv),
                    aiEnabledCount: g.aiEnabledCount,
                    hasAiEnabled: g.aiEnabledCount > 0
                };
            });
    }

    _enrichRow(row) {
        const targetDate = row.targetSign
            ? new Date(row.targetSign).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : '—';

        let isInQuarter = false;
        if (row.targetSign) {
            const d = new Date(row.targetSign);
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
        else if (row.stageChanged && row.stageDir > 0 && (row.stageShort === 'S2' || row.stage === 'Stage 2 - SQO')) wowIcon = 'S2↑';
        else if (row.forecastCategory === 'Commit' && row.fcChanged) wowIcon = '★';
        else if (row.changeScore < -2) wowIcon = '⚠';
        else if (row.changeScore > 0) wowIcon = '✓';

        // Product lines: compact display
        let productsDisplay = '—';
        let productsTooltip = '';
        if (row.productLine) {
            const prods = row.productLine.split(';').map(p => p.trim()).filter(p => p);
            productsTooltip = prods.map(p => this._shortProduct(p)).join(', ');
            if (prods.length === 1) {
                productsDisplay = this._shortProduct(prods[0]);
            } else {
                productsDisplay = prods.length + ' products';
            }
        }

        // Next Steps: show more context
        const nextSteps = row.nextSteps || '';
        const nextStepsShort = nextSteps.length > 140 ? nextSteps.substring(0, 138) + '…' : (nextSteps || '—');

        return {
            ...row,
            key: row.id,
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
        this._loadData();
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
        if (s.acvIncreases > 0) items.push({ key: 'ai', icon: '↑', text: `${s.acvIncreases} ACV increase${s.acvIncreases > 1 ? 's' : ''} (${this._fmtCurrencyDelta(s.netACVChange)} net)` });
        if (s.targetSlips > 0) items.push({ key: 'ts', icon: '⚠', text: `${s.targetSlips} target date slip${s.targetSlips > 1 ? 's' : ''}` });
        if (s.movedToCommit > 0) items.push({ key: 'mc', icon: '★', text: `${s.movedToCommit} moved to Commit` });
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
        if (lower.includes('compliance')) return 'Compliance';
        if (lower.includes('contract')) return 'Contract';
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
            this.ownerSortDir = { ...this.ownerSortDir, [owner]: field === 'acv' ? 'desc' : 'asc' };
        }
        this._buildOwnerGroups();
    }

    // ── Inline Edit ──
    static FIELD_LABELS = {
        'ACV__c': 'ACV ($)',
        'Target_LOI_Date__c': 'Target Sign Date',
        'StageName': 'Stage',
        'BL_Forecast_Category__c': 'Forecast Category',
        'Product_Line__c': 'Products',
        'Next_Steps__c': 'Next Steps',
    };

    static STAGE_OPTIONS = [
        { label: 'S0 - Prospecting', value: 'Stage 0 - Prospecting' },
        { label: 'S1 - Discovery', value: 'Stage 1 - Discovery' },
        { label: 'S2 - SQO', value: 'Stage 2 - SQO' },
        { label: 'S3 - Pilot', value: 'Stage 3 - Pilot' },
        { label: 'S4 - Proposal', value: 'Stage 4 - Proposal' },
        { label: 'S5 - Negotiation', value: 'Stage 5 - Negotiation' },
    ];

    static FC_OPTIONS = [
        { label: 'Pipeline', value: 'Pipeline' },
        { label: 'Gut', value: 'Gut' },
        { label: 'Commit', value: 'Commit' },
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
    get editIsTextarea() { return this.editField === 'Next_Steps__c' || this.editField === 'Product_Line__c'; }

    get editPicklistOptions() {
        if (this.editField === 'StageName') return PipelineReviewCenter.STAGE_OPTIONS;
        if (this.editField === 'BL_Forecast_Category__c') return PipelineReviewCenter.FC_OPTIONS;
        return [];
    }

    handleEditValueChange(e) {
        this.editValue = e.detail ? e.detail.value : e.target.value;
    }

    handleEditCancel() {
        this.isEditing = false;
        this.editOppId = null;
    }

    async handleEditSave() {
        if (!this.editOppId || !this.editField) return;
        this.isEditing = false;
        try {
            const result = await updateOpportunityField({
                oppId: this.editOppId,
                fieldName: this.editField,
                fieldValue: this.editValue
            });
            if (result === 'OK') {
                this._showToast('Saved', `${this.editFieldLabel} updated`, 'success');
                await new Promise(r => setTimeout(r, 500));
                this._loadData();
            } else {
                this._showToast('Error', result, 'error');
            }
        } catch (err) {
            this._showToast('Error', 'Failed to save: ' + (err.body?.message || err.message || ''), 'error');
        }
        this.editOppId = null;
    }

    _showToast(title, message, variant) {
        this.dispatchEvent(new CustomEvent('showtoast', {
            detail: { title, message, variant },
            bubbles: true, composed: true
        }));
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