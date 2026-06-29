const fs = require('fs');
const path = './vocab_data.json';

try {
    const data = JSON.parse(fs.readFileSync(path, 'utf8'));
    
    // Map a simple structure to the one required by vocabulary.html
    const transformedData = data.map(item => ({
        chinese: item.word,
        pinyin: item.pinyin,
        russian: item.meaning,
        notes: ""
    }));

    console.log(JSON.stringify(transformedData, null, 2));
} catch (e) {
    console.error(e);
    process.exit(1);
}
