// ==UserScript==
// @name         HuntFlow: Auto Change Stage NEW 3.0 
// @namespace    http://tampermonkey.net/
// @version      2.4.0
// @description  Галочки выбора вакансий; отдельные списки для Этапов и Отказов; устойчивый выбор причины через комбобокс
// @match        https://*.huntflow.ru/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // ——— Конфигурация ———
    // Этапы (добавлен "Контакт с кандидатом")
    const STAGES = [
        'HR-scoring',
        'Контакт с кандидатом',
        'Технический скоринг',
        'Технические интервью',
        'HR-интервью',
        'Финал с руководителем',
        'Не нашли команду',
    ];

    // Причины отказа (точные строки из атрибута title, как в HTML)
    const REJECT_REASONS = [
        '1. Авито: по резюме',
        '1.1 Авито: несоответствие hard skills',
        '1.2 Авито: плохо выполнено тестовое задание',
        '1.3 Авито: несоответствие soft skills',
        '1.4 Авито: несоответствие лидерским компетенциям',
        '1.5 Авито: мотивация не соответствует роли',
        '1.6 Авито: переведен на другую вакансию',
        '1.7 Авито: кандидат рассматривается на дочке',
        '1.8 Авито: неявка',
        '1.8.1 Авито: Не прошел комплаенс-проверку (красная зона)',
        '2. Авито: плохие рекомендации',
        '3. Кандидат: не выходит на связь',
        '3.1 Кандидат: поиск не актуален',
        '3.2 Кандидат: принял другой оффер',
        '3.3 Кандидат: не заинтересовали задачи',
        '3.4 Кандидат: не готов делать тестовое задание / кейс',
        '3.4.1 Кандидат: не готов проходить технические интервью',
        '3.5 Кандидат: не устраивает уровень дохода',
        '3.6 Кандидат: не устраивают НЕ ДЕНЕЖНЫЕ условия',
        '3.7 Кандидат: не готов работать в Авито',
        '3.8 Кандидат: не готов работать в РФ',
        '3.9 Кандидат: не готов работать в рос. компании вне зависимости от локации',
        '3.9.1 Кандидат: не заполнил анкету СБ',
        '4. Кандидат: не устраивают условия в Армении',
        '4.1 Кандидат: не готов к релокации в другой город',
        '4.2 Кандидат: не устраивает график работы',
        '4.3 Кандидат: не подходит гибридный/офисный график',
        '4.4 Кандидат: обучение на очном',
        'По другой причине',
    ];

    // ——— Утилиты ———
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const $ = (sel, root = document) => root.querySelector(sel);
    const $all = (sel, root = document) => Array.from(root.querySelectorAll(sel));

    const VACANCY_SELECTOR = 'li[data-qa="applicant_vacancy"]';
    const SELECTED_ATTR = 'data-hf-selected';

    function getTopContainer() {
        return document.querySelector('.contentContainer--Udhv_') || document.querySelector('.list--L9UhV');
    }

    function isVisible(el) {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    }

    // Попап статусов
    function getStatusesPopupRoot() {
        const list = $('[data-qa="statusesList"]');
        return isVisible(list) ? list : null;
    }
    function isPopupOpen() { return !!getStatusesPopupRoot(); }

    async function waitForPopupOpen(timeout = 2500) {
        const end = Date.now() + timeout;
        while (Date.now() < end) { if (isPopupOpen()) return true; await sleep(50); }
        return false;
    }

    async function waitForPopupClose(timeout = 4000) {
        const end = Date.now() + timeout;
        while (Date.now() < end) { if (!isPopupOpen()) return true; await sleep(80); }
        return false;
    }

    function getChangeStatusButtonFromVacancy(vacItem) {
        return $('button[data-qa="change_status_button"]', vacItem)
            || $all('button', vacItem).find(b => (b.textContent || '').includes('Сменить этап подбора'));
    }

    function getSelectedVacancies() {
        return $all(VACANCY_SELECTOR).filter(el => el.getAttribute(SELECTED_ATTR) === '1');
    }

    function openChangeStatusPopup(btn) { btn?.click(); }

    function norm(s) {
        return (s || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
    }

    // ——— Статусы/Этапы в первом попапе ———
    async function clickStageByText(stageName, retries = 12, delay = 120) {
        const target = norm(stageName);
        for (let i = 0; i < retries; i++) {
            const root = getStatusesPopupRoot();
            if (!root) return false;
            const items = $all('label.itemName--_nDUF, [data-qa="status_item"], .itemName--_nDUF', root);
            const found = items.find(el => norm(el.textContent) === target);
            if (found) { found.click(); return true; }
            await sleep(delay);
        }
        return false;
    }

    async function applyStage(stageName) {
        let ok = await clickStageByText(stageName, 14, 140);
        if (!ok) { console.warn(`Этап не найден: ${stageName}`); return false; }
        await sleep(140);
        const saved = await clickSaveWithWait();
        if (!saved) console.warn('Не удалось закрыть попап после Сохранить (этап).');
        return saved;
    }

    // ——— Путь "Отказ" — первый список ———
    async function clickRejectRoot(retries = 12, delay = 120) {
        for (let i = 0; i < retries; i++) {
            const root = getStatusesPopupRoot();
            if (!root) return false;
            const items = $all('label.itemName--_nDUF, [data-qa="status_item"], .itemName--_nDUF', root);
            const candidate = items.find(el => {
                const t = norm(el.textContent);
                return t === 'Отказ' || t.startsWith('Отказ');
            });
            if (candidate) { candidate.click(); return true; }
            await sleep(delay);
        }
        return false;
    }

    // ——— Комбобокс причин отказа ———
    function getRejectCombobox() {
        const box = $('.rejectReasonsCombobox--NYw4e');
        if (!box) return null;
        const content = $('[data-qa="dropdown-autocomplete-content"]', box);
        return isVisible(content) ? content : null;
    }

    async function waitRejectComboboxOpen(timeout = 2500) {
        const end = Date.now() + timeout;
        while (Date.now() < end) {
            const c = getRejectCombobox();
            if (c) return true;
            await sleep(80);
        }
        return false;
    }

    // Пробуем вбивать в поле поиска текст причины, чтобы рециклер отрисовал нужное
    async function typeIntoRejectSearch(query) {
        const box = $('.rejectReasonsCombobox--NYw4e');
        if (!box) return;
        const input = $('input[type="search"]', box);
        if (!input) return;
        input.focus();
        input.value = query;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(150);
    }

    async function clickRejectReasonByTitle(titleText, retries = 14, delay = 140) {
        const target = norm(titleText);
        // попробуем сначала подфильтровать
        await typeIntoRejectSearch(target);

        for (let i = 0; i < retries; i++) {
            const content = getRejectCombobox();
            if (!content) { await sleep(delay); continue; }

            const scroller = $('[data-qa="scroller"]', content) || content;
            if (scroller && scroller.scrollTop !== undefined) {
                scroller.scrollTop = Math.min(scroller.scrollTop + 150 * i, (scroller.scrollHeight || 10000));
            }

            const items = $all('[data-qa="list-item"]', content);
            for (const it of items) {
                const tx = $('[data-qa="text"] span[title]', it);
                if (!tx) continue;
                const ttl = norm(tx.getAttribute('title') || tx.textContent);
                if (ttl === target) {
                    const clickTarget = it.querySelector('.content--kFHxB') || it;
                    clickTarget.click();
                    return true;
                }
            }
            await sleep(delay);
        }
        return false;
    }

    function clickClosePopupIfAny() {
        const dialog = getStatusesPopupRoot();
        if (!dialog) return;
        const closeBtn = $('button[aria-label="Close"], button[aria-label="Закрыть"], .close, [data-qa="close"]', document);
        if (closeBtn && isVisible(closeBtn)) closeBtn.click();
        else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    }

    async function clickSaveWithWait() {
        const saveBtn = $('button[data-qa="save"]');
        if (!saveBtn) return false;
        saveBtn.click();
        return await waitForPopupClose(4000);
    }

    async function applyReject(reasonTitle) {
        const okReject = await clickRejectRoot();
        if (!okReject) { console.warn('Отказ не найден в списке.'); return false; }

        const opened = await waitRejectComboboxOpen(2500);
        if (!opened) { console.warn('Комбобокс причин отказа не открылся'); return false; }

        let okReason = await clickRejectReasonByTitle(reasonTitle, 16, 140);
        if (!okReason) {
            console.warn(`Причина не найдена: ${reasonTitle}`);
            return false;
        }
        await sleep(140);

        const saved = await clickSaveWithWait();
        if (!saved) console.warn('Не удалось закрыть попап после Сохранить (отказ).');
        return saved;
    }

    // ——— Массовое применение — только по выбранным ———
    async function applyPresetToSelected(preset) {
        const selected = getSelectedVacancies();
        if (selected.length === 0) {
            console.warn('Нет отмеченных вакансий. Поставьте галочки или нажмите "Выбрать все".');
            return;
        }

        for (let i = 0; i < selected.length; i++) {
            const vac = selected[i];
            try {
                const btn = getChangeStatusButtonFromVacancy(vac);
                if (!btn) { console.warn('Нет кнопки "Сменить этап подбора" в карточке', i); continue; }

                vac.scrollIntoView({ block: 'center' });
                await sleep(150);

                openChangeStatusPopup(btn);
                const opened = await waitForPopupOpen(2500);
                if (!opened) { console.warn('Попап не открылся, пропуск', i); continue; }

                let ok = false;
                if (preset.type === 'reject') {
                    ok = await applyReject(preset.reasonTitle);
                    if (!ok) { await sleep(300); ok = await applyReject(preset.reasonTitle); }
                } else if (preset.type === 'stage') {
                    ok = await applyStage(preset.stageName);
                    if (!ok) { await sleep(300); ok = await applyStage(preset.stageName); }
                }

                if (!ok) {
                    clickClosePopupIfAny();
                    await sleep(200);
                }

                await sleep(360);
            } catch (e) {
                console.error('Ошибка на карточке', i, e);
                clickClosePopupIfAny();
                await sleep(200);
            }
        }

        showCompletionBanner();
    }

    function showCompletionBanner() {
        const banner = document.createElement('div');
        banner.textContent = 'Простановка завершена';
        Object.assign(banner.style, {
            position: 'fixed', top: '56px', right: '16px',
            backgroundColor: 'rgba(30, 136, 229, 0.95)', color: '#fff',
            padding: '10px 14px', borderRadius: '8px', zIndex: '10000',
            boxShadow: '0 6px 18px rgba(0,0,0,0.15)', fontSize: '13px', fontWeight: '600',
            transition: 'opacity 1.6s ease',
        });
        document.body.appendChild(banner);
        setTimeout(() => { banner.style.opacity = '0'; setTimeout(() => banner.remove(), 1600); }, 2200);
    }

    // ——— UI ———
    function baseSelectStyle() {
        return { fontSize: '12px', padding: '4px 6px', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.15)', background: '#fff', color: '#333', outline: 'none', height: '28px' };
    }

    function applyMiniButtonStyle(btn, color = '#424242') {
        Object.assign(btn.style, { backgroundColor: color, color: '#fff', border: 'none', borderRadius: '6px', padding: '4px 8px', fontSize: '12px', lineHeight: '18px', cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.12)' });
    }

    function createVacancyCheckbox() {
        const btn = document.createElement('button');
        btn.className = 'hf-vacancy-select';
        btn.type = 'button';
        btn.setAttribute('aria-pressed', 'false');
        btn.title = 'Выбрать вакансию';
        Object.assign(btn.style, { width: '18px', height: '18px', minWidth: '18px', minHeight: '18px', borderRadius: '4px', border: '1px solid rgba(0,0,0,0.25)', background: '#fff', color: '#2e7d32', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', cursor: 'pointer', marginRight: '6px' });
        btn.textContent = '';
        return btn;
    }

    function setVacancySelected(vacItem, selected) {
        const btn = $('.hf-vacancy-select', vacItem);
        if (!btn) return;
        if (selected) {
            vacItem.setAttribute(SELECTED_ATTR, '1');
            btn.setAttribute('aria-pressed', 'true');
            btn.textContent = '✓';
            btn.style.background = '#2e7d32';
            btn.style.color = '#fff';
            btn.style.borderColor = '#2e7d32';
            vacItem.style.outline = '1px dashed rgba(46,125,50,0.45)';
            vacItem.style.outlineOffset = '2px';
        } else {
            vacItem.removeAttribute(SELECTED_ATTR);
            btn.setAttribute('aria-pressed', 'false');
            btn.textContent = '';
            btn.style.background = '#fff';
            btn.style.color = '#2e7d32';
            btn.style.borderColor = 'rgba(0,0,0,0.25)';
            vacItem.style.outline = '';
            vacItem.style.outlineOffset = '';
        }
    }

    function installCheckboxes() {
        const items = $all(VACANCY_SELECTOR);
        items.forEach(item => {
            if ($('.hf-vacancy-select', item)) return;
            const info = $('.info--dZRbt', item) || item;
            const desc = $('.description--Qax62', info) || info;
            const btn = createVacancyCheckbox();
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isSelected = item.getAttribute(SELECTED_ATTR) === '1';
                setVacancySelected(item, !isSelected);
            });
            const titleWrap = $('.vacancyTitle--ni9ix', desc) || desc.firstChild || desc;
            if (titleWrap && titleWrap.parentNode) titleWrap.parentNode.insertBefore(btn, titleWrap);
            else desc.insertBefore(btn, desc.firstChild);
        });
    }

    function createPanel() {
        const container = getTopContainer();
        if (!container) return;
        if (container.querySelector('.hf-quick-status-toolbar')) return;

        const panel = document.createElement('div');
        panel.className = 'hf-quick-status-toolbar';
        Object.assign(panel.style, { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '10px', padding: '6px 8px', background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.06)', borderRadius: '10px' });

        // Выбрать все
        const selectAllBtn = document.createElement('button');
        selectAllBtn.title = 'Выбрать все вакансии на странице';
        selectAllBtn.textContent = 'Выбрать все';
        applyMiniButtonStyle(selectAllBtn, '#1565c0');
        selectAllBtn.addEventListener('click', () => {
            const items = $all(VACANCY_SELECTOR);
            items.forEach(item => setVacancySelected(item, true));
        });
        panel.appendChild(selectAllBtn);

        // Селект этапов
        const stageSelect = document.createElement('select');
        stageSelect.title = 'Этап';
        Object.assign(stageSelect.style, baseSelectStyle());
        stageSelect.appendChild(new Option('Этап: выберите…', '', true, true));
        STAGES.forEach((stage) => {
            stageSelect.appendChild(new Option(stage, stage));
        });
        panel.appendChild(stageSelect);

        // Селект причин отказа
        const rejectSelect = document.createElement('select');
        rejectSelect.title = 'Отказ';
        Object.assign(rejectSelect.style, baseSelectStyle());
        rejectSelect.appendChild(new Option('Отказ: выберите…', '', true, true));
        REJECT_REASONS.forEach((r) => {
            rejectSelect.appendChild(new Option(r, r));
        });
        panel.appendChild(rejectSelect);

        // Кнопка запуска
        const runBtn = document.createElement('button');
        runBtn.title = 'Применить выбранный Этап или Отказ к отмеченным';
        runBtn.textContent = '▶';
        applyMiniButtonStyle(runBtn, '#424242');
        runBtn.addEventListener('click', async () => {
            const stageVal = stageSelect.value || '';
            const rejectVal = rejectSelect.value || '';

            if (!stageVal && !rejectVal) return;

            if (stageVal) {
                await applyPresetToSelected({ type: 'stage', stageName: stageVal });
            }
            if (rejectVal) {
                await applyPresetToSelected({ type: 'reject', reasonTitle: rejectVal });
            }
        });
        panel.appendChild(runBtn);

        container.insertBefore(panel, container.firstChild);
    }

    const observer = new MutationObserver(() => { createPanel(); installCheckboxes(); });
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('load', () => { setTimeout(() => { createPanel(); installCheckboxes(); }, 500); });
})();
