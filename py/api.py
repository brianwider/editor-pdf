"""API del editor, sin red: la usan el servidor local de la app de Mac y el motor web dentro del navegador."""
import base64
import json
import os
import re
import threading
import urllib.parse
import uuid

import pymupdf as fitz

import editor
from editor import EditError, FontBook, clone, draw_object, object_box, object_from_element, page_elements, public_element, remove_element, resolve_variant

HISTORY_LIMIT = 60
SIGNATURES = os.path.join(editor.DATA_DIR, 'signatures')
TEXT_PROPS = {'text', 'x', 'y', 'width', 'wrap', 'size', 'color', 'opacity', 'underline', 'strike', 'align', 'spacing', 'lineHeight', 'rotation', 'bg'}
SHAPE_PROPS = {'x', 'y', 'w', 'h', 'color', 'fill', 'strokeWidth', 'opacity'}


class Session:
  def __init__(self, data, name):
    self.name = name
    self.base = data
    self.objects = []
    self.images = {}
    self.book = FontBook()
    doc = fitz.open('pdf', data)
    self.book.scan(doc)
    self.info = doc.metadata
    self.history = [self.snapshot(False)]
    self.index = 0
    self.version = 0

  def snapshot(self, noop):
    return {'base': self.base, 'objects': clone(self.objects), 'noop': noop}

  def restore(self):
    state = self.history[self.index]
    self.base, self.objects = state['base'], clone(state['objects'])
    self.version += 1

  def commit(self, noop=False, merge=False):
    self.history = self.history[:self.index + 1]
    if merge and self.index > 0:
      self.history[self.index] = self.snapshot(noop)
    else:
      self.history.append(self.snapshot(noop))
    self.history = self.history[-HISTORY_LIMIT:]
    self.index = len(self.history) - 1
    self.version += 1

  def move(self, step):
    self.index += step
    # Separar un texto del PDF no se ve en pantalla: deshacer lo salta junto con el cambio siguiente.
    while 0 < self.index < len(self.history) and self.history[self.index]['noop']:
      if step > 0 and self.index == len(self.history) - 1:
        break
      self.index += step
    self.index = max(0, min(self.index, len(self.history) - 1))
    self.restore()

  def open_base(self):
    return fitz.open('pdf', self.base)

  def save_base(self, doc):
    self.base = doc.tobytes(encryption=fitz.PDF_ENCRYPT_NONE)

  def composed(self, page_number=None, exclude=None):
    doc = self.open_base()
    for obj in self.objects:
      if obj['id'] != exclude and (page_number is None or obj['page'] == page_number):
        draw_object(doc, doc[obj['page']], obj, self.book, self.images)
    return doc

  def get(self, object_id):
    found = next((o for o in self.objects if o['id'] == object_id), None)
    if not found:
      raise EditError('Ese elemento ya no existe.')
    return found

  def public_object(self, obj):
    data = {k: v for k, v in obj.items() if k not in ('exact',)}
    data['box'] = object_box(obj, self.book)
    return data

  def pages(self):
    return [{'w': p.rect.width, 'h': p.rect.height} for p in self.open_base()]

  def state(self):
    can_undo = self.index > 0 and any(not s['noop'] for s in self.history[1:self.index + 1])
    can_redo = any(not s['noop'] for s in self.history[self.index + 1:])
    return {'version': self.version, 'canUndo': can_undo, 'canRedo': can_redo, 'dirty': self.index > 0}

  def run(self, action, req):
    """Aplica una accion entera o deja el documento exactamente como estaba."""
    backup = (self.base, clone(self.objects), list(self.history), self.index, self.version)
    try:
      result = action(self, req)
      self.composed()
      return result
    except Exception as error:
      self.base, self.objects, self.history, self.index, self.version = backup
      if isinstance(error, EditError):
        raise
      print('Error interno:', repr(error), flush=True)
      raise EditError('No se pudo aplicar ese cambio. El documento quedó como estaba.')

  # Acciones sobre texto y objetos

  def objectify(self, page_number, element_id, ref=None):
    doc = self.open_base()
    page = doc[page_number]
    elements = page_elements(page)
    element = next((e for e in elements if e['id'] == element_id), None)
    if ref:
      # Los id cambian al editar otro texto: manda lo que el usuario tocó, por contenido y posición.
      same = [e for e in elements if e['text'] == ref['text']]
      distance = lambda e: abs(e['bbox'][0] - ref['bbox'][0]) + abs(e['bbox'][1] - ref['bbox'][1])
      element = min(same, key=distance) if same and distance(min(same, key=distance)) < 4 else None
    if not element:
      raise EditError('Ese texto ya no está en la página. Hacé clic de nuevo sobre el texto actual.')
    remove_element(doc, page, element)
    self.save_base(doc)
    obj = object_from_element(element, 'o' + uuid.uuid4().hex[:8], page_number)
    self.objects.append(obj)
    return obj

  def update(self, obj, props):
    allowed = TEXT_PROPS if obj['type'] == 'text' else SHAPE_PROPS
    for key, value in props.items():
      if key in allowed:
        obj[key] = value
    if obj['type'] == 'text':
      if 'font' in props:
        obj['font'] = props['font']
        obj['synthBold'] = obj['synthItalic'] = False
        name = props['font'].get('name', '')
        obj['bold'], obj['italic'] = editor.name_is_bold(name), editor.name_is_italic(name)
      if 'bold' in props or 'italic' in props:
        resolve_variant(obj, props.get('bold', obj['bold']), props.get('italic', obj['italic']), self.book)

  def new_text(self, page, x, y, text, size=14, **extra):
    path = editor.find_file_font('Arial')
    font = {'kind': 'file', 'path': path, 'name': 'Arial'} if path else {'kind': 'base', 'code': 'helv', 'name': 'Helvetica'}
    obj = {**editor.TEXT_DEFAULTS, 'id': 'o' + uuid.uuid4().hex[:8], 'type': 'text', 'page': page, 'text': text, 'x': x, 'y': y, 'ascent': size * 0.9, 'width': 0, 'size': size, 'font': font, 'flags': 0}
    obj.update(extra)
    self.objects.append(obj)
    return obj

  def flatten_page(self, doc, number):
    for obj in [o for o in self.objects if o['page'] == number]:
      draw_object(doc, doc[number], obj, self.book, self.images)
      self.objects.remove(obj)

  def remap(self, mapping):
    self.objects = [o for o in self.objects if mapping(o['page']) is not None]
    for obj in self.objects:
      obj['page'] = mapping(obj['page'])


