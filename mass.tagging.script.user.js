// ==UserScript==
// @name         Mass Tagging NEW 2.0
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Скроллит список кандидатов, ставит метку "ТЛ Аналитик"
// @author       Your Name
// @match        *://*.avito.huntflow.ru/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/emilia-hr/hf/main/mass.tagging.script.user.js
// @downloadURL  https://raw.githubusercontent.com/emilia-hr/hf/main/mass.tagging.script.user.js

// ==/UserScript==

(function() {
    'use strict';

    console.log('Script initialized');
    let buttonAdded = false;
    let applicantLinks = [];

    function addButton() {
        if (buttonAdded) return;

        const buttonContainer = document.querySelector('a.logoLink--IM656[data-qa="logo-link"]');
        if (buttonContainer) {
            const newButton = document.createElement('button');
            newButton.textContent = 'ТЛ Аналитик';
            newButton.className = 'custom-tag-button';
            styleButton(newButton);

            newButton.addEventListener('click', async () => {
                try {
                    const totalApplicants = document.querySelectorAll('div[data-qa="applicant_root"]').length;
                    const totalAvailable = getTotalAvailableApplicants();

                    const input = prompt(`Найдено ${totalAvailable} кандидатов. Сколько обработать? (0 = все)`, totalApplicants);
                    if (input === null) {
                        console.log('Пользователь отменил операцию.');
                        return;
                    }

                    const numberToLoad = parseInt(input, 10);
                    const finalCount = (numberToLoad === 0 || isNaN(numberToLoad)) ? totalAvailable : numberToLoad;

                    await scrollToLoadApplicants(finalCount);
                    applicantLinks = collectApplicantLinks();
                    console.log(`Собрано ${applicantLinks.length} ссылок`);

                    await setTagsOnLinks(applicantLinks, finalCount);
                } catch (error) {
                    console.error('Ошибка при массовой установке тега:', error);
                }
            });

            buttonContainer.parentNode.insertBefore(newButton, buttonContainer.nextSibling);
            buttonAdded = true;
            console.log('Кнопка добавлена рядом с логотипом');
        } else {
            console.log('Логотип не найден для добавления кнопки');
        }
    }

    function styleButton(button) {
        button.style.backgroundColor = '#ffc107';
        button.style.color = '#000';
        button.style.border = '1px solid #000';
        button.style.padding = '3px 6px';
        button.style.marginLeft = '8px';
        button.style.cursor = 'pointer';
        button.style.borderRadius = '5px';
        button.style.fontSize = '12px';
        button.style.fontWeight = 'bold';
    }

    function getTotalAvailableApplicants() {
        let countElement = document.querySelector('#sidebar-content .count--T9JlN')
                         || document.querySelector('.count--T9JlN')
                         || document.querySelector('[data-qa="applicants-count"]');

        if (countElement) {
            const match = countElement.innerText.match(/\d+/);
            if (match) {
                return parseInt(match[0], 10);
            }
        }

        const visibleCount = document.querySelectorAll('div[data-qa="applicant_root"]').length;
        return visibleCount;
    }

    async function scrollToLoadApplicants(requiredCount) {
        let previousCount = 0;
        let currentCount = document.querySelectorAll('div[data-qa="applicant_root"]').length;
        console.log(`Начинаем прокрутку для загрузки ${requiredCount} кандидатов`);

        let listElement = document.querySelector('div.layout__list')
                      || document.querySelector('div[data-qa="applicant_root"]')?.parentElement?.parentElement
                      || window;

        let attempts = 0;
        const maxAttempts = 30;
        while (currentCount < requiredCount && previousCount !== currentCount && attempts < maxAttempts) {
            previousCount = currentCount;
            if (listElement === window) {
                window.scrollTo(0, document.body.scrollHeight);
            } else {
                listElement.scrollTop = listElement.scrollHeight;
            }
            await new Promise(r => setTimeout(r, 2000));
            currentCount = document.querySelectorAll('div[data-qa="applicant_root"]').length;
            attempts++;
        }

        console.log(`Загружено ${currentCount} кандидатов`);
    }

    function collectApplicantLinks() {
        const applicants = document.querySelectorAll('div[data-qa="applicant_root"] a[data-qa="applicant"]');
        const links = [];
        applicants.forEach(applicant => {
            if (applicant.href) links.push(applicant.href);
        });
        return links;
    }

    async function setTagsOnLinks(links, numberToLoad) {
        for (let i = 0; i < Math.min(numberToLoad, links.length); i++) {
            try {
                const url = links[i];
                console.log(`Обрабатываю ${i + 1}/${numberToLoad}: ${url}`);
                await navigateToLink(url);
                await setTag();
                await navigateBack();
            } catch (error) {
                console.error(`Ошибка на кандидате ${i + 1}:`, error);
                continue;
            }
        }
        console.log('Установка тегов завершена');
    }

    async function setTag() {
        if (await isTagAlreadyApplied('ТЛ Аналитик')) {
            console.log('Тег уже установлен');
            return;
        }

        const addButton = await waitForElement('button[data-qa="tag-add-item"]');
        addButton.click();
        await new Promise(r => setTimeout(r, 800));

        const searchInput = await waitForElement('input[type="search"][placeholder="Поиск..."]');
        searchInput.value = 'ТЛ Аналитик';
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));

        await new Promise(r => setTimeout(r, 800));
        const tagToSelect = await waitForTag('ТЛ Аналитик');
        tagToSelect.click();

        await waitForTagToBeApplied('ТЛ Аналитик', 5000);
    }

    async function isTagAlreadyApplied(tagName) {
        const tags = document.querySelectorAll('div[data-qa="tags"] button[data-qa="tag-item"]');
        return Array.from(tags).some(tag => tag.textContent.trim() === tagName);
    }

    function waitForElement(selector, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const interval = setInterval(() => {
                const element = document.querySelector(selector);
                if (element) {
                    clearInterval(interval);
                    resolve(element);
                }
            }, 300);
            setTimeout(() => {
                clearInterval(interval);
                reject(new Error(`Элемент ${selector} не найден`));
            }, timeout);
        });
    }

    function waitForTag(tagName, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const interval = setInterval(() => {
                const tag = Array.from(document.querySelectorAll('div.text--hbcD9'))
                    .find(el => el.textContent.trim() === tagName);
                if (tag) {
                    clearInterval(interval);
                    resolve(tag);
                }
            }, 300);
            setTimeout(() => {
                clearInterval(interval);
                reject(new Error(`Тег ${tagName} не найден`));
            }, timeout);
        });
    }

    function waitForTagToBeApplied(tagName, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const interval = setInterval(async () => {
                if (await isTagAlreadyApplied(tagName)) {
                    clearInterval(interval);
                    resolve();
                }
            }, 300);
            setTimeout(() => {
                clearInterval(interval);
                reject(new Error(`Тег ${tagName} не применился`));
            }, timeout);
        });
    }

    function navigateToLink(url) {
        return new Promise((resolve, reject) => {
            window.location.href = url;
            const checkInterval = setInterval(() => {
                const titleElement = document.querySelector('h1[data-qa="applicant-card-title"]');
                if (titleElement) {
                    clearInterval(checkInterval);
                    setTimeout(resolve, 800);
                }
            }, 300);
            setTimeout(() => {
                clearInterval(checkInterval);
                reject(new Error('Не удалось загрузить страницу кандидата'));
            }, 10000);
        });
    }

    function navigateBack() {
        return new Promise((resolve, reject) => {
            window.history.back();
            const checkInterval = setInterval(() => {
                const listElement = document.querySelector('div[data-qa="applicant_root"]');
                if (listElement) {
                    clearInterval(checkInterval);
                    setTimeout(resolve, 800);
                }
            }, 300);
            setTimeout(() => {
                clearInterval(checkInterval);
                reject(new Error('Не удалось вернуться на список'));
            }, 10000);
        });
    }

    const observer = new MutationObserver(() => addButton());
    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener('load', () => {
        setTimeout(addButton, 2000);
    });
})();
