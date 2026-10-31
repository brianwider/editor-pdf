"""Motor del editor. Cada documento es un PDF base mas objetos editables que se dibujan encima."""
import copy
import os
import re
import statistics
import unicodedata
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from math import cos, radians, sin

import pymupdf as fitz

# La app empaquetada y la web guardan fuentes y firmas fuera del programa.
DATA_DIR = os.environ.get('PDF_EDITOR_DATA') or os.path.dirname(os.path.abspath(__file__))
FONT_UPLOADS = os.path.join(DATA_DIR, 'fonts')
FONT_DIRS = [
  FONT_UPLOADS,
  os.path.expanduser('~/Library/Fonts'),
  '/Library/Fonts',
  '/System/Library/Fonts',
  '/System/Library/Fonts/Supplemental',
  '/Applications/Microsoft Word.app/Contents/Resources/DFonts',
]
STYLE_WORDS = r'(semi|demi|extra|ultra)?(bold|black|heavy)|italic|oblique|regular|psmt|mt|ps\b'
LIGATURES = {'ﬀ': 'ff', 'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬃ': 'ffi', 'ﬄ': 'ffl', 'ﬅ': 'st', 'ﬆ': 'st'}
SPACES = '  '
FLAG_ITALIC, FLAG_SERIF, FLAG_MONO, FLAG_BOLD = 2, 4, 8, 16
TEXT_DEFAULTS = {
  'bold': False, 'italic': False, 'synthBold': False, 'synthItalic': False, 'color': '#000000', 'opacity': 1, 'underline': False,
  'strike': False, 'align': 'left', 'spacing': 0, 'lineHeight': 1.2, 'rotation': 0, 'bg': None, 'wrap': False, 'exact': None,
}


class EditError(Exception):
  pass


def clean_name(name):
  return name.split('+', 1)[-1]


def compact(name):
  return re.sub(r'[^a-z0-9]', '', name.lower())


def family_of(name):
  return compact(re.sub(STYLE_WORDS, '', clean_name(name), flags=re.I))


def file_family(stem):
  # Solo se quita el estilo: "Arial Black" es otra familia, no Arial en negrita.
  return compact(re.sub(r'(semi|demi|extra|ultra)?bold|italic|oblique|regular', '', stem, flags=re.I))


def name_is_bold(name):
  return bool(re.search(r'bold|black|heavy', name, re.I))


def name_is_italic(name):
  return bool(re.search(r'italic|oblique', name, re.I))


def font_class(name, flags=0):
  if flags & FLAG_MONO or re.search(r'cour|mono|consol', name, re.I):
    return 'mono'
  if re.search(r'helvetica|arial|sans|verdana|calibri|tahoma', name, re.I):
    return 'sans'
  if flags & FLAG_SERIF or re.search(r'times|serif|georgia|garamond|minion|cambria|tiro', name, re.I):
    return 'serif'
  return 'sans'


def hex_to_rgb(value):
  value = value.lstrip('#')
  return tuple(int(value[i:i + 2], 16) / 255 for i in (0, 2, 4))


def int_to_hex(value):
  return f'#{value & 0xffffff:06x}'


# --- Fuentes del sistema ---

_system_cache = None


def system_fonts(refresh=False):
  global _system_cache
  if _system_cache is None or refresh:
    found = []
    for folder in FONT_DIRS:
      if not os.path.isdir(folder):
        continue
      for file in sorted(os.listdir(folder)):
        stem, ext = os.path.splitext(file)
        if ext.lower() in ('.ttf', '.otf'):
          found.append({'path': os.path.join(folder, file), 'name': stem, 'family': file_family(stem), 'bold': bool(re.search(r'bold', stem, re.I)), 'italic': name_is_italic(stem)})
    _system_cache = found
  return _system_cache


def find_file_font(font_name, bold=None, italic=None):
  """Busca la fuente real instalada: mismo nombre exacto, o misma familia y estilo."""
  bold = name_is_bold(font_name) if bold is None else bold
  italic = name_is_italic(font_name) if italic is None else italic
  fonts = system_fonts()
  wanted = compact(clean_name(font_name))
  for font in fonts:
    if compact(font['name']) == wanted and font['bold'] == bold and font['italic'] == italic:
      return font['path']
  family = family_of(font_name)
  # Estas familias tienen las mismas medidas: reemplazan bien a la original.
  twins = {'helvetica': 'arial', 'helveticaneue': 'arial', 'times': 'timesnewroman', 'timesroman': 'timesnewroman', 'courier': 'couriernew'}
  for wanted_family in (family, twins.get(family)):
    for font in fonts:
      if font['family'] == wanted_family and font['bold'] == bold and font['italic'] == italic:
        return font['path']
  return None


_file_fonts = {}


def load_file_font(path):
  if path not in _file_fonts:
    _file_fonts[path] = fitz.Font(fontfile=path)
  return _file_fonts[path]