session = None
lock = threading.Lock()
CAPABILITIES = {'googleFonts': True, 'desktop': False}


def parse_ranges(text, count):
  pages = []
  for part in re.split(r'[,\s]+', text.strip()):
    match = re.fullmatch(r'(\d+)(?:-(\d+))?', part)
    if not match:
      raise EditError('Escribí las páginas así: 1-3, 5')
    start, end = int(match.group(1)), int(match.group(2) or match.group(1))
    if not (1 <= start <= end <= count):
      raise EditError(f'Este PDF tiene páginas de la 1 a la {count}.')
    pages += list(range(start - 1, end))
  return pages


def signature_path(signature_id):
  if not re.fullmatch(r'[0-9a-f]{32}', signature_id):
    raise EditError('Esa firma no existe.')
  path = os.path.join(SIGNATURES, signature_id + '.png')
  if not os.path.exists(path):
    raise EditError('Esa firma no existe.')
  return path


def read_signature(signature_id):
  with open(signature_path(signature_id), 'rb') as f:
    return f.read()


def list_signatures():
  if not os.path.isdir(SIGNATURES):
    return []
  files = [os.path.join(SIGNATURES, f) for f in os.listdir(SIGNATURES) if f.endswith('.png')]
  out = []
  for path in sorted(files, key=os.path.getmtime, reverse=True):
    pix = fitz.Pixmap(path)
    out.append({'id': os.path.basename(path)[:-4], 'w': pix.width, 'h': pix.height})
  return out


