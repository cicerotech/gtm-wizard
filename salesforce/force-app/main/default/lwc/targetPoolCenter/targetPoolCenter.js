import { LightningElement, track } from 'lwc';
import getAccountDistribution from '@salesforce/apex/TargetPoolController.getAccountDistribution';
import getAssignedAccounts from '@salesforce/apex/TargetPoolController.getAssignedAccounts';
import getBLOptions from '@salesforce/apex/TargetPoolController.getBLOptions';
import getPoolAccounts from '@salesforce/apex/TargetPoolController.getPoolAccounts';
import getPoolSummary from '@salesforce/apex/TargetPoolController.getPoolSummary';
import claimAccount from '@salesforce/apex/TargetPoolController.claimAccount';
import dropAccount from '@salesforce/apex/TargetPoolController.dropAccount';
import transferAccount from '@salesforce/apex/TargetPoolController.transferAccount';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

export default class TargetPoolCenter extends LightningElement {
    activeTab = 'distribution';
    @track blSummary = [];
    @track expandedBL = null;
    @track blAccounts = [];
    @track blOptions = [];
    distLoading = true;
    blLoading = false;

    @track poolData = [];
    @track filteredPool = [];
    @track summary = {};
    @track industryOptions = [{ label: 'All Industries', value: 'All' }];
    selectedTier = 'All';
    selectedPod = 'All';
    selectedIndustry = 'All';
    searchTerm = '';
    poolLoading = true;

    showConfirm = false;
    confirmTitle = '';
    confirmMessage = '';
    confirmAccountId = null;
    confirmAction = null;
    showTransferPicker = false;
    showDropReason = false;
    dropReason = '';
    transferTarget = '';

    tierOptions = [
        { label: 'All Tiers', value: 'All' },
        { label: 'T1 — High Priority', value: 'T1' },
        { label: 'T2 — Medium', value: 'T2' },
        { label: 'T3 — Standard', value: 'T3' }
    ];
    podOptions = [
        { label: 'All Pods', value: 'All' },
        { label: 'US Pod', value: 'US Pod' },
        { label: 'EU Pod', value: 'EU Pod' }
    ];

    connectedCallback() {
        this._loadDistribution();
        this._loadPool();
        this._loadBLOptions();
    }

    handleTabChange(event) { this.activeTab = event.target.value; }

    async _loadDistribution() {
        this.distLoading = true;
        try { this.blSummary = await getAccountDistribution(); } catch (e) { console.error(e); }
        this.distLoading = false;
    }

    async _loadBLOptions() {
        try { this.blOptions = await getBLOptions(); } catch (e) { console.error(e); }
    }

    get usBLs() { return this.blSummary.filter(b => b.pod === 'US'); }
    get euBLs() { return this.blSummary.filter(b => b.pod === 'EU'); }
    get distTotal() {
        let t=0,a=0,i=0;
        this.blSummary.forEach(b => { t+=b.totalAccounts; a+=b.activePipeline; i+=b.inactive; });
        return {total:t, active:a, inactive:i};
    }

    async handleBLClick(e) {
        const bl = e.currentTarget.dataset.bl;
        if (this.expandedBL === bl) { this.expandedBL = null; this.blAccounts = []; return; }
        this.expandedBL = bl; this.blLoading = true;
        try { this.blAccounts = await getAssignedAccounts({ ownerName: bl }); } catch (err) { this.blAccounts = []; }
        this.blLoading = false;
    }

    get showBLAccounts() { return this.expandedBL && !this.blLoading && this.blAccounts.length > 0; }
    get expandedBLName() { return this.expandedBL; }
    get expandedBLCount() { return this.blAccounts.length; }

    handleDrop(e) {
        this._openConfirm('Drop Account', `Drop "${e.target.dataset.name}" to the Target Pool? Please provide a reason.`, e.target.dataset.id, 'drop', false);
        this.showDropReason = true;
        this.dropReason = '';
    }
    handleDropReasonChange(e) { this.dropReason = e.detail.value; }
    handleTransferOpen(e) {
        this._openConfirm('Transfer Account', `Transfer "${e.target.dataset.name}" to:`, e.target.dataset.id, 'transfer', true);
    }
    handlePoolTransfer(e) {
        this._openConfirm('Assign Account', `Assign "${e.target.dataset.name}" to a Business Lead:`, e.target.dataset.id, 'transfer', true);
    }

    _openConfirm(title, msg, id, action, showPicker) {
        this.confirmTitle = title;
        this.confirmMessage = msg;
        this.confirmAccountId = id;
        this.confirmAction = action;
        this.showTransferPicker = showPicker;
        this.showDropReason = false;
        this.dropReason = '';
        this.transferTarget = '';
        this.showConfirm = true;
    }

    handleTransferTargetChange(e) { this.transferTarget = e.detail.value; }

