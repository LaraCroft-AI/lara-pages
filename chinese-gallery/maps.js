(() => {
    'use strict';
    const $ = id => document.getElementById(id);
    const PAGE_SIZE = 8;
    const state = { type: 'radical', node: '亻', level: 'all', page: 0,
        view: window.matchMedia('(max-width: 760px)').matches ? 'list' : 'map', query: '' };
    let vocabulary = [], radicals = {}, catalogs = {}, ready = false;
    let loading = null;
    const normalize = value => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    function route() {
        const isMaps = location.hash.split('?')[0] === '#maps';
        $('lessons').hidden = isMaps;
        $('maps').hidden = !isMaps;
        for (const section of ['lessons', 'maps']) {
            const active = (section === 'maps') === isMaps;
            if (active) $('nav-' + section).setAttribute('aria-current', 'page');
            else $('nav-' + section).removeAttribute('aria-current');
        }
        document.title = `${isMaps ? 'Карты иероглифов' : 'Уроки'} · Китайский язык`;
        if (isMaps && ready) { readRoute(); render(); }
    }

    function readRoute() {
        const params = new URLSearchParams(location.hash.split('?')[1] || '');
        if (!params.size) return;
        state.type = params.get('type') === 'character' ? 'character' : 'radical';
        const level = params.get('level');
        state.level = ['all', '1', '2', '3', '4', '5', '6', '7–9', 'none'].includes(level) ? level : 'all';
        state.node = catalogs[state.type].find(node => node.id === params.get('node'))?.id || catalogs[state.type][0].id;
        state.page = 0;
        state.query = '';
        $('map-search').value = '';
    }

    function saveRoute() {
        if ($('maps').hidden) return;
        const params = new URLSearchParams({ type: state.type, node: state.node, level: state.level });
        history.replaceState(null, '', '#maps?' + params.toString());
    }

    function matchingWords(node, type = state.type) {
        return vocabulary.filter(item => type === 'character'
            ? item.word.includes(node.id) && item.word !== node.id
            : [...item.word].some(char => node.forms.includes(radicals[char])));
    }

    function filterLevel(words) {
        return words.filter(item => state.level === 'all' || (state.level === 'none' ? item.hsk30 == null : String(item.hsk30) === state.level));
    }

    function currentNode() { return catalogs[state.type].find(node => node.id === state.node); }
    function wordsForNode(node) { return filterLevel(node.words); }

    function wordMarkup(item, node) {
        const word = [...item.word].map(char => {
            const matches = state.type === 'character' ? char === node.id : node.forms.includes(radicals[char]);
            return matches ? `<mark>${escapeHTML(char)}</mark>` : escapeHTML(char);
        }).join('');
        return `<span class="map-glyph" lang="zh-CN">${word}</span><span class="map-pinyin">${escapeHTML(item.pinyin)}</span><span class="map-translation">${escapeHTML(item.meaning)}</span><span class="map-level">${item.hsk30 == null ? 'Вне списка HSK' : 'HSK 3.0: ' + item.hsk30}</span>`;
    }

    function wordButton(item, node) {
        const button = document.createElement('button');
        button.className = 'map-word';
        button.innerHTML = wordMarkup(item, node);
        button.setAttribute('aria-label', `${item.word}, ${item.pinyin}, ${item.meaning}. Слушать`);
        button.title = `${item.word} · ${item.pinyin} · ${item.meaning}`;
        button.addEventListener('click', () => {
            $('map-word-detail').hidden = false;
            $('map-word-detail').textContent = `${item.word} · ${item.pinyin} · ${item.meaning}`;
            window.speak(item.word);
        });
        return button;
    }

    function renderNodes() {
        const list = $('map-node-list');
        list.replaceChildren();
        let count = 0;
        for (const node of catalogs[state.type]) {
            if (!normalize([node.id, node.pinyin, node.meaning].join(' ')).includes(normalize(state.query))) continue;
            const words = wordsForNode(node);
            if (!words.length && node.id !== state.node) continue;
            const button = document.createElement('button');
            button.className = 'map-node';
            button.setAttribute('aria-pressed', String(node.id === state.node));
            button.setAttribute('aria-label', `${node.id} — ${node.meaning}, слов: ${words.length}`);
            button.dataset.node = node.id;
            button.innerHTML = `<span class="map-glyph" lang="zh-CN">${escapeHTML(node.id)}</span><span class="map-pinyin">${escapeHTML(node.pinyin)}</span><small>${words.length} сл.</small>`;
            button.disabled = words.length === 0 && node.id !== state.node;
            button.addEventListener('click', () => {
                state.node = node.id; state.page = 0; render(); saveRoute();
                // Keep keyboard focus on the selected node after rebuilding the list.
                [...list.children].find(child => child.dataset.node === node.id)?.focus({ preventScroll: true });
            });
            list.appendChild(button);
            count++;
        }
        $('map-node-empty').hidden = count > 0;
    }

    function renderMap() {
        const node = currentNode();
        const words = wordsForNode(node);
        $('map-word-detail').hidden = true;
        state.page = Math.min(state.page, Math.max(0, Math.ceil(words.length / PAGE_SIZE) - 1));
        $('map-title').textContent = `${node.id} · ${node.pinyin} · ${node.meaning}`;
        $('map-title').title = $('map-title').textContent;
        $('map-summary').textContent = `${state.type === 'radical' ? 'Ключ' : 'Иероглиф'} · ${words.length} из ${node.words.length} слов`;
        $('map-empty').hidden = words.length > 0;
        $('map-scroll').hidden = state.view !== 'map' || !words.length;
        $('map-word-list').hidden = state.view !== 'list' || !words.length;
        $('map-pagination').hidden = state.view === 'list' || !words.length;
        $('map-print').disabled = $('map-practice').disabled = !words.length;
        document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === state.view)));
        const canvas = $('map-canvas');
        canvas.replaceChildren();
        $('map-word-list').replaceChildren();
        if (!words.length) return;
        if (state.view === 'list') {
            for (const item of words) $('map-word-list').appendChild(wordButton(item, node));
            return;
        }
        const displayed = words.slice(state.page * PAGE_SIZE, (state.page + 1) * PAGE_SIZE);
        drawMap(canvas, node, displayed);
        $('map-prev').disabled = state.page === 0;
        $('map-next').disabled = (state.page + 1) * PAGE_SIZE >= words.length;
        $('map-page').textContent = `${state.page * PAGE_SIZE + 1}–${Math.min((state.page + 1) * PAGE_SIZE, words.length)} из ${words.length} слов`;
    }

    function drawMap(canvas, node, displayed) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 840 620');
        svg.setAttribute('aria-hidden', 'true');
        canvas.appendChild(svg);
        const center = document.createElement('div');
        center.className = 'map-center ' + state.type;
        center.innerHTML = `<span class="map-glyph" lang="zh-CN">${escapeHTML(node.id)}</span><span>${escapeHTML(node.pinyin)}</span><span class="map-meaning">${escapeHTML(node.meaning)}</span>`;
        canvas.appendChild(center);
        displayed.forEach((item, index) => {
            const angle = -Math.PI / 2 + index * 2 * Math.PI / displayed.length;
            const x = 420 + 325 * Math.cos(angle), y = 310 + 230 * Math.sin(angle);
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            for (const [key, value] of Object.entries({ x1: 420, y1: 310, x2: x, y2: y })) line.setAttribute(key, value);
            svg.appendChild(line);
            const button = wordButton(item, node);
            button.style.left = x + 'px'; button.style.top = y + 'px';
            canvas.appendChild(button);
        });
    }

    function render() {
        document.querySelectorAll('[data-level]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.level === state.level)));
        document.querySelectorAll('[data-map-type]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mapType === state.type)));
        $('map-type-description').textContent = state.type === 'radical'
            ? `${catalogs.radical.length} ключей. Строительные элементы иероглифов.`
            : `${catalogs.character.length} иероглифов. Знакомые знаки в составе слов.`;
        renderNodes(); renderMap();
    }

    function printMaterial(practice) {
        const node = currentNode(), words = wordsForNode(node);
        if (!words.length) return;
        let print = $('mapPrint');
        if (!print) { print = document.createElement('div'); print.id = 'mapPrint'; document.body.appendChild(print); }
        const level = state.level === 'all' ? 'Все уровни HSK 3.0' : state.level === 'none' ? 'Вне списка HSK' : `HSK 3.0: ${state.level}`;
        print.innerHTML = `<h1>${practice ? 'Прописи' : 'Карта слов'}: ${escapeHTML(node.id)} · ${escapeHTML(node.meaning)}</h1><p>${escapeHTML(node.pinyin)} · ${level} · ${words.length} слов</p>`;
        if (!practice) {
            for (let offset = 0; offset < words.length; offset += PAGE_SIZE) {
                const sheet = document.createElement('section'); sheet.className = 'print-map-sheet';
                if (offset > 0) sheet.innerHTML = `<h2>${escapeHTML(node.id)} · ${escapeHTML(node.meaning)}</h2>`;
                const range = document.createElement('p'); range.textContent = `${offset + 1}–${Math.min(offset + PAGE_SIZE, words.length)} из ${words.length} слов`;
                const canvas = document.createElement('div'); canvas.className = 'map-canvas';
                drawMap(canvas, node, words.slice(offset, offset + PAGE_SIZE));
                sheet.append(range, canvas); print.appendChild(sheet);
            }
        }
        for (const item of practice ? words : []) {
            const row = document.createElement('div');
            row.className = 'practice-row';
            row.innerHTML = `<div class="practice-label">${escapeHTML(item.word)} · ${escapeHTML(item.pinyin)} · ${escapeHTML(item.meaning)}</div>`;
            for (const char of item.word) {
                const cells = document.createElement('div'); cells.className = 'practice-cells';
                for (let i = 0; i < 10; i++) {
                    const cell = document.createElement('span'); cell.className = 'practice-cell' + (i === 1 || i === 2 ? ' trace' : '');
                    cell.textContent = i < 3 ? char : ''; cells.appendChild(cell);
                }
                row.appendChild(cells);
            }
            print.appendChild(row);
        }
        document.body.classList.add('printing-map');
        window.print();
    }

    function showError() {
        $('maps-loading').hidden = false;
        $('maps-content').hidden = true;
        $('maps-loading').replaceChildren();
        const message = document.createElement('p');
        message.textContent = 'Не удалось загрузить карты. Проверьте соединение и повторите загрузку.';
        const retry = document.createElement('button');
        retry.className = 'map-button'; retry.textContent = 'Повторить';
        retry.addEventListener('click', () => location.reload());
        $('maps-loading').append(message, retry);
    }

    async function init(dictionaries) {
        if (loading) return loading;
        loading = (async () => {
            try {
                const response = await fetch('data/character-radicals.json');
                if (!response.ok) throw new Error('Radical data unavailable');
                radicals = await response.json();
                vocabulary = [...new Map(Object.values(dictionaries).flat().map(item => [item.word, item])).values()];
                catalogs.radical = window.mapCatalog.radicals.map(([id, pinyin, meaning, forms]) => ({ id, pinyin, meaning, forms }));
                const characters = new Map(window.mapCatalog.characters.map(([id, pinyin, meaning]) => [id, { id, pinyin, meaning }]));
                for (const item of vocabulary) {
                    if ([...item.word].length === 1 && !characters.has(item.word)) characters.set(item.word, { id: item.word, pinyin: item.pinyin, meaning: item.meaning });
                }
                catalogs.character = [...characters.values()];
                for (const type of ['radical', 'character']) {
                    catalogs[type].forEach(node => { node.words = matchingWords(node, type); });
                    catalogs[type] = catalogs[type].filter(node => node.words.length > 0);
                }
                ready = true;
                readRoute(); render();
                $('maps-loading').hidden = true;
                $('maps-content').hidden = false;
            } catch (error) {
                console.error('Ошибка загрузки карт:', error); showError();
            }
        })();
        return loading;
    }

    document.querySelectorAll('[data-level]').forEach(button => button.addEventListener('click', () => {
        state.level = button.dataset.level; state.page = 0; render(); saveRoute();
    }));
    document.querySelectorAll('[data-map-type]').forEach(button => button.addEventListener('click', () => {
        state.type = button.dataset.mapType;
        state.node = (catalogs[state.type].find(node => wordsForNode(node).length) || catalogs[state.type][0]).id;
        state.page = 0; state.query = ''; $('map-search').value = ''; render(); saveRoute();
    }));
    document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
        state.view = button.dataset.view; renderMap();
    }));
    $('map-search').addEventListener('input', event => { state.query = event.target.value; renderNodes(); });
    $('map-reset-level').addEventListener('click', () => { state.level = 'all'; render(); saveRoute(); });
    $('map-prev').addEventListener('click', () => { state.page--; renderMap(); });
    $('map-next').addEventListener('click', () => { state.page++; renderMap(); });
    $('map-print').addEventListener('click', () => printMaterial(false));
    $('map-practice').addEventListener('click', () => printMaterial(true));
    window.addEventListener('afterprint', () => document.body.classList.remove('printing-map'));
    window.addEventListener('hashchange', route);
    window.ChineseMaps = { init, showError };
    route();
})();
