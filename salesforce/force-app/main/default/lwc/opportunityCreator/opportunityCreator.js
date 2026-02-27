import { LightningElement, track, wire } from 'lwc';
import { NavigationMixin, CurrentPageReference } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import searchAccounts from '@salesforce/apex/AccountLookupController.searchAccounts';
import getAccountById from '@salesforce/apex/AccountLookupController.getAccountById';
import createOpportunity from '@salesforce/apex/AccountLookupController.createOpportunity';
import getDefaultPod from '@salesforce/apex/AccountLookupController.getDefaultPod';

export default class OpportunityCreator extends NavigationMixin(LightningElement) {
    // Account lookup state
    @track searchTerm = '';
    @track searchResults = [];
    @track isSearching = false;
    @track showDropdown = false;
    @track selectedAccount = null;
    
    // Form fields
    @track stage = 'Stage 0 - Prospecting';
    @track targetSignDate = '';
    @track acv = 100000;
    @track selectedProductLines = ['Undetermined'];
    @track opportunitySource = 'Inbound';
    @track pod = 'US';
    
    // UI state
    @track isCreating = false;
    @track errorMessage = '';
    
    searchTimeout;
    _pageRefApplied = false;

    // Read URL parameters (e.g. from Account page "New Opportunity" button)
    @wire(CurrentPageReference)
    handlePageRef(pageRef) {
        if (pageRef && pageRef.state && !this._pageRefApplied) {
            const accountId = pageRef.state.c__accountId;
            const accountName = pageRef.state.c__accountName;
            if (accountId) {
                this._pageRefApplied = true;
                // Pre-populate from URL params, then enrich via Apex
                if (accountName) {
                    this.selectedAccount = { id: accountId, name: accountName, subtitle: '' };
                }
                this.loadAccountDetails(accountId);
            }
        }
    }

    // Fetch full account details from Apex for subtitle
    async loadAccountDetails(accountId) {
        try {
            const result = await getAccountById({ accountId: accountId });
            if (result) {
                this.selectedAccount = result;
            }
        } catch (err) {
            console.error('Error loading account:', err);
            // Keep the basic info we already have from URL params
        }
    }
    
    // Stage options
    get stageOptions() {
        return [
            { label: 'Stage 0 - Prospecting', value: 'Stage 0 - Prospecting' },
            { label: 'Stage 1 - Discovery', value: 'Stage 1 - Discovery' },
            { label: 'Stage 2 - SQO', value: 'Stage 2 - SQO' },
            { label: 'Stage 3 - Pilot', value: 'Stage 3 - Pilot' },
            { label: 'Stage 4 - Proposal', value: 'Stage 4 - Proposal' }
        ];
    }
    
    // Product Line options (mirrors Product_Lines_Multi__c values in org)
    get productLineOptions() {
        return [
            { label: 'Undetermined', value: 'Undetermined' },
            { label: 'AI Contracting - Technology', value: 'AI Contracting - Technology' },
            { label: 'AI Contracting - Managed Services', value: 'AI Contracting - Managed Services' },
            { label: 'AI Compliance - Technology', value: 'AI Compliance - Technology' },
            { label: 'AI M&A - Managed Services', value: 'AI M&A - Managed Services' },
            { label: 'AI Platform - Sigma', value: 'AI Platform - Sigma' },
            { label: 'AI Platform - Insights', value: 'AI Platform - Insights' },
            { label: 'AI Platform - Litigation', value: 'AI Platform - Litigation' },
            { label: 'AI Platform - Government', value: 'AI Platform - Government' },
            { label: 'FDE - Custom AI Solution', value: 'FDE - Custom AI Solution' },
            { label: 'Contracting - Secondee', value: 'Contracting - Secondee' },
            { label: 'Other - Managed Service', value: 'Other - Managed Service' },
            { label: 'Other - Secondee', value: 'Other - Secondee' }
        ];
    }
    
    // Opportunity Source options (active values from org)
    get opportunitySourceOptions() {
        return [
            { label: 'Inbound', value: 'Inbound' },
            { label: 'Outbound', value: 'Outbound' },
            { label: 'Events', value: 'Events' },
            { label: 'Referral', value: 'Referral' },
            { label: 'Existing Customer', value: 'Existing Customer' }
        ];
    }
    
    get hasSelectedAccount() {
        return this.selectedAccount !== null;
    }
    
    get isFormValid() {
        return this.selectedAccount && this.stage && this.selectedProductLines.length > 0;
    }

    get hasSelectedProductLines() {
        return this.selectedProductLines.length > 0;
    }

    get selectedProductLinesSummary() {
        const count = this.selectedProductLines.length;
        if (count === 1) {
            return this.selectedProductLines[0];
        }
        return count + ' product lines selected';
    }
    
    get showError() {
        return this.errorMessage !== '';
    }