def action_copy_to_pages(s, req):
  obj = s.get(req['objectId'])
  count = s.open_base().page_count
  targets = list(range(count)) if req.get('pages') == 'all' else parse_ranges(req.get('pages', ''), count)
  added = 0
  for number in targets:
    if number != obj['page']:
      copy = clone(obj)
      copy['id'] = 'o' + uuid.uuid4().hex[:8]
      copy['page'] = number
      s.objects.append(copy)
      added += 1
  s.commit()
  return {'pagesChanged': 'all', 'count': added}


def action_objectify(s, req):
  obj = s.objectify(req['page'], req['id'], req.get('ref'))
  s.commit(noop=True)
  return {'object': s.public_object(obj), 'pagesChanged': [req['page']]}


def action_update(s, req):
  obj = s.get(req['objectId'])
  s.update(obj, req['props'])
  s.commit(merge=req.get('merge', False))
  return {'object': s.public_object(obj), 'pagesChanged': [obj['page']]}


def action_add(s, req):
  spec = req['object']
  page = spec['page']
  if spec['type'] == 'text':
    obj = s.new_text(page, spec['x'], spec['y'], spec.get('text', 'Texto'), spec.get('size', 14))
  else:
    obj = {**spec, 'id': 'o' + uuid.uuid4().hex[:8]}
    if spec['type'] == 'image':
      image_id = uuid.uuid4().hex
      s.images[image_id] = read_signature(obj.pop('signature')) if spec.get('signature') else base64.b64decode(spec['data'])
      obj.pop('data', None)
      obj['image'] = image_id
    s.objects.append(obj)
  s.commit()
  return {'object': s.public_object(obj), 'pagesChanged': [page]}


def action_remove(s, req):
  obj = s.get(req['objectId'])
  s.objects.remove(obj)
  s.commit()
  return {'pagesChanged': [obj['page']]}


def action_remove_span(s, req):
  obj = s.objectify(req['page'], req['id'], req.get('ref'))
  s.objects.remove(obj)
  s.commit()
  return {'pagesChanged': [req['page']]}


def action_duplicate(s, req):
  obj = clone(s.get(req['objectId']))
  obj['id'] = 'o' + uuid.uuid4().hex[:8]
  obj['x'] += 12
  obj['y'] += 12
  s.objects.append(obj)
  s.commit()
  return {'object': s.public_object(obj), 'pagesChanged': [obj['page']]}


def action_order(s, req):
  obj = s.get(req['objectId'])
  s.objects.remove(obj)
  if req['to'] == 'front':
    s.objects.append(obj)
  else:
    s.objects.insert(0, obj)
  s.commit()
  return {'object': s.public_object(obj), 'pagesChanged': [obj['page']]}


def action_page_rotate(s, req):
  doc = s.open_base()
  for number in req['pages']:
    s.flatten_page(doc, number)
    page = doc[number]
    page.set_rotation((page.rotation + req['angle']) % 360)
  s.save_base(doc)
  s.commit()
  return {'pagesChanged': 'all'}


def action_page_delete(s, req):
  doc = s.open_base()
  remove = set(req['pages'])
  if len(remove) >= doc.page_count:
    raise EditError('Un PDF necesita al menos una página.')
  keep = [n for n in range(doc.page_count) if n not in remove]
  doc.select(keep)
  s.save_base(doc)
  s.remap(lambda n: keep.index(n) if n in keep else None)
  s.commit()
  return {'pagesChanged': 'all'}


def action_page_move(s, req):
  doc = s.open_base()
  order = list(range(doc.page_count))
  order.insert(req['to'], order.pop(req['from']))
  doc.select(order)
  s.save_base(doc)
  s.remap(order.index)
  s.commit()
  return {'pagesChanged': 'all'}


def action_page_duplicate(s, req):
  doc = s.open_base()
  number = req['page']
  doc.fullcopy_page(number, number + 1 if number + 1 < doc.page_count else -1)
  s.save_base(doc)
  copies = [clone(o) for o in s.objects if o['page'] == number]
  s.remap(lambda n: n + 1 if n > number else n)
  for obj in copies:
    obj['id'] = 'o' + uuid.uuid4().hex[:8]
    obj['page'] = number + 1
  s.objects += copies
  s.commit()
  return {'pagesChanged': 'all'}


