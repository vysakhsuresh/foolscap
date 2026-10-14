# Flat ODF text documents: footnotes + two-column section + header/footer; and a form with fields.
import os, sys
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

HEAD = '''<?xml version="1.0" encoding="UTF-8"?>
<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
 xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
 xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:form="urn:oasis:names:tc:opendocument:xmlns:form:1.0"
 xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"
 xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"
 office:version="1.3" office:mimetype="application/vnd.oasis.opendocument.text">
<office:meta><dc:title>{title}</dc:title><meta:initial-creator>Office Clerk</meta:initial-creator></office:meta>
<office:font-face-decls><style:font-face style:name="Liberation Serif" svg:font-family="'Liberation Serif'"/><style:font-face style:name="FreeSerif" svg:font-family="FreeSerif"/></office:font-face-decls>
<office:styles>
 <style:default-style style:family="paragraph"><style:text-properties style:font-name="Liberation Serif" fo:font-size="11pt" style:font-name-complex="FreeSerif" style:font-size-complex="11pt"/></style:default-style>
 <style:style style:name="Standard" style:family="paragraph"><style:paragraph-properties fo:text-align="justify" fo:margin-bottom="0.15cm"/></style:style>
 <style:style style:name="Heading_20_1" style:display-name="Heading 1" style:family="paragraph" style:default-outline-level="1"><style:paragraph-properties fo:margin-top="0.4cm" fo:margin-bottom="0.2cm"/><style:text-properties fo:font-size="16pt" fo:font-weight="bold"/></style:style>
 <style:style style:name="Heading_20_2" style:display-name="Heading 2" style:family="paragraph" style:default-outline-level="2"><style:text-properties fo:font-size="13pt" fo:font-weight="bold"/></style:style>
 <style:style style:name="Footnote" style:family="paragraph"><style:text-properties fo:font-size="9pt"/></style:style>
</office:styles>
<office:automatic-styles>
 <style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm" fo:margin-top="1.5cm" fo:margin-bottom="1.5cm" fo:margin-left="2cm" fo:margin-right="2cm"/>
  <style:header-style><style:header-footer-properties fo:min-height="0.6cm" fo:margin-bottom="0.3cm"/></style:header-style>
  <style:footer-style><style:header-footer-properties fo:min-height="0.6cm" fo:margin-top="0.3cm"/></style:footer-style></style:page-layout>
 <style:style style:name="Sect2" style:family="section"><style:section-properties><style:columns fo:column-count="2" fo:column-gap="0.8cm"/></style:section-properties></style:style>
 <style:style style:name="Center" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:text-align="center"/></style:style>
 <text:list-style style:name="Num1"><text:list-level-style-number text:level="1" style:num-suffix="." style:num-format="1"><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" fo:text-indent="-0.6cm" fo:margin-left="1.2cm"/></style:list-level-properties></text:list-level-style-number>
  <text:list-level-style-number text:level="2" style:num-suffix=")" style:num-format="a"><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" fo:text-indent="-0.6cm" fo:margin-left="2cm"/></style:list-level-properties></text:list-level-style-number></text:list-style>
</office:automatic-styles>
<office:master-styles><style:master-page style:name="Standard" style:page-layout-name="pm1">
 <style:header><text:p text:style-name="Center">{header}</text:p></style:header>
 <style:footer><text:p text:style-name="Center">Page <text:page-number text:select-page="current"/> of <text:page-count/></text:p></style:footer>
</style:master-page></office:master-styles>
<office:body><office:text>'''
TAIL = '</office:text></office:body></office:document>'

def fn(n, text):
    return f'<text:note text:id="ftn{n}" text:note-class="footnote"><text:note-citation>{n}</text:note-citation><text:note-body><text:p text:style-name="Footnote">{text}</text:p></text:note-body></text:note>'

para = ('The panchayat recorded rainfall of 2,914 mm during the year, of which 71 percent fell between June and September. '
        'Groundwater levels in the observation wells recovered by an average of 1.8 metres after the monsoon, but four wells near the paddy fields remained below the pre-monsoon level of the previous year. ')
body = []
body.append('<text:h text:style-name="Heading_20_1" text:outline-level="1">Groundwater Study, Kumarakom Panchayat</text:h>')
body.append(f'<text:p text:style-name="Standard">This note summarises the findings of the 2025-26 groundwater survey{fn(1, "Survey carried out by volunteers of the panchayat science club between April 2025 and March 2026.")}. It is written for ward members and is deliberately short.</text:p>')
body.append('<text:h text:style-name="Heading_20_2" text:outline-level="2">1. Findings</text:h>')
body.append('<text:section text:style-name="Sect2" text:name="Cols">')
for i in range(6):
    note = fn(i + 2, f'Well number {i + 11} is a dug well, 9.{i} m deep, lined with laterite.') if i % 2 == 0 else ''
    body.append(f'<text:p text:style-name="Standard">{para}{note}{para}</text:p>')
