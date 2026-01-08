import { LightningElement, api, wire } from 'lwc';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';
import { NavigationMixin } from 'lightning/navigation';

// Import Account fields
import NAME_FIELD from '@salesforce/schema/Account.Name';
import LOGO_URL_FIELD from '@salesforce/schema/Account.Logo_URL__c';

const FIELDS = [NAME_FIELD, LOGO_URL_FIELD];

export default class AccountHighlightsPanel extends NavigationMixin(LightningElement) {
    @api recordId;
    
    accountData;
    error;
    imageError = false;

    @wire(getRecord, { recordId: '$recordId', fields: FIELDS })
    wiredAccount({ error, data }) {
        if (data) {
            this.accountData = data;
            this.error = undefined;
            this.imageError = false;
        } else if (error) {
            this.error = error;
            this.accountData = undefined;
        }
    }

    get accountName() {
        return this.accountData ? getFieldValue(this.accountData, NAME_FIELD) : '';
    }

    get logoUrl() {
        return this.accountData ? getFieldValue(this.accountData, LOGO_URL_FIELD) : null;
    }

    get hasLogo() {
        return this.logoUrl && this.logoUrl.length > 0 && !this.imageError;
    }

    get isLoading() {
        return !this.accountData && !this.error;
    }

    handleImageError() {
        this.imageError = true;
    }

    handleNewOpportunity() {
        // Invoke the New Opportunity quick action (which triggers the Flow)
        this[NavigationMixin.Navigate]({
            type: 'standard__quickAction',
            attributes: {
                apiName: 'NewOpportunity'
            },
            state: {
                recordId: this.recordId,
                defaultFieldValues: `AccountId=${this.recordId}`
            }
        });
    }

    handleEdit() {
        this[NavigationMixin.Navigate]({
            type: 'standard__recordPage',
            attributes: {
                recordId: this.recordId,
                objectApiName: 'Account',
                actionName: 'edit'
            }
        });
    }
}
