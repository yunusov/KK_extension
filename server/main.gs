function doGet(e) {
  Logger.log("main doGet");
  const action = e.parameter.msgtype || 'default';
  Logger.log("action = " + action);
  if (action === 'APPS_SCRIPT_GET') {
    return ContentService.createTextOutput(JSON.stringify({
      result: response_doGet(e) // вызов из Отклик.gs
    })).setMimeType(ContentService.MimeType.JSON);
  } 
  else if (action === 'APPS_SCRIPT_GET_RESPONSE') {
    return ContentService.createTextOutput(JSON.stringify({
      result: order_doGet(e) // вызов из Заказ.gs
    })).setMimeType(ContentService.MimeType.JSON);
  }
   
  return ContentService.createTextOutput(`{ ok:false, error:"unknown msgtype" }`).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  Logger.log("main doPost");
  const action = e.parameter.msgtype || 'default';
  Logger.log("action = " + action);
  if (action === 'APPS_SCRIPT_POST') {
    return ContentService.createTextOutput(JSON.stringify({
      result: order_doPost(e) // вызов из Заказ.gs
    })).setMimeType(ContentService.MimeType.JSON);
  } 
     
  return ContentService.createTextOutput(`{ ok:false, error:"unknown msgtype" }`).setMimeType(ContentService.MimeType.JSON);
}