    handleExport() {
        let csv = 'Business Lead,Pod,Q1 Book,Front Book,Back Book\n';
        this.blSummary.forEach(b => { csv += `${b.ownerName},${b.pod},${b.totalAccounts},${b.activePipeline},${b.inactive}\n`; });
        csv += `TOTAL,,${this.distTotal.total},${this.distTotal.active},${this.distTotal.inactive}\n`;
        if (this.blAccounts.length > 0) {
            csv += `\n${this.expandedBL} Accounts\nAccount,Industry,Context,Book\n`;
            this.blAccounts.forEach(a => { csv += `"${a.name}","${a.industry||''}","${a.context||''}","${a.book}"\n`; });
        }
        // Use data URI for LWC compatibility
        const encodedUri = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', 'Q1_FY26_Distribution.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // Pool
    async _loadPool() {
        this.poolLoading = true;
        try {
            const [accounts, summary] = await Promise.all([getPoolAccounts({tierFilter:'All'}), getPoolSummary()]);
            this.poolData = accounts; this.summary = summary;
            this._buildIndustryOptions();
            this._applyPoolFilters();
        } catch (e) { console.error(e); }
        this.poolLoading = false;
    }

    _buildIndustryOptions() {
        const inds = new Set();
        this.poolData.forEach(a => { if (a.industry) inds.add(a.industry); });
        this.industryOptions = [
            { label: 'All Industries', value: 'All' },
            ...[...inds].sort().map(i => ({ label: i, value: i }))
        ];
    }

    _applyPoolFilters() {
        let d = [...this.poolData];
        if (this.selectedTier !== 'All') d = d.filter(a => a.tier === this.selectedTier);
        if (this.selectedPod !== 'All') d = d.filter(a => a.pod === this.selectedPod);
        if (this.selectedIndustry !== 'All') d = d.filter(a => a.industry === this.selectedIndustry);
        if (this.searchTerm) { const t = this.searchTerm.toLowerCase(); d = d.filter(a => (a.name||'').toLowerCase().includes(t) || (a.industry||'').toLowerCase().includes(t)); }
        this.filteredPool = d;
    }

    handleTierChange(e) { this.selectedTier = e.detail.value; this._applyPoolFilters(); }
    handlePodChange(e) { this.selectedPod = e.detail.value; this._applyPoolFilters(); }
    handleIndustryChange(e) { this.selectedIndustry = e.detail.value; this._applyPoolFilters(); }
    handleSearch(e) { this.searchTerm = e.target.value; this._applyPoolFilters(); }
    handleRefresh() { this._loadPool(); this._loadDistribution(); }

    handleClaim(e) {
        const tier = e.target.dataset.tier;
        const name = e.target.dataset.name;
        const rev = e.target.dataset.rev;
        const title = tier === 'T1' ? 'Claim T1 Priority Account' : 'Claim Account';
        const msg = tier === 'T1'
            ? `"${name}" is T1 (${rev}). Pod restrictions apply. Confirm?`
            : `Claim "${name}"?`;
        this._openConfirm(title, msg, e.target.dataset.id, 'claim', false);
    }

    handleConfirmCancel() { this.showConfirm = false; }

    async handleConfirmOk() {
        this.showConfirm = false;
        const id = this.confirmAccountId;
        const action = this.confirmAction;
        try {
            let result;
            if (action === 'claim') result = await claimAccount({ accountId: id });
            else if (action === 'drop') {
                if (!this.dropReason || this.dropReason.trim().length < 5) {
                    this.dispatchEvent(new ShowToastEvent({title:'Required',message:'Please provide a reason for dropping this account (at least 5 characters)',variant:'warning'}));
                    this.showConfirm = true;
                    return;
                }
                result = await dropAccount({ accountId: id, dropReason: this.dropReason.trim() });
            }
            else if (action === 'transfer') {
                if (!this.transferTarget) {
                    this.dispatchEvent(new ShowToastEvent({title:'Error',message:'Select a Business Lead',variant:'error'}));
                    return;
                }
                result = await transferAccount({ accountId: id, targetBLName: this.transferTarget });
            }
            if (result && result.success) {
                this.dispatchEvent(new ShowToastEvent({title:'Success',message:result.message,variant:'success'}));
                // Small delay to let SF cache invalidate after DML, then reload
                await new Promise(r => setTimeout(r, 1000));
                this._loadPool(); this._loadDistribution();
                if (this.expandedBL) this.blAccounts = await getAssignedAccounts({ownerName:this.expandedBL});
            } else {
                this.dispatchEvent(new ShowToastEvent({title:'Failed',message:result?result.message:'Error',variant:'error'}));
            }
        } catch (error) {
            this.dispatchEvent(new ShowToastEvent({title:'Error',message:'Operation failed',variant:'error'}));
        }
    }

    get poolCount() { return this.filteredPool.length; }
    get scorecardItems() {
        const s = this.summary;
        return [
            { label: 'TOTAL POOL', value: s.totalAccounts||0, cls: 'score-card total' },
            { label: 'T1 HIGH PRIORITY', value: s.t1Count||0, cls: 'score-card t1' },
            { label: 'T2 MEDIUM', value: s.t2Count||0, cls: 'score-card t2' },
            { label: 'T3 STANDARD', value: s.t3Count||0, cls: 'score-card t3' },
        ];
    }
}