def similar_font(name, bold, italic, flags=0):
  """Fuente parecida para las letras que el PDF no trae."""
  kind = font_class(name, flags)
  family = {'mono': 'couriernew', 'serif': 'timesnewroman', 'sans': 'arial'}[kind]
  for font in system_fonts():
    if font['family'] == family and font['bold'] == bold and font['italic'] == italic:
      return load_file_font(font['path']), font['name']
  styles = {'sans': ('helv', 'hebo', 'heit', 'hebi'), 'serif': ('tiro', 'tibo', 'tiit', 'tibi'), 'mono': ('cour', 'cobo', 'coit', 'cobi')}
  code = styles[kind][int(bold) + 2 * int(italic)]
  return fitz.Font(code), {'sans': 'Helvetica', 'serif': 'Times', 'mono': 'Courier'}[kind]


def base_twin(name, bold, italic):
  groups = {'arial': 'sans', 'helvetica': 'sans', 'helveticaneue': 'sans', 'timesnewroman': 'serif', 'times': 'serif', 'timesroman': 'serif', 'couriernew': 'mono', 'courier': 'mono'}
  kind = groups.get(family_of(name))
  if not kind:
    return None
  styles = {'sans': ('helv', 'hebo', 'heit', 'hebi'), 'serif': ('tiro', 'tibo', 'tiit', 'tibi'), 'mono': ('cour', 'cobo', 'coit', 'cobi')}
  return fitz.Font(styles[kind][int(bold) + 2 * int(italic)]), {'sans': 'Helvetica', 'serif': 'Times', 'mono': 'Courier'}[kind]


def covers(font, char):
  return font.has_glyph(ord(char)) and (char in SPACES or not fitz.Rect(font.glyph_bbox(ord(char))).is_empty)


GOOGLE_CSS = 'https://fonts.googleapis.com/css2?family={}:ital,wght@0,400;0,700;1,400;1,700'


def download_google_font(font_name):
  """Baja de Google Fonts la familia pedida. Solo viaja el nombre de la fuente."""
  raw = re.sub(STYLE_WORDS, '', clean_name(font_name).split('-')[0], flags=re.I)
  family = re.sub(r'(?<=[a-z])(?=[A-Z])', ' ', raw).strip()
  headers = {'User-Agent': 'Mozilla/5.0'}
  request = urllib.request.Request(GOOGLE_CSS.format(urllib.parse.quote_plus(family)), headers=headers)
  try:
    css = urllib.request.urlopen(request, timeout=15).read().decode()
  except Exception:
    raise EditError(f'Google Fonts no tiene "{family}" o no hay conexión. Podés cargar el archivo de la fuente.')
  os.makedirs(FONT_UPLOADS, exist_ok=True)
  saved = 0
  for style, weight, url in re.findall(r"font-style:\s*(\w+);\s*font-weight:\s*(\d+);.*?url\(([^)]+)\)", css, re.S):
    parts = [family] + (['Bold'] if weight == '700' else []) + (['Italic'] if style == 'italic' else [])
    with urllib.request.urlopen(url, timeout=30) as source:
      with open(os.path.join(FONT_UPLOADS, ' '.join(parts) + '.ttf'), 'wb') as target:
        target.write(source.read())
    saved += 1
  if not saved:
    raise EditError(f'Google Fonts no devolvió archivos para "{family}".')
  system_fonts(refresh=True)
  return family


def save_uploaded_font(filename, data):
  stem, ext = os.path.splitext(os.path.basename(filename))
  if ext.lower() not in ('.ttf', '.otf'):
    raise EditError('La fuente tiene que ser un archivo .ttf u .otf.')
  try:
    fitz.Font(fontbuffer=data)
  except Exception:
    raise EditError('Ese archivo no es una fuente válida.')
  os.makedirs(FONT_UPLOADS, exist_ok=True)
  with open(os.path.join(FONT_UPLOADS, re.sub(r'[^\w .-]', '_', stem) + ext.lower()), 'wb') as target:
    target.write(data)
  system_fonts(refresh=True)
  return stem


# --- Fuentes dentro del PDF: permiten volver a usar exactamente los mismos glifos ---


def parse_tounicode(stream):
  mapping = {}
  text = stream.decode('latin-1')
  decode = lambda h: bytes.fromhex(h).decode('utf-16-be', 'ignore')
  for section in re.findall(r'beginbfchar(.*?)endbfchar', text, re.S):
    for code, uni in re.findall(r'<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>', section):
      mapping.setdefault(decode(uni), code.lower())
  for section in re.findall(r'beginbfrange(.*?)endbfrange', text, re.S):
    for lo, hi, body in re.findall(r'<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]*>|\[[^\]]*\])', section):
      width = len(lo)
      start, end = int(lo, 16), int(hi, 16)
      if body.startswith('['):
        for offset, uni in enumerate(re.findall(r'<([0-9a-fA-F]*)>', body)):
          mapping.setdefault(decode(uni), f'{start + offset:0{width}x}')
      else:
        base = bytes.fromhex(body[1:-1])
        for offset in range(end - start + 1):
          value = int.from_bytes(base, 'big') + offset
          mapping.setdefault(value.to_bytes(len(base), 'big').decode('utf-16-be', 'ignore'), f'{start + offset:0{width}x}')
  return mapping


