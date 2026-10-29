"""Build the illustrated guide from Markdown and verified demo screenshots.

Run after scripts/capture-demo.mjs. Requires reportlab and a Unicode TTF font.
"""
import json
import re
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Image, Table, TableStyle, PageBreak,
)

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / 'docs'
SHOTS = DOCS / 'screenshots' / 'demo'
OUTPUT = DOCS / 'Anvandarinstruktion_kyrkouppdrag.pdf'
fonts = [Path('C:/Windows/Fonts'), Path('/usr/share/fonts/truetype/dejavu')]
font_dir = next(p for p in fonts if p.exists())
regular = font_dir / ('arial.ttf' if (font_dir / 'arial.ttf').exists() else 'DejaVuSans.ttf')
bold = font_dir / ('arialbd.ttf' if (font_dir / 'arialbd.ttf').exists() else 'DejaVuSans-Bold.ttf')
pdfmetrics.registerFont(TTFont('Guide', str(regular)))
pdfmetrics.registerFont(TTFont('GuideBold', str(bold)))
pdfmetrics.registerFontFamily('Guide', normal='Guide', bold='GuideBold', italic='Guide', boldItalic='GuideBold')
styles = getSampleStyleSheet()
for style in styles.byName.values():
    style.fontName = 'Guide'
    style.leading = 15
    style.fontSize = 10
styles.add(ParagraphStyle('CoverTitle', fontName='GuideBold', fontSize=32, leading=40, textColor=colors.HexColor('#7D0037'), spaceAfter=20))
styles.add(ParagraphStyle('SectionTitle', fontName='GuideBold', fontSize=22, leading=28, textColor=colors.HexColor('#7D0037'), spaceAfter=15))
styles.add(ParagraphStyle('SectionSub', fontName='GuideBold', fontSize=13, leading=18, spaceBefore=12, spaceAfter=8))
styles.add(ParagraphStyle('CaptionSmall', fontName='Guide', fontSize=8, leading=12, textColor=colors.HexColor('#555555'), spaceBefore=6, spaceAfter=12))
styles.add(ParagraphStyle('CellSmall', fontName='Guide', fontSize=7, leading=10))


def text(value):
    value = escape(value)
    value = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', value)
    value = re.sub(r'`([^`]+)`', r'\1', value)
    return value


def para(value, style='BodyText'):
    return Paragraph(text(value), styles[style])


manifest_path = SHOTS / 'manifest.json'
if not manifest_path.exists():
    raise SystemExit('Screenshot manifest is missing. Run capture-demo.mjs first.')
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
if isinstance(manifest, dict):
    manifest = manifest.get('screenshots', manifest.get('images', []))


def shot(page, role=None, mobile=False):
    candidates = [s for s in manifest if s['page'] == page and (s['width'] < 600) == mobile]
    if role:
        candidates = [s for s in candidates if s['role'] == role]
    if not candidates:
        raise ValueError(f'Missing screenshot: {page}, {role}, mobile={mobile}')
    item = candidates[0]
    path = Path(item['path'])
    if not path.is_absolute():
        path = ROOT / path
    if not path.exists():
        path = SHOTS / Path(item['path']).name
    width = (77 if mobile else 174) * mm
    image = Image(str(path), width=width, height=width * item['height'] / item['width'])
    return [image, para(f"{item['label']}. {item.get('roleLabel', item['role'])}. {'Mobil' if mobile else 'Dator'}. Bild från det lokala demot.", 'CaptionSmall')]


source = (DOCS / 'ANVANDARINSTRUKTION.md').read_text(encoding='utf-8')
story = [Spacer(1, 35 * mm), para('Kyrkouppdrag', 'CoverTitle'), para('Användarinstruktion', 'SectionTitle'),
         para('För ideella, anställda, administratörer och kiosk.'), Spacer(1, 12 * mm),
         para('Boka pass, samordna arbetet och hitta rätt bland appens funktioner.'), Spacer(1, 15 * mm),
         para('Utgåva 29 oktober 2026'), para('www.kyrkouppdrag.se'),
         para('Bilderna visar påhittade personer i ett lokalt demoläge. Menyval kan skilja sig beroende på församling och behörighet.')]

