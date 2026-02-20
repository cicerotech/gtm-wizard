import { LightningElement, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getAccountHealth from '@salesforce/apex/CSHomeController.getAccountHealth';
import getLateStageCSPipeline from '@salesforce/apex/CSHomeController.getLateStageCSPipeline';
import getExpansionPipeline from '@salesforce/apex/CSHomeController.getExpansionPipeline';
import getContractRenewals from '@salesforce/apex/CSHomeController.getContractRenewals';
import saveAccountHealth from '@salesforce/apex/CSHomeController.saveAccountHealth';
import saveCSOutcome from '@salesforce/apex/CSHomeController.saveCSOutcome';
import getCSOutcomes from '@salesforce/apex/CSHomeController.getCSOutcomes';

export default class CsHomeDashboard extends LightningElement {

    @track healthSummary = {};
    @track healthAccounts = [];
    @track csPipeline = {};
    @track csDeals = [];
    @track expansionDeals = [];
    @track contracts = [];
    @track outcomes = [];
    isLoading = true;
    error;

    activeTab = 'health';

    // Edit state
    @track editModalOpen = false;
    @track editAccount = {};
    @track editOutcomeOpen = false;
    @track editOutcomeAccount = {};

    get healthOptions() { return [{label:'Green',value:'Green'},{label:'Yellow',value:'Yellow'},{label:'Red',value:'Red'}]; }
    get isOutcomesTab() { return this.activeTab === 'outcomes'; }
    get outcomesTabClass() { return 'tab-btn' + (this.isOutcomesTab ? ' active' : ''); }
    get hasOutcomes() { return this.outcomes.length > 0; }

    // Structured outcomes grouped by status
    @track outcomesByStatus = { delivered: [], inDelivery: [], nearTerm: [] };
    get hasDelivered() { return this.outcomesByStatus.delivered.length > 0; }
    get hasInDelivery() { return this.outcomesByStatus.inDelivery.length > 0; }
    get hasNearTerm() { return this.outcomesByStatus.nearTerm.length > 0; }
    get deliveredCount() { return this.outcomesByStatus.delivered.length; }
    get inDeliveryCount() { return this.outcomesByStatus.inDelivery.length; }
    get nearTermCount() { return this.outcomesByStatus.nearTerm.length; }

    // Add outcome state
    @track addOutcomeOpen = false;
    @track newOutcome = { accountId: '', accountName: '', status: 'Delivered', product: '', outcome: '' };
    get statusOptions() { return [{label:'Delivered',value:'Delivered'},{label:'In Delivery',value:'In Delivery'},{label:'Near-Term',value:'Near-Term'}]; }

    connectedCallback() {
        this._loadAll();
    }

    async _loadAll() {
        this.isLoading = true;
        try {
            const [health, pipeline, expansion, contracts, outcomesData] = await Promise.all([
                getAccountHealth(),
                getLateStageCSPipeline(),
                getExpansionPipeline(),
                getContractRenewals(),
                getCSOutcomes()
            ]);

            this.healthSummary = health || {};
            this.healthAccounts = (health?.accounts || []).map(a => ({
                ...a,
                key: a.id,
                healthClass: `health-badge health-${(a.health || '').toLowerCase()}`,
                accountUrl: '/' + a.id,
                overviewSnippet: a.healthOverview
                    ? (a.healthOverview.length > 200 ? a.healthOverview.substring(0, 200) + '...' : a.healthOverview)
                    : '—'
            }));

            this.csPipeline = pipeline || {};
            this.csDeals = (pipeline?.deals || []).map(d => this._enrichDeal(d));

            this.expansionDeals = (expansion || []).map(d => this._enrichDeal(d));

            // All contracts are now forward-looking (EndDate >= TODAY)
            this.contracts = (contracts || []).map(c => {
                const days = c.daysUntilEnd || 0;
                // Days column: muted amber for ≤30, orange for 31-90, green for 90+
                let daysClass = 'days-ok';
                if (days <= 30) daysClass = 'days-urgent';
                else if (days <= 90) daysClass = 'days-warning';
                // Status column: always neutral text (not colored)
                const statusText = c.status || '—';
                const statusClass = statusText === 'Draft' ? 'status-draft' : 'status-neutral';

                return {
                    ...c,
                    key: c.id,
                    accountUrl: '/' + c.id,
                    endDateFormatted: c.endDate
                        ? new Date(c.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : '—',
                    statusClass,
                    daysClass,
                    daysLabel: `${days}d remaining`,
                    healthClass: c.health ? `health-dot health-${c.health.toLowerCase()}` : ''
                };
            });

            this.outcomes = (outcomesData || []).map(o => ({
                ...o,
                key: o.id,
                healthClass: o.health ? `health-badge health-${o.health.toLowerCase()}` : '',
                outcomeSnippet: o.outcome ? (o.outcome.length > 150 ? o.outcome.substring(0, 150) + '...' : o.outcome) : 'Not set'
            }));

            // Parse structured outcomes from JSON in CS_Outcomes__c
            this._parseStructuredOutcomes(outcomesData || []);

            this.error = undefined;
        } catch (err) {
            this.error = err?.body?.message || 'Error loading CS dashboard data';
        } finally {
            this.isLoading = false;
        }
    }

    _enrichDeal(d) {
        const targetDate = d.targetSign
            ? new Date(d.targetSign).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : '—';

        let rowSentiment = 'neutral';
        if (d.anyChange && d.stageDir > 0) rowSentiment = 'positive';
        else if (d.anyChange && d.stageDir < 0) rowSentiment = 'negative';

        let acvDisplay = '';
        let acvSentiment = 'neutral';
        if (d.acvDelta > 0) { acvDisplay = '↑'; acvSentiment = 'positive'; }
        else if (d.acvDelta < 0) { acvDisplay = '↓'; acvSentiment = 'negative'; }

        let targetSentiment = 'neutral';
        if (d.targetDeltaDays > 7) targetSentiment = 'negative';
        else if (d.targetDeltaDays < -3) targetSentiment = 'positive';

        return {
            ...d,
            key: d.id,
            oppUrl: '/' + d.id,
            acvFormatted: this._fmtCurrency(d.acv || 0),
            targetDate,
            acvDisplay,
            acvSentiment,
            targetSentiment,
            rowSentiment,
            rowClass: `table-row row-${rowSentiment}`,
            existingBadge: d.isExisting ? 'Existing' : '',
            stageBadge: d.stageChanged ? (d.stageDir > 0 ? '↑' : '↓') : '',
            productShort: this._abbreviateProduct(d.productLine)
        };
    }

    _abbreviateProduct(name) {
        if (!name) return '—';
        // Map known long product line names to clean abbreviations
        const abbrevs = {
            'AI Compliance - Technology': 'AI Comp-Tech',
            'AI Platform - Insights': 'AI Plat-Insights',
            'AI Contracting - Technology': 'AI Contr-Tech',
            'AI Platform - Sigma': 'AI Plat-Sigma',
            'AI Platform - Litigation': 'AI Plat-Litigation',
            'AI Contracting - Managed Services': 'AI Contr-MS',
            'AI M&A - Managed Services': 'AI M&A-MS',
            'FDE - Custom AI Solution': 'FDE-Custom AI',
            'Other - Managed Service': 'Other-MS',
            'Other - Secondee': 'Other-Secondee',
            'Contracting - Secondee': 'Contr-Secondee',
            // Handle multi-select "Multiple" values
            'Multiple': 'Multiple'
        };
        if (abbrevs[name]) return abbrevs[name];
        // Fallback: handle "AI-Augmented" prefix pattern from legacy data
        let short = name
            .replace('AI-Augmented ', 'AI ')
            .replace('Compliance_In-House Technology', 'Compliance Tech')
            .replace('Contracting_In-House Technology', 'Contracting Tech')
            .replace('Contracting_Managed Services', 'Contracting MS')
            .replace('Managed Services', 'MS')
            .replace('Other_Managed Service', 'Other-MS');
        // Truncate if still too long
        if (short.length > 25) short = short.substring(0, 23) + '...';
        return short;
    }

    // ── Tab handlers ──

    handleTabClick(event) {
        this.activeTab = event.currentTarget.dataset.tab;
    }

    get isHealthTab() { return this.activeTab === 'health'; }
    get isPipelineTab() { return this.activeTab === 'pipeline'; }
    get isExpansionTab() { return this.activeTab === 'expansion'; }
    get isContractsTab() { return this.activeTab === 'contracts'; }

    get healthTabClass() { return 'tab-btn' + (this.isHealthTab ? ' active' : ''); }
    get pipelineTabClass() { return 'tab-btn' + (this.isPipelineTab ? ' active' : ''); }
    get expansionTabClass() { return 'tab-btn' + (this.isExpansionTab ? ' active' : ''); }
    get contractsTabClass() { return 'tab-btn' + (this.isContractsTab ? ' active' : ''); }

    // ── Computed getters ──

    get greenCount() { return this.healthSummary.greenCount || 0; }
    get yellowCount() { return this.healthSummary.yellowCount || 0; }
    get redCount() { return this.healthSummary.redCount || 0; }
    get totalHealthAccounts() { return this.healthSummary.totalAccounts || 0; }

    get csDealsCount() { return this.csPipeline.totalDeals || 0; }
    get csAcvFormatted() { return this._fmtCurrency(this.csPipeline.totalACV || 0); }
    get stage4Count() { return this.csPipeline.stage4Count || 0; }
    get stage4AcvFormatted() { return this._fmtCurrency(this.csPipeline.stage4ACV || 0); }
    get stage5Count() { return this.csPipeline.stage5Count || 0; }
    get stage5AcvFormatted() { return this._fmtCurrency(this.csPipeline.stage5ACV || 0); }

    get hasExpansionDeals() { return this.expansionDeals.length > 0; }
    get hasContracts() { return this.contracts.length > 0; }
    get hasCSDeals() { return this.csDeals.length > 0; }

    get weekLabel() {
        return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }

    handleRefresh() { this._loadAll(); }

    // ── Health Edit ──
    handleEditHealth(event) {
        const acctId = event.currentTarget.dataset.id;
        const acct = this.healthAccounts.find(a => a.key === acctId);
        if (acct) {
            this.editAccount = { id: acctId, name: acct.name, health: acct.health, overview: acct.healthOverview || '' };
            this.editModalOpen = true;
        }
    }
    handleHealthChange(e) { this.editAccount = { ...this.editAccount, health: e.detail.value }; }
    handleOverviewChange(e) { this.editAccount = { ...this.editAccount, overview: e.detail.value }; }
    handleEditCancel() { this.editModalOpen = false; this.editAccount = {}; }
    async handleEditSave() {
        this.editModalOpen = false;
        try {
            await saveAccountHealth({ accountId: this.editAccount.id, health: this.editAccount.health, healthOverview: this.editAccount.overview });
            this.dispatchEvent(new ShowToastEvent({ title: 'Saved', message: 'Account health updated', variant: 'success' }));
            this._loadAll();
        } catch (e) {
            this.dispatchEvent(new ShowToastEvent({ title: 'Error', message: e.body?.message || e.message, variant: 'error' }));
        }
    }

    // ── Outcome Edit ──
    handleEditOutcome(event) {
        const acctId = event.currentTarget.dataset.id;
        const acct = this.outcomes.find(o => o.key === acctId);
        if (acct) {
            this.editOutcomeAccount = { id: acctId, name: acct.name, products: acct.products, outcome: acct.outcome || '' };
            this.editOutcomeOpen = true;
        }
    }
    handleOutcomeTextChange(e) { this.editOutcomeAccount = { ...this.editOutcomeAccount, outcome: e.detail.value }; }
    handleOutcomeCancel() { this.editOutcomeOpen = false; this.editOutcomeAccount = {}; }
    async handleOutcomeSave() {
        this.editOutcomeOpen = false;
        try {
            await saveCSOutcome({ accountId: this.editOutcomeAccount.id, outcome: this.editOutcomeAccount.outcome });
            this.dispatchEvent(new ShowToastEvent({ title: 'Saved', message: 'Outcome updated', variant: 'success' }));
            this._loadAll();
        } catch (e) {
            this.dispatchEvent(new ShowToastEvent({ title: 'Error', message: e.body?.message || e.message, variant: 'error' }));
        }
    }

    // ── Structured Outcomes ──

    _parseStructuredOutcomes(accountRows) {
        const delivered = [];
        const inDelivery = [];
        const nearTerm = [];
        let idx = 1;

        for (const acct of accountRows) {
            if (!acct.outcome) continue;
            let parsed = [];
            try {
                parsed = JSON.parse(acct.outcome);
                if (!Array.isArray(parsed)) parsed = [];
            } catch {
                if (acct.outcome.trim()) {
                    parsed = [{ status: 'Delivered', product: acct.products || '—', outcome: acct.outcome }];
                }
            }

            for (const item of parsed) {
                const row = {
                    key: `${acct.id}_${idx++}`,
                    accountId: acct.id,
                    accountName: acct.name,
                    accountUrl: '/' + acct.id,
                    health: acct.health,
                    healthClass: acct.health ? `health-badge health-${acct.health.toLowerCase()}` : '',
                    product: item.product || '—',
                    outcome: item.outcome || '',
                    status: item.status || 'Delivered'
                };

                if (row.status === 'Delivered') delivered.push(row);
                else if (row.status === 'In Delivery') inDelivery.push(row);
                else if (row.status === 'Near-Term') nearTerm.push(row);
                else delivered.push(row);
            }
        }

        // Assign sequential row numbers per category
        delivered.forEach((r, i) => { r.rowNum = i + 1; });
        inDelivery.forEach((r, i) => { r.rowNum = i + 1; });
        nearTerm.forEach((r, i) => { r.rowNum = i + 1; });

        this.outcomesByStatus = { delivered, inDelivery, nearTerm };
    }

    handleAddOutcomeOpen(event) {
        const status = event.currentTarget.dataset.status || 'Delivered';
        this.newOutcome = { accountId: '', accountName: '', status, product: '', outcome: '' };
        this.addOutcomeOpen = true;
    }
    handleAddOutcomeClose() { this.addOutcomeOpen = false; }
    handleNewOutcomeStatus(e) { this.newOutcome = { ...this.newOutcome, status: e.detail.value }; }
    handleNewOutcomeProduct(e) { this.newOutcome = { ...this.newOutcome, product: e.detail.value }; }
    handleNewOutcomeText(e) { this.newOutcome = { ...this.newOutcome, outcome: e.detail.value }; }
    handleNewOutcomeAccount(e) {
        const acctId = e.detail.value;
        const acct = this.outcomes.find(o => o.id === acctId);
        this.newOutcome = { ...this.newOutcome, accountId: acctId, accountName: acct?.name || '' };
    }

    get accountPicklistOptions() {
        return this.outcomes.map(o => ({ label: o.name, value: o.id }));
    }

    async handleAddOutcomeSave() {
        if (!this.newOutcome.accountId || !this.newOutcome.outcome) return;
        this.addOutcomeOpen = false;

        const acct = this.outcomes.find(o => o.id === this.newOutcome.accountId);
        let existing = [];
        try { existing = JSON.parse(acct?.outcome || '[]'); if (!Array.isArray(existing)) existing = []; } catch { existing = []; }

        existing.push({
            status: this.newOutcome.status,
            product: this.newOutcome.product,
            outcome: this.newOutcome.outcome
        });

        try {
            await saveCSOutcome({ accountId: this.newOutcome.accountId, outcome: JSON.stringify(existing) });
            this.dispatchEvent(new ShowToastEvent({ title: 'Saved', message: 'Outcome added', variant: 'success' }));
            this._loadAll();
        } catch (e) {
            this.dispatchEvent(new ShowToastEvent({ title: 'Error', message: e.body?.message || e.message, variant: 'error' }));
        }
    }

    // ── Formatting ──

    _fmtCurrency(val) {
        if (val == null || val === 0) return '$0';
        if (Math.abs(val) >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
        if (Math.abs(val) >= 1000) return `$${Math.round(val / 1000)}k`;
        return `$${Math.round(val)}`;
    }
}