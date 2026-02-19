import { LightningElement, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getCampaignOverview from '@salesforce/apex/MarketingAnalyticsController.getCampaignOverview';
import getEventPerformance from '@salesforce/apex/MarketingAnalyticsController.getEventPerformance';
import getPipelineAttribution from '@salesforce/apex/MarketingAnalyticsController.getPipelineAttribution';
import getLeadFlow from '@salesforce/apex/MarketingAnalyticsController.getLeadFlow';
import getInsights from '@salesforce/apex/MarketingAnalyticsController.getInsights';
import getCampaignsForEditor from '@salesforce/apex/MarketingAnalyticsController.getCampaignsForEditor';
import saveCampaigns from '@salesforce/apex/MarketingAnalyticsController.saveCampaigns';
import getCampaignMembers from '@salesforce/apex/MarketingAnalyticsController.getCampaignMembers';
import addCampaignMember from '@salesforce/apex/MarketingAnalyticsController.addCampaignMember';
import searchContactsAndLeads from '@salesforce/apex/MarketingAnalyticsController.searchContactsAndLeads';
import getEventBudgetSummary from '@salesforce/apex/MarketingAnalyticsController.getEventBudgetSummary';

export default class MarketingAnalyticsCenter extends LightningElement {
    @track activeTab = 'overview';
    @track loading = true;
    @track error = null;

    @track overview = null;
    @track eventData = null;
    @track attribution = null;
    @track leadFlow = null;
    @track insights = [];
    @track budgetSummary = null;

    // Data editor state
    @track editorCampaigns = [];
    @track editorSubTab = 'campaigns';
    @track editorDraftValues = [];
    @track editorSaving = false;
    @track selectedEditorCampaign = null;
    @track campaignMembers = [];
    @track memberSearchTerm = '';
    @track memberSearchResults = [];
    @track membersLoading = false;

    get isOverview() { return this.activeTab === 'overview'; }
    get isEvents() { return this.activeTab === 'events'; }
    get isAttribution() { return this.activeTab === 'attribution'; }
    get isLeadFlow() { return this.activeTab === 'leadflow'; }
    get isEditor() { return this.activeTab === 'editor'; }
    get isEditorCampaigns() { return this.editorSubTab === 'campaigns'; }
    get isEditorMembers() { return this.editorSubTab === 'members'; }

    get overviewTabClass() { return this.activeTab === 'overview' ? 'tab active' : 'tab'; }
    get eventsTabClass() { return this.activeTab === 'events' ? 'tab active' : 'tab'; }
    get attributionTabClass() { return this.activeTab === 'attribution' ? 'tab active' : 'tab'; }
    get leadFlowTabClass() { return this.activeTab === 'leadflow' ? 'tab active' : 'tab'; }
    get editorTabClass() { return this.activeTab === 'editor' ? 'tab active' : 'tab'; }
    get editorCampaignsSubClass() { return this.editorSubTab === 'campaigns' ? 'sub-tab active' : 'sub-tab'; }
    get editorMembersSubClass() { return this.editorSubTab === 'members' ? 'sub-tab active' : 'sub-tab'; }

    connectedCallback() {
        this.loadAllData();
    }

    async loadAllData() {
        this.loading = true;
        this.error = null;
        try {
            const [ov, ev, attr, lf, ins, edCamps, budgetSum] = await Promise.all([
                getCampaignOverview(),
                getEventPerformance(),
                getPipelineAttribution(),
                getLeadFlow(),
                getInsights(),
                getCampaignsForEditor(),
                getEventBudgetSummary()
            ]);
            this.overview = ov;
            this.eventData = ev;
            this.attribution = attr;
            this.leadFlow = lf;
            this.insights = ins || [];
            this.editorCampaigns = (edCamps || []).map(c => ({ ...c, url: '/' + c.id }));
            this.budgetSummary = budgetSum;
        } catch (e) {
            this.error = e.body ? e.body.message : e.message;
        }
        this.loading = false;
    }

    handleTabClick(event) {
        this.activeTab = event.currentTarget.dataset.tab;
    }

    handleRefresh() {
        this.loadAllData();
    }

    // ── Formatting helpers ──
    get fmtTotalSpend() { return this.overview ? this._fmtCurrency(this.overview.totalSpend) : '$0'; }
    get fmtTotalPipeline() { return this.overview ? this._fmtCurrency(this.overview.totalPipeline) : '$0'; }
    get fmtTotalWon() { return this.overview ? this._fmtCurrency(this.overview.totalWonRevenue) : '$0'; }
    get fmtAvgRoi() {
        if (!this.overview || this.overview.avgRoi == null) return 'N/A';
        if (this.overview.totalPipeline === 0 && this.overview.totalWonRevenue === 0) return 'No attribution';
        return this.overview.avgRoi.toFixed(1) + '%';
    }
    get fmtAvgCpl() { return this.overview && this.overview.avgCostPerLead != null ? this._fmtCurrency(this.overview.avgCostPerLead) : 'N/A'; }

    get fmtEventSpend() { return this.eventData ? this._fmtCurrency(this.eventData.totalSpend) : '$0'; }
    get fmtEventPipeline() { return this.eventData ? this._fmtCurrency(this.eventData.totalPipeline) : '$0'; }
    get fmtCostPerAttendee() { return this.eventData && this.eventData.costPerAttendee != null ? this._fmtCurrency(this.eventData.costPerAttendee) : 'N/A'; }
    get fmtPipelinePerEvent() { return this.eventData && this.eventData.pipelinePerEvent != null ? this._fmtCurrency(this.eventData.pipelinePerEvent) : 'N/A'; }

    get fmtAttrPipeline() { return this.attribution ? this._fmtCurrency(this.attribution.totalAttributedPipeline) : '$0'; }
    get fmtAttrWon() { return this.attribution ? this._fmtCurrency(this.attribution.totalAttributedWon) : '$0'; }
    get fmtCoverage() { return this.attribution ? this.attribution.coveragePercent + '%' : '0%'; }

    get fmtConvRate() { return this.leadFlow ? this.leadFlow.conversionRate + '%' : '0%'; }

    get formattedCampaigns() {
        if (!this.overview || !this.overview.campaigns) return [];
        return this.overview.campaigns.map(c => ({
            ...c,
            fmtSpend: this._fmtCurrency(c.spend),
            fmtPipeline: this._fmtCurrency(c.pipelineInfluenced),
            fmtWon: this._fmtCurrency(c.wonRevenue),
            fmtRoi: this._fmtRoi(c.roi, c.pipelineInfluenced, c.wonRevenue),
            url: '/' + c.id
        }));
    }

    get formattedByType() {
        if (!this.overview || !this.overview.byType) return [];
        return this.overview.byType.map(g => ({
            ...g,
            fmtSpend: this._fmtCurrency(g.spend),
            fmtPipeline: this._fmtCurrency(g.pipeline),
            fmtAvgRoi: this._fmtRoi(g.avgRoi, g.pipeline, g.wonRevenue),
            fmtCpl: g.costPerLead != null ? this._fmtCurrency(g.costPerLead) : '-'
        }));
    }

    get formattedByFunnel() {
        if (!this.overview || !this.overview.byFunnel) return [];
        return this.overview.byFunnel.map(g => ({
            ...g,
            fmtSpend: this._fmtCurrency(g.spend),
            fmtPipeline: this._fmtCurrency(g.pipeline),
            fmtAvgRoi: this._fmtRoi(g.avgRoi, g.pipeline, g.wonRevenue)
        }));
    }

    get formattedEvents() {
        if (!this.eventData || !this.eventData.events) return [];
        return this.eventData.events.map(e => ({
            ...e,
            fmtSpend: this._fmtCurrency(e.spend),
            fmtPipeline: this._fmtCurrency(e.pipelineInfluenced),
            fmtRoi: this._fmtRoi(e.roi, e.pipelineInfluenced, e.wonRevenue),
            url: '/' + e.id
        }));
    }

    get formattedByCity() {
        if (!this.eventData || !this.eventData.byCity) return [];
        return this.eventData.byCity.map(g => ({
            ...g,
            fmtSpend: this._fmtCurrency(g.spend),
            fmtPipeline: this._fmtCurrency(g.pipeline),
            fmtCpa: g.costPerAttendee != null ? this._fmtCurrency(g.costPerAttendee) : '-',
            fmtPpe: g.pipelinePerEvent != null ? this._fmtCurrency(g.pipelinePerEvent) : '-'
        }));
    }

    get formattedTopCampaigns() {
        if (!this.attribution || !this.attribution.topCampaigns) return [];
        return this.attribution.topCampaigns.map(r => ({
            ...r,
            fmtPipeline: this._fmtCurrency(r.pipelineValue),
            url: '/' + r.campaignId
        }));
    }

    get formattedRecentLeads() {
        if (!this.leadFlow || !this.leadFlow.recentLeads) return [];
        return this.leadFlow.recentLeads.map(l => ({
            ...l,
            url: '/' + l.id
        }));
    }

    get insightCards() {
        return (this.insights || []).map(i => ({
            ...i,
            cardClass: 'insight-card insight-' + i.severity
        }));
    }

    get hasInsights() { return this.insights && this.insights.length > 0; }

    _fmtCurrency(val) {
        if (val == null || val === '' || val === undefined) return '$0';
        const num = typeof val === 'number' ? val : parseFloat(val);
        if (isNaN(num) || num === 0) return '$0';
        if (num >= 1000000) return '$' + (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return '$' + (num / 1000).toFixed(0) + 'K';
        return '$' + num.toFixed(0);
    }

    _fmtRoi(roi, pipeline, wonRevenue) {
        if (roi == null || roi === undefined || roi === '') return '-';
        const num = typeof roi === 'number' ? roi : parseFloat(roi);
        if (isNaN(num)) return '-';
        if ((pipeline == null || pipeline === 0) && (wonRevenue == null || wonRevenue === 0)) {
            return 'No attribution';
        }
        if (num <= -100 && (wonRevenue == null || wonRevenue === 0)) {
            return 'No revenue yet';
        }
        return num.toFixed(1) + '%';
    }

    // ── Data Editor: Campaign columns ──
    get editorColumns() {
        return [
            { label: 'Campaign', fieldName: 'url', type: 'url', typeAttributes: { label: { fieldName: 'name' }, target: '_blank' }, sortable: true },
            { label: 'Status', fieldName: 'status' },
            { label: 'Type', fieldName: 'campaignType' },
            { label: 'Funnel', fieldName: 'funnelStage' },
            { label: 'City', fieldName: 'eventCity' },
            { label: 'Region', fieldName: 'eventRegion' },
            { label: 'Spend', fieldName: 'spend', type: 'currency', editable: true },
            { label: 'Attendees', fieldName: 'attendees', type: 'number', editable: true },
            { label: 'Leads', fieldName: 'leads', type: 'number' },
            { label: 'Pipeline', fieldName: 'pipelineInfluenced', type: 'currency' },
            { type: 'action', typeAttributes: { rowActions: [
                { label: 'Edit Details', name: 'edit_row' },
                { label: 'View in Salesforce', name: 'view_record' }
            ]}}
        ];
    }

    // Picklist options for edit modal
    get statusOptions() { return [{label:'Planned',value:'Planned'},{label:'In Progress',value:'In Progress'},{label:'Completed',value:'Completed'},{label:'Aborted',value:'Aborted'}]; }
    get typeOptions() { return [{label:'Field Marketing',value:'Field Marketing'},{label:'Corporate Events',value:'Corporate Events'},{label:'Customer Marketing',value:'Customer Marketing'},{label:'Internal Events',value:'Internal Events'},{label:'Digital / Paid',value:'Digital / Paid'},{label:'Content Marketing',value:'Content Marketing'},{label:'Outbound',value:'Outbound'},{label:'Partner Marketing',value:'Partner Marketing'}]; }
    get funnelOptions() { return [{label:'Awareness',value:'Awareness'},{label:'Consideration',value:'Consideration'},{label:'Decision',value:'Decision'},{label:'Retention',value:'Retention'}]; }
    get cityOptions() { return [{label:'Dublin',value:'Dublin'},{label:'London',value:'London'},{label:'New York',value:'New York'},{label:'San Francisco',value:'San Francisco'},{label:'Boston',value:'Boston'},{label:'Chicago',value:'Chicago'},{label:'Miami',value:'Miami'},{label:'Minneapolis',value:'Minneapolis'},{label:'Los Angeles',value:'Los Angeles'},{label:'Virtual',value:'Virtual'},{label:'Other',value:'Other'}]; }
    get regionOptions() { return [{label:'US - East',value:'US - East'},{label:'US - West',value:'US - West'},{label:'US - Central',value:'US - Central'},{label:'EMEA - UK/Ireland',value:'EMEA - UK/Ireland'},{label:'EMEA - Continental',value:'EMEA - Continental'},{label:'APAC',value:'APAC'},{label:'Global / Virtual',value:'Global / Virtual'}]; }
    get contentOptions() { return [{label:'Webinar',value:'Webinar'},{label:'Whitepaper',value:'Whitepaper'},{label:'Case Study',value:'Case Study'},{label:'Blog Post',value:'Blog Post'},{label:'Video',value:'Video'},{label:'Email Sequence',value:'Email Sequence'},{label:'Social Campaign',value:'Social Campaign'},{label:'Event / Dinner',value:'Event / Dinner'},{label:'Conference Booth',value:'Conference Booth'},{label:'Roundtable',value:'Roundtable'},{label:'ABM Package',value:'ABM Package'}]; }
    get seniorityOptions() { return [{label:'Executive',value:'Executive'},{label:'VP',value:'VP'},{label:'Director',value:'Director'},{label:'Manager',value:'Manager'},{label:'Individual Contributor',value:'Individual Contributor'},{label:'Non-Executive',value:'Non-Executive'}]; }
    get eventTypeOptions() { return [{label:'Corporate Event',value:'Corporate Event'},{label:'Field Event',value:'Field Event'},{label:'Third-Party Event',value:'Third-Party Event'}]; }
    get fiscalYearOptions() { return [{label:'FY2024',value:'FY2024'},{label:'FY2025',value:'FY2025'},{label:'FY2026',value:'FY2026'},{label:'FY2027',value:'FY2027'}]; }
    get memberStatusOptions() { return [{label:'Invited',value:'Invited'},{label:'Registered',value:'Registered'},{label:'Confirmed',value:'Confirmed'},{label:'Attended',value:'Attended'},{label:'No Show',value:'No Show'},{label:'Declined',value:'Declined'},{label:'Sent',value:'Sent'},{label:'Responded',value:'Responded'}]; }

    // Edit modal state
    @track editModalOpen = false;
    @track editRow = {};

    handleRowAction(event) {
        const action = event.detail.action.name;
        const row = event.detail.row;
        if (action === 'edit_row') {
            this.editRow = { ...row };
            this.editModalOpen = true;
        } else if (action === 'view_record') {
            window.open('/' + row.id, '_blank');
        }
    }

    handleEditField(event) {
        const field = event.target.dataset.field;
        this.editRow = { ...this.editRow, [field]: event.detail.value };
    }

    handleEditSpend(event) {
        this.editRow = { ...this.editRow, spend: parseFloat(event.target.value) || 0 };
    }

    handleEditAttendees(event) {
        this.editRow = { ...this.editRow, attendees: parseInt(event.target.value) || 0 };
    }

    handleEditSave() {
        const mapped = { id: this.editRow.id };
        mapped.Status = this.editRow.status;
        mapped.Type__c = this.editRow.campaignType;
        mapped.Event_Type__c = this.editRow.eventType;
        mapped.Fiscal_Year__c = this.editRow.fiscalYear;
        mapped.Projected_Spend__c = this.editRow.projectedSpend;
        mapped.Funnel_Stage__c = this.editRow.funnelStage;
        mapped.Event_City__c = this.editRow.eventCity;
        mapped.Event_Region__c = this.editRow.eventRegion;
        mapped.Content_Type__c = this.editRow.contentType;
        mapped.Seniority_Level__c = this.editRow.seniorityLevel;
        mapped.ActualCost = this.editRow.spend;
        mapped.Number_of_Attendees__c = this.editRow.attendees;

        this.editorSaving = true;
        this.editModalOpen = false;
        saveCampaigns({ campaignsJson: JSON.stringify([mapped]) })
            .then(() => {
                this.dispatchEvent(new ShowToastEvent({ title: 'Saved', message: 'Campaign updated', variant: 'success' }));
                return this.loadAllData();
            })
            .catch(error => {
                this.dispatchEvent(new ShowToastEvent({ title: 'Error', message: error.body ? error.body.message : error.message, variant: 'error' }));
            })
            .finally(() => { this.editorSaving = false; });
    }

    handleEditCancel() {
        this.editModalOpen = false;
        this.editRow = {};
    }

    get memberColumns() {
        return [
            { label: 'Name', fieldName: 'name' },
            { label: 'Company', fieldName: 'company' },
            { label: 'Title', fieldName: 'title' },
            { label: 'Type', fieldName: 'memberType' },
            { label: 'Status', fieldName: 'memberStatus', editable: true },
        ];
    }

    get campaignOptions() {
        return (this.editorCampaigns || []).map(c => ({ label: c.name, value: c.id }));
    }

    handleEditorSubTab(event) {
        this.editorSubTab = event.currentTarget.dataset.subtab;
    }

    handleEditorSave(event) {
        const draftValues = event.detail.draftValues;
        const updates = draftValues.map(draft => {
            const mapped = { id: draft.id };
            if (draft.spend !== undefined) mapped.ActualCost = draft.spend;
            if (draft.attendees !== undefined) mapped.Number_of_Attendees__c = draft.attendees;
            return mapped;
        });

        this.editorSaving = true;
        saveCampaigns({ campaignsJson: JSON.stringify(updates) })
            .then(() => {
                this.dispatchEvent(new ShowToastEvent({ title: 'Saved', message: updates.length + ' campaign(s) updated', variant: 'success' }));
                this.editorDraftValues = [];
                return this.loadAllData();
            })
            .catch(error => {
                this.dispatchEvent(new ShowToastEvent({ title: 'Error saving', message: error.body ? error.body.message : error.message, variant: 'error' }));
            })
            .finally(() => { this.editorSaving = false; });
    }

    handleCampaignSelect(event) {
        this.selectedEditorCampaign = event.detail.value;
        this.loadMembers();
    }

    async loadMembers() {
        if (!this.selectedEditorCampaign) return;
        this.membersLoading = true;
        try {
            this.campaignMembers = await getCampaignMembers({ campaignId: this.selectedEditorCampaign });
        } catch (e) {
            this.campaignMembers = [];
        }
        this.membersLoading = false;
    }

    handleMemberSearch(event) {
        this.memberSearchTerm = event.target.value;
        if (this.memberSearchTerm.length >= 2) {
            searchContactsAndLeads({ searchTerm: this.memberSearchTerm })
                .then(results => { this.memberSearchResults = results || []; })
                .catch(() => { this.memberSearchResults = []; });
        } else {
            this.memberSearchResults = [];
        }
    }

    handleAddMember(event) {
        const recordId = event.currentTarget.dataset.id;
        if (!this.selectedEditorCampaign || !recordId) return;
        addCampaignMember({ campaignId: this.selectedEditorCampaign, contactOrLeadId: recordId, status: 'Sent' })
            .then(() => {
                this.dispatchEvent(new ShowToastEvent({ title: 'Added', message: 'Member added to campaign', variant: 'success' }));
                this.memberSearchTerm = '';
                this.memberSearchResults = [];
                return this.loadMembers();
            })
            .catch(error => {
                this.dispatchEvent(new ShowToastEvent({ title: 'Error', message: error.body ? error.body.message : error.message, variant: 'error' }));
            });
    }
}
