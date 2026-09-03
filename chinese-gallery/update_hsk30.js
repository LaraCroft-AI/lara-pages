const fs = require('fs');

// Official standard (GF 0025—2021), vocabulary table on PDF pages 42–175:
// https://www.moe.gov.cn/jyb_sjzl/ziliao/A19/202111/W020211118507389477190.pdf
// Machine-readable transcription pinned to a reviewed upstream revision:
// https://github.com/ivankra/hsk30/tree/4ff9e3915ce87baaecd7ebe263085573a4ea3192

const mainCsvPath = process.argv[2];
const expandedCsvPath = process.argv[3];
const vocabularyPath = process.argv[4] || './vocab_data.json';

if (!mainCsvPath || !expandedCsvPath) {
    console.error('Usage: node update_hsk30.js <hsk30.csv> <hsk30-expanded.csv> [vocab_data.json]');
    process.exit(1);
}

function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (quoted) {
            if (char === '"' && text[i + 1] === '"') {
                cell += '"';
                i++;
            } else if (char === '"') {
                quoted = false;
            } else {
                cell += char;
            }
        } else if (char === '"') {
            quoted = true;
        } else if (char === ',') {
            row.push(cell);
            cell = '';
        } else if (char === '\n') {
            row.push(cell.replace(/\r$/, ''));
            rows.push(row);
            row = [];
            cell = '';
        } else {
            cell += char;
        }
    }

    if (cell || row.length) {
        row.push(cell.replace(/\r$/, ''));
        rows.push(row);
    }

    const headers = rows.shift();
    return rows
        .filter(values => values.some(Boolean))
        .map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])));
}

const mainRows = parseCsv(fs.readFileSync(mainCsvPath, 'utf8').replace(/^\uFEFF/, ''));
const expandedRows = parseCsv(fs.readFileSync(expandedCsvPath, 'utf8').replace(/^\uFEFF/, ''));

const expectedCounts = { '1': 500, '2': 772, '3': 973, '4': 1000, '5': 1071, '6': 1140, '7-9': 5636 };
const actualCounts = Object.fromEntries(Object.keys(expectedCounts).map(level => [level, 0]));
for (const row of mainRows) actualCounts[row.Level] = (actualCounts[row.Level] || 0) + 1;

if (mainRows.length !== 11092 || JSON.stringify(actualCounts) !== JSON.stringify(expectedCounts)) {
    throw new Error(`Unexpected HSK source totals: ${mainRows.length} ${JSON.stringify(actualCounts)}`);
}

const rank = { '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7-9': 7 };
const levelsByWord = new Map();
for (const row of expandedRows) {
    const word = row.Simplified.trim();
    const level = row.Level;
    if (!word || row.Example || !rank[level]) continue;

    const previous = levelsByWord.get(word);
    if (!previous || rank[level] < rank[previous]) levelsByWord.set(word, level);
}

const dictionaries = JSON.parse(fs.readFileSync(vocabularyPath, 'utf8'));
let total = 0;
let matched = 0;

for (const words of Object.values(dictionaries)) {
    for (const item of words) {
        delete item.hsk;
        const sourceLevel = levelsByWord.get(item.word);
        item.hsk30 = sourceLevel === '7-9' ? '7–9' : sourceLevel ? Number(sourceLevel) : null;
        total++;
        if (sourceLevel) matched++;
    }
}

fs.writeFileSync(vocabularyPath, `${JSON.stringify(dictionaries, null, 2)}\n`);
console.log(`Updated ${total} entries: ${matched} matched, ${total - matched} not listed`);
