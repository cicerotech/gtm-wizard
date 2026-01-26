import { LightningElement, api, wire } from 'lwc';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';
import { NavigationMixin } from 'lightning/navigation';

import CODE_NAME_FIELD from '@salesforce/schema/Account.Code_Name__c';
import OWNER_NAME_FIELD from '@salesforce/schema/Account.Owner.Name';
import CLO_FIELD from '@salesforce/schema/Account.CLO__c';
import CUSTOMER_TYPE_FIELD from '@salesforce/schema/Account.Customer_Type__c';
import POD_FIELD from '@salesforce/schema/Account.Pod__c';

const FIELDS = [
    CODE_NAME_FIELD,
    OWNER_NAME_FIELD,
    CLO_FIELD,
    CUSTOMER_TYPE_FIELD,
    POD_FIELD
];

export default class CouncilHighlights extends NavigationMixin(LightningElement) {
    @api recordId;

    @wire(getRecord, { recordId: '$recordId', fields: FIELDS })
    account;

    get codeName() {
        return getFieldValue(this.account.data, CODE_NAME_FIELD) || 'Council Account';
    }

    get ownerName() {
        return getFieldValue(this.account.data, OWNER_NAME_FIELD) || '-';
    }

    get clo() {
        return getFieldValue(this.account.data, CLO_FIELD) || '-';
    }

    get customerType() {
        return getFieldValue(this.account.data, CUSTOMER_TYPE_FIELD) || '-';
    }

    get pod() {
        return getFieldValue(this.account.data, POD_FIELD) || '-';
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

