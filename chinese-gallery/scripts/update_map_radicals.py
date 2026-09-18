"""Build the LGPL character/radical projection from Make Me a Hanzi JSONL."""
import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
vocabulary = json.loads((root / 'data/vocab_data.json').read_text())
characters = set(''.join(item['word'] for words in vocabulary.values() for item in words))
source = [json.loads(line) for line in Path(sys.argv[1]).read_text().splitlines() if line.strip()]
radicals = {item['character']: item['radical'] for item in source if item['character'] in characters}
# The same component 阝 denotes two different Kangxi radicals by position.
for item in source:
    if item['character'] in characters and item['radical'] == '阝':
        decomposition = item.get('decomposition', '')
        if decomposition.startswith('⿰阝'):
            radicals[item['character']] = '阜'
        elif decomposition.startswith('⿰') and decomposition.endswith('阝'):
            radicals[item['character']] = '邑'
        else:
            raise ValueError(f"Ambiguous 阝 position: {item['character']} {decomposition}")
# 〇 is a numeric symbol absent from the upstream character dictionary.
# Keep it explicitly unclassified instead of assigning an invented radical.
if '〇' in characters:
    radicals['〇'] = None
# 囍 is absent from Make Me a Hanzi; ZDIC lists 口 as its radical.
# https://www.zdic.net/hans/囍 (verified 2026-09-18).
if '囍' in characters:
    radicals['囍'] = '口'
missing = characters - radicals.keys()
if missing:
    raise ValueError(f'Missing characters: {"".join(sorted(missing))}')
(root / 'data/character-radicals.json').write_text(json.dumps(radicals, ensure_ascii=False, indent=2) + '\n')
print(f'Updated {len(radicals)} character radicals')
