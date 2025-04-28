// ==UserScript==
// @name         Data Extractor NEW 2.0
// @namespace    http://tampermonkey.net/
// @version      1.02
// @description  Extract data from links and save to Excel
// @author
// @match        *://avito.huntflow.ru/*
// @updateURL    https://raw.githubusercontent.com/emilia-hr/hf/main/data.extr.script.user.js
// @downloadURL  https://raw.githubusercontent.com/emilia-hr/hf/main/data.extr.script.user.js
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

    // Add CSS for the button
    GM_addStyle(`
        .custom-excel-button {
            display: inline-block;
            padding: 3px 8px;
            border: 1px solid #ccc;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            background: linear-gradient(45deg, #FF0000, #0000FF, #008000, #800080);
            color: white;
            text-align: center;
            width: 60px;
            transition: opacity 0.3s;
        }
        .custom-excel-button:hover {
            opacity: 0.8;
        }
    `);

    function addButton() {
        if (buttonAdded) {
            return;
        }
        var vacancyBlock = document.querySelector('div[data-qa="vacancy-block"]');
        if (vacancyBlock) {
            console.log('HF_SE: Vacancy block found:', vacancyBlock);
            var titleLink = vacancyBlock.querySelector('a');
            if (titleLink) {
                var buttonContainer = document.createElement('div');
                buttonContainer.style.display = 'inline-block';
                buttonContainer.style.marginLeft = '10px';

                var newButton = document.createElement('div');
                newButton.className = 'item--OBfF8';
                newButton.innerHTML = '<a><span class="custom-excel-button">to Excel</span></a>';

                newButton.querySelector('a').addEventListener('click', async function() {
                    console.log('HF_SE: Button clicked');
                    await resetToFirstPage();
                    var elements = await collectAllApplicantLinks();
                    var count = elements.length;
                    console.log(`HF_SE: Found ${count} unique applicant links`);
                    var numberToLoad = prompt(`Найдено ${count} элементов. Сколько из них загрузить?`, count);

                    if (numberToLoad !== null && !isNaN(numberToLoad)) {
                        numberToLoad = Math.min(count, parseInt(numberToLoad));
                        await loadPagesAndExtractData(elements, numberToLoad);
                    }
                });

                buttonContainer.appendChild(newButton);
                titleLink.parentNode.insertBefore(buttonContainer, titleLink.nextSibling);

                buttonAdded = true;
                console.log('HF_SE: Button added next to vacancy title');
            } else {
                console.log('HF_SE: Title link not found inside vacancy block');
            }
        } else {
            console.log('HF_SE: Vacancy block not found');
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
    if (targetNode) {
        observer.observe(targetNode, { childList: true, subtree: true });
    } else {
        console.error('HF_SE: Body not found for observer');
    }

    setTimeout(addButton, 3000);

    async function resetToFirstPage() {
        console.log('HF_SE: Resetting to first page');
        var firstPageButton = document.querySelector('a[data-qa="pagination_first"]') ||
                             document.querySelector('a[data-qa="pagination_page_1"]') ||
                             document.querySelector('a[aria-label="First page"]');
        if (firstPageButton && !firstPageButton.classList.contains('disabled')) {
            return new Promise((resolve) => {
                firstPageButton.click();
                var checkExist = setInterval(function() {
                    var applicantListElement = document.querySelector('div[data-qa="applicant_root"]');
                    if (applicantListElement) {
                        clearInterval(checkExist);
                        setTimeout(() => {
                            console.log('HF_SE: Reset to first page complete');
                            resolve();
                        }, 2000);
                    }
                }, 500);
            });
        } else {
            console.log('HF_SE: Already on first page or no first page button');
            return Promise.resolve();
        }
    }

    async function collectAllApplicantLinks() {
        var allLinks = new Set();
        var currentPage = 1;
        var hasNextPage = true;
        var maxPages = 50;

        while (hasNextPage && currentPage <= maxPages) {
            console.log(`HF_SE: Processing page ${currentPage}`);
            var applicantRootElements = document.querySelectorAll('div[data-qa="applicant_root"]');
            var pageLinks = new Set();
            applicantRootElements.forEach(el => {
                var linkElement = el.querySelector('a[data-qa="applicant"]');
                if (linkElement && linkElement.href) {
                    pageLinks.add(linkElement.href);
                    allLinks.add(linkElement.href);
                }
            });
            console.log(`HF_SE: Found ${pageLinks.size} links on page ${currentPage}, total unique: ${allLinks.size}`);

            var nextButton = document.querySelector('a[data-qa="pagination_next"]') ||
                            document.querySelector('a[aria-label="Next page"]');
            if (nextButton && !nextButton.classList.contains('disabled') && !nextButton.hasAttribute('disabled')) {
                var previousLinkCount = allLinks.size;
                await clickNextPage(nextButton);
                await new Promise(resolve => setTimeout(resolve, 2000));
                var newApplicantElements = document.querySelectorAll('div[data-qa="applicant_root"]');
                var newLinks = new Set();
                newApplicantElements.forEach(el => {
                    var linkElement = el.querySelector('a[data-qa="applicant"]');
                    if (linkElement && linkElement.href) {
                        newLinks.add(linkElement.href);
                    }
                });
                if (newLinks.size > 0 && ![...newLinks].every(link => pageLinks.has(link))) {
                    currentPage++;
                } else {
                    console.log('HF_SE: No new links detected, stopping pagination');
                    hasNextPage = false;
                }
            } else {
                console.log('HF_SE: No next page button or disabled');
                hasNextPage = false;
            }
        }

        console.log(`HF_SE: Collected ${allLinks.size} unique links across ${currentPage} pages`);
        return Array.from(allLinks).map(href => ({ href }));
    }

    async function clickNextPage(nextButton) {
        return new Promise((resolve) => {
            nextButton.click();
            var checkExist = setInterval(function() {
                var applicantListElement = document.querySelector('div[data-qa="applicant_root"]');
                if (applicantListElement) {
                    clearInterval(checkExist);
                    setTimeout(() => {
                        console.log('HF_SE: Next page loaded');
                        resolve();
                    }, 2000);
                }
            }, 500);
        });
    }

    async function loadPagesAndExtractData(elements, numberToLoad) {
        var data = [];
        var processedLinks = new Set();

        for (var i = 0; i < numberToLoad; i++) {
            var element = elements[i];
            if (!processedLinks.has(element.href)) {
                console.log(`HF_SE: Processing link ${i + 1}/${numberToLoad}: ${element.href}`);
                await navigateToLink(element.href);
                var extractedData = extractData(document);
                if (extractedData['applicant-card-title'] !== 'N/A') {
                    data.push(extractedData);
                    processedLinks.add(element.href);
                } else {
                    console.warn(`HF_SE: No valid data extracted for ${element.href}, skipping`);
                }
                await navigateBack();
            } else {
                console.log(`HF_SE: Skipping duplicate link: ${element.href}`);
            }
        }

        console.log('HF_SE: Data loaded from all pages');
        generateExcel(data);
    }

    function navigateToLink(href) {
        return new Promise((resolve) => {
            window.location.href = href;
            var checkExist = setInterval(function() {
                var titleElement = document.querySelector('h1[data-qa="applicant-card-title"]');
                if (titleElement) {
                    clearInterval(checkExist);
                    setTimeout(() => {
                        console.log('HF_SE: Applicant page loaded');
                        resolve();
                    }, 1000);
                }
            }, 500);
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
                        console.log('HF_SE: Returned to list page');
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
        var telegramButton = doc.querySelector('button.button--OyRVi.buttonText--tamFM');
        return telegramButton ? telegramButton.innerText.trim() : 'N/A';
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
        var linkElement = doc.querySelector('div.actions--waK78 a[data-qa="original-resume-link"][href*="linkedin.com"]');
        if (linkElement) {
            return linkElement.href;
        }
        var defaultLink = doc.querySelector('a[href*="linkedin.com/in/"]');
        return defaultLink ? defaultLink.href : 'N/A';
    }

    function extractCompany(doc) {
        var positionElement = doc.querySelector('span.text--Gf5iv');
        if (positionElement) {
            var delimiterElement = positionElement.querySelector('span.delimiter--m8tbD');
            if (delimiterElement && delimiterElement.nextSibling) {
                return delimiterElement.nextSibling.textContent.trim();
            }
            let nodes = positionElement.childNodes;
            for (let i = nodes.length - 1; i >= 0; i--) {
                if (nodes[i].nodeType === 3) {
                    let text = nodes[i].textContent.trim();
                    if (text && text !== '•') {
                        return text;
                    }
                }
            }
        }
        return 'N/A';
    }

    function generateExcel(data) {
        var uniqueData = [];
        var seenUrls = new Set();
        data.forEach(item => {
            if (!seenUrls.has(item.url)) {
                uniqueData.push(item);
                seenUrls.add(item.url);
            }
        });

        console.log(`HF_SE: Generating Excel with ${uniqueData.length} unique rows`);
        var ws = XLSX.utils.json_to_sheet(uniqueData);
        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
        XLSX.writeFile(wb, "data.xlsx");
        console.log('HF_SE: Excel file generated');
    }

})();