def simple_encoding_map(doc, source):
  codec = 'mac_roman' if 'MacRomanEncoding' in source else 'cp1252'
  mapping = {}
  for code in range(32, 256):
    try:
      mapping[bytes([code]).decode(codec)] = f'{code:02x}'
    except UnicodeDecodeError:
      pass
  ref = re.search(r'/Encoding (\d+) 0 R', source)
  body = doc.xref_object(int(ref.group(1))) if ref else source
  diff = re.search(r'/Differences\s*\[(.*?)\]', body, re.S)
  if diff:
    code = 0
    for token in re.findall(r'/[^\s/\[\]]+|\d+', diff.group(1)):
      if token.isdigit():
        code = int(token)
      else:
        char = chr(fitz.glyph_name_to_unicode(token[1:]))
        mapping = {k: v for k, v in mapping.items() if v != f'{code:02x}'}
        mapping[char] = f'{code:02x}'
        code += 1
  return mapping


class DocFont:
  def __init__(self, doc, xref, base):
    self.xref = xref
    self.name = clean_name(base)
    self.subset = '+' in base
    self.resource = f'PE{xref}'
    self.embedded = bool(doc.extract_font(xref)[3])
    source = doc.xref_object(xref)
    self.flags = 0
    tounicode = re.search(r'/ToUnicode (\d+) 0 R', source)
    self.codes = parse_tounicode(doc.xref_stream(int(tounicode.group(1)))) if tounicode else {}
    if not self.codes and '/Type0' not in source:
      self.codes = simple_encoding_map(doc, source)
    self.base14 = None
    if not self.embedded:
      styles = {'sans': ('helv', 'hebo', 'heit', 'hebi'), 'serif': ('tiro', 'tibo', 'tiit', 'tibi'), 'mono': ('cour', 'cobo', 'coit', 'cobi')}
      self.base14 = fitz.Font(styles[font_class(self.name)][int(name_is_bold(self.name)) + 2 * int(name_is_italic(self.name))])


class FontBook:
  """Que letras trae cada fuente del PDF. Se conserva aunque se borre su texto de la pagina."""

  def __init__(self):
    self.fonts = {}
    self.seen = defaultdict(set)
    self.samples = defaultdict(lambda: defaultdict(list))
    self.flags = {}

  def scan(self, doc):
    for page in doc:
      for info in page.get_fonts(full=True):
        if info[0] and info[0] not in self.fonts:
          try:
            self.fonts[info[0]] = DocFont(doc, info[0], info[3])
          except Exception:
            continue
      for span in page.get_texttrace():
        name = clean_name(span['font'])
        self.flags.setdefault(name, span.get('flags', 0))
        size = span['size'] or 1
        chars = span['chars']
        for index, char in enumerate(chars):
          if char[1] < 0:
            continue
          self.seen[name].add(chr(char[0]))
          if index + 1 < len(chars):
            step = abs(chars[index + 1][2][0] - char[2][0]) + abs(chars[index + 1][2][1] - char[2][1])
            self.samples[name][chr(char[0])].append(step / size)
          else:
            self.samples[name][chr(char[0])].append(abs(char[3][2] - char[3][0]) / size)

  def named(self, name):
    return [f for f in self.fonts.values() if f.name == name]

  def code_for(self, name, token):
    """Devuelve (fuente, codigo) si ese texto se puede escribir con los glifos del PDF."""
    token_chars = set(token)
    for font in self.named(name):
      if font.base14 and token in font.codes:
        return font, font.codes[token]
      if token in font.codes and token_chars <= self.seen[name] | set(LIGATURES):
        return font, font.codes[token]
      for ligature, plain in LIGATURES.items():
        if plain == token and ligature in font.codes and ligature in self.seen[name]:
          return font, font.codes[ligature]
    return None

  def advance(self, name, font, token):
    if font.base14:
      return font.base14.text_length(token, fontsize=1)
    samples = self.samples[name].get(token)
    if samples:
      return statistics.median(samples)
    total = 0
    for char in token:
      samples = self.samples[name].get(char)
      total += statistics.median(samples) if samples else 0.5
    return total * 0.97 if len(token) > 1 else total

  def space_advance(self, name):
    samples = self.samples[name].get(' ')
    return statistics.median(samples) if samples else 0.25

  def listing(self):
    names = {f.name: f for f in self.fonts.values()}
    return sorted(names)


# --- Texto original de la pagina ---


def plain(text):
  return ''.join(LIGATURES.get(c, c) for c in text)