image_map = {
    'Start': ('oversikt', 'ideell'),
    'Pass (alla)': ('pass', 'ideell'),
    'Mina bokningar': ('mina-bokningar', 'ideell'),
    'Mina ansvar (anställd)': ('mina-ansvar', 'anstalld'),
    'Notiser': ('notiser', 'ideell'),
    'Min profil': ('profil', 'ideell'),
    'Skapa och ändra pass (admin eller anställd med behörighet)': ('pass', 'fadmin'),
    'Personal': ('personal', 'fadmin'),
    'Grupper': ('grupper', 'fadmin'),
    'Utskick': ('utskick', 'padmin'),
    'Behörigheter': ('behorigheter', 'fadmin'),
    'Församlingar (pastoratsadmin, superadmin)': ('forsamlingar', 'padmin'),
    'Pastorat (superadmin)': ('pastorat', 'superadmin'),
    'Exportera (import och export)': ('exportera', 'fadmin'),
    'Kiosk': ('kiosk', 'kiosk'),
}
lines = source[source.index('## 1.') :].splitlines()
i = 0
while i < len(lines):
    line = lines[i].strip()
    i += 1
    if not line or line.startswith('# '):
        continue
    if line.startswith('## '):
        if line.startswith('## 4.'):
            continue
        if line.startswith(('## 6.', '## 7.')):
            story.extend([Spacer(1, 8 * mm), para(line[3:], 'SectionSub')])
        else:
            story.extend([PageBreak(), para(line[3:], 'SectionTitle')])
    elif line.startswith('### '):
        title = line[4:]
        story.extend([PageBreak(), para(title, 'SectionTitle')])
        if title in image_map:
            story.extend(shot(*image_map[title]))
    elif line.startswith('|'):
        rows = [line]
        while i < len(lines) and lines[i].strip().startswith('|'):
            rows.append(lines[i].strip())
            i += 1
        cells = [[para(c.strip(), 'CellSmall') for c in row.strip('|').split('|')]
                 for row in rows if not re.fullmatch(r'[|:\-\s]+', row)]
        count = len(cells[0])
        widths = ([48 * mm] + [126 * mm / (count - 1)] * (count - 1)) if count > 2 else [42 * mm, 132 * mm]
        table = Table(cells, colWidths=widths, repeatRows=1, hAlign='LEFT')
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#F3E3CC')),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#FAF6F2')]),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 6), ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 7), ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
            ('LINEBELOW', (0, 0), (-1, 0), 0.8, colors.HexColor('#7D0037')),
        ]))
        story.extend([table, Spacer(1, 10)])
    else:
        story.append(para(line))

story.append(Spacer(1, 10))
mobile_table = Table([[shot('pass', 'ideell', True)[0], shot('mina-ansvar', 'anstalld', True)[0]]], colWidths=[87 * mm, 87 * mm])
mobile_table.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP')]))
story.extend([mobile_table, para('Till vänster: Pass för ideell. Till höger: Mina ansvar för anställd.', 'CaptionSmall')])


def footer(canvas, doc):
    canvas.setStrokeColor(colors.HexColor('#E9DBD3'))
    canvas.line(18 * mm, 16 * mm, 192 * mm, 16 * mm)
    canvas.setFont('Guide', 8)
    canvas.setFillColor(colors.HexColor('#555555'))
    canvas.drawString(18 * mm, 11 * mm, 'Kyrkouppdrag | Användarinstruktion | 29 oktober 2026')
    canvas.drawRightString(192 * mm, 11 * mm, str(doc.page))


doc = SimpleDocTemplate(str(OUTPUT), pagesize=(210 * mm, 297 * mm),
                        rightMargin=18 * mm, leftMargin=18 * mm, topMargin=20 * mm,
                        bottomMargin=23 * mm, title='Kyrkouppdrag: användarinstruktion', author='Kyrkouppdrag')
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print(OUTPUT)
