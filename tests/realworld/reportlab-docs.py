# Documents the way many bank and government back offices make them: ReportLab, standard fonts not embedded.
import datetime, os, random, re, subprocess, sys
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.platypus import LongTable, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

RW = sys.argv[1]
P = lambda n: os.path.join(RW, 'pdf', n)
rng = random.Random(11)
ss = getSampleStyleSheet()

# 1. A long bank statement, table across pages with the header repeated, "Page x of y" in the footer.
class Numbered(canvas.Canvas):
    def __init__(self, *a, **k):
        super().__init__(*a, **k); self._pages = []
    def showPage(self):
        self._pages.append(dict(self.__dict__)); self._startPage()
    def save(self):
        n = len(self._pages)
        for st in self._pages:
            self.__dict__.update(st)
            self.setFont('Helvetica', 7); self.drawRightString(200 * mm, 8 * mm, f'Page {self._pageNumber} of {n}')
            self.drawString(10 * mm, 8 * mm, 'Kuttanad Gramin Bank (fictional) · This is a computer generated statement')
            super().showPage()
        super().save()
small = ss['BodyText'].clone('small', fontSize=7, leading=8.5)
rows = [['Txn Date', 'Value Date', 'Description', 'Ref No.', 'Debit', 'Credit', 'Balance']]
bal = 15234.10
for i in range(420):
    d = datetime.date(2025, 4, 1) + datetime.timedelta(days=i * 365 // 420)
    cr = rng.random() < 0.25
    amt = round(rng.uniform(20, 30000 if cr else 4000), 2)
    bal += amt if cr else -amt
    desc = rng.choice(['TO TRANSFER-UPI/DR/{n}/ZOMATO/HDFC/zomato@hdfcbank', 'BY TRANSFER-NEFT*SBIN0001234*SALARY', 'ATM WDL-ATM CASH {n} KOTTAYAM', 'TO TRANSFER-INB IMPS{n}/9847000000/XX1234/rent', 'DEBIT-ACHDr NACH00000000{n} BAJAJ FINANCE', 'BY CASH DEPOSIT-CDM {n}', 'CHARGES-SMS ALERT CHGS Q1'])
    rows.append([d.strftime('%d %b %Y'), d.strftime('%d %b %Y'), Paragraph(desc.replace('{n}', str(rng.randint(10**8, 10**9))), small), str(rng.randint(10**5, 10**6)), '' if cr else f'{amt:,.2f}', f'{amt:,.2f}' if cr else '', f'{bal:,.2f}'])
doc = SimpleDocTemplate(P('rl-bank-statement-long.pdf'), pagesize=A4, leftMargin=10 * mm, rightMargin=10 * mm, topMargin=12 * mm, bottomMargin=14 * mm, title='Statement of Account', author='Core Banking', creator='Statement batch job')
t = LongTable(rows, repeatRows=1, colWidths=[20 * mm, 20 * mm, 62 * mm, 24 * mm, 20 * mm, 20 * mm, 24 * mm])
t.setStyle(TableStyle([('FONT', (0, 0), (-1, -1), 'Helvetica', 7), ('FONT', (0, 0), (-1, 0), 'Helvetica-Bold', 7), ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#dfe8f0')), ('ALIGN', (4, 1), (-1, -1), 'RIGHT'), ('LINEBELOW', (0, 0), (-1, -1), 0.25, colors.grey), ('VALIGN', (0, 0), (-1, -1), 'TOP')]))
story = [Paragraph('Kuttanad Gramin Bank (fictional)', ss['Title']), Paragraph('Account statement: SAJAN P. JOHN · A/c 3021 0045 7788 · 01 Apr 2025 to 31 Mar 2026', ss['Normal']), Spacer(1, 6), t]
doc.build(story, canvasmaker=Numbered)

# 2. An AcroForm: a KYC update form with text fields, check boxes, radio buttons, a choice list.
c = canvas.Canvas(P('rl-kyc-form.pdf'), pagesize=A4)
c.setTitle('KYC update form')
c.setFont('Helvetica-Bold', 16); c.drawString(25 * mm, 280 * mm, 'KYC Update Form (fictional bank)')
c.setFont('Helvetica', 10)
f = c.acroForm
y = 260
for label, name, w in [('Customer name', 'customer_name', 110), ('Account number', 'account_no', 70), ('PAN', 'pan', 50), ('Mobile', 'mobile', 50), ('Email', 'email', 90), ('Address line 1', 'address1', 120), ('Address line 2', 'address2', 120), ('PIN code', 'pin', 30)]:
    c.drawString(25 * mm, y * mm + 2, label)
    f.textfield(name=name, tooltip=label, x=65 * mm, y=y * mm - 2, width=w * mm, height=7 * mm, borderStyle='underlined', forceBorder=True, fontSize=10)
    y -= 12
c.drawString(25 * mm, y * mm + 2, 'Gender')
for i, v in enumerate(['Female', 'Male', 'Other']):
    f.radio(name='gender', value=v, selected=False, x=(65 + i * 30) * mm, y=y * mm, size=12, buttonStyle='circle', shape='circle')
    c.drawString((70 + i * 30) * mm, y * mm + 2, v)
y -= 12
c.drawString(25 * mm, y * mm + 2, 'Occupation')
f.choice(name='occupation', value='Salaried', options=['Salaried', 'Self-employed', 'Student', 'Retired', 'Homemaker'], x=65 * mm, y=y * mm - 2, width=60 * mm, height=7 * mm)
y -= 14
for name, label in [('nri', 'I am a Non-Resident Indian'), ('pep', 'I am a politically exposed person'), ('declare', 'I declare that the above details are true')]:
    f.checkbox(name=name, x=25 * mm, y=y * mm, size=12, buttonStyle='check', checked=False)
    c.drawString(32 * mm, y * mm + 2, label); y -= 10
c.drawString(25 * mm, 40 * mm, 'Signature: ______________________          Date: ____________')
c.showPage(); c.save()

# 3. Bookmarks, a page with /Rotate 90 (a landscape table printed sideways), and links.
c = canvas.Canvas(P('rl-handbook-rotated.pdf'), pagesize=A4)
c.setTitle('Employee handbook')
for i, ch in enumerate(['Welcome', 'Leave policy', 'Travel and allowances', 'Annexure: holiday list']):
    c.bookmarkPage(f'ch{i}'); c.addOutlineEntry(f'{i + 1}. {ch}', f'ch{i}', level=0)
    if i == 3:
        c.setPageRotation(90)
    c.setFont('Helvetica-Bold', 18); c.drawString(25 * mm, 270 * mm, f'{i + 1}. {ch}')
    c.setFont('Times-Roman', 11)
    ty = 255
    for k in range(18):
        c.drawString(25 * mm, ty * mm, f'Section {i + 1}.{k + 1}: Employees are entitled to the benefits described in this clause from their date of joining.')
        ty -= 7
    if i == 0:
        c.linkURL('https://example.com/policies', (25 * mm, 100 * mm, 120 * mm, 108 * mm), relative=0)
        c.setFillColor(colors.blue); c.drawString(25 * mm, 102 * mm, 'Read the full policy online'); c.setFillColor(colors.black)
    c.showPage()
c.save()

# 4. Pages of different sizes in one file (A4, Legal, A5 landscape) with standard fonts, as an office scanner/merger leaves them.
c = canvas.Canvas(P('rl-mixed-sizes.pdf'))
for size, label in [(A4, 'A4 covering letter'), ((612, 1008), 'Legal-size deed page'), (landscape((419.5, 595.3)), 'A5 landscape receipt')]:
    c.setPageSize(size); c.setFont('Courier', 12)
    c.drawString(40, size[1] - 60, label)
    for k in range(10): c.drawString(40, size[1] - 90 - k * 16, f'Line {k + 1} of the {label.lower()}, typed in Courier.')
    c.rect(20, 20, size[0] - 40, size[1] - 40)
    c.showPage()
c.save()
print('ok')

# 5. A wide table printed sideways on a portrait page (as Word and LaTeX do with a landscape table in a portrait document).
c = canvas.Canvas(P('rl-sideways-table.pdf'), pagesize=A4)
c.setFont('Helvetica-Bold', 14); c.drawString(25 * mm, 280 * mm, 'Annexure II: district-wise collections (fictional)')
c.saveState(); c.translate(30 * mm, 40 * mm); c.rotate(90)
cols = ['District', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Total']
c.setFont('Helvetica-Bold', 9)
for k, h in enumerate(cols): c.drawString(k * 21 * mm, 0, h)
c.setFont('Helvetica', 9)
for r, d in enumerate(['Thiruvananthapuram', 'Kollam', 'Pathanamthitta', 'Alappuzha', 'Kottayam', 'Idukki', 'Ernakulam', 'Thrissur', 'Palakkad', 'Malappuram', 'Kozhikode', 'Wayanad', 'Kannur', 'Kasaragod']):
    y = -(r + 1) * 7 * mm
    c.drawString(0, y, d[:12])
    vals = [rng.randint(100, 999) for _ in range(9)]
    for k, v in enumerate(vals): c.drawRightString((k + 2) * 21 * mm - 3 * mm, y, f'{v}')
    c.drawRightString(11 * 21 * mm - 3 * mm, y, f'{sum(vals):,}')
c.restoreState()
c.setFont('Helvetica', 9); c.drawString(25 * mm, 15 * mm, 'Figures in lakh rupees. Source: fictional board.')
c.showPage(); c.save()
print('ok2')