body.append('</text:section>')
body.append('<text:h text:style-name="Heading_20_2" text:outline-level="2">2. Recommendations</text:h>')
body.append('<text:list text:style-name="Num1">')
for t, subs in [('Recharge pits in every ward', ['one per 20 houses', 'near the road drains']), ('Monthly readings of the observation wells', []), ('A ban on new bore wells within 100 m of a pond', ['until the next survey', 'exceptions for drinking water only'])]:
    inner = ''
    if subs:
        inner = '<text:list>' + ''.join(f'<text:list-item><text:p text:style-name="Standard">{s}</text:p></text:list-item>' for s in subs) + '</text:list>'
    body.append(f'<text:list-item><text:p text:style-name="Standard">{t}</text:p>{inner}</text:list-item>')
body.append('</text:list>')
body.append('<text:h text:style-name="Heading_20_2" text:outline-level="2">3. Readings</text:h>')
body.append('<table:table table:name="Readings"><table:table-column table:number-columns-repeated="4"/>')
rows = [('Well', 'April (m)', 'October (m)', 'Change')] + [(f'W{i + 11}', f'{6.1 + i * 0.3:.1f}', f'{4.2 + i * 0.25:.1f}', f'{1.9 + i * 0.05:+.2f}') for i in range(10)]
for r in rows:
    body.append('<table:table-row>' + ''.join(f'<table:table-cell office:value-type="string"><text:p>{c}</text:p></table:table-cell>' for c in r) + '</table:table-row>')
body.append('</table:table>')
body.append('<text:p text:style-name="Standard">ഈ റിപ്പോർട്ട് പഞ്ചായത്ത് സമിതിയുടെ അടുത്ത യോഗത്തിൽ ചർച്ച ചെയ്യും. എല്ലാ വാർഡ് അംഗങ്ങളും പങ്കെടുക്കണമെന്ന് അഭ്യർത്ഥിക്കുന്നു.</text:p>')
with open(os.path.join(OUT, 'study.fodt'), 'w') as f:
    f.write(HEAD.format(title='Groundwater study', header='Kumarakom Panchayat (fictional) — groundwater note') + '\n'.join(body) + TAIL)

# A form: text boxes, check boxes, a list box, and a date, as an office would make one to be filled in.
FORMS = '''<office:forms form:automatic-focus="false" form:apply-design-mode="false"><form:form form:name="Application">
<form:text form:name="FullName" form:id="c1" form:control-implementation="ooo:com.sun.star.form.component.TextField"/>
<form:text form:name="Address" form:id="c2" form:control-implementation="ooo:com.sun.star.form.component.TextField"/>
<form:text form:name="Phone" form:id="c3" form:control-implementation="ooo:com.sun.star.form.component.TextField"/>
<form:checkbox form:name="Member" form:id="c4" form:control-implementation="ooo:com.sun.star.form.component.CheckBox" form:label="Existing member"/>
<form:checkbox form:name="Consent" form:id="c5" form:control-implementation="ooo:com.sun.star.form.component.CheckBox" form:label="I agree to the rules"/>
<form:listbox form:name="Ward" form:id="c6" form:control-implementation="ooo:com.sun.star.form.component.ListBox" form:dropdown="true" form:size="1">
<form:option form:label="Ward 1"/><form:option form:label="Ward 2"/><form:option form:label="Ward 3"/></form:listbox>
</form:form></office:forms>'''
def ctrl(cid, x, y, w, h, z):
    return f'<draw:control text:anchor-type="paragraph" draw:z-index="{z}" draw:control="{cid}" svg:width="{w}cm" svg:height="{h}cm" svg:x="{x}cm" svg:y="{y}cm"/>'
fb = ['<text:h text:style-name="Heading_20_1" text:outline-level="1">Membership application (fictional residents association)</text:h>',
      f'<text:p text:style-name="Standard">Full name {ctrl("c1", 4, 0, 10, 0.7, 0)}</text:p>', '<text:p text:style-name="Standard"/>',
      f'<text:p text:style-name="Standard">Address {ctrl("c2", 4, 0, 12, 0.7, 1)}</text:p>', '<text:p text:style-name="Standard"/>',
      f'<text:p text:style-name="Standard">Phone {ctrl("c3", 4, 0, 6, 0.7, 2)}</text:p>', '<text:p text:style-name="Standard"/>',
      f'<text:p text:style-name="Standard">Ward {ctrl("c6", 4, 0, 4, 0.7, 5)}</text:p>', '<text:p text:style-name="Standard"/>',
      f'<text:p text:style-name="Standard">{ctrl("c4", 0, 0, 6, 0.7, 3)}</text:p>', '<text:p text:style-name="Standard"/>',
      f'<text:p text:style-name="Standard">{ctrl("c5", 0, 0, 8, 0.7, 4)}</text:p>', '<text:p text:style-name="Standard"/>',
      '<text:p text:style-name="Standard">Signature: ______________________ Date: ____________</text:p>']
with open(os.path.join(OUT, 'membership-form.fodt'), 'w') as f:
    f.write(HEAD.format(title='Membership form', header='Residents association').replace('<office:body><office:text>', '<office:body><office:text>' + FORMS) + '\n'.join(fb) + TAIL)
print('ok')
