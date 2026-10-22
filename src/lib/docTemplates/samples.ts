import type { DocTemplate } from "@/lib/docTemplates/format";

// Built-in examples every firm sees. Copy one to make it your own.
// They are starting points for an attorney to review, not legal advice.
const DEED_BODY = `>>Prepared by: {{attorney_name}}
>>Preparer signature no longer required per NJSA 46:26A-3

# DEED

This Deed is made on {{deed_date}} and delivered on {{delivery_date}}.

**BETWEEN**

{{grantor_names}}

whose post office address is {{grantor_address}},

>>referred to as the Grantor,

**AND**

{{grantee_names}}

whose address is {{grantee_address}},

>>referred to as the Grantee.

The words "Grantor" and "Grantee" shall mean all Grantors and all Grantees listed above.

**Transfer of Ownership.** The Grantor grants and conveys (transfers ownership of) the property (called the "Property") described below to the Grantee.

**Consideration.** This transfer is made for the sum and consideration of {{consideration_words}} DOLLARS ({{consideration_amount}}).

The Grantor acknowledges receipt of this money.

**Tax map Reference.** (N.J.S.A. 46:26A-1) The Property is located in the {{municipality_type}} of {{municipality}}, Block No. {{block}}, Lot No. {{lot}}, Account No. {{account_no}}.

☐ No property tax identification number is available on the date of this Deed. (Check box if applicable.)

**Property.** The Property consists of the land and all the buildings and structures on the land in the {{municipality_type}} of {{municipality}}, County of {{county}} and State of New Jersey.

☒ Please see attached Legal Description annexed hereto and made a part hereof. (check box if applicable).

BEING known as Lot {{lot}}, Block {{block}} as shown on the {{municipality_type}} of {{municipality}} tax map.

Being commonly known as: {{property_address}}.

**Being the same premises conveyed to {{grantor_names}}, herein, by Deed from {{prior_grantor}} dated {{prior_deed_date}}, recorded on {{prior_deed_recorded}} in the {{county}} County Clerk's/Register's Office as Instrument # {{prior_instrument_no}}.**

**Subject to Federal and State regulations, municipal zoning ordinances, easements, restrictions and covenants of record, if any and such state of facts as an accurate survey may disclose.**

**Promises by Grantor:** The Grantor promises and warrants that Grantor, by acts of Grantor, has not encumbered the property. This promise is called a "covenant as to grantor's acts" (N.J.S.A. 46:4-6). This promise means that the Grantor has not allowed anyone else to obtain any legal right which would affect the property being transferred (such as a mortgage or entering a judgment against the Grantor).

**Signatures.** The Grantor signs this Deed as of the date at the top of the first page. (Print name below each signature).

>>______________________________
>>{{grantor_signer_1}}

>>______________________________
>>{{grantor_signer_2}}

STATE OF NEW JERSEY
COUNTY OF {{county}}   SS.:

I CERTIFY that on {{acknowledgment_date}}, {{grantor_names}} personally came before me and stated to my satisfaction that this person:
a) was the maker of this Deed;
b) executed this Deed as their own act; and,
c) made this Deed for {{consideration_amount}} as the full and actual consideration paid or to be paid for the transfer of title. (Such consideration is defined in N.J.S.A. 46:15-5.)

______________________________
Notary Public

---

# DEED

{{grantor_names}}
>>Grantor

::TO

{{grantee_names}}
>>Grantee

Record and return to:
{{record_and_return_to}}
`;

