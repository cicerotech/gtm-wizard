import { LightningElement, api, wire } from 'lwc';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

import NAME_FIELD from '@salesforce/schema/Account.Name';
import LOGO_URL_FIELD from '@salesforce/schema/Account.Logo_URL__c';

import submitInfoRequest from '@salesforce/apex/AccountInfoRequestController.submitInfoRequest';

const FIELDS = [NAME_FIELD, LOGO_URL_FIELD];

const REQUEST_TYPE_OPTIONS = [
    { label: 'Contacts', value: 'Contacts' },
    { label: 'Account Intelligence', value: 'Account Intelligence' }
];

export default class AccountHighlightsPanel extends NavigationMixin(LightningElement) {
    @api recordId;
    
    accountData;
    error;
    imageError = false;

    showInfoRequestModal = false;
    infoRequestTypes = [];
    infoRequestDetail = '';
    isSubmitting = false;

    get requestTypeOptions() {
        return REQUEST_TYPE_OPTIONS;
    }

    get submitDisabled() {
        return this.infoRequestTypes.length === 0 || this.isSubmitting;
    }

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
        this[NavigationMixin.Navigate]({
            type: 'standard__navItemPage',
            attributes: {
                apiName: 'New_Opportunity'
            },
            state: {
                c__accountId: this.recordId,
                c__accountName: this.accountName
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

    handleInfoRequest() {
        this.infoRequestTypes = [];
        this.infoRequestDetail = '';
        this.isSubmitting = false;
        this.showInfoRequestModal = true;
    }

    handleInfoRequestCancel() {
        this.showInfoRequestModal = false;
    }

    handleRequestTypeChange(event) {
        this.infoRequestTypes = event.detail.value;
    }

    handleRequestDetailChange(event) {
        this.infoRequestDetail = event.detail.value;
    }

    async handleInfoRequestSubmit() {
        if (this.infoRequestTypes.length === 0) return;
        this.isSubmitting = true;

        try {
            const result = await submitInfoRequest({
                accountId: this.recordId,
                requestTypes: this.infoRequestTypes,
                additionalDetail: this.infoRequestDetail || ''
            });

            if (result && result.success) {
                this.dispatchEvent(new ShowToastEvent({
                    title: 'Request Submitted',
                    message: result.message || 'Your information request has been sent.',
                    variant: 'success'
                }));
            } else {
                this.dispatchEvent(new ShowToastEvent({
                    title: 'Submission Failed',
                    message: result?.message || 'Could not submit request.',
                    variant: 'error'
                }));
            }
        } catch (error) {
            this.dispatchEvent(new ShowToastEvent({
                title: 'Error',
                message: error.body?.message || 'An unexpected error occurred.',
                variant: 'error'
            }));
        } finally {
            this.isSubmitting = false;
            this.showInfoRequestModal = false;
        }
    }
}
