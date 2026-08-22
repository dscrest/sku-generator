// T&C data + persistence for the estimate's last page. Pure ESM (no React /
// JSX) so the node self-check can run it — components live in EstimateTerms.jsx.
// Content is editable per-print and kept in localStorage only — every browser
// starts from DEFAULT_TERMS.
// ponytail: localStorage-only; wire to OrgSetting + PUT /settings when
// org-wide shared defaults are needed.

export const STORAGE_KEY = 'estimateTerms';

export const DEFAULT_TERMS = {
  terms: [
    { label: 'Delivery Of Goods', text: '6 - 7 Weeks From The Date Of Purchase Order Receipt Along With Advance Payment.' },
    { label: 'Duties & Taxes', text: 'As Per GST Rule @18% Extra.' },
    { label: 'Payment Terms', text: '40% Advance Payment On Order Place Time & Balance 60% Payment Against Pro-forma Invoice On Before Time.' },
    { label: 'Packing', text: '4% Extra For Create Wooden Box Packing. Or Nil In Case Supply In Loose Pack.' },
    { label: 'Forwarding', text: 'Forwarding Charge From Our Work Shop To Transport Or Any Place, Whatever Charge Would Be Pay By Buyer.' },
    { label: 'Freight Charge', text: 'On To Pay Basis. (Whatever Charge Of Transportation Pay By Buyer.)' },
    { label: 'Transit Damage', text: 'We Are Not Responsible For Any Transportation Damage After Handover The Material To Transporter Or Private Vehicle.' },
    { label: 'Insurance Of Goods', text: 'In Account Of Buyer.' },
    { label: 'Validity Of Offer', text: '15 Days From The Date Of Submission.' },
    { label: 'Technical Changes', text: 'After Receiving Purchase Order We Can Not Change Any Technical Parameters. Or In Case You Require So, Buyer Have To Pay Extra Amount Of Changes.' },
    { label: 'Warranty Of Valve', text: '18 Months From The Date Of Dispatch & 12 Months From The Date Of Commissioning, Whichever Is Earlier, Against Any Manufacturing Defects, Faulty Workmanship, Defective Metals.\nHowever, This Does Not Hold In Case Of Normal Wear & Tear Due To Erosion & Corrosion. Moreover, No Warranty Or Guarantee Applicable In Pneumatic Valves & Related Accessories.' },
    { label: 'MTC & GA Drawing', text: 'MSUN Will Provide You With GA Drawing If You Require It For Approval Purpose, And Material Test Certificate Providing On Delivery Time.' },
    { label: 'Testing & QC', text: 'MSUN Will Provide Testing Facility At Our Work Shop. Without Testing Valves, Complaint Can Not Be Acceptable.' },
    { label: 'Extra Job Work', text: 'If Buyer Require Any Extra Job After Place The Order, So Whatever Charge Of Job Should Be Applicable.' },
  ],
  bank: [
    ['Name Of Company', 'MSUN VALVE PVT. LTD.', 'Branch Of Bank', "Sardarnagar (A'Bad)"],
    ['Name Of Bank', 'HDFC BANK LIMITED', 'IFSC Code', 'HDFC0000889'],
    ['Account No', '50200076743945', 'Account Type', 'CURRENT'],
    ['GST No', '24AAQCM4066R1ZN', 'PAN No.', 'AAQCM4066R'],
    ['Mr. Kamal Patel', '(+91) 75748 57831', '(+91) 75748 57832', 'Kamal@marutivalves.com'],
    ['Mr. Dipan Patel', '(+91) 95125 06161', '(+91) 95125 06262', 'Sales@msunvalve.com'],
    ['MARUTI OFFICE', '(+91) 90235 80049', '(+91) 98983 74361', 'Sales@marutivalves.com'],
  ],
  footer: 'Factory:- B-10, Swastik Industrial Estate, Ahmedabad - Indore Highway, Kothiya - Kunha, Kubadthal, Kothiya, Ahmedabad',
};

// Merge a stored (possibly old/corrupt) value over the defaults. Pure so the
// node self-check can exercise it without a browser.
export function normalizeTerms(raw) {
  const d = DEFAULT_TERMS;
  if (!raw || typeof raw !== 'object') return d;
  return {
    terms: Array.isArray(raw.terms)
      ? raw.terms.map((t) => ({ label: String(t?.label ?? ''), text: String(t?.text ?? '') }))
      : d.terms,
    bank: Array.isArray(raw.bank)
      ? raw.bank.map((r) => [0, 1, 2, 3].map((i) => String((Array.isArray(r) ? r[i] : null) ?? '')))
      : d.bank,
    footer: typeof raw.footer === 'string' ? raw.footer : d.footer,
  };
}

export function loadTerms() {
  try {
    return normalizeTerms(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch {
    return DEFAULT_TERMS;
  }
}

export function saveTerms(t) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
}
