import { LightningElement, api, track } from 'lwc';
import searchAccounts from '@salesforce/apex/AccountLookupController.searchAccounts';
import getAccountById from '@salesforce/apex/AccountLookupController.getAccountById';

export default class AccountLookup extends LightningElement {
    @api label = 'Account';
    @api placeholder = 'Search accounts...';
    @api required = false;
    
    // Flow output properties
    @api selectedAccountId = '';
    @api selectedAccountName = '';
    
    @track searchTerm = '';
    @track searchResults = [];
    @track isLoading = false;
    @track showDropdown = false;
    @track selectedAccount = null;
    @track errorMessage = '';
    
    searchTimeout;
    
    connectedCallback() {
        // If there's a pre-selected account ID, fetch its details
        if (this.selectedAccountId) {
            this.loadSelectedAccount();
        }
    }
    
    async loadSelectedAccount() {
        try {
            const result = await getAccountById({ accountId: this.selectedAccountId });
            if (result) {
                this.selectedAccount = result;
                this.selectedAccountName = result.name;
            }
        } catch (error) {
            console.error('Error loading account:', error);
        }
    }
    
    handleSearchChange(event) {
        this.searchTerm = event.target.value;
        this.errorMessage = '';
        
        // Clear previous timeout
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }
        
        // Debounce search - wait 300ms after user stops typing
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
        
        this.isLoading = true;
        this.showDropdown = true;
        
        try {
            const results = await searchAccounts({ searchTerm: this.searchTerm });
            this.searchResults = results;
            
            if (results.length === 0) {
                this.errorMessage = 'No accounts found matching "' + this.searchTerm + '"';
            }
        } catch (error) {
            console.error('Search error:', error);
            this.errorMessage = 'Error searching accounts. Please try again.';
            this.searchResults = [];
        } finally {
            this.isLoading = false;
        }
    }
    
    handleSelectAccount(event) {
        const accountId = event.currentTarget.dataset.id;
        const account = this.searchResults.find(acc => acc.id === accountId);
        
        if (account) {
            this.selectedAccount = account;
            this.selectedAccountId = account.id;
            this.selectedAccountName = account.name;
            this.searchTerm = '';
            this.searchResults = [];
            this.showDropdown = false;
            this.errorMessage = '';
            
            // Dispatch change event for Flow
            this.dispatchEvent(new FlowAttributeChangeEvent('selectedAccountId', account.id));
            this.dispatchEvent(new FlowAttributeChangeEvent('selectedAccountName', account.name));
        }
    }
    
    handleClearSelection() {
        this.selectedAccount = null;
        this.selectedAccountId = '';
        this.selectedAccountName = '';
        this.searchTerm = '';
        this.errorMessage = '';
        
        // Dispatch change event for Flow
        this.dispatchEvent(new FlowAttributeChangeEvent('selectedAccountId', ''));
        this.dispatchEvent(new FlowAttributeChangeEvent('selectedAccountName', ''));
        
        // Focus the search input
        this.template.querySelector('input')?.focus();
    }
    
    handleInputFocus() {
        if (this.searchResults.length > 0) {
            this.showDropdown = true;
        }
    }
    
    handleInputBlur() {
        // Delay hiding dropdown to allow click events to fire
        setTimeout(() => {
            this.showDropdown = false;
        }, 200);
    }
    
    get hasSelection() {
        return this.selectedAccount !== null;
    }
    
    get hasResults() {
        return this.searchResults.length > 0;
    }
    
    get showNoResults() {
        return !this.isLoading && this.searchTerm.length >= 2 && this.searchResults.length === 0;
    }
    
    get inputClass() {
        return this.errorMessage ? 'slds-input has-error' : 'slds-input';
    }
}

// Flow attribute change event
class FlowAttributeChangeEvent extends CustomEvent {
    constructor(attributeName, attributeValue) {
        super('flowattributechange', {
            detail: {
                attributeName,
                attributeValue
            },
            bubbles: true,
            composed: true
        });
    }
}