def visual_to_pdf(page):
  return page.derotation_matrix * ~page.transformation_matrix


def page_elements(page):
  """Agrupa el texto de la pagina: un tramo por estilo, y parrafos cuando las lineas son continuas."""
  flags = fitz.TEXT_PRESERVE_WHITESPACE | fitz.TEXT_MEDIABOX_CLIP | fitz.TEXT_PRESERVE_LIGATURES
  elements = []
  # La extraccion devuelve coordenadas sin rotar; todo el editor trabaja en lo que se ve en pantalla.
  turn = page.rotation_matrix
  linear = fitz.Matrix(turn.a, turn.b, turn.c, turn.d, 0, 0)
  for b, block in enumerate(page.get_text('rawdict', flags=flags)['blocks']):
    group = None
    for l, line in enumerate(block.get('lines', [])):
      if abs((fitz.Point(line['dir']) * linear).x - 1) > 0.001:
        group = None
        continue
      for span in line['spans']:
        span['bbox'] = tuple((fitz.Rect(span['bbox']) * turn).normalize())
        span['origin'] = tuple(fitz.Point(span['origin']) * turn)
        for char in span['chars']:
          char['origin'] = tuple(fitz.Point(char['origin']) * turn)
      visible = [s for s in line['spans'] if ''.join(c['c'] for c in s['chars']).strip()]
      for s, span in enumerate(visible):
        chars = [c for c in span['chars']]
        text = plain(''.join(c['c'] for c in chars))
        part = {
          'id': f's{b}.{l}.{s}', 'font': clean_name(span['font']), 'size': span['size'], 'flags': span['flags'], 'color': span['color'],
          'bbox': list(span['bbox']), 'origin': list(span['origin']), 'text': text.rstrip(), 'chars': chars,
        }
        same = group and len(visible) == 1 and all(group[k] == part[k] for k in ('font', 'color')) and abs(group['size'] - part['size']) < 0.01
        if same:
          last = group['parts'][-1]
          gap = part['origin'][1] - last['origin'][1]
          same = abs(part['bbox'][0] - group['parts'][0]['bbox'][0]) < 1.5 and 0.9 * part['size'] <= gap <= 1.8 * part['size']
        if same:
          group['parts'].append(part)
        else:
          group = {**part, 'parts': [part]}
          elements.append(group)
          if len(visible) > 1:
            group = None
  result = []
  for element in elements:
    parts = element['parts']
    widest = max(p['bbox'][2] - p['bbox'][0] for p in parts)
    text = parts[0]['text']
    for previous, part in zip(parts, parts[1:]):
      text += (' ' if previous['bbox'][2] - previous['bbox'][0] >= widest * 0.72 else '\n') + part['text']
    x0 = min(p['bbox'][0] for p in parts)
    y0 = min(p['bbox'][1] for p in parts)
    x1 = max(p['bbox'][2] for p in parts)
    y1 = max(p['bbox'][3] for p in parts)
    centered = len(parts) == 1 and (x1 - x0) < page.rect.width * 0.8 and abs((x0 + x1) / 2 - page.rect.width / 2) < 1.5
    justified = len(parts) > 2 and all(abs((p['bbox'][2] - p['bbox'][0]) - widest) < 1.5 for p in parts[:-1])
    gaps = [b['origin'][1] - a['origin'][1] for a, b in zip(parts, parts[1:])]
    result.append({
      'id': element['id'], 'text': text, 'font': element['font'], 'size': element['size'], 'flags': element['flags'], 'color': int_to_hex(element['color']),
      'bbox': [x0, y0, x1, y1], 'origin': parts[0]['origin'], 'parts': parts, 'multi': len(parts) > 1, 'align': 'center' if centered else 'justify' if justified else 'left',
      'lineHeight': (statistics.median(gaps) / element['size']) if gaps else 1.2,
    })
  return result


def public_element(element):
  return {k: v for k, v in element.items() if k not in ('parts', 'origin')}


def text_counts(page):
  return Counter(c for c in plain(page.get_text('text')) if not c.isspace())


def remove_element(doc, page, element):
  """Borra el texto del contenido del PDF con franjas finas que no tocan las lineas vecinas."""
  before = text_counts(page)
  to_unrotated = page.derotation_matrix
  for part in element['parts']:
    x0, _, x1, _ = part['bbox']
    size, baseline = part['size'], part['origin'][1]
    inset = min(0.5, (x1 - x0) * 0.1)
    band = fitz.Rect(x0 + inset, baseline - size * 0.35, x1 - inset, baseline - size * 0.25) * to_unrotated
    band.normalize()
    page.add_redact_annot(band, fill=False)
  page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE, graphics=fitz.PDF_REDACT_LINE_ART_NONE, text=fitz.PDF_REDACT_TEXT_REMOVE)
  removed = Counter(c for c in element['text'] if not c.isspace())
  if (before - removed) - text_counts(page):
    raise EditError('Cambiar este texto borraría letras vecinas, así que no se aplicó.')