export const SAMPLE_TEMPLATES: DocTemplate[] = [
  {
    id: "sample-nj-deed",
    name: "Deed (NJ, bargain and sale with covenant as to grantor's acts)",
    category: "Real Estate",
    description: "New Jersey deed with tax-map reference, legal description reference, prior-deed recital, grantor's covenant, signatures, notary acknowledgment and the recording cover.",
    body: DEED_BODY,
    source: "sample",
    sample: true,
    updatedAt: "2026-10-21T00:00:00Z",
    fields: [
      { key: "attorney_name", label: "Prepared by (attorney)", example: "Piotr Rapciewicz" },
      { key: "deed_date", label: "Date the deed is made", example: "October ____, 2026" },
      { key: "delivery_date", label: "Date delivered", example: "October ____, 2026" },
      { key: "grantor_names", label: "Grantor(s)", hint: "Current owner(s), as on the prior deed", example: "Paul Montesano and Marilyn Montesano" },
      { key: "grantor_address", label: "Grantor post office address", example: "3 Masada Court, Toms River, New Jersey 08753" },
      { key: "grantee_names", label: "Grantee(s)", hint: "Buyer(s)", example: "William Dolan, Susan Dolan, Nicholas Prisco and Alexa Prisco" },
      { key: "grantee_address", label: "Grantee address", example: "about to be 3 Masada Court, Toms River, NJ 08753" },
      { key: "consideration_words", label: "Consideration in words", example: "SIX HUNDRED TWELVE THOUSAND FIVE HUNDRED AND 00/100" },
      { key: "consideration_amount", label: "Consideration amount", example: "$612,500.00" },
      { key: "municipality_type", label: "Municipality type", hint: "Township, Borough, City, Town", example: "Township" },
      { key: "municipality", label: "Municipality", example: "Toms River" },
      { key: "county", label: "County", example: "Ocean" },
      { key: "block", label: "Block No.", example: "540" },
      { key: "lot", label: "Lot No.", example: "15" },
      { key: "account_no", label: "Account No.", hint: "Leave blank if none" },
      { key: "property_address", label: "Property address", example: "3 Masada Court, Toms River, NJ 08753" },
      { key: "prior_grantor", label: "Prior deed: from (grantor)", hint: "Who conveyed to the current owner" },
      { key: "prior_deed_date", label: "Prior deed: dated" },
      { key: "prior_deed_recorded", label: "Prior deed: recorded on" },
      { key: "prior_instrument_no", label: "Prior deed: instrument #" },
      { key: "grantor_signer_1", label: "Signature line 1 (print name)", example: "PAUL MONTESANO" },
      { key: "grantor_signer_2", label: "Signature line 2 (print name)", example: "MARILYN MONTESANO" },
      { key: "acknowledgment_date", label: "Notary: date acknowledged", example: "October ____, 2026" },
      { key: "record_and_return_to", label: "Record and return to", example: "The Law Office of Piotr Rapciewicz, LLC, 445 Brick Blvd, Suite 205, Brick, NJ 08723" },
    ],
  },
  {
    id: "sample-nj-attorney-review",
    name: "Attorney review letter (NJ residential contract)",
    category: "Real Estate",
    description: "Letter to the other side's attorney or realtor disapproving the contract during the three-day attorney review period and proposing changes.",
    source: "sample",
    sample: true,
    updatedAt: "2026-10-21T00:00:00Z",
    body: `{{firm_name}}
{{firm_address}}

{{today_date}}

**VIA EMAIL ({{recipient_email}})**

{{recipient_name}}
{{recipient_company}}

**Re: {{client_role}}: {{client_name}}**
**Property: {{property_address}}**
**Our file: {{matter_number}}**

Dear {{recipient_salutation}}:

Please be advised that this office represents {{client_name}}, the {{client_role}} in the above-referenced transaction. This letter is sent within the three (3) business day attorney review period provided in the contract, and the contract is hereby **DISAPPROVED** pending the following revisions, which are made a part of the contract upon acceptance:

1. {{revision_1}}
2. {{revision_2}}
3. {{revision_3}}

All other terms and conditions of the contract remain in full force and effect. Please have your client initial the enclosed copy of this letter where indicated and return it to this office, at which time the contract will be deemed approved as modified. If this letter is not accepted, the contract shall be null and void.

Nothing in this letter shall be construed as a waiver of any rights of my client, and all rights are expressly reserved.

Very truly yours,

{{attorney_name}}
{{firm_name}}

cc: {{client_name}}
`,
    fields: [
      { key: "firm_name", label: "Firm name" },
      { key: "firm_address", label: "Firm address" },
      { key: "today_date", label: "Date" },
      { key: "recipient_email", label: "Recipient email" },
      { key: "recipient_name", label: "Recipient name", hint: "Other side's attorney or realtor" },
      { key: "recipient_company", label: "Recipient firm / brokerage" },
      { key: "recipient_salutation", label: "Dear …", example: "Ms. Arcudi" },
      { key: "client_role", label: "Client is the…", example: "Buyer" },
      { key: "client_name", label: "Client name" },
      { key: "property_address", label: "Property address" },
      { key: "matter_number", label: "Our file number" },
      { key: "revision_1", label: "Revision 1" },
      { key: "revision_2", label: "Revision 2" },
      { key: "revision_3", label: "Revision 3" },
      { key: "attorney_name", label: "Attorney name" },
    ],
  },
  {
    id: "sample-engagement-letter",
    name: "Engagement letter (flat fee)",
    category: "Letters",
    description: "Short engagement letter confirming the scope of representation, a flat fee, what is not included, and the client's signature.",
    source: "sample",
    sample: true,
    updatedAt: "2026-10-21T00:00:00Z",
    body: `{{firm_name}}
{{firm_address}}

{{today_date}}

{{client_name}}
{{client_address}}

**Re: Engagement for {{matter_description}}**

Dear {{client_salutation}}:

Thank you for choosing {{firm_name}}. This letter confirms the terms on which we will represent you.

**Scope of representation.** We will represent you in connection with {{scope}}. Our representation is limited to this matter; any other matter would require a separate agreement.

**Fee.** Our fee for this matter is a flat fee of {{flat_fee}}, payable {{fee_terms}}. The fee does not include costs and disbursements such as filing fees, recording fees, title charges or courier charges, which will be billed to you at cost.

**Not included.** {{exclusions}}

**Your responsibilities.** Please provide the documents and information we request promptly, keep us informed of anything that may affect the matter, and let us know immediately if your contact details change.

**Ending the engagement.** You may end our representation at any time. We may withdraw as permitted by the Rules of Professional Conduct. Our representation ends when the matter concludes or when we send you a closing letter.

If these terms are acceptable, please sign below and return a copy to us.

Very truly yours,

{{attorney_name}}
{{firm_name}}

**AGREED AND ACCEPTED:**

______________________________
{{client_name}}

Date: ______________
`,
    fields: [
      { key: "firm_name", label: "Firm name" },
      { key: "firm_address", label: "Firm address" },
      { key: "today_date", label: "Date" },
      { key: "client_name", label: "Client name" },
      { key: "client_address", label: "Client address" },
      { key: "client_salutation", label: "Dear …", example: "Mr. Walsh" },
      { key: "matter_description", label: "Matter (short)", example: "Purchase of 12 Oak Street, Clifton, NJ" },
      { key: "scope", label: "Scope of representation" },
      { key: "flat_fee", label: "Flat fee", example: "$1,500.00" },
      { key: "fee_terms", label: "When the fee is payable", example: "at closing" },
      { key: "exclusions", label: "What is not included" },
      { key: "attorney_name", label: "Attorney name" },
    ],
  },
];
