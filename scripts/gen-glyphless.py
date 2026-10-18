# Makes the font in app/src/pdf/surgeon-unicode.ts: two glyphs that draw nothing,
# .notdef and one blank glyph 500 units wide, so invisible text in any script can
# be written with it. Our own, from scratch: no licence to carry.
#   pip install fonttools && python3 scripts/gen-glyphless.py && base64 -w0 glyphless.ttf
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

fb = FontBuilder(1000, isTTF=True)
fb.setupGlyphOrder(['.notdef', 'space'])
fb.setupCharacterMap({0x20: 'space'})
empty = TTGlyphPen(None).glyph()
fb.setupGlyf({'.notdef': empty, 'space': empty})
fb.setupHorizontalMetrics({'.notdef': (500, 0), 'space': (500, 0)})
fb.setupHorizontalHeader(ascent=1000, descent=0)
fb.setupNameTable({'familyName': 'GlyphLessFont', 'styleName': 'Regular'})
fb.setupOS2(sTypoAscender=1000, sTypoDescender=0, usWinAscent=1000, usWinDescent=0, fsType=0)
fb.setupPost()
fb.save('glyphless.ttf')
