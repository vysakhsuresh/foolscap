# A Writer form with real controls, made through LibreOffice's own API, exported as a PDF form (fictional content).
import os, subprocess, sys, time
import uno
from com.sun.star.beans import PropertyValue
from com.sun.star.awt import Size, Point

OUT = sys.argv[1]
proc = subprocess.Popen(['soffice', '-env:UserInstallation=file://' + os.path.abspath(os.path.join(os.path.dirname(OUT), '..', 'lo-profile-uno')), '--headless', '--norestore',
                         '--accept=socket,host=127.0.0.1,port=2099;urp;'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
local = uno.getComponentContext()
resolver = local.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver', local)
for _ in range(60):
    try:
        ctx = resolver.resolve('uno:socket,host=127.0.0.1,port=2099;urp;StarOffice.ComponentContext'); break
    except Exception:
        time.sleep(0.5)
smgr = ctx.ServiceManager
desktop = smgr.createInstanceWithContext('com.sun.star.frame.Desktop', ctx)
def pv(n, v):
    p = PropertyValue(); p.Name = n; p.Value = v; return p
doc = desktop.loadComponentFromURL('private:factory/swriter', '_blank', 0, (pv('Hidden', True),))
text = doc.Text
cur = text.createTextCursor()
cur.CharHeight = 16; cur.CharWeight = 150
text.insertString(cur, 'Membership application (fictional residents association)\n', False)
cur.CharHeight = 11; cur.CharWeight = 100
labels = [('Full name', 'FullName', 'text'), ('House name and number', 'House', 'text'), ('Mobile', 'Mobile', 'text'), ('Email', 'Email', 'text'),
          ('Ward', 'Ward', 'list'), ('Existing member', 'Member', 'check'), ('I agree to the rules', 'Consent', 'check'), ('Remarks', 'Remarks', 'multi')]
for label, _, _ in labels:
    text.insertString(cur, label + '\n\n', False)
text.insertString(cur, 'Signature: ______________________   Date: ____________\n', False)
page = doc.DrawPage
y = 3400
for label, name, kind in labels:
    svc = {'text': 'TextField', 'multi': 'TextField', 'check': 'CheckBox', 'list': 'ListBox'}[kind]
    model = doc.createInstance('com.sun.star.form.component.' + svc)
    model.Name = name
    if kind == 'check':
        model.Label = ''
    if kind == 'list':
        model.StringItemList = ('Ward 1', 'Ward 2', 'Ward 3', 'Ward 4'); model.Dropdown = True
    if kind == 'multi':
        model.MultiLine = True
    shape = doc.createInstance('com.sun.star.drawing.ControlShape')
    shape.Size = Size(9000 if kind != 'check' else 500, 700 if kind != 'multi' else 2000)
    shape.Position = Point(7000, y)
    shape.Control = model
    shape.AnchorType = uno.Enum('com.sun.star.text.TextContentAnchorType', 'AT_PAGE')
    page.add(shape)
    y += 1270 if kind != 'multi' else 2600
filt = (pv('FilterName', 'writer_pdf_Export'), pv('FilterData', uno.Any('[]com.sun.star.beans.PropertyValue', (pv('ExportFormFields', True), pv('FormsType', 2)))))
doc.storeToURL(uno.systemPathToFileUrl(os.path.abspath(OUT)), filt)
doc.storeToURL(uno.systemPathToFileUrl(os.path.abspath(OUT[:-4] + '.odt')), (pv('FilterName', 'writer8'),))
doc.close(True)
try:
    desktop.terminate()
except Exception:
    pass
proc.wait(timeout=30)
print('ok')
