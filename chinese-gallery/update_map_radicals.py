"""Build the LGPL character/radical projection from Make Me a Hanzi JSONL."""
import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parent
vocabulary = json.loads((root / 'vocab_data.json').read_text())
characters = set(''.join(item['word'] for words in vocabulary.values() for item in words))
source = [json.loads(line) for line in Path(sys.argv[1]).read_text().splitlines() if line.strip()]
radicals = {item['character']: item['radical'] for item in source if item['character'] in characters}
# 〇 is a numeric symbol absent from the upstream character dictionary.
# Keep it explicitly unclassified instead of assigning an invented radical.
if '〇' in characters:
    radicals['〇'] = None
missing = characters - radicals.keys()
if missing:
    raise ValueError(f'Missing characters: {"".join(sorted(missing))}')
(root / 'data/character-radicals.json').write_text(json.dumps(radicals, ensure_ascii=False, indent=2) + '\n')
print(f'Updated {len(radicals)} character radicals')