    get createButtonLabel() {
        return this.isCreating ? 'Creating...' : 'Create Opportunity';
    }
    
    get podOptions() {
        return [
            { label: 'US', value: 'US' },
            { label: 'EU', value: 'EU' }
        ];
    }

    handlePodChange(event) {
        this.pod = event.detail.value;
    }

    connectedCallback() {
        this.setDateFromDays(100);
        this._loadDefaultPod();
    }

    async _loadDefaultPod() {
        try {
            const defaultPod = await getDefaultPod();
            if (defaultPod) {
                this.pod = defaultPod;
            }
        } catch (err) {
            // Default to US if lookup fails
        }
    }

    // Helper: set target sign date N days from now
    setDateFromDays(days) {
        const d = new Date();
        d.setDate(d.getDate() + days);
        this.targetSignDate = d.toISOString().split('T')[0];
    }
    
    // Account search handlers
    handleSearchChange(event) {
        this.searchTerm = event.target.value;
        this.errorMessage = '';
        
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }
        
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this.searchTimeout = setTimeout(() => {
            this.performSearch();
        }, 300);
    }
    
    async performSearch() {
        if (this.searchTerm.length < 2) {
            this.searchResults = [];
            this.showDropdown = false;
            return;
        }
        
        this.isSearching = true;
        this.showDropdown = true;
        
        try {
            const results = await searchAccounts({ searchTerm: this.searchTerm });
            this.searchResults = results;
        } catch (error) {
            console.error('Search error:', error);
            this.searchResults = [];
        } finally {
            this.isSearching = false;
        }
    }
    
    handleSelectAccount(event) {
        const accountId = event.currentTarget.dataset.id;
        const account = this.searchResults.find(acc => acc.id === accountId);
        
        if (account) {
            this.selectedAccount = account;
            this.searchTerm = '';
            this.searchResults = [];
            this.showDropdown = false;
        }
    }
    
    handleClearAccount() {
        this.selectedAccount = null;
        this.searchTerm = '';
        this._pageRefApplied = false;
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        setTimeout(() => {
            const input = this.template.querySelector('.account-search-input');
            if (input) input.focus();
        }, 100);
    }
    
    handleSearchFocus() {
        if (this.searchResults.length > 0) {
            this.showDropdown = true;
        }
    }
    
    handleSearchBlur() {
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        setTimeout(() => {
            this.showDropdown = false;
        }, 200);
    }
    
    // Form field handlers
    handleStageChange(event) {
        this.stage = event.detail.value;
    }
    
    handleDateChange(event) {
        this.targetSignDate = event.target.value;
    }

    // Date assist buttons
    handleDateAssist(event) {
        const days = parseInt(event.currentTarget.dataset.days, 10);
        this.setDateFromDays(days);
    }
    
    handleAcvChange(event) {
        this.acv = parseFloat(event.target.value) || 0;
    }

    // ACV assist buttons
    handleAcvAssist(event) {
        const amount = parseInt(event.currentTarget.dataset.amount, 10);
        this.acv = amount;
    }
    
    handleProductLinesChange(event) {
        this.selectedProductLines = event.detail.value;
    }

    handleSourceChange(event) {
        this.opportunitySource = event.detail.value;
    }
    
    // Create opportunity -- navigates straight to record on success
    async handleCreate() {
        if (!this.isFormValid) {
            this.errorMessage = 'Please fill in all required fields.';
            return;
        }
        
        this.isCreating = true;
        this.errorMessage = '';
        
        try {
            const oppId = await createOpportunity({
                accountId: this.selectedAccount.id,
                accountName: this.selectedAccount.name,
                stage: this.stage,
                targetSignDate: this.targetSignDate,
                acv: this.acv,
                productLines: this.selectedProductLines.join(';'),
                opportunitySource: this.opportunitySource,
                pod: this.pod
            });
            
            // Show quick toast and navigate immediately
            this.dispatchEvent(new ShowToastEvent({
                title: 'Success',
                message: 'Opportunity created successfully',
                variant: 'success'
            }));

            // Navigate to the new Opp record using Lightning SPA navigation
            // replace: true prevents Back button from returning to the creator form
            this[NavigationMixin.Navigate]({
                type: 'standard__recordPage',
                attributes: {
                    recordId: oppId,
                    objectApiName: 'Opportunity',
                    actionName: 'view'
                }
            }, true);
            
        } catch (error) {
            console.error('Create error:', error);
            this.errorMessage = error.body?.message || 'Error creating opportunity. Please try again.';
            this.isCreating = false;
        }
    }
    
    // Cancel -- navigate back to Opportunities list via SPA
    handleCancel() {
        this[NavigationMixin.Navigate]({
            type: 'standard__objectPage',
            attributes: {
                objectApiName: 'Opportunity',
                actionName: 'list'
            },
            state: {
                filterName: 'Recent'
            }
        }, true);
    }
}
