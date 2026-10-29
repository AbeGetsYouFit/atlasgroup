export type LeadFields={name?:string;email?:string;phone?:string;service?:string;plan?:string;purpose?:string;state?:string;dob?:string;dateOfBirth?:string;consent?:boolean;smsConsent?:boolean;veteran?:boolean;policyHolder?:boolean;wantsCallback?:boolean};
export type LeadUtm={source:string;campaign:string;content:string;plan:string};
export type LeadCtx={page:string;stage:'partial'|'book'|'reachout';utm?:Partial<LeadUtm>};
export function buildLeadPayload(fields:LeadFields,ctx:LeadCtx):Record<string,unknown>|null;
export function fingerprint(payload:Record<string,unknown>|null):string;
export function readUtm(search:string):LeadUtm;
