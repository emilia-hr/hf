// ==UserScript==
// @name         Data Extractor
// @namespace    http://tampermonkey.net/
// @version      0.95
// @description  Extract data from links and save to Excel
// @author       Sergei Medintsev
// @match        *://avito.huntflow.ru/*
// @updateURL    https://github.com/emilia-hr/hf/raw/main/data.extr.script.user.js
// @downloadURL  https://github.com/emilia-hr/hf/raw/main/data.extr.script.user.js
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @connect      *
// @require      https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.17.0/xlsx.full.min.js
// ==/UserScript==

(function() {
    'use strict';

    console.log('HF_SE: Script started');

    let buttonAdded = false;

    function addButton() {
        if (buttonAdded) {
            return;
        }
        var buttonContainer = document.querySelector('div.search--qvPi4.item--R7wgx');
        if (buttonContainer) {
            console.log('HF_SE: Button container found:', buttonContainer);

            var newButton = document.createElement('div');
            newButton.className = 'item--OBfF8';
            newButton.innerHTML = '<a><span style="padding: 5px; border: 1px solid #ccc; border-radius: 3px; cursor: pointer;">to Excel</span></a>';

            newButton.querySelector('a').addEventListener('click', async function() {
                console.log('HF_SE: Button clicked');
                var applicantRootElements = document.querySelectorAll('div[data-qa="applicant_root"]');
                var elements = [];
                applicantRootElements.forEach(el => {
                    var linkElement = el.querySelector('a[data-qa="applicant"]');
                    if (linkElement) {
                        elements.push(linkElement);
                    }
                });
                var count = elements.length;
                console.log(`HF_SE: Found ${count} elements with data-qa="applicant_root" and a[data-qa="applicant"]`);
                var numberToLoad = prompt(`Найдено ${count} элементов. Сколько из них загрузить?`, count);

                if (numberToLoad !== null && !isNaN(numberToLoad)) {
                    numberToLoad = Math.min(count, parseInt(numberToLoad));
                    await loadPagesAndExtractData(elements, numberToLoad);
                }
            });

            buttonContainer.appendChild(newButton);
            buttonAdded = true;
            console.log('HF_SE: Button added to the container');
        } else {
            console.log('HF_SE: Button container not found');
        }
    }

    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.addedNodes.length || mutation.removedNodes.length) {
                console.log('HF_SE: DOM changed');
                addButton();
            }
        });
    });

    const targetNode = document.querySelector('body');
    observer.observe(targetNode, { childList: true, subtree: true });

    setTimeout(addButton, 3000);

    async function loadPagesAndExtractData(elements, numberToLoad) {
        var data = [];
        for (var i = 0; i < numberToLoad; i++) {
            var element = elements[i];
            await clickElementAndWaitForLoad(element);
            data.push(extractData(document));
            await navigateBack();
        }

        console.log('HF_SE: Data loaded from all pages');
        generateExcel(data);
    }

    function clickElementAndWaitForLoad(element) {
        return new Promise((resolve) => {
            // Клик по элементу
            element.click();

            // Интервал для проверки наличия элемента с заголовком страницы
            var checkExist = setInterval(function() {
                // Поиск элемента заголовка
                var titleElement = document.querySelector('h1[data-qa="applicant-card-title"]');

                // Если элемент найден, остановить интервал
                if (titleElement) {
                    clearInterval(checkExist);

                    // Установка задержки после нахождения элемента
                    // Это необходимо для обеспечения полной загрузки всех данных на странице
                    setTimeout(() => {
                        resolve();
                    }, 1000); // Задержка после нахождения элемента
                }
            }, 500); // Проверка каждые 500 миллисекунд
        });
    }

    function navigateBack() {
        return new Promise((resolve) => {
            window.history.back();
            var checkExist = setInterval(function() {
                var applicantListElement = document.querySelector('div[data-qa="applicant_root"]');
                if (applicantListElement) {
                    clearInterval(checkExist);
                    setTimeout(() => {
                        resolve();
                    }, 1000);
                }
            }, 500);
        });
    }

    function extractData(doc) {
        var titleElement = doc.querySelector('h1[data-qa="applicant-card-title"]');
        var titleText = titleElement ? titleElement.innerText.trim() : 'N/A';

        var telegramText = extractTelegram(doc);
        var phoneNumberText = extractPhoneNumber(doc);
        var emailText = extractEmail(doc);
        var linkedInText = extractLinkedIn(doc);
        var companyText = extractCompany(doc);

        var url = window.location.href;

        return {
            'applicant-card-title': titleText,
            'telegram': telegramText,
            'phone_number': phoneNumberText,
            'email': emailText,
            'linkedin': linkedInText,
            'company': companyText,
            'url': url
        };
    }

    function extractTelegram(doc) {
        var telegramElements = doc.querySelectorAll('button[data-qa="telegram"]');
        if (telegramElements.length > 1) {
            return telegramElements[1].innerText.trim();
        }
        return 'N/A';
    }

    function extractPhoneNumber(doc) {
        var phoneElement = doc.querySelector('a[href^="tel:"]');
        return phoneElement ? phoneElement.innerText.trim() : 'N/A';
    }

    function extractEmail(doc) {
        var emailElement = doc.querySelector('a[href^="mailto:"]');
        return emailElement ? emailElement.innerText.trim() : 'N/A';
    }

    function extractLinkedIn(doc) {
        var linkedInElement = doc.querySelector('a[href*="linkedin.com"]');
        return linkedInElement ? linkedInElement.href : 'N/A';
    }

    function extractCompany(doc) {
        var positionElement = doc.querySelector('div.position--dSSdW');
        if (positionElement) {
            var match = positionElement.innerText.match(/\(([^)]+)\)/);
            return match ? match[1] : 'N/A';
        }
        return 'N/A';
    }

    function generateExcel(data) {
        var ws = XLSX.utils.json_to_sheet(data);
        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
        XLSX.writeFile(wb, "data.xlsx");
        console.log('HF_SE: Excel file generated');
    }

})();
