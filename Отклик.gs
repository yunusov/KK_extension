const SHEET_NAME_RESPONSE = 'Отклик';

function doGet(e) {
  Logger.log("Отклик doGet");
  const out = ContentService.createTextOutput().setMimeType(ContentService.MimeType.JSON);

  const secret = (e.parameter && e.parameter.secret) || '';
  if (secret !== SECRET) {
    out.setContent(JSON.stringify({ ok:false, error:'forbidden' }));
    return out;
  }

  // 1) Простой тест: ?secret=...&msg=hello
  const msg = e.parameter && e.parameter.msg;

  // 2) Мультизначения: ?secret=...&v=A&v=B&v=C  => одна строка: [A,B,C]
  const values = (e.parameters && e.parameters.v) || null;

  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME_RESPONSE)
            || SpreadsheetApp.getActive().insertSheet(SHEET_NAME_RESPONSE);

  let inserted = 0;
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
