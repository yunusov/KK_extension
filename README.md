# KK_extension

Chrome-расширение (Manifest V3) + серверная часть на **Google Apps Script**. Расширение извлекает данные карточки заказа с сайта **Профи.ру** (название, дата, URL, ранг отклика, наличие отзыва, цена отклика) и передаёт их в **Google Apps Script**, который записывает строки в Google-таблицу.

Ключевая особенность текущей версии: **один deployment** Apps Script, а маршрутизация к нужному листу выполняется на сервере через параметр `msgtype`.

---

## Структура репозитория

```
KK_extension/
├── README.md
├── main.gs              ← Apps Script: диспетчер doGet/doPost (маршрутизация по msgtype)
├── Заказ.gs             ← Apps Script: запись в лист «Заказ» (order_doGet / order_doPost)
├── Отклик.gs            ← Apps Script: запись в лист «Отклик» (response_doGet)
├── .github/workflows/   ← GitHub Actions: валидация/упаковка расширения, релиз
└── test/
    ├── google_sheet.js  ← standalone-тест POST-запроса в таблицу (из консоли браузера)
    ├── test.js          ← прототип парсера карточки (черновик grabImages)
    ├── docs/            ← заметки по Google Sheets API и Apps Script
    ├── fixtures/        ← копии data/*.html для запуска парсера вне сайта
    └── extension/       ← Chrome-расширение
        ├── manifest.json
        ├── popup.html / popup.css / popup.js
        └── bg.js
```

| Файл | Роль |
|---|---|
| `test/extension/popup.html` | UI попапа (заголовок + кнопка TRANSFER NOW) |
| `test/extension/popup.css` | Стили попапа: активная, hover/active, состояние `:disabled` |
| `test/extension/popup.js` | Логика попапа: внедрение парсера, сбор данных, состояния кнопки, отправка сообщений |
| `test/extension/bg.js` | Service worker: HTTP-мост к единому deployment Apps Script через `msgtype` |
| `test/extension/manifest.json` | Манифест MV3 (permissions, host_permissions, попап, SW) |
| `main.gs` | Серверный диспетчер: по `msgtype` вызывает `order_doGet` / `response_doGet` / `order_doPost` |
| `Заказ.gs` | Лист «Заказ»: запись GET-массивом (`v`), POST-массивом (`values`), проверка `SECRET` |
| `Отклик.gs` | Лист «Отклик»: GET-запись массивом `v`, проверка `SECRET` |
---

## Поток данных

```
Клик по «TRANSFER NOW» (popup.js)
  → chrome.tabs.query({ active: true, currentWindow: true })
  → chrome.scripting.executeScript(grabImages, allFrames: true)
       └─ парсинг карточки заказа (CSS-классы Профи.ру)
  → onResult(frames)
       ├─ sendMessage({ type: "APPS_SCRIPT_GET",          v: result[0] })
       └─ sendMessage({ type: "APPS_SCRIPT_GET_RESPONSE", v: result[1] })
  → bg.js (service worker)
       └─ GET https://script.google.com/macros/s/<DEPLOYMENT_HASH>/exec?msgtype=…
            └─ ?msgtype=APPS_SCRIPT_GET           → main.gs  → Отклик.gs  (response_doGet)
            └─ ?msgtype=APPS_SCRIPT_GET_RESPONSE  → main.gs  → Заказ.gs   (order_doGet)
  → запись строки в лист «Заказ» / «Отклик»
```

Ответ сервера: `main.gs` оборачивает результат в `{"result": … }`, а `bg.js` — в `{ ok: true, data }` (или `{ ok: false, error }`).

---

## Серверная часть (Apps Script)

Три файла-скрипта объединяются в **один проект** Apps Script и публикуются как **Web App**. Деплой один — `DEPLOYMENT_HASH` в `bg.js`.

### Маршрутизация в `main.gs`

