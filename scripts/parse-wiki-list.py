"""Turn the scraped 'List of <year> Hot Wheels' wiki page (markdown) into catalog rows.
Usage: python3 scripts/parse-wiki-list.py <page.md> <year> > rows.json"""
import json, re, sys

src, year = sys.argv[1], int(sys.argv[2])
LINK = re.compile(r'\[([^\]]*)\]\(((?:[^()\s]|\([^()\s]*\))+)(?:\s+"[^"]*")?\)')

def text(cell):
    cell = re.sub(r'!\[[^\]]*\]\([^)]*\)', '', cell)
    cell = LINK.sub(lambda m: m.group(1), cell)
    return re.sub(r'\*\*|<br>', ' ', cell).replace('\\', '').strip()

rows = []
for line in open(src, encoding='utf-8'):
    if not re.match(r'^\| [A-Z0-9]{5} \|', line):
        continue
    cells = [c.strip() for c in line.strip().strip('|').split(' | ')]
    if len(cells) < 6:
        continue
    toy, col, name_cell, series_cell, sno, photo = cells[:6]
    series_parts = [text(p) for p in series_cell.split('<br>')]
    tags = [p for p in series_parts[1:] if p]
    name = text(name_cell)
    color_m = re.search(r'\((\d+)(?:st|nd|rd|th) Colou?r(?:\s*-\s*([^)]+))?\)\s*$', name)
    img = None
    m = re.search(r'\]\((https://static\.wikia\.nocookie\.net/[^)\s]+)\)\s*$', photo)
    if m and 'Image_Not_Available' not in m.group(1):
        img = m.group(1).split('/revision/')[0] + '/revision/latest/scale-to-width-down/300'
    t = 'mainline'
    if any('Super Treasure Hunt' in x for x in tags): t = 'super_treasure_hunt'
    elif any('Treasure Hunt' in x for x in tags): t = 'treasure_hunt'
    rows.append({
        'toy': toy, 'year': year, 'col': int(col) if col.isdigit() else None,
        'name': re.sub(r'\s*\(\d+(?:st|nd|rd|th) Colou?r[^)]*\)\s*$', '', name),
        'version': int(color_m.group(1)) if color_m else 1,
        'variant': (color_m.group(2) or '').strip() or None if color_m else None,
        'series': series_parts[0], 'seriesNo': sno, 'type': t,
        'isNew': any('New for' in x for x in tags),
        'exclusive': next((x.replace(' Exclusive', '') for x in tags if 'Exclusive' in x), None),
        'img': img,
    })
json.dump(rows, sys.stdout, ensure_ascii=False)
