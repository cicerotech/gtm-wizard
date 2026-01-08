import { LightningElement, api, wire } from 'lwc';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';

// Import Account fields
import LOGO_URL_FIELD from '@salesforce/schema/Account.Logo_URL__c';
import NAME_FIELD from '@salesforce/schema/Account.Name';

const FIELDS = [LOGO_URL_FIELD, NAME_FIELD];

export default class CompanyLogoDisplay extends LightningElement {
    @api recordId;
    
    logoUrl;
    accountName;
    imageError = false;

    @wire(getRecord, { recordId: '$recordId', fields: FIELDS })
    wiredAccount({ error, data }) {
        if (data) {
            this.logoUrl = getFieldValue(data, LOGO_URL_FIELD);
            this.accountName = getFieldValue(data, NAME_FIELD);
            this.imageError = false;
        } else if (error) {
            console.error('Error loading account:', error);
            this.logoUrl = null;
            this.accountName = '';
        }
    }

    get hasLogo() {
        return this.logoUrl && !this.imageError;
    }

    handleImageError() {
        // If image fails to load, show default icon
        this.imageError = true;
    }
}