def action_page_blank(s, req):
  doc = s.open_base()
  after = req['after']
  reference = doc[after].rect
  doc.new_page(after + 1, width=reference.width, height=reference.height)
  s.save_base(doc)
  s.remap(lambda n: n + 1 if n > after else n)
  s.commit()
  return {'pagesChanged': 'all'}


def action_replace(s, req):
  find, replacement = req['find'], req['replace']
  if not find:
    raise EditError('Escribí el texto que querés buscar.')
  pattern = re.compile(re.escape(find), 0 if req.get('matchCase') else re.I)
  count = 0
  for obj in [o for o in s.objects if o['type'] == 'text']:
    new, hits = pattern.subn(lambda _: replacement, obj['text'])
    if hits:
      obj['text'] = new
      count += hits
  doc = s.open_base()
  for number in range(doc.page_count):
    for element in reversed(page_elements(s.open_base()[number])):
      new, hits = pattern.subn(lambda _: replacement, element['text'])
      if hits:
        obj = s.objectify(number, element['id'])
        obj['text'] = new
        count += hits
  if not count:
    raise EditError(f'No encontré "{find}".')
  s.commit()
  return {'pagesChanged': 'all', 'count': count}


def action_watermark(s, req):
  doc = s.open_base()
  size = req.get('size', 60)
  for number in range(doc.page_count):
    rect = doc[number].rect
    width = len(req['text']) * size * 0.55
    s.new_text(number, rect.width / 2 - width * 0.35, rect.height / 2 + width * 0.35, req['text'], size, color=req.get('color', '#808080'), opacity=req.get('opacity', 0.25), rotation=-45)
  s.commit()
  return {'pagesChanged': 'all'}


def action_page_numbers(s, req):
  doc = s.open_base()
  total = doc.page_count
  size = req.get('size', 10)
  for number in range(total):
    rect = doc[number].rect
    label = req.get('format', '{n} de {total}').replace('{n}', str(number + 1)).replace('{total}', str(total))
    y = rect.height - 28 if req.get('position', 'bottom') == 'bottom' else 20
    s.new_text(number, 0, y, label, size, width=rect.width, align='center', color='#444444')
  s.commit()
  return {'pagesChanged': 'all'}


def page_fields(page):
  turn = page.rotation_matrix
  fields = []
  for widget in page.widgets() or []:
    rect = (widget.rect * turn).normalize()
    fields.append({
      'xref': widget.xref, 'kind': widget.field_type_string.lower(), 'name': widget.field_label or widget.field_name, 'value': widget.field_value,
      'on': widget.field_type in (fitz.PDF_WIDGET_TYPE_CHECKBOX, fitz.PDF_WIDGET_TYPE_RADIOBUTTON) and widget.field_value not in (False, 'Off', '', None),
      'options': [o[1] if isinstance(o, (list, tuple)) else o for o in (widget.choice_values or [])], 'multiline': bool(widget.field_flags & 4096),
      'bbox': list(rect),
    })
  return fields


def action_field(s, req):
  doc = s.open_base()
  page = doc[req['page']]
  widget = next((w for w in page.widgets() or [] if w.xref == req['xref']), None)
  if widget is None:
    raise EditError('Ese campo ya no existe.')
  if widget.field_type in (fitz.PDF_WIDGET_TYPE_CHECKBOX, fitz.PDF_WIDGET_TYPE_RADIOBUTTON):
    widget.field_value = widget.on_state() if req['value'] else 'Off'
  else:
    widget.field_value = req['value']
  widget.update()
  s.save_base(doc)
  s.commit()
  return {'pagesChanged': [req['page']]}


def action_metadata(s, req):
  doc = s.open_base()
  meta = doc.metadata or {}
  meta.update({k: req.get(k, '') for k in ('title', 'author', 'subject', 'keywords')})
  doc.set_metadata(meta)
  s.save_base(doc)
  s.info = meta
  s.commit()
  return {'pagesChanged': []}


ACTIONS = {name[7:]: fn for name, fn in list(globals().items()) if name.startswith('action_')}


