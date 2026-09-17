// State. Kept in the script's lexical scope; mirror the live values on
// window via getters so tests/console always see the current binding.
let allDictionaries = {};
let activeDictNames = [];
let currentVocab = [];
let trainingPool = [];
let currentQuestion = null;
let totalWordsAtStart = 0;
let correctAnswers = 0;
let totalAnswers = 0;
let nextQuestionTimer = null;
// 'ru2hanzi': question = Russian meaning, options = pinyin + hanzi
// 'hanzi2ru': question = hanzi + pinyin,   options = Russian meaning
let trainingMode = 'ru2hanzi';
Object.defineProperties(window, {
    allDictionaries: { configurable: true, get: () => allDictionaries },
    currentQuestion:  { configurable: true, get: () => currentQuestion },
    trainingMode:     { configurable: true, get: () => trainingMode },
    trainingPool:     { configurable: true, get: () => trainingPool },
});

async function init() {
    const list = document.getElementById('vocabList');
    try {
        let data = null;
        // Загружаем словари из data/vocab_data.json (единственный источник данных)
        const response = await fetch('data/vocab_data.json', { cache: 'no-store' });
        if (response.ok) data = await response.json();

        if (!data || typeof data !== 'object') throw new Error('no data');
        allDictionaries = data;
        window.ChineseMaps.init(data);

        const chipsContainer = document.getElementById('dictChips');
        chipsContainer.innerHTML = '';

        const dictNames = Object.keys(allDictionaries);
        dictNames.forEach((name) => {
            const chip = document.createElement('button');
            chip.className = 'dict-chip';
            chip.innerHTML = `<span class="dot"></span><span>${name}</span>`;
            chip.onclick = () => toggleDict(name, chip);
            chipsContainer.appendChild(chip);
        });

        document.getElementById('dictCount').innerText = `(${dictNames.length})`;
        // Ensure gallery is the visible tab on first load
        document.getElementById('gallery').classList.add('active');
        document.getElementById('training').classList.remove('active');
        document.getElementById('btn-gallery').classList.add('active');
        document.getElementById('btn-training').classList.remove('active');
        // No dictionary is selected by default. Render the empty state for the active tab
        // and don't pre-warm training (it has nothing to show).
        renderEmptyStateForActiveTab();
        updateProgress();
    } catch (error) {
        console.error("Ошибка загрузки словарей:", error);
        window.ChineseMaps.showError();
        if (list) list.innerHTML = '<div class="empty-state col-span-full"><div class="text-4xl mb-3">⚠️</div><p class="empty-state-heading">Не удалось загрузить словари</p><p class="text-sm mt-1">Проверьте, что файл data/vocab_data.json доступен</p></div>';
        const q = document.getElementById('questionWord');
        if (q) { q.innerText = '⚠ Словари не загружены'; q.classList.add('question-message'); q.classList.remove('question-hanzi'); }
        const qp = document.getElementById('questionPinyin');
        if (qp) { qp.innerText = '';  }
    }
}

function toggleDict(name, element) {
    if (activeDictNames.includes(name)) {
        activeDictNames = activeDictNames.filter(n => n !== name);
        element.classList.remove('active');
    } else {
        activeDictNames.push(name);
        element.classList.add('active');
    }
    updateCurrentVocab();
}

function updateCurrentVocab() {
    clearTimeout(nextQuestionTimer);
    nextQuestionTimer = null;
    currentVocab = [];
    activeDictNames.forEach(name => {
        if (allDictionaries[name]) {
            currentVocab = [...currentVocab, ...allDictionaries[name]];
        }
    });

    if (document.getElementById('gallery').classList.contains('active')) {
        searchVocabulary();
    } else if (document.getElementById('training').classList.contains('active')) {
        startTraining();
    }
}