def object_from_element(element, object_id, page_number):
  x0, y0, x1, y1 = element['bbox']
  origin = element['origin']
  exact = []
  for part in element['parts']:
    for char in part['chars']:
      if char['c'] not in SPACES:
        exact.append([char['c'], char['origin'][0] - origin[0], char['origin'][1] - origin[1]])
  bold, italic = name_is_bold(element['font']) or bool(element['flags'] & FLAG_BOLD), name_is_italic(element['font']) or bool(element['flags'] & FLAG_ITALIC)
  return {
    **TEXT_DEFAULTS, 'id': object_id, 'type': 'text', 'page': page_number, 'text': element['text'], 'x': origin[0], 'y': y0, 'ascent': origin[1] - y0,
    'width': x1 - origin[0], 'wrap': element['multi'], 'size': element['size'], 'font': {'kind': 'doc', 'name': element['font']}, 'flags': element['flags'],
    'bold': bold, 'italic': italic, 'color': element['color'], 'align': element['align'], 'lineHeight': element['lineHeight'],
    'exact': {'text': element['text'], 'size': element['size'], 'font': element['font'], 'width': x1 - origin[0], 'chars': exact},
  }


# --- Dibujo de objetos ---


def add_page_resource(doc, page, category, name, value):
  kind, current = doc.xref_get_key(page.xref, 'Resources')
  if kind == 'null':
    # La pagina hereda recursos: se copian a la pagina antes de sumar uno propio.
    parent = page.xref
    while kind == 'null':
      parent_kind, parent_ref = doc.xref_get_key(parent, 'Parent')
      if parent_kind != 'xref':
        break
      parent = int(parent_ref.split()[0])
      kind, current = doc.xref_get_key(parent, 'Resources')
    doc.xref_set_key(page.xref, 'Resources', current if kind != 'null' else '<<>>')
    kind, current = doc.xref_get_key(page.xref, 'Resources')
  holder, prefix = (int(current.split()[0]), '') if kind == 'xref' else (page.xref, 'Resources/')
  sub_kind, sub = doc.xref_get_key(holder, f'{prefix}{category}')
  if sub_kind == 'xref':
    doc.xref_set_key(int(sub.split()[0]), name, value)
  else:
    if sub_kind == 'null':
      doc.xref_set_key(holder, f'{prefix}{category}', '<<>>')
    doc.xref_set_key(holder, f'{prefix}{category}/{name}', value)


def append_stream(doc, page, stream):
  if not page.is_wrapped:
    page.wrap_contents()
  xref = doc.get_new_xref()
  doc.update_object(xref, '<<>>')
  doc.update_stream(xref, stream.encode('latin-1'), compress=True)
  refs = ' '.join(f'{c} 0 R' for c in page.get_contents())
  doc.xref_set_key(page.xref, 'Contents', f'[{refs} {xref} 0 R]')


def wrap_line(words, measure, limit):
  lines, current = [], ''
  for word in words:
    candidate = f'{current} {word}' if current else word
    if current and measure(candidate) > limit:
      lines.append(current)
      current = word
    else:
      current = candidate
  lines.append(current)
  return lines


