Отлично. Ниже — два надёжных способа писать в Google-таблицу из JS так, чтобы потом без боли упаковать это в **Chrome-расширение (MV3)**. Плюс минимальные рабочие сниппеты.

---

# Вариант A (рекомендую): напрямую в **Google Sheets API** из расширения

## Что нужно

1. **Cloud-проект** → включить **Google Sheets API**. Затем настроить **OAuth consent screen** (достаточно тестового режима на 100 пользователей) и создать OAuth-клиент типа **Installed → Chrome Extension** (указываешь ID расширения). ([Google for Developers][1])

2. В `manifest.json`:

* `manifest_version: 3`
* `"permissions": ["identity", "storage", "activeTab", "scripting"]`
* `"host_permissions": ["https://www.googleapis.com/*"]`
* `"oauth2": { "client_id": "<CLIENT_ID>.apps.googleusercontent.com", "scopes": ["https://www.googleapis.com/auth/spreadsheets"] }`
  (Это штатный способ для OAuth в расширениях; токены берутся через `chrome.identity`.) ([Chrome for Developers][2])

3. **Как писать в таблицу**: вызываем метод **`spreadsheets.values.append`** с `valueInputOption=USER_ENTERED` (или `RAW`) — он допишет строки в конец «таблицы» указанного диапазона. ([Google for Developers][3])

### Минимальный пример

**`manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "Profi → Google Sheets",
  "version": "0.1.0",
  "permissions": ["identity", "storage", "activeTab", "scripting"],
  "host_permissions": ["https://www.googleapis.com/*"],
  "oauth2": {
    "client_id": "<CLIENT_ID>.apps.googleusercontent.com",
    "scopes": ["https://www.googleapis.com/auth/spreadsheets"]
  },
  "background": { "service_worker": "bg.js" },
  "content_scripts": [
    { "matches": ["https://profi.ru/*"], "js": ["content.js"] }
  ]
}
```

*(почему так: `oauth2` и `identity` — для получения токена; `host_permissions` — чтобы фетчить `https://www.googleapis.com/` из SW/страниц расширения).* ([Chrome for Developers][2])

**`bg.js` (service worker)**

```js
async function getToken() {
  const { token } = await chrome.identity.getAuthToken({ interactive: true });
  return token; // кэш и авто-обновление берёт на себя Chrome
}

async function appendRows({ spreadsheetId, range, values }) {
  const token = await getToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append` +
              `?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values }) // [["id","title","budget","link","date"], ...]
  });
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${await res.text()}`);
  return res.json();
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'APPEND_SHEET') {
    appendRows(msg.payload).then(
      data => sendResponse({ ok: true, data }),
      err  => sendResponse({ ok: false, error: err.message })
    );
    return true; // async
  }
});
```

*Заметь: `chrome.identity.getAuthToken` в MV3 кэширует и сам освежает access-token — удобно для фоновой записи.* ([Chrome for Developers][4])

**`content.js` (на странице Profi.ru)**

```js
// Пример: собрали строки на странице (псевдокод – подставь свои селекторы)
const rows = [...document.querySelectorAll('.order-card')].map(c => ([
  c.dataset.id,
  c.querySelector('.order-title')?.textContent.trim(),
  (c.querySelector('.order-budget')?.textContent.match(/\d[\d\s]*/)?.[0]||'').replace(/\s/g, ''),
  new URL(c.querySelector('a')?.href||'', location.href).href,
  c.querySelector('.order-date')?.textContent.trim()
]));

chrome.runtime.sendMessage({
  type: 'APPEND_SHEET',
  payload: {
    spreadsheetId: "<ID_ТВОЕЙ_ТАБЛИЦЫ>",
    range: "Лист1!A1",   // append сам найдёт конец таблицы в этом диапазоне
    values: rows
  }
}, (resp) => console.log('Sheets append:', resp));
```

**Плюсы**: одна зависимость (Google API), нативные токены из `chrome.identity`, минимум инфраструктуры.
**Минусы**: если выкатишь публично, для «чувствительных» скоупов (напр., `/auth/spreadsheets`) может понадобиться **верификация OAuth**; в тестовом режиме — до **100 тест-пользователей**. ([Поддержка Google][5])

---

# Вариант B (альтернатива проще в проде): через **Apps Script Web App** как «прокси»

Идея: создать **веб-приложение на Apps Script**, которое пишет в нужную таблицу. Расширение просто делает **POST** на URL скрипта. Это обходит OAuth в самом расширении (аутентификация/доступ выполняет Apps Script «от имени автора скрипта»).

### Шаги

1. В Google Sheet → **Extensions → Apps Script**.
2. Напиши `doPost(e)` и деплой как **Web app** (`Execute as: Me`, `Who has access: Only myself`/`Anyone with link` — на свой риск; обычно добавляют простой секрет в заголовке). ([Google for Developers][6])

**Apps Script (Code.gs)**

```js
const SHEET_NAME = 'Лист1';
const SECRET = 'my-token';

