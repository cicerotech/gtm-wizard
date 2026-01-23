import { LightningElement, api, wire, track } from 'lwc';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';

// Import Account fields
import LOGO_URL_FIELD from '@salesforce/schema/Account.Logo_URL__c';
import NAME_FIELD from '@salesforce/schema/Account.Name';

const FIELDS = [LOGO_URL_FIELD, NAME_FIELD];

export default class CompanyLogoDisplay extends LightningElement {
    @api recordId;
    
    @track logoUrl = null;
    @track accountName = '';
    @track imageError = false;
    @track isLoading = true;

    @wire(getRecord, { recordId: '$recordId', fields: FIELDS })
    wiredAccount({ error, data }) {
        this.isLoading = false;
        if (data) {
            this.logoUrl = getFieldValue(data, LOGO_URL_FIELD);
            this.accountName = getFieldValue(data, NAME_FIELD);
            this.imageError = false;
            console.log('Company Logo Display - Logo URL:', this.logoUrl);
            console.log('Company Logo Display - Account:', this.accountName);
        } else if (error) {
            console.error('Company Logo Display - Error loading account:', error);
            this.logoUrl = null;
            this.accountName = '';
        }
    }

    get hasLogo() {
        const result = this.logoUrl && this.logoUrl.length > 0 && !this.imageError;
        console.log('Company Logo Display - hasLogo:', result, 'URL:', this.logoUrl, 'Error:', this.imageError);
        return result;
    }

    get logoImageUrl() {
        // Return the URL directly - CloudFront URLs don't need file extensions
        return this.logoUrl;
    }

    handleImageError(event) {
        // If image fails to load, show default icon
        console.error('Company Logo Display - Image failed to load:', this.logoUrl);
        this.imageError = true;
    }

    handleImageLoad() {
        console.log('Company Logo Display - Image loaded successfully');
    }
}
