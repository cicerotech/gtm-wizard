import { LightningElement, api, wire, track } from 'lwc';
import { getRecord, getFieldValue, updateRecord } from 'lightning/uiRecordApi';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import ID_FIELD from '@salesforce/schema/Opportunity.Id';
import CSM_REQUESTED from '@salesforce/schema/Opportunity.CSM_Requested__c';
import CS_KEY_STAKEHOLDERS from '@salesforce/schema/Opportunity.CS_Key_Stakeholders__c';
import CS_PRODUCTS from '@salesforce/schema/Opportunity.CS_Products_Purchased__c';
import CS_COMMERCIAL_TERMS from '@salesforce/schema/Opportunity.CS_Commercial_Terms__c';
import CS_CONTRACT_TERM from '@salesforce/schema/Opportunity.CS_Contract_Term__c';
import CS_AUTO_RENEW from '@salesforce/schema/Opportunity.CS_Auto_Renew__c';
import CS_CUSTOMER_GOALS from '@salesforce/schema/Opportunity.CS_Customer_Goals__c';
import CS_COMMERCIAL_NOTES from '@salesforce/schema/Opportunity.CS_Commercial_Notes__c';

const FIELDS = [CSM_REQUESTED, CS_KEY_STAKEHOLDERS, CS_PRODUCTS, CS_COMMERCIAL_TERMS, CS_CONTRACT_TERM, CS_AUTO_RENEW, CS_CUSTOMER_GOALS, CS_COMMERCIAL_NOTES];

export default class CsStaffingModal extends LightningElement {
    @api recordId;
    @track showModal = false;
    @track formData = {};
    _previousCsmRequested = false;

    @wire(getRecord, { recordId: '$recordId', fields: FIELDS })
    wiredRecord({ data }) {
        if (data) {
            const csmRequested = getFieldValue(data, CSM_REQUESTED);
            if (csmRequested && !this._previousCsmRequested) {
                this.formData = {
                    stakeholders: getFieldValue(data, CS_KEY_STAKEHOLDERS) || '',
                    products: (getFieldValue(data, CS_PRODUCTS) || '').split(';').filter(Boolean),
                    commercialTerms: getFieldValue(data, CS_COMMERCIAL_TERMS) || '',
                    contractTerm: getFieldValue(data, CS_CONTRACT_TERM) || '',
                    autoRenew: getFieldValue(data, CS_AUTO_RENEW) || false,
                    customerGoals: getFieldValue(data, CS_CUSTOMER_GOALS) || '',
                    commercialNotes: getFieldValue(data, CS_COMMERCIAL_NOTES) || ''
                };
                this.showModal = true;
            }
            this._previousCsmRequested = csmRequested;
        }
    }

    get productOptions() {
        return [
            { label: 'AI Compliance - Technology', value: 'AI Compliance - Technology' },
            { label: 'AI Platform - Sigma', value: 'AI Platform - Sigma' },
            { label: 'AI Platform - Insights', value: 'AI Platform - Insights' },
            { label: 'AI Contracting - Technology', value: 'AI Contracting - Technology' },
            { label: 'AI Contracting - Managed Services', value: 'AI Contracting - Managed Services' },
            { label: 'AI M&A - Managed Services', value: 'AI M&A - Managed Services' },
            { label: 'AI Platform - Litigation', value: 'AI Platform - Litigation' },
            { label: 'FDE - Custom AI Solution', value: 'FDE - Custom AI Solution' },
            { label: 'Other - Managed Service', value: 'Other - Managed Service' },
            { label: 'Other - Secondee', value: 'Other - Secondee' },
            { label: 'Contracting - Secondee', value: 'Contracting - Secondee' },
            { label: 'Contracting BAU', value: 'Contracting BAU' }
        ];
    }

    get commercialTermsOptions() {
        return [
            { label: 'POC', value: 'POC' },
            { label: 'Trial', value: 'Trial' },
            { label: 'Standard Renewing Contract', value: 'Standard Renewing Contract' }
        ];
    }

    get contractTermOptions() {
        return [
            { label: '1 Year', value: '1 Year' },
            { label: '2 Years', value: '2 Years' },
            { label: '3 Years', value: '3 Years' }
        ];
    }

    handleStakeholders(e) { this.formData = { ...this.formData, stakeholders: e.detail.value }; }
    handleProducts(e) { this.formData = { ...this.formData, products: e.detail.value }; }
    handleCommercialTerms(e) { this.formData = { ...this.formData, commercialTerms: e.detail.value }; }
    handleContractTerm(e) { this.formData = { ...this.formData, contractTerm: e.detail.value }; }
    handleAutoRenew(e) { this.formData = { ...this.formData, autoRenew: e.target.checked }; }
    handleCustomerGoals(e) { this.formData = { ...this.formData, customerGoals: e.detail.value }; }
    handleCommercialNotes(e) { this.formData = { ...this.formData, commercialNotes: e.detail.value }; }

    async handleSave() {
        const fields = {};
        fields[ID_FIELD.fieldApiName] = this.recordId;
        fields[CS_KEY_STAKEHOLDERS.fieldApiName] = this.formData.stakeholders;
        fields[CS_PRODUCTS.fieldApiName] = Array.isArray(this.formData.products) ? this.formData.products.join(';') : this.formData.products;
        fields[CS_COMMERCIAL_TERMS.fieldApiName] = this.formData.commercialTerms;
        fields[CS_CONTRACT_TERM.fieldApiName] = this.formData.contractTerm;
        fields[CS_AUTO_RENEW.fieldApiName] = this.formData.autoRenew;
        fields[CS_CUSTOMER_GOALS.fieldApiName] = this.formData.customerGoals;
        fields[CS_COMMERCIAL_NOTES.fieldApiName] = this.formData.commercialNotes;

        try {
            await updateRecord({ fields });
            this.showModal = false;
            this.dispatchEvent(new ShowToastEvent({ title: 'CS Handover Saved', message: 'CS team has been notified.', variant: 'success' }));
        } catch (e) {
            this.dispatchEvent(new ShowToastEvent({ title: 'Error', message: e.body?.message || e.message, variant: 'error' }));
        }
    }

    async handleCancel() {
        this.showModal = false;
        const fields = {};
        fields[ID_FIELD.fieldApiName] = this.recordId;
        fields[CSM_REQUESTED.fieldApiName] = false;
        try {
            await updateRecord({ fields });
        } catch { /* silent */ }
    }
}