| `msgtype` (из URL) | Вызываемая функция | Лист таблицы |
|---|---|---|
| `APPS_SCRIPT_GET` | `response_doGet(e)` (Отклик.gs) | «Отклик» |
| `APPS_SCRIPT_GET_RESPONSE` | `order_doGet(e)` (Заказ.gs) | «Заказ» |
| `APPS_SCRIPT_POST` | `order_doPost(e)` (Заказ.gs) | «Заказ» |

### Как сервер читает данные

- **GET** (из расширения): `?secret=my-token&v=A&B` — несколько значений `v` складываются в одну строку листа (`e.parameters.v`).
- **GET** с простым `msg=hello`: пишется `[ISO-дата, msg]`.
- **POST** (`values` в JSON-теле): `order_doPost` дописывает массив строк (`sh.getRange(lastRow+1, …).setValues(rows)`).

В обоих файлах `Заказ.gs` и `Отклик.gs` стоит проверка `secret !== SECRET` (SECRET = `my-token`).
---

## Chrome-расширение

### Что извлекает `grabImages` (popup.js)

| Поле | Селектор / источник |
|---|---|
| Корень карточки | `.order-card__container` (data-testid=`order_card_container`) |
| Название заказа | `.order-card-header__title-container p` |
| Дата создания | первый `.order-card-param-subitem-list__element .order-card-param-subitem__text` |
| Наличие отзыва | `[data-testid="review"]` внутри карточки (нет → false) |
| Цена отклика | `.order-card-price__container .order-card-param__text p` → число |
| Ранг отклика | `.order-card-additional-info__container` → `ваш\s+отклик\s*[:#№]?\s*(\d+)(?:-?и?й)?` |

Дата поддерживает **три формата** (функция `parseOrderDateTime`):
- относительный: «`N минут/часов/дней/недель назад`» → `Date.now() - N * единица`;
- короткий: «`сегодня/вчера/позавчера`» → сдвиг на 0/-1/-2 дня;
- абсолютный: «`4 октября в 09:56`» → текущий год + «антибудущее» правило.

### `bg.js`

- Слушает `chrome.runtime.onMessage`.
- Строит URL: `https://script.google.com/macros/s/${DEPLOYMENT_HASH}/exec?msgtype=<msg.type>&<query>`.
- Для `APPS_SCRIPT_POST` добавляет POST-опции к `fetch`.
- Явно читает ответ как текст и пробует распарсить JSON; при неудаче выбрасывает ошибку с HTTP-статусом и фрагментом тела (помогает отлаживать 403 / HTML-ответы).

### `popup.js`: жизненный цикл кнопки

Кнопка `#transferBtn` проходит полный цикл состояний:

| Состояние | Текст кнопки | `disabled` | Когда |
|---|---|---|---|
| Обработка | `⏳ Обработка...` | `true` | сразу после клика |
| Успех | `✓ Готово` | `true` | данные распарсены и отправлены в `bg.js` |
| Карточка не найдена | `✗ Не найдено` | `true` | `frames[0].result` не массив |
| Ошибка внедрения / нет вкладок / пустые фреймы | `TRANSFER NOW` | `false` | `resetButton()` сразу |
| Исходное | `TRANSFER NOW` | `false` | автосброс через 1,5 с после статуса; страховка 15 с |

Реализация:

- Единые хелперы `setButtonState(text, disabled)` и `resetButton()` — единственный источник правды для текста и блокировки кнопки.
- **Асинхронный «finally»**: после успеха кнопка разблокируется через `Promise.allSettled([p1, p2])` — когда оба `sendMessage` получили ответ — с задержкой 1,5 с (чтобы статус был виден).
- **Страховочный таймаут** 15 с: даже если ответ сервера «завис», кнопка вернётся в исходное состояние.
- Проверка `Array.isArray(frames[0].result)` вместо `!== null` — защита от `undefined`/битых фреймов.
- Стиль `button:disabled` задан в `popup.css`: серый фон, `cursor: not-allowed`, пониженная прозрачность; `hover`/`active` применяются только к незаблокированной кнопке (`:not(:disabled)`).

---

## Установка и запуск

### Расширение

1. `chrome://extensions/` → включить **Режим разработчика**.
2. **«Загрузить распакованное расширение»** → выбрать папку `test/extension`.
3. Открыть страницу заказа Профи.ру → кликнуть иконку расширения → **TRANSFER NOW**.

