"""Build public/data/catalog.json from the wiki lists and the sold-price snapshot.
Refresh: scrape https://hotwheels.fandom.com/wiki/List_of_<year>_Hot_Wheels to markdown,
run scripts/parse-wiki-list.py into data/sources/wiki-<year>.json, then: npm run catalog"""
import json, re
from datetime import date

def load(p):
    return json.load(open(p, encoding='utf-8'))

prices = load('data/sources/prices-2026.json')
norm = lambda s: re.sub(r'[^a-z0-9]', '', re.sub(r'\(.*?\)', '', s.lower()))

def price_for(row):
    want = 'S' if row['type'] == 'super_treasure_hunt' else 'T'
    n = norm(row['name'])
    for p in prices['cars']:
        pn = norm(p['car'])
        if p['t'] == want and (pn == n or n.startswith(pn) or pn.startswith(n)):
            return p
    return None

cars = []
for year, status in ((2026, 'released'), (2027, 'upcoming')):
    for r in load(f'data/sources/wiki-{year}.json'):
        car = {
            'id': r['toy'], 'y': year, 'col': r['col'], 'name': r['name'], 'v': r['version'],
            'series': r['series'], 'sno': r['seriesNo'], 'type': r['type'], 'status': status,
        }
        if r.get('variant'): car['variant'] = r['variant']
        if r['isNew']: car['new'] = True
        if r['exclusive']: car['excl'] = r['exclusive']
        if r['img']: car['img'] = r['img']
        if year == 2026 and r['type'] != 'mainline':
            p = price_for(r)
            if p:
                car.update({'case': p['cs'], 'paint': p['spot'], 'now': p['now'], 'avg': p['avg'],
                            'chg': p['chg'], 'sales': p['sales']})
                if p['low']: car['thin'] = True
        cars.append(car)

missing = [c['name'] for c in cars if c['y'] == 2026 and c['type'] != 'mainline' and 'now' not in c]
out = {
    'updated': date.today().isoformat(),
    'pricesSaved': prices['saved'],
    'shelf': prices['shelf'], 'superAvg': prices['superAvg'], 'thAvg': prices['thAvg'],
    'sources': {
        'models': 'Hot Wheels Wiki (hotwheels.fandom.com), lists of 2026 and 2027 Hot Wheels, CC BY-SA',
        'prices': prices['source'],
    },
    'cars': cars,
}
json.dump(out, open('public/data/catalog.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(len(cars), 'cars;', 'no price for:', missing)