function doPost(e) {
  try {
    const auth = e.parameter.secret || (e.postData && JSON.parse(e.postData.contents).secret);
    if (auth !== SECRET) return ContentService.createTextOutput('Forbidden').setResponseCode(403);

    const payload = e.postData ? JSON.parse(e.postData.contents) : {};
    const rows = payload.values || [];
    const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
    if (rows.length) sheet.getRange(sheet.getLastRow()+1, 1, rows.length, rows[0].length).setValues(rows);
    return ContentService.createTextOutput(JSON.stringify({ ok: true }));
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok:false, error:String(err) })).setResponseCode(500);
  }
}
```

*(Веб-апп должен иметь `doGet`/`doPost`, иначе не задеплоится.)* ([Google for Developers][6])

**В расширении (любой контекст)**

```js
await fetch("https://script.google.com/macros/s/AKfycb.../exec", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ secret: "my-token", values: rows })
});
```

**Плюсы**: нет OAuth в расширении, проще поддерживать; можно централизованно менять логику.
**Минусы**: безопасность и квоты на Apps Script — твоя ответственность; публичный web-app лучше дополнительно ограничивать (секрет, Origin-проверка и т.п.). ([Google for Developers][6])

---

## Какой путь выбрать под твой кейс (Profi → Sheets)

* Нужна **быстрая локальная разработка** и ты один пользователь → *Подойдёт любой*.
* Планируешь **распространять расширение** другим людям → часто удобнее **Apps Script** (минимум фрикции у конечного пользователя). Если хочешь нативный доступ к Google API и не зависеть от Apps Script — бери путь **A** и готовь **OAuth-верификацию**. ([Поддержка Google][5])

---

## Пара важных деталей

* **Scopes**: для записи достаточно `https://www.googleapis.com/auth/spreadsheets`. Если ещё хочешь давать выбрать файл через Picker — добавляй Drive-скоупы по необходимости. Чем меньше скоупов, тем лучше. ([Google for Developers][7])
* **Append vs batch**: много строк? Вместо множества `append` делай **`values.batchUpdate`** (меньше сетевых вызовов). ([Google for Developers][8])
* **MV3 и OAuth**: `chrome.identity.getAuthToken` — «правильный» способ для Google-API в расширениях; если нужен полный контроль над refresh-токеном, можно собрать **PKCE/Code Flow** через `chrome.identity.launchWebAuthFlow`, но это сложнее (сам делаешь обмен кода на токен и хранение refresh). ([Chrome for Developers][4])
* **Хост-доступ**: не забудь `host_permissions` на `https://www.googleapis.com/*`, иначе `fetch` к Sheets API из SW упадёт. ([Chrome for Developers][9])
* **OAuth тест-режим**: до **100 тест-пользователей**; для широкой аудитории — «Publish app» и пройти проверку (особенно со «sensitive» скоупами). ([Поддержка Google][10])

---

## Готовые «кирпичики» под твою задачу

1. **Контент-скрипт** (Profi): собирает массив `rows`.
2. **Фоновый SW**: принимает `rows` и делает `append` в нужную таблицу (Вариант A) или шлёт на Apps Script URL (Вариант B).
3. **Кнопка в попапе**: «Экспортировать в Google Sheets» — чтобы руками запускать пуш.
4. **Надёжность**: при офлайне складывай очереди `rows` в `chrome.storage.local`, а при сети — дозаливай.

Если хочешь, могу под твою текущую разметку страницы **прописать точные селекторы** и сформировать «скелет» расширения с двумя транспортами (Sheets API / Apps Script), чтобы ты сразу вставил свой `spreadsheetId` и поехал.

[1]: https://developers.google.com/workspace/sheets/api/quickstart/js?utm_source=chatgpt.com "JavaScript quickstart | Google Sheets"
[2]: https://developer.chrome.com/docs/extensions/reference/manifest/oauth2?utm_source=chatgpt.com "Manifest - oauth2 | Chrome Extensions"
[3]: https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/append?utm_source=chatgpt.com "Method: spreadsheets.values.append | Google Sheets"
[4]: https://developer.chrome.com/docs/extensions/reference/api/identity?utm_source=chatgpt.com "chrome.identity | API - Chrome for Developers"
[5]: https://support.google.com/cloud/answer/13463073?hl=en&utm_source=chatgpt.com "OAuth App Verification Help Center"
[6]: https://developers.google.com/apps-script/guides/web?utm_source=chatgpt.com "Web Apps | Apps Script"
[7]: https://developers.google.com/workspace/sheets/api/scopes?utm_source=chatgpt.com "Choose Google Sheets API scopes"
[8]: https://developers.google.com/workspace/sheets/api/guides/values?utm_source=chatgpt.com "Read & write cell values | Google Sheets"
[9]: https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions?utm_source=chatgpt.com "Declare permissions | Chrome Extensions"
[10]: https://support.google.com/cloud/answer/15549945?hl=en&utm_source=chatgpt.com "Manage App Audience - Google Cloud Platform Console ..."