def layout_text(obj, book):
  """Calcula donde va cada glifo. Devuelve glifos, lineas, tamano y letras sin fuente original."""
  size, spacing = obj['size'], obj.get('spacing', 0)
  font_ref = obj['font']
  doc_name = font_ref['name'] if font_ref['kind'] == 'doc' else None
  file_font = load_file_font(font_ref['path']) if font_ref['kind'] == 'file' else fitz.Font(font_ref['code']) if font_ref['kind'] == 'base' else None
  text = obj['text']
  note = None

  if doc_name:
    chars_needed = {c for c in text if c not in SPACES and not c.isspace()}
    exact_chars = {c[0] for c in (obj.get('exact') or {}).get('chars', [])}
    missing = {c for c in chars_needed if not book.code_for(doc_name, c)} - exact_chars
    if missing:
      # Si la fuente real esta instalada, se usa entera para que todo combine.
      path = find_file_font(doc_name)
      if path and all(covers(load_file_font(path), c) for c in chars_needed):
        doc_name, file_font = None, load_file_font(path)
        label = os.path.splitext(os.path.basename(path))[0]
        note = {'kind': 'installed' if file_family(label) == family_of(font_ref['name']) else 'twin', 'font': label}
    if missing and doc_name:
      # Sin archivo instalado (como en la web), las fuentes base equivalen a Arial, Times y Courier.
      twin = base_twin(doc_name, obj['bold'], obj['italic'])
      if twin and all(covers(twin[0], c) for c in chars_needed):
        doc_name, file_font = None, twin[0]
        note = {'kind': 'twin', 'font': twin[1]}
  flags = obj.get('flags', 0)
  backup = {}

  def pick(token):
    if doc_name:
      found = book.code_for(doc_name, token)
      if found:
        return ('doc', found[0], found[1], book.advance(doc_name, found[0], token) * size)
    if file_font and all(covers(file_font, c) for c in token):
      return ('file', file_font, token, file_font.text_length(token, fontsize=size))
    if len(token) > 1:
      return None
    if not backup:
      backup['font'], backup['name'] = similar_font(font_ref.get('name', ''), obj['bold'], obj['italic'], flags)
    if covers(backup['font'], token):
      return ('file', backup['font'], token, backup['font'].text_length(token, fontsize=size))
    raise EditError(f'Ninguna fuente disponible puede escribir "{token}".')

  def tokens(line):
    out, i = [], 0
    while i < len(line):
      char = line[i]
      if char in SPACES:
        out.append(('space', None, None, space_of() + spacing))
        i += 1
        continue
      for length in (3, 2):
        chunk = line[i:i + length]
        if not spacing and doc_name and len(chunk) == length and chunk in LIGATURES.values():
          found = pick(chunk)
          if found:
            out.append(found + (chunk,))
            i += length
            break
      else:
        found = pick(char)
        out.append((found[0], found[1], found[2], found[3] + spacing, char))
        i += 1
    return out

  def space_of():
    if doc_name:
      return book.space_advance(doc_name) * size
    return file_font.text_length(' ', fontsize=size) if file_font and file_font.has_glyph(32) else size * 0.25

  def measure(line):
    return sum(t[3] for t in tokens(line))

  if obj.get('exact') and same_as_exact(obj) and doc_name:
    return exact_layout(obj, book, doc_name, pick)

  box_width = obj.get('width') or 0
  rows = []
  for paragraph in text.split('\n'):
    if obj.get('wrap') and box_width:
      rows += [(row, i < len(wrapped) - 1) for wrapped in [wrap_line(paragraph.split(' '), measure, box_width)] for i, row in enumerate(wrapped)]
    else:
      rows.append((paragraph, False))

  glyphs, lines, widest = [], [], 0
  lead = size * obj.get('lineHeight', 1.2)
  measured = [measure(row) for row, _ in rows]
  frame = max(box_width, max(measured or [0]))
  for index, (row, soft) in enumerate(rows):
    row_width = measured[index]
    widest = max(widest, row_width)
    align = obj.get('align', 'left')
    x = {'center': (frame - row_width) / 2, 'right': frame - row_width}.get(align, 0)
    row_tokens = tokens(row)
    extra = 0
    if align == 'justify' and soft and row.count(' '):
      extra = (frame - row_width) / row.count(' ')
    start = x
    for token in row_tokens:
      if token[0] == 'space':
        x += token[3] + extra
      else:
        glyphs.append({'kind': token[0], 'font': token[1], 'code': token[2], 'x': x, 'y': index * lead})
        x += token[3]
    lines.append((start, x, index * lead))
  return finish_layout(obj, glyphs, lines, frame, len(rows), lead, backup, note)


def same_as_exact(obj):
  exact = obj['exact']
  return (obj['text'] == exact['text'] and abs(obj['size'] - exact['size']) < 0.001 and obj['font'].get('name') == exact['font']
          and not obj.get('spacing') and abs(obj.get('width', 0) - exact['width']) < 0.01)


def exact_layout(obj, book, name, pick):
  """Mismo texto, fuente y tamano: cada glifo vuelve a su posicion original."""
  glyphs, rows = [], defaultdict(list)
  backup = {}
  for char, dx, dy in obj['exact']['chars']:
    found = None
    for font in book.named(name):
      if char in font.codes:
        found = ('doc', font, font.codes[char])
        break
    if not found:
      for variant in (plain(char),):
        hit = book.code_for(name, variant)
        if hit:
          found = ('doc', hit[0], hit[1])
    if not found:
      chosen = pick(plain(char)[0])
      found = chosen[:3]
      backup['name'] = chosen[1].name
    glyphs.append({'kind': found[0], 'font': found[1], 'code': found[2], 'x': dx, 'y': dy})
    rows[round(dy, 1)].append(dx)
  size = obj['size']
  lines = [(min(v), max(v) + size * 0.5, y) for y, v in sorted(rows.items())]
  ys = sorted(rows)
  height = (ys[-1] if ys else 0) + size * 1.2
  return {'glyphs': glyphs, 'lines': lines, 'w': obj['width'], 'h': height, 'missing': backup.get('name')}


def finish_layout(obj, glyphs, lines, frame, count, lead, backup, note):
  return {'glyphs': glyphs, 'lines': lines, 'w': frame, 'h': max(count, 1) * lead, 'missing': backup.get('name'), 'note': note}


