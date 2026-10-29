/* The two SMS-consent tags are mutually exclusive on a contact: latest signal wins. */
export function oppositeConsentTag(tags){return tags.includes('sms-consent-yes')?'sms-consent-no':'sms-consent-yes'}