function switchTab(tabId) {
    document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('#btn-gallery, #btn-training').forEach(b => b.classList.remove('active'));

    document.getElementById(tabId).classList.add('active');
    document.getElementById('btn-' + tabId).classList.add('active');

    if (tabId === 'gallery') {
        searchVocabulary();
     } else if (tabId === 'training') {
         // Highlight the default active mode button
        const ruBtn = document.getElementById('mode-ru2hanzi');
        if (ruBtn) ruBtn.classList.toggle('active', trainingMode === 'ru2hanzi');
        document.getElementById('mode-hanzi2ru').classList.toggle('active', trainingMode === 'hanzi2ru');
        startTraining();
     }
 }
function renderEmptyStateForActiveTab() {
    const gallery = document.getElementById('gallery');
    const training = document.getElementById('training');
    const isGallery = gallery && gallery.classList.contains('active');

    if (isGallery) {
        const list = document.getElementById('vocabList');
        if (list) list.innerHTML = `
            <div class="empty-state col-span-full">
                <div class="text-5xl mb-4">📚</div>
                <p class="font-hanzi empty-state-glyph">选词</p>
                <p class="empty-state-heading">Выберите словари выше</p>
                <p class="text-sm mt-1 text-muted">Нажмите на чипсы, чтобы начать</p>
            </div>`;
        const stats = document.getElementById('searchStats');
        if (stats) stats.innerText = '';
    } else if (training) {
        const q = document.getElementById('questionWord');
        if (q) { q.innerText = 'Выберите словари'; q.classList.remove('question-message'); q.classList.remove('question-hanzi'); }
        const qp = document.getElementById('questionPinyin');
        if (qp) { qp.innerText = '';  }
        const fb = document.getElementById('feedback');
        if (fb) fb.innerText = '';
        const grid = document.getElementById('optionsGrid');
        if (grid) grid.innerHTML = '';
    }
}

