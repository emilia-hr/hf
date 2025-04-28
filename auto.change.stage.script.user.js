// ==UserScript==
// @name         HuntFlow: Auto Change Stage NEW 2.0
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Автоматически проставляет отказ по резюме на всех вакансиях
// @author
// @match        https://*.huntflow.ru/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/emilia-hr/hf/main/auto.change.stage.script.user.js
// @downloadURL  https://raw.githubusercontent.com/emilia-hr/hf/main/auto.change.stage.script.user.js
// ==/UserScript==

(function() {
    'use strict';

    const parametersList = [
        {
            START_BUTTON_LABEL: 'Проставить везде: "по резюме"',
            START_BUTTON_BACKGROUND_COLOR: '#28a745',
            REJECTION_LABEL: 'Отказ',
            REJECTION_REASON_LABEL: '1. Авито: по резюме',
            SAVE_BUTTON_LABEL: 'Сохранить',
            BUTTON_PROCESSING_MODE: 'all'
        },
        {
            START_BUTTON_LABEL: 'Проставить везде: "переведен на другую вакансию"',
            START_BUTTON_BACKGROUND_COLOR: '#28a745',
            REJECTION_LABEL: 'Отказ',
            REJECTION_REASON_LABEL: '1.6 Авито: переведен на другую вакансию',
            SAVE_BUTTON_LABEL: 'Сохранить',
            BUTTON_PROCESSING_MODE: 'all'
        }
    ];

    function createButtons() {
        const container = document.querySelector('.contentContainer--Udhv_') || document.querySelector('.list--L9UhV');
        if (container && !document.querySelector('.btn-change-status')) {
            const buttonContainer = document.createElement('div');
            buttonContainer.style.marginBottom = '10px';
            parametersList.forEach(params => {
                const button = document.createElement('button');
                button.textContent = params.START_BUTTON_LABEL;
                button.style.backgroundColor = params.START_BUTTON_BACKGROUND_COLOR;
                button.style.color = '#fff';
                button.style.margin = '5px';
                button.style.padding = '8px 12px';
                button.style.border = 'none';
                button.style.borderRadius = '4px';
                button.classList.add('button', 'btn-change-status');
                button.addEventListener('click', () => processAllStages(params));
                buttonContainer.appendChild(button);
            });
            container.insertBefore(buttonContainer, container.firstChild);
        }
    }

    function showCompletionBanner() {
        const banner = document.createElement('div');
        banner.textContent = 'Простановка статусов завершена';
        banner.style.position = 'fixed';
        banner.style.top = '50px';
        banner.style.right = '20px';
        banner.style.backgroundColor = 'rgba(40, 167, 69, 0.9)';
        banner.style.color = '#fff';
        banner.style.padding = '15px 30px';
        banner.style.borderRadius = '5px';
        banner.style.zIndex = '1000';
        banner.style.transition = 'opacity 2s ease-in-out';
        document.body.appendChild(banner);

        setTimeout(() => {
            banner.style.opacity = '0';
            setTimeout(() => {
                banner.remove();
            }, 2000);
        }, 3000);
    }

    function clickLabelWithText(labelText) {
        const labels = document.querySelectorAll('label.itemName--_nDUF');
        for (let label of labels) {
            if (label.textContent.includes(labelText)) {
                label.click();
                return true;
            }
        }
        return false;
    }

    function clickButtonWithText(buttonText) {
        const saveButton = document.querySelector('button[data-qa="save"]');
        if (saveButton && saveButton.querySelector('.content--e4eWR')?.textContent.includes(buttonText)) {
            saveButton.click();
            setTimeout(() => {
                const confirmation = document.querySelector('.confirmation-message');
                if (confirmation) return true;
            }, 500);
            return true;
        }
        console.warn(`Кнопка с текстом "${buttonText}" не найдена или не содержит ожидаемого текста.`);
        return false;
    }

    async function findAndInputStatus(status) {
        return new Promise(resolve => {
            const searchInput = document.querySelector('input[type="search"][placeholder="Поиск..."]');
            if (searchInput) {
                searchInput.value = '';
                searchInput.value = status;
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                setTimeout(() => {
                    const reasonItem = Array.from(document.querySelectorAll('span'))
                        .find(span => span.textContent.trim() === status);
                    if (reasonItem) {
                        reasonItem.click();
                        resolve(true);
                    } else {
                        console.warn(`Причина "${status}" не найдена.`);
                        resolve(false);
                    }
                }, 500);
            } else {
                console.warn('Поле поиска причины не найдено.');
                resolve(false);
            }
        });
    }

    async function processAllStages(params) {
        const changeStageButtons = document.querySelectorAll('button[data-qa="change_status_button"]');
        let buttonsToProcess = Array.from(changeStageButtons);
        let index = 0;

        async function processNextButton() {
            if (index < buttonsToProcess.length) {
                buttonsToProcess[index].click();
                await new Promise(resolve => setTimeout(resolve, 500));

                if (clickLabelWithText(params.REJECTION_LABEL)) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                    const statusInputSuccess = await findAndInputStatus(params.REJECTION_REASON_LABEL);
                    if (statusInputSuccess) {
                        setTimeout(() => {
                            if (clickButtonWithText(params.SAVE_BUTTON_LABEL)) {
                                index++;
                                setTimeout(processNextButton, 1000);
                            } else {
                                console.warn('Не удалось нажать кнопку "Сохранить", продолжаем с следующей вакансией.');
                                index++;
                                setTimeout(processNextButton, 1000);
                            }
                        }, 500);
                    } else {
                        index++;
                        setTimeout(processNextButton, 1000);
                    }
                }
            } else {
                showCompletionBanner();
            }
        }

        processNextButton();
    }

    const observer = new MutationObserver(() => {
        createButtons();
    });

    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener('load', () => {
        setTimeout(createButtons, 500);
    });
})();