def handle(method, url, headers, body):
  """Atiende un pedido y devuelve (estado, contenido, tipo, cabeceras). Los errores previstos llegan como 422."""
  parsed = urllib.parse.urlparse(url)
  try:
    with lock:
      return route_get(parsed.path, urllib.parse.parse_qs(parsed.query)) if method == 'GET' else route_post(parsed.path, headers, body)
  except EditError as error:
    return reply(422, {'error': str(error)})


def reply(status, content, content_type='application/json', headers=None):
  if not isinstance(content, bytes):
    content = json.dumps(content).encode()
  return status, content, content_type, headers or {}


def route_get(path, query):
  if path == '/api/capabilities':
    return reply(200, {'googleFonts': CAPABILITIES['googleFonts'], 'desktop': CAPABILITIES['desktop']})
  if path == '/api/state':
    if session is None:
      return reply(200, {'open': False})
    return reply(200, {'open': True, 'name': session.name, 'pages': session.pages(), **session.state()})
  if path == '/api/signatures':
    return reply(200, {'signatures': list_signatures()})
  match = re.fullmatch(r'/api/signatures/([0-9a-f]{32})', path)
  if match:
    return reply(200, read_signature(match.group(1)), 'image/png')
  if session is None:
    return reply(404, {'error': 'No hay ningún PDF abierto'})
  match = re.fullmatch(r'/api/page/(\d+)/(elements|image|object)', path)
  if match:
    number = int(match.group(1))
    if number >= fitz.open('pdf', session.base).page_count:
      return reply(404, {'error': 'Esa página no existe'})
    scale = min(max(float(query.get('scale', ['2'])[0]), 0.1), 5)
    if match.group(2) == 'elements':
      page = session.open_base()[number]
      objects = [session.public_object(o) for o in session.objects if o['page'] == number]
      return reply(200, {'elements': [public_element(e) for e in page_elements(page)], 'objects': objects, 'fields': page_fields(page)})
    if match.group(2) == 'image':
      doc = session.composed(number, query.get('exclude', [None])[0])
      return reply(200, doc[number].get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False).tobytes('png'), 'image/png')
    doc = session.open_base()
    page = doc[number]
    editor.append_stream(doc, page, '')
    doc.xref_set_key(page.xref, 'Contents', f'[{page.get_contents()[-1]} 0 R]')
    for annot in list(page.annots() or []):
      page.delete_annot(annot)
    draw_object(doc, page, session.get(query['id'][0]), session.book, session.images)
    return reply(200, page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=True, annots=False).tobytes('png'), 'image/png')
  if path == '/api/search':
    needle = query.get('q', [''])[0]
    case = query.get('case', ['0'])[0] == '1'
    hits = []
    fold = (lambda t: t) if case else str.lower
    if needle:
      doc = session.open_base()
      for number in range(doc.page_count):
        for element in page_elements(doc[number]):
          if fold(needle) in fold(element['text']):
            hits.append({'page': number, 'bbox': element['bbox'], 'text': element['text'][:80]})
      for obj in session.objects:
        if obj['type'] == 'text' and fold(needle) in fold(obj['text']):
          box = object_box(obj, session.book)
          hits.append({'page': obj['page'], 'bbox': [box['x'], box['y'], box['x'] + box['w'], box['y'] + box['h']], 'text': obj['text'][:80]})
    return reply(200, {'hits': hits})
  if path == '/api/fonts':
    seen = set()
    installed = []
    for font in editor.system_fonts():
      if font['name'] not in seen:
        seen.add(font['name'])
        installed.append({'kind': 'file', 'path': font['path'], 'name': font['name']})
    return reply(200, {'document': session.book.listing(), 'installed': installed})
  if path == '/api/metadata':
    return reply(200, session.info or {})
  return reply(404, {'error': 'Ruta desconocida'})


