import { LightningElement, api, wire } from 'lwc';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';
import { NavigationMixin } from 'lightning/navigation';

// Import Account fields
import NAME_FIELD from '@salesforce/schema/Account.Name';
import LOGO_URL_FIELD from '@salesforce/schema/Account.Logo_URL__c';
import PHONE_FIELD from '@salesforce/schema/Account.Phone';
import WEBSITE_FIELD from '@salesforce/schema/Account.Website';
import BILLING_STREET from '@salesforce/schema/Account.BillingStreet';
import BILLING_CITY from '@salesforce/schema/Account.BillingCity';
import BILLING_STATE from '@salesforce/schema/Account.BillingState';
import BILLING_POSTAL from '@salesforce/schema/Account.BillingPostalCode';
import BILLING_COUNTRY from '@salesforce/schema/Account.BillingCountry';
import OWNER_NAME from '@salesforce/schema/Account.Owner.Name';

const FIELDS = [
    NAME_FIELD, 
    LOGO_URL_FIELD, 
    PHONE_FIELD, 
    WEBSITE_FIELD,
    BILLING_STREET,
    BILLING_CITY,
    BILLING_STATE,
    BILLING_POSTAL,
    BILLING_COUNTRY,
    OWNER_NAME
];

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

    get phone() {
        return this.accountData ? getFieldValue(this.accountData, PHONE_FIELD) : '';
    }

    get phoneLink() {
        return this.phone ? `tel:${this.phone}` : '';
    }

    get website() {
        return this.accountData ? getFieldValue(this.accountData, WEBSITE_FIELD) : '';
    }

    get websiteLink() {
        if (!this.website) return '';
        return this.website.startsWith('http') ? this.website : `https://${this.website}`;
    }

    get billingAddress() {
        if (!this.accountData) return '';
        const street = getFieldValue(this.accountData, BILLING_STREET) || '';
        const city = getFieldValue(this.accountData, BILLING_CITY) || '';
        const state = getFieldValue(this.accountData, BILLING_STATE) || '';
        const postal = getFieldValue(this.accountData, BILLING_POSTAL) || '';
        const country = getFieldValue(this.accountData, BILLING_COUNTRY) || '';
        
        const parts = [];
        if (street) parts.push(street);
        if (city || state || postal) {
            parts.push([city, state, postal].filter(p => p).join(' '));
        }
        if (country) parts.push(country);
        return parts.join('\n');
    }

    get ownerName() {
        return this.accountData ? getFieldValue(this.accountData, OWNER_NAME) : '';
    }

    get isLoading() {
        return !this.accountData && !this.error;
    }

    handleImageError() {
        this.imageError = true;
    }

    handleFollow() {
        // Follow functionality - would need additional implementation
        console.log('Follow clicked');
    }

    handleNewOpportunity() {
        this[NavigationMixin.Navigate]({
            type: 'standard__objectPage',
            attributes: {
                objectApiName: 'Opportunity',
                actionName: 'new'
            },
            state: {
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

