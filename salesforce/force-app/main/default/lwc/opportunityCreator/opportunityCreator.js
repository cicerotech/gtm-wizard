import { LightningElement, track } from 'lwc';
import searchAccounts from '@salesforce/apex/AccountLookupController.searchAccounts';
import createOpportunity from '@salesforce/apex/AccountLookupController.createOpportunity';

export default class OpportunityCreator extends LightningElement {
    // Account lookup state
    @track searchTerm = '';
    @track searchResults = [];
    @track isSearching = false;
    @track showDropdown = false;
    @track selectedAccount = null;
    
    // Form fields
    @track stage = 'Stage 1 - Discovery';
    @track targetSignDate = '';
    @track acv = 100000;
    @track productLine = '';
    
    // UI state
    @track isCreating = false;
    @track errorMessage = '';
    @track successMessage = '';
    @track createdOppId = '';
    
    searchTimeout;
    
    // Stage options
    get stageOptions() {
        return [
            { label: 'Stage 0 - Qualifying', value: 'Stage 0 - Qualifying' },
            { label: 'Stage 1 - Discovery', value: 'Stage 1 - Discovery' },
            { label: 'Stage 2 - SQO', value: 'Stage 2 - SQO' },
            { label: 'Stage 3 - Pilot', value: 'Stage 3 - Pilot' },
            { label: 'Stage 4 - Proposal', value: 'Stage 4 - Proposal' }
        ];
    }
    
    // Product Line options
    get productLineOptions() {
        return [
            { label: '-- Select Product Line --', value: '' },
            { label: 'Undetermined', value: 'Undetermined' },
            { label: 'CLM', value: 'CLM' },
            { label: 'Drafting', value: 'Drafting' },
            { label: 'Repository', value: 'Repository' },
            { label: 'CLM + Drafting', value: 'CLM + Drafting' },
            { label: 'CLM + Repository', value: 'CLM + Repository' },
            { label: 'Drafting + Repository', value: 'Drafting + Repository' },
            { label: 'Full Suite', value: 'Full Suite' }
        ];
    }
    
    get hasSelectedAccount() {
        return this.selectedAccount !== null;
    }
    
    get isFormValid() {
        return this.selectedAccount && this.stage && this.productLine;
    }
    
    get showSuccess() {
        return this.successMessage !== '';
    }
    
    get showError() {
        return this.errorMessage !== '';
    }
    
    connectedCallback() {
        // Set default target sign date to 90 days from now
        const defaultDate = new Date();
        defaultDate.setDate(defaultDate.getDate() + 90);
        this.targetSignDate = defaultDate.toISOString().split('T')[0];
    }
    
    // Account search handlers
    handleSearchChange(event) {
        this.searchTerm = event.target.value;
        this.errorMessage = '';
        
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }
        
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
        this.template.querySelector('.account-search-input')?.focus();
    }
    
    handleSearchFocus() {
        if (this.searchResults.length > 0) {
            this.showDropdown = true;
        }
    }
    
    handleSearchBlur() {
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
    
    handleAcvChange(event) {
        this.acv = parseFloat(event.target.value) || 0;
    }
    
    handleProductLineChange(event) {
        this.productLine = event.detail.value;
    }
    
    // Create opportunity
    async handleCreate() {
        if (!this.isFormValid) {
            this.errorMessage = 'Please fill in all required fields.';
            return;
        }
        
        this.isCreating = true;
        this.errorMessage = '';
        this.successMessage = '';
        
        try {
            const result = await createOpportunity({
                accountId: this.selectedAccount.id,
                accountName: this.selectedAccount.name,
                stage: this.stage,
                targetSignDate: this.targetSignDate,
                acv: this.acv,
                productLine: this.productLine
            });
            
            this.createdOppId = result;
            this.successMessage = 'Opportunity created successfully!';
            
            // Dispatch event for parent to handle (redirect)
            this.dispatchEvent(new CustomEvent('opportunitycreated', {
                detail: { opportunityId: result }
            }));
            
        } catch (error) {
            console.error('Create error:', error);
            this.errorMessage = error.body?.message || 'Error creating opportunity. Please try again.';
        } finally {
            this.isCreating = false;
        }
    }
    
    handleCancel() {
        this.dispatchEvent(new CustomEvent('cancel'));
    }
    
    handleViewOpportunity() {
        window.location.href = `/lightning/r/Opportunity/${this.createdOppId}/view`;
    }
    
    handleCreateAnother() {
        this.selectedAccount = null;
        this.stage = 'Stage 1 - Discovery';
        this.acv = 100000;
        this.productLine = '';
        this.successMessage = '';
        this.createdOppId = '';
        
        const defaultDate = new Date();
        defaultDate.setDate(defaultDate.getDate() + 90);
        this.targetSignDate = defaultDate.toISOString().split('T')[0];
    }
}