def draw_text(doc, page, obj, book):
  layout = layout_text(obj, book)
  size = obj['size']
  theta = radians(obj.get('rotation', 0))
  ex = fitz.Point(cos(theta), sin(theta))
  ey = fitz.Point(sin(theta), -cos(theta))
  origin = fitz.Point(obj['x'], obj['y'] + obj['ascent'])
  to_pdf = visual_to_pdf(page)
  linear = fitz.Matrix(to_pdf.a, to_pdf.b, to_pdf.c, to_pdf.d, 0, 0)
  pdf_ex, pdf_ey = ex * linear, ey * linear
  local = lambda x, y: (origin + ex * x - ey * y) * to_pdf
  r, g, b = hex_to_rgb(obj['color'])
  shear = 0.2 if obj.get('synthItalic') else 0
  a, b_, c, d = pdf_ex.x, pdf_ex.y, pdf_ey.x + pdf_ex.x * shear, pdf_ey.y + pdf_ex.y * shear
  ops = ['q']
  opacity = obj.get('opacity', 1)
  if opacity < 1:
    state = f'PEgs{int(opacity * 100)}'
    add_page_resource(doc, page, 'ExtGState', state, f'<</ca {opacity:.2f}/CA {opacity:.2f}>>')
    ops.append(f'/{state} gs')
  if obj.get('bg'):
    br, bg, bb = hex_to_rgb(obj['bg'])
    pad = size * 0.12
    corners = [local(-pad, -obj['ascent'] - pad), local(layout['w'] + pad, -obj['ascent'] - pad), local(layout['w'] + pad, layout['h'] - obj['ascent'] + pad), local(-pad, layout['h'] - obj['ascent'] + pad)]
    path = f'{corners[0].x:.3f} {corners[0].y:.3f} m ' + ' '.join(f'{p.x:.3f} {p.y:.3f} l' for p in corners[1:]) + ' h f'
    ops.append(f'{br:.4f} {bg:.4f} {bb:.4f} rg {path}')
  ops.append(f'{r:.4f} {g:.4f} {b:.4f} rg {r:.4f} {g:.4f} {b:.4f} RG')
  for start, end, y in layout['lines']:
    for flag, offset in (('underline', size * 0.12), ('strike', -size * 0.28)):
      if obj.get(flag):
        p0, p1 = local(start, y + offset), local(end, y + offset)
        ops.append(f'{max(size * 0.06, 0.4):.3f} w {p0.x:.3f} {p0.y:.3f} m {p1.x:.3f} {p1.y:.3f} l S')
  raw = [g_ for g_ in layout['glyphs'] if g_['kind'] == 'doc']
  if raw:
    if obj.get('synthBold'):
      ops.append(f'2 Tr {size * 0.03:.3f} w')
    ops.append('BT')
    current = None
    for glyph in raw:
      font = glyph['font']
      if font is not current:
        add_page_resource(doc, page, 'Font', font.resource, f'{font.xref} 0 R')
        ops.append(f'/{font.resource} {size:.4f} Tf')
        current = font
      point = local(glyph['x'], glyph['y'])
      ops.append(f'{a:.5f} {b_:.5f} {c:.5f} {d:.5f} {point.x:.3f} {point.y:.3f} Tm <{glyph["code"]}> Tj')
    ops.append('ET')
  ops.append('Q')
  append_stream(doc, page, '\n'.join(ops))

  files = [g_ for g_ in layout['glyphs'] if g_['kind'] == 'file']
  if files:
    # TextWriter calcula mal las coordenadas con la pagina rotada: se escribe sin rotacion y se restaura.
    rotation = page.rotation
    anchor = origin * page.derotation_matrix
    angle = rotation - obj.get('rotation', 0)
    page.set_rotation(0)
    writer = fitz.TextWriter(page.rect, opacity=opacity, color=(r, g, b))
    for glyph in files:
      writer.append((anchor.x + glyph['x'], anchor.y + glyph['y']), glyph['code'], font=glyph['font'], fontsize=size)
    if not page.is_wrapped:
      page.wrap_contents()
    writer.write_text(page, morph=(anchor, fitz.Matrix(angle)) if angle else None, render_mode=2 if obj.get('synthBold') else 0)
    page.set_rotation(rotation)
  return layout


def draw_shape(page, obj):
  to_page = page.derotation_matrix
  shape = page.new_shape()
  color = hex_to_rgb(obj['color']) if obj.get('color') else None
  fill = hex_to_rgb(obj['fill']) if obj.get('fill') else None
  opacity = obj.get('opacity', 1)
  x, y, w, h = obj['x'], obj['y'], obj['w'], obj['h']
  if obj['type'] == 'line':
    shape.draw_line(fitz.Point(x, y) * to_page, fitz.Point(x + w, y + h) * to_page)
  elif obj['type'] == 'ink':
    shape.draw_polyline([fitz.Point(x + px * w, y + py * h) * to_page for px, py in obj['points']])
  else:
    rect = (fitz.Rect(x, y, x + w, y + h) * to_page).normalize()
    if obj['type'] == 'ellipse':
      shape.draw_oval(rect)
    else:
      shape.draw_rect(rect)
  stroke_width = obj.get('strokeWidth', 1)
  shape.finish(color=color if stroke_width else None, fill=fill, width=stroke_width, stroke_opacity=opacity, fill_opacity=opacity, lineCap=1, lineJoin=1, closePath=False)
  shape.commit()