def route_post(path, headers, body):
  if path == '/api/open':
    return open_pdf(headers, body)
  if path == '/api/signatures/upload':
    png, width, height = editor.prepare_signature(body, headers.get('x-remove-background') == '1')
    os.makedirs(SIGNATURES, exist_ok=True)
    signature_id = uuid.uuid4().hex
    with open(os.path.join(SIGNATURES, signature_id + '.png'), 'wb') as f:
      f.write(png)
    return reply(200, {'id': signature_id, 'w': width, 'h': height})
  if path == '/api/signatures/delete':
    os.remove(signature_path(json.loads(body)['id']))
    return reply(200, {'signatures': list_signatures()})
  if path == '/api/fonts/upload':
    name = editor.save_uploaded_font(urllib.parse.unquote(headers.get('x-filename', 'fuente.ttf')), body)
    return reply(200, {'name': name, 'pagesChanged': 'all', **touch()})
  if path == '/api/fonts/google':
    family = editor.download_google_font(json.loads(body)['name'])
    return reply(200, {'family': family, 'pagesChanged': 'all', **touch()})
  if session is None:
    return reply(404, {'error': 'No hay ningún PDF abierto'})
  if path == '/api/do':
    req = json.loads(body)
    if req.get('version') != session.version:
      return reply(409, {'error': 'El documento cambió. Probá de nuevo.'})
    action = ACTIONS.get(req.get('action'))
    if not action:
      return reply(404, {'error': 'Acción desconocida'})
    result = session.run(action, req)
    return reply(200, {**result, 'pages': session.pages(), **session.state()})
  if path in ('/api/undo', '/api/redo'):
    delta = -1 if path == '/api/undo' else 1
    if not 0 <= session.index + delta < len(session.history):
      return reply(409, {'error': 'No hay nada para deshacer.'})
    session.move(delta)
    return reply(200, {'pages': session.pages(), **session.state()})
  if path == '/api/download':
    return download(json.loads(body or b'{}'))
  if path == '/api/insert':
    return insert_pdf(headers, body)
  return reply(404, {'error': 'Ruta desconocida'})


def touch():
  if session is None:
    return {}
  session.version += 1
  return session.state()


def open_pdf(headers, data):
  global session
  name = urllib.parse.unquote(headers.get('x-filename', 'documento.pdf'))
  password = urllib.parse.unquote(headers.get('x-password', ''))
  try:
    doc = fitz.open('pdf', data)
  except Exception:
    return reply(400, {'error': 'Ese archivo no se pudo leer como PDF.'})
  encrypted = doc.needs_pass
  if encrypted and not doc.authenticate(password):
    return reply(401, {'error': 'Contraseña incorrecta.' if password else 'Este PDF tiene contraseña.'})
  session = Session(doc.tobytes(encryption=fitz.PDF_ENCRYPT_NONE), name)
  return reply(200, {'name': name, 'pages': session.pages(), 'wasEncrypted': encrypted, **session.state()})


def download(req):
  doc = session.composed()
  if req.get('pages'):
    doc.select(parse_ranges(req['pages'], doc.page_count))
  options = {'garbage': 3, 'deflate': True, 'encryption': fitz.PDF_ENCRYPT_NONE}
  if req.get('password'):
    options.update(encryption=fitz.PDF_ENCRYPT_AES_256, user_pw=req['password'], owner_pw=req['password'])
  data = doc.tobytes(**options)
  filename = urllib.parse.quote(re.sub(r'\.pdf$', '', session.name, flags=re.I) + ('-paginas.pdf' if req.get('pages') else '-editado.pdf'))
  return reply(200, data, 'application/pdf', {'X-Filename': filename})


def insert_pdf(headers, data):
  after = int(headers.get('x-after', 0))
  try:
    other = fitz.open('pdf', data)
  except Exception:
    return reply(400, {'error': 'Ese archivo no se pudo leer como PDF.'})
  if other.needs_pass:
    return reply(422, {'error': 'Quitale la contraseña a ese PDF antes de agregarlo.'})
  doc = session.open_base()
  count = other.page_count
  doc.insert_pdf(other, start_at=after + 1)
  session.save_base(doc)
  session.book.scan(session.open_base())
  session.remap(lambda n: n + count if n > after else n)
  session.commit()
  return reply(200, {'pagesChanged': 'all', 'pages': session.pages(), **session.state()})