### Локальный тест на `file://` страницах

1. В `manifest.json` уже есть `"file:///*"` в `host_permissions`.
2. На карточке расширения включить **«Разрешить доступ к URL-адресам файлов»** (Allow access to file URLs).
3. Перезагрузить расширение.

⚠️ Помни: файл-мок должен содержать те же CSS-классы, что и реальный сайт, иначе парсер вернёт `null`.

### Deployment Apps Script

1. Создать проект Apps Script, добавить в него файлы `main.gs`, `Заказ.gs`, `Отклик.gs`.
2. Deploy → **New deployment** → **Web app** (Execute as: Me, доступ: **Anyone**).
3. Скопировать ID из URL деплоя в `bg.js`:

```js
const DEPLOYMENT_HASH = "AKfycb…";
```

---

## Конфигурация

| Параметр | Где | Описание |
|---|---|---|
| `DEPLOYMENT_HASH` | `test/extension/bg.js` | ID Web App-деплоя (единого) |
| `SECRET` | `Заказ.gs` | Общая проверка секрета (`my-token`) для GET/POST |
| `SHEET_NAME` | `Заказ.gs` | Имя листа «Заказ» |
| `SHEET_NAME_RESPONSE` | `Отклик.gs` | Имя листа «Отклик» |

---

## Отладка

| Что смотреть | Как открыть |
|---|---|
| Логи попапа | Правый клик по иконке расширения → **Inspect** (DevTools попапа; удерживает попап живым) |
| Логи service worker | `chrome://extensions/` → ссылка **«service worker»** на карточке расширения |
| Логи инжекта | Консоль страницы (F12): `[inject] выполняюсь на …` из `grabImages` |
| Логи Apps Script | Редактор Apps Script → Execution / Logs (виден `msgtype`, `values`, ошибки) |

### Частые проблемы

| Симптом | Причина / решение |
|---|---|
| `Cannot access a chrome:// URL` | Работаем не на вкладке расширения; скрипт внедряется только на обычные http/https страницы |
| `Cannot access contents of the page…` | Вкладка вне зоны прав: не выдан `activeTab` (клик по иконке) или `file://` без разрешения |
| `HTTP 403` от Apps Script | Деплой не «Anyone» либо `secret` не совпадает с `SECRET` |
| `сервер вернул не JSON` | Apps Script ответил HTML (страница входа/ошибки) — смотреть фрагмент тела в ошибке |
| Пустой `result` / `Карточка не найдена` | На странице нет нужных CSS-классов (не та страница / мок без разметки) |
| Запись не в том листе | Проверить `msgtype`: `APPS_SCRIPT_GET` → «Отклик», `APPS_SCRIPT_GET_RESPONSE` → «Заказ» |

---

## Ограничения и известные проблемы

- **Парсинг зависит от разметки Профи.ру**, но якоря переведены на стабильные `order-card-*` и `data-testid` (а не хэши `sc-*`).
- **Дата и ранг защищены от `null`/`NaN`**: `summaryLog` оборачивает парсинг в `try/catch`; при отсутствии ранга уходит пустая строка, а не `NaN`.
- **Маршрутизация завязана на `msgtype`**: переименование типа в `bg.js` или `popup.js` ломает соответствие листов.
- **Индикация процесса и автосброс кнопки**: кнопка проходит состояния `⏳ Обработка… / ✓ Готово / ✗ Не найдено` и автоматически возвращается в исходное (1,5 с после ответа или 15 с — страховка). Текст ответа сервера (подробности и ошибки) доступен только в консоли.

---

## Дальнейшие шаги

- [x] Устойчивые селекторы (переход на `data-testid`/`order-card-*`)
- [x] Защита парсера от `null`/`NaN`
- [ ] Подключить тестовый прогон парсера на фикстурах `test/fixtures` (автоматизация)
- [ ] Показ ответа сервера в попапе (не только в консоли)
- [ ] Очередь записей в `chrome.storage.local` при офлайне