def draw_image(page, obj, images):
  rect = (fitz.Rect(obj['x'], obj['y'], obj['x'] + obj['w'], obj['y'] + obj['h']) * page.derotation_matrix).normalize()
  page.insert_image(rect, stream=images[obj['image']], rotate=page.rotation, keep_proportion=False, overlay=True)


def draw_object(doc, page, obj, book, images):
  if obj['type'] == 'text':
    return draw_text(doc, page, obj, book)
  if obj['type'] == 'image':
    draw_image(page, obj, images)
  else:
    draw_shape(page, obj)
  return None


def object_box(obj, book):
  if obj['type'] != 'text':
    return None
  layout = layout_text(obj, book)
  return {'x': obj['x'], 'y': obj['y'], 'w': layout['w'], 'h': layout['h'], 'missing': layout.get('missing'), 'note': layout.get('note')}


def resolve_variant(obj, bold, italic, book):
  """Activa negrita o cursiva con la variante real de la familia; si no existe, la simula con los mismos glifos."""
  name = obj['font'].get('name') or os.path.splitext(os.path.basename(obj['font']['path']))[0]
  family = family_of(name)
  obj['bold'], obj['italic'] = bold, italic
  for candidate in book.listing():
    if family_of(candidate) == family and name_is_bold(candidate) == bold and name_is_italic(candidate) == italic:
      needed = {c for c in obj['text'] if c not in SPACES and not c.isspace()}
      if all(book.code_for(candidate, c) for c in needed):
        obj['font'] = {'kind': 'doc', 'name': candidate}
        obj['synthBold'] = obj['synthItalic'] = False
        return
  path = find_file_font(name, bold, italic)
  if path:
    obj['font'] = {'kind': 'file', 'path': path, 'name': os.path.splitext(os.path.basename(path))[0]}
    obj['synthBold'] = obj['synthItalic'] = False
    return
  base_bold, base_italic = name_is_bold(name), name_is_italic(name)
  obj['synthBold'] = bold and not base_bold
  obj['synthItalic'] = italic and not base_italic


def prepare_signature(data, remove_background=True):
  """Normaliza una firma: fondo transparente si hace falta y recorte al trazo. Devuelve (png, ancho, alto)."""
  try:
    pix = fitz.Pixmap(data)
  except Exception:
    raise EditError('Esa imagen no se pudo leer. Probá con PNG o JPG.')
  if pix.colorspace is None or pix.colorspace.n != 3:
    pix = fitz.Pixmap(fitz.csRGB, pix)
  while max(pix.width, pix.height) > 1600:
    pix.shrink(1)
  had_alpha = bool(pix.alpha)
  width, height, n = pix.width, pix.height, pix.n
  samples = pix.samples
  rgba = bytearray(width * height * 4)
  if remove_background and not had_alpha:
    # El papel se toma de la imagen, asi tambien funciona con fotos de papel con sombra.
    lums = [(samples[i] * 3 + samples[i + 1] * 6 + samples[i + 2]) // 10 for i in range(0, len(samples), n)]
    paper = sorted(lums[::max(1, len(lums) // 2000)])[int(min(len(lums), 2000) * 0.9) - 1] if lums else 255
    clear, solid = paper - 14, paper * 0.6
    span = max(clear - solid, 1)
  for index in range(width * height):
    source, target = index * n, index * 4
    rgba[target:target + 3] = samples[source:source + 3]
    if had_alpha:
      rgba[target + 3] = samples[source + 3]
    elif remove_background:
      rgba[target + 3] = int(max(0, min(1, (clear - lums[index]) / span)) * 255)
    else:
      rgba[target + 3] = 255
  columns = [x for x in range(width) if any(rgba[(y * width + x) * 4 + 3] > 24 for y in range(0, height, 2))]
  rows = [y for y in range(height) if any(rgba[(y * width + x) * 4 + 3] > 24 for x in range(0, width, 2))]
  if not columns or not rows:
    raise EditError('No encontré ningún trazo en esa imagen. Probá sin quitar el fondo.')
  pad = 4
  x0, x1 = max(columns[0] - pad, 0), min(columns[-1] + pad + 1, width)
  y0, y1 = max(rows[0] - pad, 0), min(rows[-1] + pad + 1, height)
  cropped = bytearray()
  for y in range(y0, y1):
    cropped += rgba[(y * width + x0) * 4:(y * width + x1) * 4]
  result = fitz.Pixmap(fitz.csRGB, x1 - x0, y1 - y0, bytes(cropped), True)
  return result.tobytes('png'), x1 - x0, y1 - y0


def clone(value):
  return copy.deepcopy(value)
