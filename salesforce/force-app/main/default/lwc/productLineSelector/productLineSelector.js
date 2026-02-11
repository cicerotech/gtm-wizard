import { LightningElement, api, wire } from 'lwc';
import { getRecord, getFieldValue, updateRecord } from 'lightning/uiRecordApi';
import { getPicklistValues, getObjectInfo } from 'lightning/uiObjectInfoApi';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import PRODUCT_LINES_FIELD from '@salesforce/schema/Opportunity.Product_Lines_Multi__c';
import OPPORTUNITY_OBJECT from '@salesforce/schema/Opportunity';

export default class ProductLineSelector extends LightningElement {
    @api recordId;
    isEditing = false;
    selectedValues = [];
    isSaving = false;

    _originalValues = [];
    _picklistOptions = [];

    @wire(getObjectInfo, { objectApiName: OPPORTUNITY_OBJECT })
    objectInfo;

    @wire(getPicklistValues, {
        recordTypeId: '$objectInfo.data.defaultRecordTypeId',
        fieldApiName: PRODUCT_LINES_FIELD
    })
    wiredPicklistValues({ data }) {
        if (data) {
            this._picklistOptions = data.values.map(v => ({
                label: v.label,
                value: v.value
            }));
        }
    }

    @wire(getRecord, { recordId: '$recordId', fields: [PRODUCT_LINES_FIELD] })
    wiredRecord({ data }) {
        if (data) {
            const val = getFieldValue(data, PRODUCT_LINES_FIELD);
            this.selectedValues = val ? val.split(';') : [];
            this._originalValues = [...this.selectedValues];
        }
    }

    get options() {
        return this._picklistOptions;
    }

    get selectedLabels() {
        return this.selectedValues
            .map(v => {
                const opt = this._picklistOptions.find(o => o.value === v);
                return opt ? opt.label : v;
            })
            .filter(Boolean);
    }

    get hasSelections() {
        return this.selectedValues && this.selectedValues.length > 0;
    }

    handleEdit() {
        this.isEditing = true;
    }

    handleChange(event) {
        this.selectedValues = [...event.detail.value];
    }

    handleCancel() {
        this.selectedValues = [...this._originalValues];
        this.isEditing = false;
    }

    handleSave() {
        this.isSaving = true;
        const fields = {};
        fields.Id = this.recordId;
        fields[PRODUCT_LINES_FIELD.fieldApiName] =
            this.selectedValues.length > 0
                ? this.selectedValues.join(';')
                : null;

        updateRecord({ fields })
            .then(() => {
                this._originalValues = [...this.selectedValues];
                this.isEditing = false;
                this.isSaving = false;
                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'Success',
                        message: 'Product lines updated',
                        variant: 'success'
                    })
                );
            })
            .catch(error => {
                this.isSaving = false;
                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'Error updating product lines',
                        message: error.body?.message || 'An error occurred',
                        variant: 'error'
                    })
                );
            });
    }
}
