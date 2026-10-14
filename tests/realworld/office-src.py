# Makes Word, Excel and PowerPoint sources (fictional data) with python-docx/openpyxl/python-pptx,
# plus flat ODF text files (footnotes, sections in columns, form fields) LibreOffice will turn into docx and PDF.
import datetime, os, random, sys
from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt, Cm, RGBColor
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from pptx import Presentation
from pptx.util import Inches, Pt as PPt
from PIL import Image, ImageDraw

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
random.seed(7)

def photo(path, w=600, h=400, seed=1):
    r = random.Random(seed)
    im = Image.new('RGB', (w, h), (180, 210, 235))
    d = ImageDraw.Draw(im)
    for i in range(h // 2, h):
        d.line([(0, i), (w, i)], fill=(60 + (i * 40) // h, 120 + r.randint(0, 20), 60))
    d.ellipse([w * 0.7, h * 0.1, w * 0.85, h * 0.32], fill=(255, 230, 120))
    for _ in range(60):
        x, y = r.randint(0, w), r.randint(h // 2, h)
        d.ellipse([x, y, x + 12, y + 12], fill=(r.randint(20, 90), r.randint(80, 160), 40))
    im.save(path, quality=88)
    return path

img1 = photo(os.path.join(OUT, 'photo1.jpg'), seed=1)
img2 = photo(os.path.join(OUT, 'photo2.jpg'), 400, 300, seed=2)

def page_number_field(par):
    run = par.add_run()
    for kind, text in (('begin', None), (None, 'PAGE'), ('end', None)):
        if kind:
            el = OxmlElement('w:fldChar'); el.set(qn('w:fldCharType'), kind); run._r.append(el)
        else:
            el = OxmlElement('w:instrText'); el.set(qn('xml:space'), 'preserve'); el.text = text; run._r.append(el)

# ---- 1. Report docx: headers/footers, headings, numbered + bulleted lists, table, picture, landscape section
d = Document()
st = d.styles['Normal']; st.font.name = 'Liberation Serif'; st.font.size = Pt(11)
sec = d.sections[0]
sec.header.paragraphs[0].text = 'Kerala Water Cooperative (fictional) — Annual Report 2025-26'
fp = sec.footer.paragraphs[0]; fp.alignment = WD_ALIGN_PARAGRAPH.CENTER; fp.add_run('Page '); page_number_field(fp)
d.add_heading('Annual Report 2025-26', 0)
d.add_paragraph('Prepared for the general body meeting held on 28 September 2026 at the cooperative hall, Aluva.')
d.add_heading('1. Overview', 1)
for i in range(3):
    d.add_paragraph('The cooperative supplied treated water to 4,212 households across eleven wards during the year, an increase of nine percent over the previous year. Collections improved after the switch to UPI payments, and the arrears older than six months fell by a third. ' * 2)
d.add_heading('2. Highlights', 1)
for t in ['New 2 lakh litre overhead tank commissioned at Desom', 'Leak detection survey covered 38 km of pipeline', 'Two solar pumps replaced diesel sets', 'Customer complaints resolved within 48 hours: 91%']:
    d.add_paragraph(t, style='List Bullet')
d.add_heading('3. Decisions sought', 1)
for t in ['Approve the audited accounts for 2025-26.', 'Approve the revised tariff from 1 January 2027.', 'Elect two members to the managing committee.']:
    d.add_paragraph(t, style='List Number')
d.add_heading('4. Accounts summary', 1)
tb = d.add_table(rows=1, cols=4); tb.style = 'Table Grid'
for c, h in zip(tb.rows[0].cells, ['Head', '2024-25 (Rs.)', '2025-26 (Rs.)', 'Change']):
    c.text = h
for row in [('Water charges', '38,40,000', '42,15,500', '+9.8%'), ('Connection fees', '2,10,000', '2,95,000', '+40.5%'), ('Electricity', '11,20,400', '9,86,300', '-12.0%'), ('Salaries', '14,60,000', '15,30,000', '+4.8%'), ('Surplus', '6,12,300', '8,44,700', '+38.0%')]:
    cells = tb.add_row().cells
    for c, v in zip(cells, row): c.text = v
d.add_paragraph()
d.add_picture(img1, width=Cm(12))
cap = d.add_paragraph('Figure 1. The new overhead tank at Desom.'); cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
ns = d.add_section(); ns.orientation = WD_ORIENT.LANDSCAPE; ns.page_width, ns.page_height = ns.page_height, ns.page_width
d.add_heading('Annexure: ward-wise connections', 1)
tb = d.add_table(rows=1, cols=8); tb.style = 'Table Grid'
for c, h in zip(tb.rows[0].cells, ['Ward', 'Households', 'Metered', 'Unmetered', 'New', 'Disconnected', 'Arrears (Rs.)', 'Complaints']):
    c.text = h
for w in range(1, 12):
    cells = tb.add_row().cells
    vals = [str(w), str(300 + w * 17), str(280 + w * 15), str(20 + w * 2), str(w * 3), str(w % 4), f'{12000 + w * 731:,}', str(w * 2 + 1)]
    for c, v in zip(cells, vals): c.text = v
d.save(os.path.join(OUT, 'report.docx'))

# ---- 2. Malayalam letter docx
d = Document()
st = d.styles['Normal']; st.font.name = 'FreeSerif'; st.font.size = Pt(12)
rpr = st.element.get_or_add_rPr(); rf = rpr.find(qn('w:rFonts'))
if rf is None:
    rf = OxmlElement('w:rFonts'); rpr.append(rf)
for a in ('w:ascii', 'w:hAnsi', 'w:cs', 'w:eastAsia'): rf.set(qn(a), 'FreeSerif')
d.add_paragraph('തീയതി: 05-09-2026').alignment = WD_ALIGN_PARAGRAPH.RIGHT
d.add_paragraph('ബഹുമാനപ്പെട്ട പ്രിൻസിപ്പൽ അവർകൾക്ക്,')
d.add_paragraph('വിഷയം: അവധി അപേക്ഷ').runs[0].bold = True
for i in range(4):
    d.add_paragraph('എന്റെ മകൾ അനഘ സുരേഷ് (ക്ലാസ് 10-ബി) പനി കാരണം 2026 സെപ്റ്റംബർ 3 മുതൽ 5 വരെ സ്കൂളിൽ ഹാജരാകാൻ കഴിഞ്ഞില്ല. ഡോക്ടറുടെ സർട്ടിഫിക്കറ്റ് ഇതോടൊപ്പം ചേർക്കുന്നു. ദയവായി അവധി അനുവദിക്കണമെന്ന് അപേക്ഷിക്കുന്നു. ')
d.add_paragraph('Doctor\'s certificate attached. Thank you.')
d.add_paragraph('വിശ്വസ്തതയോടെ,\nസുരേഷ് കുമാർ')
d.save(os.path.join(OUT, 'malayalam-leave.docx'))

# ---- 3. Resume docx with a two-column table layout and a photo
d = Document()
d.styles['Normal'].font.name = 'Carlito'
t = d.add_table(rows=1, cols=2)
left, right = t.rows[0].cells
left.width = Cm(5); right.width = Cm(12)
left.paragraphs[0].add_run().add_picture(img2, width=Cm(4))
left.add_paragraph('CONTACT').runs[0].bold = True
left.add_paragraph('arun.das@example.com\n+91 90000 12345\nThrissur')
left.add_paragraph('SKILLS').runs[0].bold = True
for s in ['AutoCAD', 'Revit', 'Site supervision', 'Estimation']: left.add_paragraph(s, style='List Bullet')
p = right.paragraphs[0]; r = p.add_run('ARUN DAS'); r.bold = True; r.font.size = Pt(22)
right.add_paragraph('Civil Engineer · 6 years')
right.add_paragraph('EXPERIENCE').runs[0].bold = True
for j in ['Site Engineer, Malabar Builders (fictional) 2021–present: supervised two G+7 residential towers, 120 flats, delivered two months early.', 'Junior Engineer, PWD contractor (fictional) 2019–2021: road resurfacing, culverts, bill of quantities.']:
    right.add_paragraph(j, style='List Bullet')
right.add_paragraph('EDUCATION').runs[0].bold = True
right.add_paragraph('B.Tech Civil Engineering, Govt. Engineering College (fictional), 2019, 8.1 CGPA')
d.save(os.path.join(OUT, 'resume.docx'))

# ---- 4. Excel: household budget with formulas, dates, merged cells, several sheets
wb = Workbook()
ws = wb.active; ws.title = 'Budget'
ws.merge_cells('A1:E1'); ws['A1'] = 'Household budget 2026 (fictional family)'; ws['A1'].font = Font(bold=True, size=14); ws['A1'].alignment = Alignment(horizontal='center')
ws.append([]); ws.append(['Date', 'Item', 'Category', 'Amount (Rs.)', 'Paid by'])
for c in ws[3]: c.font = Font(bold=True); c.fill = PatternFill('solid', fgColor='DDEBF7')
cats = ['Groceries', 'Rent', 'Electricity', 'School fees', 'Medicine', 'Transport', 'Mobile']
for i in range(40):
    ws.append([datetime.date(2026, 1 + i // 4, 1 + (i * 7) % 27), f'{random.choice(cats)} payment {i + 1}', random.choice(cats), round(random.uniform(150, 18000), 2), random.choice(['UPI', 'Cash', 'Card'])])
    ws.cell(row=ws.max_row, column=1).number_format = 'DD-MM-YYYY'
    ws.cell(row=ws.max_row, column=4).number_format = '#,##0.00'
n = ws.max_row
ws.append([None, 'Total', None, f'=SUM(D4:D{n})']); ws.cell(row=ws.max_row, column=4).number_format = '#,##0.00'; ws.cell(row=ws.max_row, column=2).font = Font(bold=True)
ws.append([None, 'Average', None, f'=AVERAGE(D4:D{n})']); ws.cell(row=ws.max_row, column=4).number_format = '#,##0.00'
for col, w in zip('ABCDE', (12, 28, 14, 14, 10)): ws.column_dimensions[col].width = w
s2 = wb.create_sheet('Summary')
s2.append(['Category', 'Total', 'Share'])
for i, c in enumerate(cats, start=2):
    s2.append([c, f'=SUMIF(Budget!C:C,A{i},Budget!D:D)', f'=B{i}/SUM($B$2:$B${len(cats) + 1})'])
    s2.cell(row=i, column=3).number_format = '0.0%'
s3 = wb.create_sheet('EMI')
s3.merge_cells('A1:D1'); s3['A1'] = 'Home loan EMI schedule'; s3['A1'].font = Font(bold=True)
s3.append(['Principal', 2500000]); s3.append(['Rate (yearly)', 0.0875]); s3['B3'].number_format = '0.00%'; s3.append(['Months', 240])
s3.append(['EMI', '=PMT(B3/12,B4,-B2)']); s3['B5'].number_format = '#,##0.00'
s3.append([]); s3.append(['Month', 'Opening', 'Interest', 'Principal', 'Closing'])
for m in range(1, 25):
    r = s3.max_row + 1
    s3.append([m, '=B2' if m == 1 else f'=E{r - 1}', f'=B{r}*$B$3/12', f'=$B$5-C{r}', f'=B{r}-D{r}'])
    for c in 'BCDE': s3[f'{c}{r}'].number_format = '#,##0.00'
wb.save(os.path.join(OUT, 'budget.xlsx'))

# ---- 5. Excel: GST sales register, wide, landscape-ish, Malayalam header cell
wb = Workbook(); ws = wb.active; ws.title = 'Sales register Sep'
ws.append(['ഇൻവോയ്സ് രജിസ്റ്റർ — September 2026'])
ws.append(['Inv No', 'Date', 'Customer', 'GSTIN', 'HSN', 'Taxable', 'CGST 9%', 'SGST 9%', 'IGST 18%', 'Total', 'Status'])
for i in range(60):
    taxable = round(random.uniform(500, 90000), 2); inter = i % 5 == 0
    r = ws.max_row + 1
    ws.append([f'PF/{418 + i}', datetime.date(2026, 9, 1 + i % 30), f'Customer {i + 1} Traders', f'32AAB{i:04d}Q1Z{i % 10}', random.choice(['9403', '9401', '4802']), taxable,
               0 if inter else f'=F{r}*0.09', 0 if inter else f'=F{r}*0.09', f'=F{r}*0.18' if inter else 0, f'=F{r}+G{r}+H{r}+I{r}', random.choice(['Paid', 'Due', 'Part paid'])])
    ws[f'B{r}'].number_format = 'DD/MM/YYYY'
    for c in 'FGHIJ': ws[f'{c}{r}'].number_format = '#,##0.00'
r = ws.max_row + 1
ws.append(['Total', None, None, None, None] + [f'=SUM({c}3:{c}{r - 1})' for c in 'FGHIJ'] + [None])
thin = Side(style='thin', color='999999')
for row in ws.iter_rows(min_row=2):
    for c in row: c.border = Border(top=thin, bottom=thin, left=thin, right=thin)
wb.save(os.path.join(OUT, 'gst-register.xlsx'))

# ---- 6. Excel: attendance sheet, very wide (31 day columns)
wb = Workbook(); ws = wb.active; ws.title = 'Attendance'
ws.append(['Name'] + [str(d) for d in range(1, 32)] + ['Present'])
for i in range(25):
    r = ws.max_row + 1
    ws.append([f'Student {i + 1}'] + [random.choice(['P', 'P', 'P', 'A']) for _ in range(31)] + [f'=COUNTIF(B{r}:AF{r},"P")'])
wb.save(os.path.join(OUT, 'attendance.xlsx'))

# ---- 7. PowerPoint deck
prs = Presentation()
s = prs.slides.add_slide(prs.slide_layouts[0]); s.shapes.title.text = 'Ward 7 Clean Water Drive'; s.placeholders[1].text = 'Progress review · September 2026'
s = prs.slides.add_slide(prs.slide_layouts[1]); s.shapes.title.text = 'What we did'
tf = s.placeholders[1].text_frame; tf.text = 'Tested 212 wells for coliform'
for t in ['Chlorinated 64 wells', 'Ran 9 awareness classes in schools', 'Distributed 400 filter candles']: tf.add_paragraph().text = t
s = prs.slides.add_slide(prs.slide_layouts[5]); s.shapes.title.text = 'Results by ward'
rows, cols = 5, 3
tbl = s.shapes.add_table(rows, cols, Inches(1), Inches(1.8), Inches(8), Inches(3)).table
for c, h in enumerate(['Ward', 'Wells tested', 'Safe after treatment']): tbl.cell(0, c).text = h
for r in range(1, rows):
    for c, v in enumerate([f'Ward {r + 4}', str(30 + r * 9), f'{88 + r}%']): tbl.cell(r, c).text = v
s = prs.slides.add_slide(prs.slide_layouts[5]); s.shapes.title.text = 'The new tank'
s.shapes.add_picture(img1, Inches(1.5), Inches(1.8), width=Inches(7))
s = prs.slides.add_slide(prs.slide_layouts[1]); s.shapes.title.text = 'Next steps'
tf = s.placeholders[1].text_frame; tf.text = 'Second round of testing in December'
tf.add_paragraph().text = 'ശുദ്ധജല ബോധവൽക്കരണ ക്ലാസുകൾ തുടരും'
prs.save(os.path.join(OUT, 'deck.pptx'))
print('ok')
