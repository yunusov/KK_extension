const SHEET_NAME = 'Заказ';
const SECRET = 'my-token';

function doPost(e) {
  const out = ContentService.createTextOutput().setMimeType(ContentService.MimeType.JSON);
  try {
    const data = e.postData ? JSON.parse(e.postData.contents) : {};
    if (data.secret !== SECRET) {
      out.setContent(JSON.stringify({ ok:false, error:'forbidden' }));
      return out; // статус всегда 200 — кладём статус в JSON
    }

    const rows = Array.isArray(data.values) ? data.values : [];
    if (!rows.length) {
      out.setContent(JSON.stringify({ ok:false, error:'no values' }));
      return out;
    }

    const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME)
              || SpreadsheetApp.getActive().insertSheet(SHEET_NAME);
    const lock = LockService.getDocumentLock();
    lock.waitLock(5000); // защита от гонок при одновременных POST
    sh.getRange(sh.getLastRow()+1, 1, rows.length, rows[0].length).setValues(rows);
    lock.releaseLock();

    out.setContent(JSON.stringify({ ok:true, inserted: rows.length }));
    return out;
  } catch (err) {
    out.setContent(JSON.stringify({ ok:false, error:String(err) }));
    return out; // 200 + тело с ошибкой
  }
}

function doGet(e) {
  Logger.log("Заказ doGet");
  const out = ContentService.createTextOutput().setMimeType(ContentService.MimeType.JSON);

  const secret = (e.parameter && e.parameter.secret) || '';
  if (secret !== SECRET) {
    out.setContent(JSON.stringify({ ok:false, error:'forbidden' }));
    Logger.log("secret !== SECRET");
    return out;
  }

  // 1) Простой тест: ?secret=...&msg=hello
  const msg = e.parameter && e.parameter.msg;

  // 2) Мультизначения: ?secret=...&v=A&v=B&v=C  => одна строка: [A,B,C]
  const values = (e.parameters && e.parameters.v) || null;

  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME)
            || SpreadsheetApp.getActive().insertSheet(SHEET_NAME);

  let inserted = 0;
  Logger.log("values = " + values + ", values.length = " + values.length + ", msg = " + msg);
  if (values && values.length) {
    sh.getRange(sh.getLastRow()+1, 1, 1, values.length).setValues([values]);
    inserted = 1;
  } else if (msg) {
    sh.getRange(sh.getLastRow()+1, 1, 1, 2).setValues([[new Date().toISOString(), msg]]);
    inserted = 1;
  }

  out.setContent(JSON.stringify({ ok:true, inserted, mode: values ? 'array' : 'msg' }));
  return out;
}

