import json
import csv
import re

# 1. Load existing HTML
with open('/root/.openclaw/workspace/lara-pages/chinese-gallery/vocabulary.html', 'r', encoding='utf-8') as f:
    html_content = f.read()

# Extract the current vocabulary array
match = re.search(r'const vocabulary = (\[\s*\{[\s\S]*?\}\s*\]);', html_content)
if not match:
    print('Could not find vocabulary array in HTML')
    exit(1)
duolingo_vocab = json.loads(match.group(1))

# 2. Process the new CSV file
csv_path = '/root/.openclaw/media/inbound/Урок_1---ebdb2588-2e22-423f-8b5b-40987875822b.csv'
zhun_vocab = []
with open(csv_path, 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        word = row.get('Слово(W)', '').strip()
        meaning = row.get('Значение(M)', '').strip()
        pinyin = row.get('Произношение(P)', '').strip()
        if word and meaning:
            zhun_vocab.append({
                'chinese': word,
                'pinyin': pinyin,
                'russian': meaning,
                'notes': ''
            })

# 3. Create the dictionaries object
dictionaries = {
    'Duolingo': duolingo_vocab,
    'Жун Урок 1': zhun_vocab
}
js_dict_string = json.dumps(dictionaries, ensure_ascii=False, indent=4)

# 4. Refactor HTML
# Replace variable definition
html_content = html_content.replace(match.group(1), js_dict_string)
# Wait, that replaces the array with the object, but the line still says 'const vocabulary = ...'
# Let's fix the variable name.
html_content = html_content.replace('const vocabulary =', 'const dictionaries =')

# Add Dictionary Selector
dict_selector_html = '''
        <div class="dict-selector">
            <label for="dictSelect">Словарь: </label>
            <select id="dictSelect" onchange="onDictChange()">
                <option value="Duolingo">Duolingo</option>
                <option value="Жун Урок 1">Жун Урок 1</option>
            </select>
        </div>
'''
html_content = html_content.replace('<div class="search-box">', dict_selector_html + '<div class="search-box">')

# Inject logic for dictionary switching
logic_head = f'''
        let currentVocab = dictionaries['Duolingo'];

        function onDictChange() {{
            const selected = document.getElementById('dictSelect').value;
            currentVocab = dictionaries[selected];
            
            if (document.getElementById('gallery').classList.contains('active')) {{
                searchVocabulary();
            }} else {{
                nextQuestion();
            }}
        }}
'''
# Insert the logic after the dictionaries definition
html_content = html_content.replace(f'const dictionaries = {js_dict_string};', f'const dictionaries = {js_dict_string};\n{logic_head}')

# Update references from 'vocabulary' to 'currentVocab'
html_content = html_content.replace('vocabulary.filter', 'currentVocab.filter')
html_content = html_content.replace('vocabulary[Math.floor', 'currentVocab[Math.floor')

# Add CSS
css_addition = '''
        .dict-selector {
            text-align: center;
            margin-bottom: 20px;
            font-weight: bold;
        }
        .dict-selector select {
            padding: 8px 15px;
            border-radius: 10px;
            border: 2px solid #2575fc;
            font-size: 14px;
            outline: none;
            cursor: pointer;
        }
'''
html_content = html_content.replace('</style>', css_addition + '</style>')

with open('/root/.openclaw/workspace/lara-pages/chinese-gallery/vocabulary.html', 'w', encoding='utf-8') as f:
    f.write(html_content)
