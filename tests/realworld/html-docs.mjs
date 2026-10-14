// Writes realistic HTML documents (fictional data) and prints each with Chromium's print-to-PDF.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), '../../package.json'));
const { chromium } = require('@playwright/test');

// $REALWORLD_DIR/gen/fonts may hold Noto Sans Malayalam and Devanagari as woff2 (see build.sh); without them the
// browser falls back to whatever Malayalam and Hindi fonts the machine has.
const ROOT = process.env.REALWORLD_DIR ?? '.';
const GEN = join(ROOT, 'gen');
const OUT = join(ROOT, 'pdf');
const HTML = join(GEN, 'html');
mkdirSync(OUT, { recursive: true });
mkdirSync(HTML, { recursive: true });
mkdirSync(join(GEN, 'shots'), { recursive: true });

const fonts = `
@font-face { font-family: 'NotoMl'; src: url('../fonts/noto-sans-malayalam-malayalam-400-normal.woff2'); font-weight: 400; }
@font-face { font-family: 'NotoMl'; src: url('../fonts/noto-sans-malayalam-malayalam-700-normal.woff2'); font-weight: 700; }
@font-face { font-family: 'NotoMl'; src: url('../fonts/noto-sans-malayalam-latin-400-normal.woff2'); font-weight: 400; unicode-range: U+0000-00FF; }
@font-face { font-family: 'NotoDeva'; src: url('../fonts/noto-sans-devanagari-devanagari-400-normal.woff2'); font-weight: 400; }
@font-face { font-family: 'NotoDeva'; src: url('../fonts/noto-sans-devanagari-devanagari-700-normal.woff2'); font-weight: 700; }
`;
const base = (body, css = '', title = 'Document') => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${fonts}
body { font-family: 'Liberation Sans', Arial, sans-serif; color: #222; font-size: 11pt; margin: 0; }
table { border-collapse: collapse; width: 100%; }
td, th { border: 1px solid #999; padding: 4px 6px; text-align: left; vertical-align: top; }
th { background: #eee; }
.r { text-align: right; }
${css}</style></head><body>${body}</body></html>`;

const rnd = (() => {
  let s = 12345;
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
})();
const inr = (n) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qr = (n = 25, size = 90) => {
  let cells = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (rnd() > 0.5 || ((x < 7 || x > n - 8) && y < 7) || (x < 7 && y > n - 8)) cells += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges">${cells}</svg>`;
};
const photoSvg = (w = 90, h = 110) =>
  `<svg width="${w}" height="${h}" viewBox="0 0 90 110"><rect width="90" height="110" fill="#cfd8e3"/><circle cx="45" cy="40" r="20" fill="#8a6a50"/><rect x="15" y="65" width="60" height="45" rx="20" fill="#34557a"/></svg>`;

const docs = {};

// 1. GST tax invoice
{
  const items = [
    ['Steel almirah, 4 shelves', '9403', 2, 8450],
    ['Office chair, mesh back', '9401', 6, 3290],
    ['LED tube light 20W', '9405', 24, 245],
    ['Extension board 6-socket', '8536', 10, 410],
    ['A4 copier paper (ream)', '4802', 40, 285],
    ['Whiteboard 4x3 ft', '9610', 3, 1875],
    ['Installation and transport', '9987', 1, 1500],
  ];
  let rows = '';
  let taxable = 0;
  items.forEach(([d, hsn, q, rate], i) => {
    const amt = q * rate;
    taxable += amt;
    rows += `<tr><td>${i + 1}</td><td>${d}</td><td>${hsn}</td><td class="r">${q}</td><td class="r">${inr(rate)}</td><td class="r">${inr(amt)}</td><td class="r">9%</td><td class="r">${inr(amt * 0.09)}</td><td class="r">9%</td><td class="r">${inr(amt * 0.09)}</td><td class="r">${inr(amt * 1.18)}</td></tr>`;
  });
  docs['invoice-gst'] = base(
    `<div style="padding:28px">
<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #1b4f8a;padding-bottom:8px">
<div><svg width="60" height="60"><circle cx="30" cy="30" r="28" fill="#1b4f8a"/><text x="30" y="38" fill="#fff" font-size="22" text-anchor="middle" font-family="Liberation Sans">PF</text></svg></div>
<div style="text-align:right"><h1 style="margin:0;color:#1b4f8a">Periyar Furnishings Pvt. Ltd.</h1>
<div>Door 14/220, Banerji Road, Ernakulam, Kerala 682018</div><div>GSTIN: 32AABCP1234Q1Z5 &nbsp; State: Kerala (32)</div></div></div>
<h2 style="text-align:center;letter-spacing:2px">TAX INVOICE</h2>
<table style="margin-bottom:10px"><tr><td><b>Invoice No:</b> PF/2026-27/0418<br><b>Date:</b> 03-09-2026<br><b>Place of supply:</b> Kerala</td>
<td><b>Bill to:</b><br>Sree Narayana Tutorial College<br>Kottayam Road, Changanassery 686101<br>GSTIN: 32AAATS9876K1Z2</td></tr></table>
<table><thead><tr><th>#</th><th>Description</th><th>HSN/SAC</th><th>Qty</th><th>Rate</th><th>Taxable value</th><th>CGST</th><th>Amount</th><th>SGST</th><th>Amount</th><th>Total</th></tr></thead><tbody>${rows}</tbody>
<tfoot><tr><th colspan="5">Total</th><th class="r">${inr(taxable)}</th><th></th><th class="r">${inr(taxable * 0.09)}</th><th></th><th class="r">${inr(taxable * 0.09)}</th><th class="r">${inr(taxable * 1.18)}</th></tr></tfoot></table>
<p><b>Amount in words:</b> Rupees One Lakh Fifty-Four Thousand Two Hundred Ninety-Seven Only</p>
<table style="width:60%"><tr><th>Bank</th><td>Federal Bank, MG Road branch</td></tr><tr><th>A/c No.</th><td>1234 5678 9012</td></tr><tr><th>IFSC</th><td>FDRL0001234</td></tr></table>
<p style="margin-top:40px;text-align:right">For Periyar Furnishings Pvt. Ltd.<br><br><br>Authorised Signatory</p>
<p style="font-size:8pt;color:#666">This is a computer generated invoice. Subject to Ernakulam jurisdiction.</p></div>`,
    'td,th{font-size:8.5pt}',
    'Tax Invoice PF/2026-27/0418',
  );
}

// 2. Train e-ticket
docs['eticket-train'] = base(
  `<div style="padding:24px">
<div style="background:#203864;color:#fff;padding:10px 16px;display:flex;justify-content:space-between"><b style="font-size:16pt">Electronic Reservation Slip (ERS)</b><span>Booked from a fictional rail portal</span></div>
<table style="margin-top:12px"><tr><th>PNR</th><th>Train No./Name</th><th>Class</th><th>Quota</th></tr>
<tr><td style="font-size:14pt"><b>4521 873 609</b></td><td>16302 / VENAD EXPRESS</td><td>SECOND SITTING (2S)</td><td>GENERAL (GN)</td></tr></table>
<div style="display:flex;justify-content:space-between;align-items:center;margin:16px 0;font-size:13pt">
<div><b>Ernakulam Jn (ERS)</b><br>Departure* 06:05 15-Oct-2026</div><div>&#8594; 3h 45m &#8594;</div><div style="text-align:right"><b>Thiruvananthapuram Ctrl (TVC)</b><br>Arrival* 09:50 15-Oct-2026</div></div>
<table><thead><tr><th>#</th><th>Name</th><th>Age</th><th>Gender</th><th>Booking Status</th><th>Current Status</th></tr></thead>
<tbody><tr><td>1</td><td>LAKSHMI NAIR</td><td>58</td><td>F</td><td>CNF/D4/31/WINDOW</td><td>CNF/D4/31/WINDOW</td></tr>
<tr><td>2</td><td>GOPAN NAIR</td><td>61</td><td>M</td><td>CNF/D4/32/MIDDLE</td><td>CNF/D4/32/MIDDLE</td></tr>
<tr><td>3</td><td>DEVIKA G NAIR</td><td>27</td><td>F</td><td>RLWL/12</td><td>RLWL/9</td></tr></tbody></table>
<div style="display:flex;gap:20px;margin-top:16px"><div>${qr(29, 120)}</div>
<table style="flex:1"><tr><th>Ticket Fare</th><td class="r">&#8377; 375.00</td></tr><tr><th>Convenience Fee (incl. GST)</th><td class="r">&#8377; 17.70</td></tr><tr><th>Travel Insurance Premium</th><td class="r">&#8377; 1.35</td></tr><tr><th>Total Fare</th><td class="r"><b>&#8377; 394.05</b></td></tr></table></div>
<h3>Instructions</h3><ol style="font-size:9pt">
<li>Prescribed original ID proof is required while travelling along with SMS/ VRM/ ERS otherwise will be treated as without ticket and penalised as per Railway Rules.</li>
<li>Passengers travelling on a fully waitlisted e-ticket will be treated as ticketless.</li>
<li>Obtain certificate from the TTE / Conductor in case of (a) passenger not travelled, (b) travelled without proper ID, for filing a refund claim.</li>
<li>Never purchase an e-ticket from unauthorised agents or persons using their personal IDs.</li></ol>
<p style="font-size:8pt;color:#555">* Departure and arrival times are local. Contact 139 for enquiries (fictional).</p></div>`,
  'th{background:#dde5f2}',
  'ERS 4521873609',
);

// 3. Electricity bill with backgrounds, bar chart, Malayalam heading
{
  const months = ['Oct', 'Dec', 'Feb', 'Apr', 'Jun', 'Aug'];
  const units = [212, 198, 230, 301, 287, 254];
  const bars = units.map((u, i) => `<rect x="${20 + i * 45}" y="${150 - u / 2.2}" width="28" height="${u / 2.2}" fill="#2e7d32"/><text x="${34 + i * 45}" y="168" font-size="10" text-anchor="middle">${months[i]}</text><text x="${34 + i * 45}" y="${144 - u / 2.2}" font-size="9" text-anchor="middle">${u}</text>`).join('');
  docs['electricity-bill'] = base(
    `<div style="padding:24px;background:#f3f8f2;min-height:1000px">
<div style="background:#2e7d32;color:#fff;padding:12px 18px;border-radius:8px"><div style="font-family:NotoMl;font-size:15pt">കേരള വൈദ്യുതി വിതരണ സമിതി (സാങ്കൽപ്പികം)</div><div style="font-size:12pt">Kerala Power Distribution Board (fictional) — Bi-monthly Bill cum Receipt</div></div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px">
<div style="background:#fff;padding:10px;border-radius:6px"><b>Consumer No.</b> 1155 6789 0123<br><b>Name</b> SUSHAMA RAVINDRAN<br><b>Address</b> TC 25/1180, Vazhuthacaud, Thiruvananthapuram<br><b>Tariff</b> LT-1A Domestic &nbsp; <b>Phase</b> Single</div>
<div style="background:#fff;padding:10px;border-radius:6px"><b>Bill No.</b> 2026090455123<br><b>Bill date</b> 05/09/2026<br><b>Due date</b> 15/09/2026<br><b>Disconnection date</b> 30/09/2026</div></div>
<table style="background:#fff;margin-top:14px"><tr><th>Meter No.</th><th>Previous reading</th><th>Present reading</th><th>Units</th></tr><tr><td>KS2390012</td><td class="r">18,442</td><td class="r">18,696</td><td class="r">254</td></tr></table>
<table style="background:#fff;margin-top:14px;width:60%"><tr><th>Energy charge</th><td class="r">1,318.50</td></tr><tr><th>Fixed charge</th><td class="r">140.00</td></tr><tr><th>Electricity duty (10%)</th><td class="r">131.85</td></tr><tr><th>Meter rent</th><td class="r">12.00</td></tr><tr><th>Fuel surcharge</th><td class="r">22.86</td></tr><tr><th style="background:#ffe08a">Net amount payable</th><td class="r" style="background:#ffe08a"><b>1,625.00</b></td></tr></table>
<h3>Consumption history (units)</h3><svg width="300" height="175" style="background:#fff">${bars}</svg>
<p style="font-family:NotoMl">ബിൽ തുക നിശ്ചിത തീയതിക്കകം അടയ്ക്കാത്ത പക്ഷം വൈദ്യുതി ബന്ധം വിച്ഛേദിക്കുന്നതാണ്. ഓൺലൈനായി പണമടയ്ക്കുന്നതിന് ഞങ്ങളുടെ വെബ്സൈറ്റ് സന്ദർശിക്കുക.</p>
<p>Pay online or at any section office. Ignore if already paid.</p></div>`,
    '@page{margin:0}',
    'Electricity bill',
  );
}

// 4. Bank statement, long table (repeating header)
{
  let bal = 48210.55;
  let rows = '';
  const narr = ['UPI/DR/6243{n}/SWIGGY/YESB/paytm-swiggy', 'NEFT CR-HDFC0000123-ACME TECHNOLOGIES PVT LTD-SALARY SEP', 'ATM WDL/MG ROAD ERNAKULAM/{n}', 'UPI/CR/7781{n}/RAHUL K/SBIN/rahulk@okaxis/rent share', 'ACH D- TP ACH LIC OF INDIA-{n}', 'POS 4591XXXXXXXX1234 BIG BAZAAR KOCHI', 'IMPS/P2A/{n}/MOTHER/FDRL', 'BIL/ONL/{n}/KSEB/Electricity', 'CHQ DEP/CLG/{n}/FEDERAL BANK', 'INT.PD:01-07-2026 TO 30-09-2026'];
  for (let i = 0; i < 160; i++) {
    const d = new Date(2026, 3, 1 + Math.floor(i * 1.1));
    const n = String(100000 + Math.floor(rnd() * 899999));
    const text = narr[Math.floor(rnd() * narr.length)].replace('{n}', n);
    const cr = /CR|DEP|INT/.test(text);
    const amt = Math.round(rnd() * (cr ? 40000 : 6000) * 100) / 100 + 10;
    bal += cr ? amt : -amt;
    const ds = d.toLocaleDateString('en-GB').replace(/\//g, '-');
    rows += `<tr><td>${ds}</td><td>${text}</td><td>${String(i * 37 + 1000).padStart(6, '0')}</td><td>${ds}</td><td class="r">${cr ? '' : inr(amt)}</td><td class="r">${cr ? inr(amt) : ''}</td><td class="r">${inr(bal)}</td></tr>`;
  }
  docs['bank-statement'] = base(
    `<div style="padding:0 6px"><h2 style="color:#7a1f2b;margin:0">Malabar Co-operative Urban Bank (fictional)</h2>
<p>Statement of account for <b>MR. ARJUN PRAKASH</b><br>Account No: 0001 2345 6789 01 &nbsp; Type: Savings &nbsp; IFSC: MCUB0000042<br>Period: 01-04-2026 to 30-09-2026 &nbsp; Currency: INR</p>
<table><thead><tr><th>Date</th><th>Narration</th><th>Chq./Ref.No.</th><th>Value Dt</th><th>Withdrawal Amt.</th><th>Deposit Amt.</th><th>Closing Balance</th></tr></thead><tbody>${rows}</tbody></table>
<p>**** End of statement ****</p><p style="font-size:8pt">Opening balance 48,210.55. This statement is computer generated and does not require a signature. Please report discrepancies within 30 days.</p></div>`,
    'td,th{font-size:8pt;padding:3px 4px} thead{display:table-header-group} tr{break-inside:avoid}',
    'Account statement',
  );
}

// 5. Resume, two columns, web font, sidebar background
docs['resume'] = base(
  `<div style="display:flex;min-height:1120px">
<aside style="width:32%;background:#263238;color:#eceff1;padding:28px 18px">
<div style="text-align:center">${photoSvg(110, 134)}</div>
<h2 style="font-family:Inter;font-weight:800;margin-top:14px">Meera Krishnan</h2><div>Senior Data Analyst</div>
<h3>Contact</h3><p>meera.k@example.com<br>+91 98470 00000<br>Kochi, Kerala</p>
<h3>Skills</h3><ul><li>SQL, Python, R</li><li>Power BI, Tableau</li><li>Forecasting</li><li>Stakeholder reporting</li></ul>
<h3>Languages</h3><p>English, Malayalam (<span style="font-family:NotoMl">മലയാളം</span>), Hindi (<span style="font-family:NotoDeva">हिन्दी</span>), Tamil</p></aside>
<main style="flex:1;padding:28px 26px;font-family:Inter">
<h2 style="border-bottom:2px solid #263238">Profile</h2><p>Analyst with eight years of experience turning messy operational data into decisions for retail and healthcare organisations across South India. Comfortable owning a problem from the first SQL query to the board presentation.</p>
<h2 style="border-bottom:2px solid #263238">Experience</h2>
<h3>Lead Analyst — Arabian Sea Retail (fictional), Kochi <span style="float:right;font-weight:400">2022 – present</span></h3>
<ul><li>Built the weekly demand forecast used by 140 stores, cutting stock-outs by 18%.</li><li>Moved 60 recurring Excel reports into one self-serve dashboard.</li><li>Mentored four junior analysts; ran the internal SQL course.</li></ul>
<h3>Data Analyst — Lakeshore Hospitals (fictional) <span style="float:right;font-weight:400">2018 – 2022</span></h3>
<ul><li>Modelled outpatient wait times and redesigned appointment slots.</li><li>Automated NABH quality indicators reporting.</li></ul>
<h2 style="border-bottom:2px solid #263238">Education</h2>
<table><tr><th>Degree</th><th>Institution</th><th>Year</th><th>Score</th></tr><tr><td>M.Sc. Statistics</td><td>Cochin University (fictional dept.)</td><td>2017</td><td>8.6 CGPA</td></tr><tr><td>B.Sc. Mathematics</td><td>St. Teresa's College</td><td>2015</td><td>84%</td></tr></table>
<h2 style="border-bottom:2px solid #263238">Certifications</h2><p>Google Data Analytics (2020) · Microsoft PL-300 (2023)</p></main></div>`,
  `@font-face{font-family:Inter;src:local('Inter')} @page{margin:0} aside h3{border-bottom:1px solid #90a4ae;font-size:11pt}`,
  'Meera Krishnan - Resume',
);

// 6. Salary slip
docs['salary-slip'] = base(
  `<div style="padding:30px;border:2px solid #333;margin:20px">
<div style="text-align:center"><h2 style="margin:0">Tejas Software Services LLP (fictional)</h2><div>Infopark Phase II, Kakkanad, Kochi 682042</div><h3>Payslip for the month of August 2026</h3></div>
<table><tr><td>Employee Name</td><td><b>Nikhil Varghese</b></td><td>Employee Code</td><td>TS-1187</td></tr>
<tr><td>Designation</td><td>Software Engineer II</td><td>Department</td><td>Platform</td></tr>
<tr><td>Date of Joining</td><td>14-07-2021</td><td>PAN</td><td>ABCPV1234K</td></tr>
<tr><td>UAN</td><td>100987654321</td><td>Bank A/c</td><td>XXXXXXXX4321</td></tr>
<tr><td>Days in month</td><td>31</td><td>LOP days</td><td>0</td></tr></table><br>
<table><tr><th>Earnings</th><th>Amount (Rs.)</th><th>Deductions</th><th>Amount (Rs.)</th></tr>
<tr><td>Basic</td><td class="r">42,500.00</td><td>Provident Fund</td><td class="r">5,100.00</td></tr>
<tr><td>House Rent Allowance</td><td class="r">21,250.00</td><td>Professional Tax</td><td class="r">208.00</td></tr>
<tr><td>Special Allowance</td><td class="r">18,730.00</td><td>Income Tax (TDS)</td><td class="r">7,420.00</td></tr>
<tr><td>LTA</td><td class="r">3,000.00</td><td>Group Health Insurance</td><td class="r">650.00</td></tr>
<tr><td>Internet reimbursement</td><td class="r">1,000.00</td><td></td><td></td></tr>
<tr><th>Gross Earnings</th><th class="r">86,480.00</th><th>Total Deductions</th><th class="r">13,378.00</th></tr></table>
<p style="font-size:13pt"><b>Net Pay: Rs. 73,102.00</b> (Rupees Seventy-Three Thousand One Hundred Two Only)</p>
<p style="font-size:8pt;color:#555">This is a system generated payslip and does not require a signature.</p></div>`,
  '',
  'Payslip Aug 2026',
);

// 7. Form 16 Part B, multi-page with many tables
{
  const sec = (title, rows) => `<tr><th colspan="4" style="background:#d9e2f3">${title}</th></tr>` + rows.map(([a, b, c]) => `<tr><td>${a}</td><td>${b}</td><td class="r">${c ?? ''}</td><td></td></tr>`).join('');
  const s = [
    ['1.', 'Gross Salary', ''],
    ['(a)', 'Salary as per provisions contained in section 17(1)', '10,37,760.00'],
    ['(b)', 'Value of perquisites under section 17(2)', '0.00'],
    ['(c)', 'Profits in lieu of salary under section 17(3)', '0.00'],
    ['(d)', 'Total', '10,37,760.00'],
    ['2.', 'Less: Allowances to the extent exempt under section 10', ''],
    ['(a)', 'Travel concession or assistance under section 10(5)', '18,000.00'],
    ['(e)', 'House rent allowance under section 10(13A)', '1,02,000.00'],
    ['3.', 'Total amount of salary received from current employer', '9,17,760.00'],
    ['4.', 'Less: Deductions under section 16', ''],
    ['(a)', 'Standard deduction under section 16(ia)', '50,000.00'],
    ['(c)', 'Tax on employment under section 16(iii)', '2,500.00'],
    ['5.', 'Income chargeable under the head "Salaries"', '8,65,260.00'],
  ];
  const c = [
    ['(a)', 'Deduction in respect of life insurance premia, contributions to provident fund etc. under section 80C', '1,50,000.00'],
    ['(b)', 'Deduction in respect of contribution to certain pension funds under section 80CCC', '0.00'],
    ['(d)', 'Deduction in respect of contribution by taxpayer to notified pension scheme under section 80CCD (1B)', '50,000.00'],
    ['(f)', 'Deduction in respect of health insurance premia under section 80D', '25,000.00'],
    ['(g)', 'Deduction in respect of interest on loan taken for higher education under section 80E', '0.00'],
    ['(k)', 'Deduction in respect of interest on deposits in savings account under section 80TTA', '4,312.00'],
  ];
  let quarters = '';
  ['Q1', 'Q2', 'Q3', 'Q4'].forEach((q, i) => (quarters += `<tr><td>${q}</td><td>QVWERTY${i}A</td><td class="r">2,59,440.00</td><td class="r">${inr(9800 + i * 450)}</td><td class="r">${inr(9800 + i * 450)}</td></tr>`));
  docs['form16'] = base(
    `<div style="padding:10px 0"><h3 style="text-align:center">FORM NO. 16<br>[See rule 31(1)(a)]<br>PART A</h3>
<p style="text-align:center">Certificate under section 203 of the Income-tax Act, 1961 for tax deducted at source on salary paid to an employee</p>
<table><tr><td>Certificate No. KLTPQ12</td><td>Last updated on 12-Jun-2026</td></tr>
<tr><td>Name and address of the Employer<br><b>TEJAS SOFTWARE SERVICES LLP</b><br>INFOPARK PHASE II, KAKKANAD, KOCHI - 682042</td><td>Name and address of the Employee<br><b>NIKHIL VARGHESE</b><br>PULIKKAL HOUSE, ALUVA - 683101</td></tr>
<tr><td>PAN of the Deductor: AAKFT1234Q &nbsp; TAN: CHNT01234E</td><td>PAN of the Employee: ABCPV1234K</td></tr>
<tr><td>Assessment Year 2026-27</td><td>Period with the Employer: 01-Apr-2025 to 31-Mar-2026</td></tr></table>
<h4>Summary of amount paid/credited and tax deducted at source thereon in respect of the employee</h4>
<table><tr><th>Quarter</th><th>Receipt Numbers of original quarterly statements</th><th>Amount paid/credited</th><th>Amount of tax deducted</th><th>Amount of tax deposited/remitted</th></tr>${quarters}</table>
<h3 style="text-align:center;break-before:page">PART B (Annexure)<br>Details of Salary Paid and any other income and tax deducted</h3>
<table><thead><tr><th style="width:6%"></th><th>Particulars</th><th style="width:18%">Rs.</th><th style="width:14%">Rs.</th></tr></thead><tbody>${sec('Salary', s)}${sec('Deductions under Chapter VI-A', c)}
${sec('Tax computation', [['12.', 'Total taxable income', '6,35,948.00'], ['13.', 'Tax on total income', '38,595.00'], ['14.', 'Rebate under section 87A, if applicable', '0.00'], ['15.', 'Surcharge, wherever applicable', '0.00'], ['16.', 'Health and education cess', '1,544.00'], ['17.', 'Tax payable', '40,139.00'], ['18.', 'Less: Relief under section 89', '0.00'], ['19.', 'Net tax payable', '40,139.00']])}</tbody></table>
<h4>Verification</h4><p>I, ANITA THOMAS, son/daughter of K. THOMAS working in the capacity of PARTNER (designation) do hereby certify that the information given above is true, complete and correct and is based on the books of account, documents, TDS statements, and other available records.</p>
<p>Place: KOCHI &nbsp;&nbsp; Date: 12-Jun-2026 &nbsp;&nbsp;&nbsp;&nbsp; (Signature of person responsible for deduction of tax)<br>Full Name: ANITA THOMAS</p></div>`,
    'td,th{font-size:9pt} @page{size:A4;margin:14mm}',
    'Form 16',
  );
}

// 8. Exam admit card with photo, Hindi
docs['admit-card'] = base(
  `<div style="padding:24px"><div style="border:2px solid #000;padding:14px">
<div style="text-align:center"><div style="font-family:NotoDeva;font-size:14pt">राष्ट्रीय प्रवेश परीक्षा परिषद (काल्पनिक)</div><b style="font-size:14pt">National Entrance Testing Council (fictional)</b><br>ADMIT CARD — Common Entrance Test 2026</div>
<div style="display:flex;gap:14px;margin-top:12px"><table style="flex:1">
<tr><th>Roll Number</th><td>2614 0098 5521</td></tr><tr><th>Application No.</th><td>260310004478</td></tr>
<tr><th>Candidate's Name</th><td>ADITYA SHARMA</td></tr><tr><th>Father's Name</th><td>RAKESH SHARMA</td></tr>
<tr><th>Date of Birth</th><td>17/02/2008</td></tr><tr><th>Category</th><td>GEN-EWS</td></tr>
<tr><th>Exam Date</th><td>24/10/2026 (Saturday)</td></tr><tr><th>Reporting Time</th><td>07:30 AM</td></tr><tr><th>Gate Closing Time</th><td>08:30 AM</td></tr>
<tr><th>Test Centre</th><td>TC 1123 — Govt. Model Higher Secondary School, Pattom, Thiruvananthapuram</td></tr></table>
<div style="text-align:center">${photoSvg(110, 134)}<div style="border:1px solid #000;height:40px;margin-top:6px;font-size:8pt">Candidate's signature</div>${qr(21, 100)}</div></div>
<h4 style="font-family:NotoDeva">परीक्षार्थियों के लिए महत्वपूर्ण निर्देश / Important instructions</h4>
<ol style="font-size:9pt"><li>Bring this admit card and one original photo ID (Aadhaar, passport, driving licence, voter ID).</li>
<li style="font-family:NotoDeva">परीक्षा केंद्र में मोबाइल फोन, कैलकुलेटर या कोई भी इलेक्ट्रॉनिक उपकरण ले जाना सख्त मना है।</li>
<li>Candidates will not be allowed to enter after the gate closing time under any circumstances.</li>
<li style="font-family:NotoDeva">उत्तर पुस्तिका पर केवल काले बॉल पॉइंट पेन का प्रयोग करें।</li></ol></div></div>`,
  'th{width:30%;background:#f4f4f4}',
  'Admit card',
);

// 9. Certificate, landscape, decorative, Malayalam + English
docs['certificate'] = base(
  `<div style="margin:18px;border:10px double #8a5a00;height:calc(100vh - 56px);padding:30px;box-sizing:border-box;text-align:center;background:radial-gradient(circle,#fffdf5,#f5e9c8)">
<div style="font-family:NotoMl;font-size:20pt;color:#7a1f2b">പ്രശസ്തി പത്രം</div>
<div style="font-family:'Liberation Serif';font-size:34pt;color:#7a1f2b;letter-spacing:3px">CERTIFICATE OF MERIT</div>
<p style="font-size:14pt;margin-top:24px">This is to certify that</p>
<div style="font-family:'Liberation Serif';font-size:28pt;font-style:italic;border-bottom:1px solid #8a5a00;display:inline-block;padding:0 40px">Anagha Suresh</div>
<p style="font-size:14pt">of Class X-B secured <b>First Prize</b> in the District Level Science Exhibition 2026<br>held at Kozhikode on 22 August 2026.</p>
<p style="font-family:NotoMl;font-size:13pt">ജില്ലാതല ശാസ്ത്രമേളയിൽ ഒന്നാം സ്ഥാനം നേടിയതിന് അഭിനന്ദനങ്ങൾ.</p>
<div style="display:flex;justify-content:space-around;margin-top:50px"><div>__________________<br>Principal</div><div><svg width="90" height="90"><circle cx="45" cy="45" r="40" fill="none" stroke="#7a1f2b" stroke-width="3"/><circle cx="45" cy="45" r="30" fill="none" stroke="#7a1f2b"/><text x="45" y="50" font-size="11" text-anchor="middle" fill="#7a1f2b">SEAL</text></svg></div><div>__________________<br>Convenor</div></div></div>`,
  '@page{size:A4 landscape;margin:0}',
  'Certificate',
);

// 10. Malayalam letter (long text)
{
  const para = 'കേരളത്തിലെ ഗ്രാമപ്രദേശങ്ങളിൽ കുടിവെള്ള വിതരണം മെച്ചപ്പെടുത്തുന്നതിനുള്ള പദ്ധതിയുടെ രണ്ടാം ഘട്ടം ഈ വർഷം ആരംഭിക്കും. പഞ്ചായത്ത് തലത്തിൽ രൂപീകരിക്കുന്ന സമിതികൾ ഓരോ വാർഡിലെയും ആവശ്യങ്ങൾ വിലയിരുത്തി റിപ്പോർട്ട് സമർപ്പിക്കണം. ';
  docs['malayalam-letter'] = base(
    `<div style="padding:40px;font-family:NotoMl;font-size:12pt;line-height:1.7">
<div style="text-align:right">തീയതി: 02-09-2026</div>
<p>സ്വീകർത്താവ്,<br>സെക്രട്ടറി,<br>ഗ്രാമ പഞ്ചായത്ത് ഓഫീസ്,<br>കുമരകം, കോട്ടയം.</p>
<p><b>വിഷയം: കുടിവെള്ള പദ്ധതി — അപേക്ഷ സംബന്ധിച്ച്</b></p>
<p>സർ,</p>${Array.from({ length: 9 }, (_, i) => `<p>${i + 1}. ${para.repeat(2 + (i % 3))}</p>`).join('')}
<p>എന്ന് വിശ്വസ്തതയോടെ,<br><br>രാജീവ് മാധവൻ<br>വാർഡ് 7, കുമരകം</p>
<p style="font-family:'Liberation Sans'">Copy to: Assistant Engineer, Water Authority (fictional), Kottayam.</p></div>`,
    '',
    'Malayalam letter',
  );
}

// 11. Hindi notice
{
  const p = 'सभी निवासियों को सूचित किया जाता है कि सोसायटी की वार्षिक आम बैठक रविवार, 18 अक्टूबर 2026 को सुबह 10 बजे सामुदायिक भवन में आयोजित की जाएगी। बैठक में रखरखाव शुल्क, पार्किंग नियम और सुरक्षा व्यवस्था पर चर्चा होगी। ';
  docs['hindi-notice'] = base(
    `<div style="padding:40px;font-family:NotoDeva;font-size:12pt;line-height:1.8"><h1 style="text-align:center">सूचना</h1><h3 style="text-align:center;font-family:'Liberation Sans'">Gulmohar Residency Welfare Association (fictional), Pune</h3>
${Array.from({ length: 6 }, () => `<p>${p.repeat(2)}</p>`).join('')}
<table style="font-family:NotoDeva"><tr><th>क्रम</th><th>विषय</th><th>प्रस्तुतकर्ता</th></tr><tr><td>1</td><td>पिछली बैठक के कार्यवृत्त की पुष्टि</td><td>सचिव</td></tr><tr><td>2</td><td>वार्षिक लेखा 2025-26</td><td>कोषाध्यक्ष</td></tr><tr><td>3</td><td>नई समिति का चुनाव</td><td>अध्यक्ष</td></tr></table>
<p style="text-align:right">आज्ञा से,<br>सचिव</p></div>`,
    '',
    'सूचना',
  );
}

// 12. Rent agreement, multi-page with numbered clauses
{
  const clauses = [
    'The Lessee shall pay a monthly rent of Rs. 18,000/- (Rupees Eighteen Thousand only) on or before the 5th day of every English calendar month, by bank transfer to the account of the Lessor.',
    'The Lessee has paid a sum of Rs. 1,00,000/- (Rupees One Lakh only) as an interest-free refundable security deposit, which shall be returned at the time of vacating the premises after deducting arrears, if any.',
    'The tenancy shall be for a period of eleven (11) months commencing from 01-10-2026 and may be renewed by mutual consent with an increase of five percent in the monthly rent.',
    'The Lessee shall pay the electricity and water charges as per the bills raised by the authorities, directly and promptly, and shall hand over the paid receipts to the Lessor whenever demanded.',
    'The Lessee shall not sub-let, assign or part with the possession of the premises or any part thereof to any other person without the written consent of the Lessor.',
    'The Lessee shall use the premises for residential purposes only and shall not store any hazardous or illegal goods.',
    'The Lessee shall keep the premises in good and tenantable condition and shall not make any structural alterations without the written consent of the Lessor.',
    'The Lessor or his authorised agent shall have the right to inspect the premises at reasonable hours with prior notice.',
    'Either party may terminate this agreement by giving one month notice in writing to the other party.',
    'On expiry or termination, the Lessee shall hand over vacant and peaceful possession of the premises to the Lessor in the same condition as it was let out, subject to normal wear and tear.',
    'The fittings and fixtures listed in the schedule annexed hereto are provided by the Lessor and shall be returned in good condition.',
    'Any dispute arising out of this agreement shall be subject to the jurisdiction of the courts at Ernakulam.',
  ];
  docs['rent-agreement'] = base(
    `<div style="font-family:'Liberation Serif';font-size:12.5pt;line-height:1.75;text-align:justify">
<div style="border:2px dashed #2a6f2a;height:200px;text-align:center;color:#2a6f2a;padding-top:40px;margin-bottom:20px;background:#eef7ee">INDIA NON JUDICIAL<br><b style="font-size:20pt">KERALA — e-STAMP (specimen)</b><br>Certificate No. IN-KL00000000000000X &nbsp; Rs. 200</div>
<h2 style="text-align:center;text-decoration:underline">RENTAL AGREEMENT</h2>
<p>This Rental Agreement is made and executed at Ernakulam on this the 25th day of September 2026 by and between <b>Mr. JOSEPH MATHEW</b>, aged 64 years, S/o Late Mathew Joseph, residing at Kallarakkal House, Panampilly Nagar, Ernakulam (hereinafter called the LESSOR, which expression shall wherever the context so admits mean and include his heirs, legal representatives, executors and assigns) of the ONE PART;</p>
<p>AND <b>Ms. ANJALI MENON</b>, aged 31 years, D/o Mr. Krishna Menon, permanent address Sreevilas, Thrissur (hereinafter called the LESSEE) of the OTHER PART.</p>
<p>WHEREAS the Lessor is the absolute owner of the residential flat bearing No. 4B, Second Floor, Skyline Palm Court (fictional), Panampilly Nagar, Ernakulam 682036, and the Lessee has approached the Lessor to take the said premises on rent, and the Lessor has agreed to let out the same on the following terms and conditions:</p>
<h3>NOW THIS AGREEMENT WITNESSETH AS FOLLOWS:</h3><ol>${clauses.map((c) => `<li>${c}</li>`).join('')}</ol>
<h3 style="text-align:center">SCHEDULE</h3><table><tr><th>Item</th><th>Quantity</th></tr><tr><td>Ceiling fans</td><td>4</td></tr><tr><td>Tube lights</td><td>6</td></tr><tr><td>Wardrobes</td><td>2</td></tr><tr><td>Geyser</td><td>1</td></tr></table>
<p>IN WITNESS WHEREOF the parties hereto have signed this agreement on the day, month and year first above written.</p>
<table style="border:none"><tr><td style="border:none">LESSOR<br><br><br>(JOSEPH MATHEW)</td><td style="border:none;text-align:right">LESSEE<br><br><br>(ANJALI MENON)</td></tr></table>
<p>WITNESSES:<br>1. ______________________<br>2. ______________________</p></div>`,
    '@page{size:A4;margin:22mm 20mm}',
    'Rental Agreement',
  );
}

// 13. Web article with images, links, headings (Chromium makes link annotations; tagged + outline)
docs['web-article'] = base(
  `<article style="padding:20px 30px;font-family:'DejaVu Serif';line-height:1.6">
<h1>How to read your electricity bill</h1><p><i>By the Consumer Desk · 4 minute read</i></p>
<p>Your bi-monthly bill packs a lot into one page. This guide walks through each box, from the tariff code to the fuel surcharge, so you can check that you were charged correctly. See the <a href="https://example.org/tariffs">official tariff order</a> for the full rate card.</p>
<figure><svg width="520" height="200"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#ffcc80"/><stop offset="1" stop-color="#4fc3f7"/></linearGradient></defs><rect width="520" height="200" fill="url(#g)"/><circle cx="420" cy="70" r="40" fill="#fff59d"/><path d="M0 160 Q130 100 260 150 T520 140 V200 H0Z" fill="#2e7d32"/></svg><figcaption>A typical bill, front side.</figcaption></figure>
<h2>1. The consumer number</h2><p>The thirteen-digit consumer number identifies your connection. You will need it to pay online, to register a complaint and to apply for a load change. Keep it handy; it never changes even when the meter is replaced.</p>
<h2>2. Readings and units</h2><p>The present reading minus the previous reading gives the units consumed during the billing period. If the meter was faulty, the bill will say "average" and the units are estimated from your past consumption.</p>
<ul><li>Check the meter number matches the one on your wall.</li><li>Check the reading date is recent.</li><li>Photograph the meter on the reading day if you are unsure.</li></ul>
<h2>3. Slabs and the telescopic tariff</h2><p>Domestic tariffs are charged in slabs: the first 50 units at one rate, the next 50 at a higher rate, and so on. Above 250 units a month, the whole consumption is charged at a single non-telescopic rate, which is why crossing that line costs more than you might expect.</p>
<table><tr><th>Units per month</th><th>Rate (Rs./unit)</th></tr><tr><td>0 – 50</td><td>3.25</td></tr><tr><td>51 – 100</td><td>4.05</td></tr><tr><td>101 – 150</td><td>5.10</td></tr><tr><td>151 – 200</td><td>6.95</td></tr><tr><td>201 – 250</td><td>8.20</td></tr></table>
<h2>4. Duty, surcharge and rent</h2><p>Electricity duty is a state tax, charged as a percentage of the energy charge. The fuel surcharge passes through changes in the cost of power purchase. Meter rent is a small fixed amount for the meter itself. Questions? Write to <a href="mailto:desk@example.org">desk@example.org</a>.</p>
<h2>5. Paying on time</h2><p>Pay before the due date to avoid a surcharge; after the disconnection date the supply may be cut and a reconnection fee charged. Most banks and UPI apps can pay the bill directly when you enter the consumer number.</p>
<p style="break-before:page">Related reading: <a href="https://example.org/solar">Rooftop solar and net metering</a>, <a href="https://example.org/subsidy">Who gets the subsidy</a>.</p></article>`,
  '',
  'How to read your electricity bill',
);

// 14. ID card (credit-card size page) — fictional "Unique ID" card front and back
docs['id-card'] = base(
  `<div class="card" style="background:linear-gradient(#fff 0,#fff 70%,#f2f2f2)"><div style="background:#ff9933;height:8px"></div><div style="padding:6px 10px;font-size:7pt"><b style="font-size:9pt">Specimen Resident Identity Card (fictional)</b>
<div style="display:flex;gap:8px;margin-top:6px">${photoSvg(56, 68)}<div>Name: <b>Fathima Beevi K</b><br><span style="font-family:NotoMl">ഫാത്തിമ ബീവി കെ</span><br>DOB: 09/11/1988<br>Female / <span style="font-family:NotoMl">സ്ത്രീ</span></div></div>
<div style="font-size:13pt;text-align:center;margin-top:8px;letter-spacing:2px"><b>0000 1111 2222</b></div></div><div style="background:#138808;height:8px;position:absolute;bottom:0;width:100%"></div></div>
<div class="card" style="break-before:page"><div style="padding:8px 10px;font-size:7pt">Address: W/O Abdul Rahman, Kunnath House, Near Juma Masjid, Tirur, Malappuram, Kerala - 676101<br><span style="font-family:NotoMl">വിലാസം: കുന്നത്ത് വീട്, ജുമാ മസ്ജിദിന് സമീപം, തിരൂർ, മലപ്പുറം</span><div style="display:flex;justify-content:space-between;align-items:end;margin-top:4px"><b style="font-size:12pt">0000 1111 2222</b>${qr(21, 60)}</div></div></div>`,
  '@page{size:85.6mm 54mm;margin:0} .card{position:relative;width:85.6mm;height:54mm;overflow:hidden;border-radius:3mm}',
  'ID card',
);

// 15. PAN-like card
docs['pan-card'] = base(
  `<div style="width:85.6mm;height:54mm;background:linear-gradient(135deg,#cde7f7,#f8f1d8);position:relative;font-size:7pt;padding:6px 10px;box-sizing:border-box">
<div style="display:flex;justify-content:space-between"><b>TAX ACCOUNT CARD (specimen)</b><b>FICTIONAL DEPT.</b></div>
<div style="display:flex;justify-content:space-between;margin-top:6px"><div>Permanent Account Number<br><b style="font-size:11pt;letter-spacing:1px">ABCDE1234F</b><br><br>Name<br><b>RAVI SHANKAR PILLAI</b><br>Father's Name<br><b>SHANKAR PILLAI</b><br>Date of Birth<br><b>23/04/1979</b></div><div>${photoSvg(54, 66)}<br>${qr(17, 50)}</div></div></div>`,
  '@page{size:85.6mm 54mm;margin:0}',
  'PAN',
);

// 16. Marksheet / grade card
{
  const subj = [['English', 'A1', 92], ['Malayalam', 'A1', 95], ['Hindi', 'A2', 84], ['Mathematics', 'A1', 98], ['Physics', 'A2', 88], ['Chemistry', 'A1', 91], ['Biology', 'B1', 77], ['Computer Science', 'A1', 99]];
  docs['marksheet'] = base(
    `<div style="padding:30px;background:repeating-linear-gradient(45deg,#fdfbf3,#fdfbf3 12px,#f6f1df 12px,#f6f1df 24px);min-height:1050px">
<div style="text-align:center;border-bottom:2px solid #333"><h2 style="margin:4px">BOARD OF HIGHER SECONDARY EXAMINATIONS (fictional)</h2><div style="font-family:NotoMl">ഹയർ സെക്കൻഡറി പരീക്ഷാ ബോർഡ്</div><h3>MARKS CERTIFICATE — MARCH 2026</h3></div>
<table style="margin-top:14px;background:#fff"><tr><th>Name</th><td>SREELAKSHMI P R</td><th>Register No.</th><td>2611042</td></tr><tr><th>School</th><td colspan="3">GHSS Chalakudy (fictional)</td></tr></table>
<table style="margin-top:14px;background:#fff"><tr><th>Subject</th><th>Max</th><th>Marks</th><th>Grade</th></tr>${subj.map(([s, g, m]) => `<tr><td>${s}</td><td class="r">100</td><td class="r">${m}</td><td>${g}</td></tr>`).join('')}
<tr><th>Total</th><th class="r">800</th><th class="r">724</th><th>A1</th></tr></table><p>Result: <b>ELIGIBLE FOR HIGHER STUDIES</b></p></div>`,
    '@page{margin:0}',
    'Marks certificate',
  );
}

// 17. Lab report
docs['lab-report'] = base(
  `<div style="padding:28px"><div style="display:flex;justify-content:space-between;border-bottom:2px solid #00796b"><div><h2 style="color:#00796b;margin:0">Nila Diagnostics (fictional)</h2><div>NABL-style lab · Palakkad</div></div>${qr(21, 70)}</div>
<table style="margin:10px 0"><tr><td>Patient: <b>Mr. Unnikrishnan K</b></td><td>Age/Sex: 67 Y / M</td><td>Sample ID: ND2609114</td></tr><tr><td>Ref. by: Dr. S. Ramesh</td><td>Collected: 08/09/2026 07:42</td><td>Reported: 08/09/2026 13:10</td></tr></table>
<h3>COMPLETE BLOOD COUNT</h3><table><tr><th>Test</th><th>Result</th><th>Unit</th><th>Biological reference interval</th></tr>
<tr><td>Haemoglobin</td><td><b>12.1 L</b></td><td>g/dL</td><td>13.0 – 17.0</td></tr><tr><td>Total WBC count</td><td>7,800</td><td>cells/µL</td><td>4,000 – 10,000</td></tr><tr><td>Platelet count</td><td>2.4</td><td>lakh/µL</td><td>1.5 – 4.1</td></tr><tr><td>ESR</td><td><b>28 H</b></td><td>mm/hr</td><td>0 – 20</td></tr></table>
<h3>LIPID PROFILE</h3><table><tr><th>Test</th><th>Result</th><th>Unit</th><th>Reference</th></tr><tr><td>Total cholesterol</td><td>212</td><td>mg/dL</td><td>&lt; 200</td></tr><tr><td>HDL cholesterol</td><td>41</td><td>mg/dL</td><td>&gt; 40</td></tr><tr><td>LDL cholesterol</td><td>138</td><td>mg/dL</td><td>&lt; 100</td></tr><tr><td>Triglycerides</td><td>165</td><td>mg/dL</td><td>&lt; 150</td></tr></table>
<p style="margin-top:30px">— End of report —</p><p style="text-align:right">Dr. Leena Joseph, MD (Path)<br>Consultant Pathologist</p></div>`,
  '',
  'Lab report',
);

// 18. Boarding pass with barcode
{
  let bars = '';
  for (let i = 0; i < 90; i++) if (rnd() > 0.45) bars += `<rect x="${i * 3}" y="0" width="${1 + Math.floor(rnd() * 2)}" height="50"/>`;
  docs['boarding-pass'] = base(
    `<div style="margin:30px;border:1px solid #333;border-radius:12px;overflow:hidden"><div style="background:#5b2c83;color:#fff;padding:10px 16px;font-size:14pt"><b>BOARDING PASS</b> · Konkan Air (fictional)</div>
<div style="display:flex;padding:14px;gap:20px"><div style="flex:2"><div>Passenger<br><b>MR NAVEEN JOSE</b></div><div style="display:flex;gap:40px;margin-top:10px;font-size:18pt"><div><b>COK</b><br><span style="font-size:9pt">Kochi</span></div><div>&#9992;</div><div><b>DXB</b><br><span style="font-size:9pt">Dubai</span></div></div>
<table style="margin-top:10px"><tr><th>Flight</th><th>Date</th><th>Boarding</th><th>Gate</th><th>Seat</th><th>Zone</th></tr><tr><td>KA 431</td><td>02 NOV</td><td>21:10</td><td>5</td><td>23C</td><td>3</td></tr></table></div>
<div style="flex:1;border-left:2px dashed #999;padding-left:14px">NAVEEN JOSE<br>KA 431 COK-DXB<br>Seat 23C<br><svg width="270" height="50">${bars}</svg></div></div></div>`,
    '@page{size:A4 landscape}',
    'Boarding pass',
  );
}

// 19. Insurance policy schedule (dense small print, 2 pages)
{
  const terms = Array.from({ length: 30 }, (_, i) => `<p><b>${i + 1}.</b> The Company shall not be liable to make any payment under this policy in respect of any expenses whatsoever incurred by any Insured Person in connection with or in respect of pre-existing diseases until ${12 + i} months of continuous coverage have elapsed since inception of the first policy with the Company, subject to the waiting periods specified in the schedule.</p>`).join('');
  docs['insurance-policy'] = base(
    `<div style="padding:24px"><h2>Health Insurance Policy Schedule (fictional insurer)</h2><table><tr><th>Policy No.</th><td>HLT/26/0099887766</td><th>Period</th><td>01/10/2026 to 30/09/2027</td></tr><tr><th>Proposer</th><td>Thomas Kurian</td><th>Sum insured</th><td>Rs. 10,00,000</td></tr><tr><th>Premium</th><td>Rs. 24,780 (incl. GST)</td><th>Plan</th><td>Family Floater</td></tr></table>
<h3>Insured persons</h3><table><tr><th>Name</th><th>Relation</th><th>DOB</th><th>Pre-existing</th></tr><tr><td>Thomas Kurian</td><td>Self</td><td>12/03/1975</td><td>Hypertension</td></tr><tr><td>Mini Thomas</td><td>Spouse</td><td>02/08/1979</td><td>None</td></tr><tr><td>Alan Thomas</td><td>Son</td><td>21/01/2008</td><td>None</td></tr></table>
<h3>Terms and exclusions</h3><div style="columns:2;font-size:7.5pt;text-align:justify">${terms}</div></div>`,
    '',
    'Policy schedule',
  );
}

// 20. Letter-size US style invoice (Letter paper)
docs['letter-invoice'] = base(
  `<div style="padding:40px"><h1>INVOICE</h1><p>Bluewater Freelance Studio (fictional)<br>2200 Market St, San Francisco CA</p><p>Bill to: Kochi Spice Exports (fictional)</p>
<table><tr><th>Description</th><th>Hours</th><th>Rate</th><th>Amount</th></tr><tr><td>Website redesign</td><td class="r">32</td><td class="r">$85.00</td><td class="r">$2,720.00</td></tr><tr><td>Copywriting</td><td class="r">10</td><td class="r">$60.00</td><td class="r">$600.00</td></tr><tr><th colspan="3">Total due</th><th class="r">$3,320.00</th></tr></table><p>Payment due within 30 days. Thank you!</p></div>`,
  '@page{size:Letter}',
  'Invoice 1042',
);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const page = await browser.newPage();
for (const [name, html] of Object.entries(docs)) {
  const file = join(HTML, `${name}.html`);
  writeFileSync(file, html);
  await page.goto(`file://${file}`);
  await page.evaluate(() => document.fonts.ready);
  const opts = { path: join(OUT, `chrome-${name}.pdf`), printBackground: true, preferCSSPageSize: true };
  if (name === 'web-article') Object.assign(opts, { tagged: true, outline: true, displayHeaderFooter: true, headerTemplate: '<div style="font-size:8px;width:100%;text-align:center">Consumer Desk</div>', footerTemplate: '<div style="font-size:8px;width:100%;text-align:center"><span class="pageNumber"></span> / <span class="totalPages"></span></div>', margin: { top: '20mm', bottom: '20mm' } });
  if (name === 'bank-statement') Object.assign(opts, { displayHeaderFooter: true, headerTemplate: '<div></div>', footerTemplate: '<div style="font-size:8px;width:100%;text-align:right;padding-right:20px">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>', margin: { top: '12mm', bottom: '16mm', left: '8mm', right: '8mm' } });
  await page.pdf(opts);
  // A few also as screenshots: phone photos and scans are made from these.
  await page.setViewportSize({ width: 900, height: 1270 });
  await page.screenshot({ path: join(GEN, 'shots', `${name}.png`), fullPage: false }).catch(() => undefined);
  console.log('ok', name);
}
await browser.close();
