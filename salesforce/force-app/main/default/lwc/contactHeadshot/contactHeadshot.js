import { LightningElement, api, wire } from 'lwc';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';
import HEADSHOT_FIELD from '@salesforce/schema/Contact.LinkedIn_Headshot_URL__c';
import NAME_FIELD from '@salesforce/schema/Contact.Name';

export default class ContactHeadshot extends LightningElement {
    @api recordId;
    
    @wire(getRecord, { recordId: '$recordId', fields: [HEADSHOT_FIELD, NAME_FIELD] })
    contact;
    
    get headshotUrl() {
        return getFieldValue(this.contact.data, HEADSHOT_FIELD);
    }
    
    get contactName() {
        return getFieldValue(this.contact.data, NAME_FIELD);
    }
    
    get hasHeadshot() {
        return !!this.headshotUrl;
    }
    
    get initials() {
        const name = this.contactName || '';
        const parts = name.split(' ');
        if (parts.length >= 2) {
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    }
    
    handleImageError(event) {
        // Hide image and show initials fallback
        event.target.style.display = 'none';
        this.template.querySelector('.initials-fallback').style.display = 'flex';
    }
}