function searchVocabulary() {
    const input = document.getElementById('searchInput').value.toLowerCase().trim();
    const pinyinQuery = input.replace(/[\s'’]/g, '');
    const list = document.getElementById('vocabList');
    const stats = document.getElementById('searchStats');
    list.innerHTML = '';

    if (activeDictNames.length === 0) {
        renderEmptyStateForActiveTab();
        return;
    }

    if (!currentVocab || currentVocab.length === 0) {
        list.innerHTML = `
            <div class="empty-state col-span-full">
                <div class="text-4xl mb-3">🈳</div>
                <p class="empty-state-heading">В словарях пока пусто</p>
            </div>`;
        stats.innerText = '';
        return;
    }

    const filtered = currentVocab.filter(item =>
        item.word.toLowerCase().includes(input) ||
        (pinyinQuery && item.pinyin.toLowerCase().replace(/[\s'’]/g, '').includes(pinyinQuery)) ||
        item.meaning.toLowerCase().includes(input)
    );

    stats.innerText = input
        ? `Найдено: ${filtered.length} из ${currentVocab.length}`
        : `Всего слов: ${currentVocab.length}`;

    if (filtered.length === 0) {
        list.innerHTML = `
            <div class="empty-state col-span-full">
                <div class="text-4xl mb-3">🔍</div>
                <p class="empty-state-heading">Ничего не найдено</p>
                <p class="text-sm mt-1">Попробуйте другой запрос</p>
            </div>`;
        return;
    }

    filtered.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = 'vocab-card ink-card rounded-2xl p-6 cursor-pointer';
        card.style.animationDelay = `${Math.min(index * 0.02, 0.4)}s`;

        // Tone color markers for pinyin
        const pinyinHtml = item.pinyin.split(' ').map(syllable => {
            const tones = syllable.match(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/g);
            const tone = tones ? tones[0] : null;
            const toneClass = {
                'ā': 'pinyin-a', 'á': 'pinyin-a', 'ǎ': 'pinyin-a', 'à': 'pinyin-a',
                'ē': 'pinyin-e', 'é': 'pinyin-e', 'ě': 'pinyin-e', 'è': 'pinyin-e',
                'ī': 'pinyin-i', 'í': 'pinyin-i', 'ǐ': 'pinyin-i', 'ì': 'pinyin-i',
                'ō': 'pinyin-o', 'ó': 'pinyin-o', 'ǒ': 'pinyin-o', 'ò': 'pinyin-o',
                'ū': 'pinyin-u', 'ú': 'pinyin-u', 'ǔ': 'pinyin-u', 'ù': 'pinyin-u'
            }[tone] || 'pinyin-neutral';
            return `<span class="${toneClass}">${syllable}</span>`;
        }).join(' ');

        card.innerHTML = `
            <div class="flex items-start justify-between mb-3">
                <div class="hanzi-display text-4xl">${item.word}</div>
                <div class="flex flex-col items-end gap-1">
                    <span class="text-xs px-2 py-0.5 rounded-full hsk-badge">${item.hsk30 ? 'HSK 3.0: ' + item.hsk30 : 'HSK 3.0: —'}</span>
                </div>
            </div>
            <div class="font-medium text-base mb-2 tracking-wide">${pinyinHtml}</div>
            <div class="text-sm text-secondary">${item.meaning}</div>
            <div class="mt-3 pt-3 flex items-center justify-between vocab-card-footer">
                <span class="text-xs text-faint">коснитесь для озвучки</span>
                <span class="text-xs opacity-50">🔊</span>
            </div>
        `;
        card.onclick = () => speak(item.word);
        list.appendChild(card);
    });
}

function speak(text) {
    if ('speechSynthesis' in window) {
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'zh-CN';
        utter.rate = 0.8;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utter);
    }
}

function startTraining() {
    clearTimeout(nextQuestionTimer);
    nextQuestionTimer = null;
    trainingPool = [...currentVocab];
    totalWordsAtStart = trainingPool.length;
    correctAnswers = 0;
    totalAnswers = 0;
    updateAccuracy();
    nextQuestion();
}

function resetTraining() {
    startTraining();
}

function setTrainingMode(mode) {
    if (mode !== 'ru2hanzi' && mode !== 'hanzi2ru') return;
    if (trainingMode === mode) return;
    trainingMode = mode;
    // Toggle the button highlight.
    const a = document.getElementById('mode-ru2hanzi');
    const b = document.getElementById('mode-hanzi2ru');
    if (a && b) {
        a.classList.toggle('active', mode === 'ru2hanzi');
        b.classList.toggle('active', mode === 'hanzi2ru');
    }
    // Reset progress so the new mode starts fresh.
    startTraining();
}

function nextQuestion() {
    const feedback = document.getElementById('feedback');
    feedback.innerText = '';

    const questionCard = document.getElementById('questionCard');
    const questionWord = document.getElementById('questionWord');

    if (!trainingPool || trainingPool.length === 0) {
        currentQuestion = null;
        document.getElementById('questionPinyin').innerText = '';
        if (activeDictNames.length === 0) {
            renderEmptyStateForActiveTab();
            updateProgress();
            return;
        }
        if (totalWordsAtStart === 0) {
            questionWord.innerText = 'Словарь пуст';
            questionWord.classList.add('question-message');
            questionWord.classList.remove('question-hanzi');
        } else {
            questionCard.classList.add('celebration');
            questionWord.innerText = '🎉 Все слова выучены!';
            questionWord.classList.add('question-message');
            questionWord.classList.remove('question-hanzi');
        }
        document.getElementById('optionsGrid').innerHTML = '';
        updateProgress();
        return;
    }

    questionCard.classList.remove('celebration');
    questionWord.classList.remove('question-message');
    questionWord.classList.remove('question-hanzi');
    const questionPinyin = document.getElementById('questionPinyin');

    currentQuestion = trainingPool[Math.floor(Math.random() * trainingPool.length)];

    // Render the question card according to the active training mode.
    if (trainingMode === 'hanzi2ru') {
        questionWord.innerText = currentQuestion.word;
        questionWord.classList.add('question-hanzi');
        questionPinyin.hidden = false;
        questionPinyin.innerText = currentQuestion.pinyin;

    } else {
        // ru2hanzi (default): show only the Russian meaning, no pinyin line.
        questionWord.innerText = currentQuestion.meaning;
        questionWord.classList.remove('question-hanzi');
        questionPinyin.hidden = true;
    }

    let options = [currentQuestion];
    let attempts = 0;
    while (options.length < 3 && currentVocab.length > options.length && attempts < 50) {
        attempts++;
        let randomWord = currentVocab[Math.floor(Math.random() * currentVocab.length)];
        if (!options.find(o => o.word === randomWord.word)) {
            options.push(randomWord);
        }
    }
    options.sort(() => Math.random() - 0.5);

    const grid = document.getElementById('optionsGrid');
    grid.innerHTML = '';

    options.forEach((opt, idx) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        // In hanzi2ru mode, options show Russian meaning; in ru2hanzi, they show pinyin + hanzi.
        const inner = trainingMode === 'hanzi2ru'
            ? `<span class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 option-number">${idx + 1}</span>
               <div class="flex-1 min-w-0">
                 <div class="font-semibold tracking-wide option-label">${opt.meaning}</div>
               </div>`
            : `<span class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 option-number">${idx + 1}</span>
               <div class="flex-1 min-w-0">
                 <div class="font-semibold tracking-wide option-label">${opt.pinyin}</div>
               </div>
               <span class="font-hanzi shrink-0 option-hanzi">${opt.word}</span>`;
        btn.innerHTML = inner;
        btn._opt = opt;  // store the option data so checkAnswer can find the correct one in any mode.
        btn.onclick = () => checkAnswer(btn, opt);
        grid.appendChild(btn);
    });

    updateProgress();
}

function checkAnswer(btn, selectedOpt) {
    const allBtns = document.querySelectorAll('.option-btn');
    allBtns.forEach(b => b.disabled = true);
    totalAnswers++;

    if (selectedOpt.word === currentQuestion.word) {
        btn.classList.add('correct');
        correctAnswers++;
        document.getElementById('feedback').innerText = '✓ Правильно!';
        document.getElementById('feedback').dataset.result = 'correct';
        trainingPool = trainingPool.filter(item => item.word !== currentQuestion.word);
    } else {
        btn.classList.add('wrong');
        document.getElementById('feedback').innerText = '✗ Попробуй ещё раз';
        document.getElementById('feedback').dataset.result = 'wrong';
        // Highlight the correct option regardless of mode.
        allBtns.forEach(b => {
            if (b._opt && b._opt.word === currentQuestion.word) {
                b.classList.add('correct');
            }
        });
    }

    updateAccuracy();
    nextQuestionTimer = setTimeout(() => {
        nextQuestionTimer = null;
        nextQuestion();
    }, 1800);
}

function updateProgress() {
    const remaining = trainingPool.length;
    document.getElementById('progressText').innerText = `Осталось: ${remaining} / ${totalWordsAtStart}`;
    const percent = totalWordsAtStart === 0 ? 0 : ((totalWordsAtStart - remaining) / totalWordsAtStart) * 100;
    document.getElementById('progressBar').style.width = `${percent}%`;
}

function updateAccuracy() {
    const acc = totalAnswers === 0 ? '—' : Math.round((correctAnswers / totalAnswers) * 100) + '%';
    document.getElementById('accuracyText').innerText = `Точность: ${acc}`;
}

document.getElementById('btn-gallery').addEventListener('click', () => switchTab('gallery'));
document.getElementById('btn-training').addEventListener('click', () => switchTab('training'));
document.getElementById('mode-ru2hanzi').addEventListener('click', () => setTrainingMode('ru2hanzi'));
document.getElementById('mode-hanzi2ru').addEventListener('click', () => setTrainingMode('hanzi2ru'));
document.getElementById('reset-training').addEventListener('click', resetTraining);
document.getElementById('searchInput').addEventListener('input', searchVocabulary);

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
