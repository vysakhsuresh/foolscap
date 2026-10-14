# Appends an incremental update to a Chromium PDF, the way a reader saves comments: a PAID stamp and a note, a new title.
import re, sys
src, out = sys.argv[1], sys.argv[2]
b = open(src, 'rb').read()
body = re.search(rb'2 0 obj\s*<<\s*(/Type /Page\b.*?)>>\s*endobj', b, re.S).group(1)
startxref = int(re.findall(rb'startxref\s+(\d+)', b)[-1])
size = int(re.findall(rb'/Size (\d+)', b)[-1])
root = re.findall(rb'/Root (\d+) 0 R', b)[-1]
out_bytes = bytearray(b if b.endswith(b'\n') else b + b'\n')
offs = {}
def obj(n, s):
    offs[n] = len(out_bytes); out_bytes.extend(f'{n} 0 obj\n'.encode() + s + b'\nendobj\n')
ap = b'q 0.8 0 0 RG 2 w 1 1 118 38 re S BT /Helv 20 Tf 0.8 0 0 rg 22 12 Td (PAID) Tj ET Q'
obj(size, b"<</Type /Annot /Subtype /Stamp /Rect [420 600 540 640] /Name /Approved /Contents (PAID) /T (Accounts) /F 4 /AP <</N %d 0 R>>>>" % (size + 1))
obj(size + 1, b'<</Type /XObject /Subtype /Form /BBox [0 0 120 40] /Resources <</Font <</Helv <</Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold>>>>>> /Length %d>>\nstream\n' % len(ap) + ap + b'\nendstream')
obj(size + 2, b'<</Type /Annot /Subtype /Text /Rect [560 700 580 720] /Contents (Checked against bank credit, 10 Sep) /T (Accounts) /Name /Comment /F 4>>')
obj(2, b'<<' + body + b'\n/Annots [%d 0 R %d 0 R]>>' % (size, size + 2))
obj(1, b'<</Title (Payslip Aug 2026 - verified) /Creator (Chromium) /Producer (Skia/PDF m141)>>')
x = len(out_bytes)
out_bytes += b'xref\n0 3\n0000000000 65535 f \n' + b'%010d 00000 n \n' % offs[1] + b'%010d 00000 n \n' % offs[2]
out_bytes += b'%d 3\n' % size + b''.join(b'%010d 00000 n \n' % offs[size + i] for i in range(3))
out_bytes += b'trailer\n<</Size %d /Root %s 0 R /Info 1 0 R /Prev %d>>\nstartxref\n%d\n%%%%EOF\n' % (size + 3, root, startxref, x)
open(out, 'wb').write(out_bytes)
