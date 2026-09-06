Окей — дам два минимальных и «живых» пути, которые легко потом упакуются в MV3-расширение.

---

# Вариант 1. Через **Apps Script Web App** (самый быстрый «первый запуск»)

## 1) Код `doPost` в Apps Script

В твоей Google-таблице: Extensions → Apps Script → вставь это и сохрани:

```js
const SHEET_NAME = 'Лист1';
const SECRET = 'my-token';

function doPost(e) {
  const output = ContentService.createTextOutput().setMimeType(ContentService.MimeType.JSON);
  try {
    const data = e.postData ? JSON.parse(e.postData.contents) : {};
    if (data.secret !== SECRET) {
      output.setContent(JSON.stringify({ ok:false, error:'Forbidden' }));
      return output.setResponseCode(403);
    }
    const rows = Array.isArray(data.values) ? data.values : [];
    if (!rows.length) {
      output.setContent(JSON.stringify({ ok:false, error:'No values' }));
      return output.setResponseCode(400);
    }
    const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
    sh.getRange(sh.getLastRow()+1, 1, rows.length, rows[0].length).setValues(rows);
    output.setContent(JSON.stringify({ ok:true, inserted: rows.length }));
    return output;
  } catch (err) {
    output.setContent(JSON.stringify({ ok:false, error: String(err) }));
    return output.setResponseCode(500);
  }
}
```

> Почему так: `doPost(e)` — вход для HTTP POST у веб-приложений на Apps Script; «сырое» тело читаем через `e.postData.contents`, а отдаём ответ через Content Service. ([Google for Developers][1])

## 2) Деплой как **Web app** и возьми URL

Menu **Deploy → Manage deployments → New deployment → Web app**. Выбери *Execute as: Me*, за доступ можно временно поставить «Anyone with the link» (или оставь закрытым и добавь простой `SECRET` как выше). После деплоя получишь URL вида:

```
https://script.google.com/macros/s/AKfycb.../exec
```

Это и есть «страница», на которую слать запросы (`/exec`; при тестовом предпросмотре бывает `/dev`). ([Google for Developers][1])

## 3) Самый простой тест прямо из консоли браузера

Открой любую вкладку, вставь:

```js
fetch('https://script.google.com/macros/s/AKfycb.../exec', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    secret: 'my-token',
    values: [
      ['OK', new Date().toISOString(), 'hello from console']
    ]
  })
}).then(r => r.json()).then(console.log);
```

В таблице появится строка. Если видишь `ok:true` — всё работает. (да, Apps Script «слушает» `doPost` и может принимать/отдавать JSON-контент). ([Google for Developers][2])

## 4) Тот же вызов из расширения (MV3)

В `manifest.json` никаких OAuth не нужно — это просто внешний POST.

```json
{
  "manifest_version": 3,
  "name": "Profi → Sheets via Apps Script",
  "version": "0.0.1",
  "permissions": ["storage"],
  "host_permissions": ["https://script.google.com/*"],
  "background": { "service_worker": "bg.js" }
}
```

`bg.js`:

```js
async function sendRowsToAppsScript(values) {
  const url = 'https://script.google.com/macros/s/AKfycb.../exec';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ secret: 'my-token', values })
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// пример вызова:
chrome.runtime.onInstalled.addListener(() => {
  sendRowsToAppsScript([['OK from MV3', new Date().toISOString()]])
    .then(console.log, console.error);
});
```

---

# Вариант 2. **Напрямую в Google Sheets API** из расширения

Это «правильный» продовый путь без Apps Script: вызываем метод **`spreadsheets.values.append`**. Понадобится OAuth в расширении через `chrome.identity.getAuthToken`. Эндпоинт:

```
POST https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}/values/{range}:append
  ?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS
```

`range` — A1-нотация, например `Лист1!A1` (append сам найдёт «конец таблицы»). `USER_ENTERED` заставляет Sheets парсить значения так, как будто их вводят руками. ([Google for Developers][3])

## 1) Manifest (MV3) с OAuth

```json
{
  "manifest_version": 3,
  "name": "Profi → Sheets (Direct API)",
  "version": "0.0.1",
  "permissions": ["identity"],
  "host_permissions": ["https://www.googleapis.com/*"],
  "oauth2": {
    "client_id": "YOUR-CLIENT-ID.apps.googleusercontent.com",
    "scopes": ["https://www.googleapis.com/auth/spreadsheets"]
  },
  "background": { "service_worker": "bg.js" }
}
```

(Клиент OAuth создаётся в Google Cloud Console; в MV3 токен берём через `chrome.identity.getAuthToken` и он кэшируется/автообновляется.) ([Chrome for Developers][4])

## 2) Мини-пример записи одной строки

`bg.js`:

```js
async function getToken() {
  const { token } = await chrome.identity.getAuthToken({ interactive: true });
  return token;
}

async function appendTestRow() {
  const token = await getToken();
  const spreadsheetId = 'YOUR_SHEET_ID';
  const range = 'Лист1!A1';

  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append` +
    `?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const body = { values: [[ 'OK', new Date().toISOString(), 'from MV3 direct' ]] };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${await res.text()}`);
  return res.json();
}

chrome.runtime.onInstalled.addListener(() => {
  appendTestRow().then(console.log, console.error);
});
```

Справка по `append` и его параметрам — в оф. документации; там же описаны `valueInputOption` значения (`RAW`, `USER_ENTERED`). ([Google for Developers][3])

---

## На какой URL слать запрос?

* **Если через Apps Script** — на **твой Web App URL** из деплоя (обычно заканчивается на `/exec`; в черновом режиме может быть `/dev`). Именно он вызывает `doPost(e)` в твоём скрипте. ([Google for Developers][1])
* **Если напрямую в Sheets API** — на REST-эндпоинт `…/spreadsheets/{id}/values/{range}:append` (в примере выше). Нужен `Authorization: Bearer <token>`, полученный через `chrome.identity.getAuthToken` в MV3. ([Google for Developers][3])

---

## Чем проверить быстро, что всё ок?

1. **Быстрый smoke-тест**: задеплой Apps Script Web App и стрельни в него из консоли `fetch(...)` — строка должна появиться мгновенно. ([Google for Developers][2])
2. **Дальше — MV3**: собери минимальное расширение под выбранный путь (Apps Script или прямой Sheets API) и запусти `onInstalled` пример выше.
3. Если нужно «пакетно» — вместо нескольких `append` делай один вызов с большим `values: [ … ]` — так быстрее и надёжней. (Метод `append` рассчитан на это). ([Google for Developers][3])

Хочешь — дам готовый минимальный архив с manifest + `bg.js` для обоих вариантов (подставишь свой `sheetId`/URL и поедешь).

[1]: https://developers.google.com/apps-script/guides/web?utm_source=chatgpt.com "Web Apps | Apps Script"
[2]: https://developers.google.com/apps-script/guides/content?utm_source=chatgpt.com "Content Service | Apps Script"
[3]: https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/append?utm_source=chatgpt.com "Method: spreadsheets.values.append | Google Sheets"
[4]: https://developer.chrome.com/docs/extensions/how-to/integrate/oauth?utm_source=chatgpt.com "OAuth 2.0: authenticate users with Google | Chrome Extensions"
