const DEPLOYMENT_HASH = "AKfycbzXGtes8ympH5rFbMlxa8FTPCeEkQ-7wR_TM0kmoTOwlvuviFWUHJiCK9rkbCnONt0x";


function buildQS(params) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue;
    if (Array.isArray(v)) v.forEach(x => qs.append(k, String(x)));
    else qs.append(k, String(v));
  }
  return qs.toString();
}

async function fetchAppsScriptJson(url, options = {}) {
  const res = await fetch(url, { ...options, redirect: "follow" });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(
      `HTTP ${res.status}: сервер вернул не JSON. Фрагмент: ${text.slice(0, 300)}`
    );
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  console.log("msg.type = " + msg.type);
  const qs = buildQS(msg.params);
  console.log("qs = " + qs.toString());
  const url = `https://script.google.com/macros/s/${DEPLOYMENT_HASH}/exec?msgtype=` + msg.type + `&` + qs.toString();
  console.log("url = " + url);
  const post_params = {}
  if (msg.type === "APPS_SCRIPT_POST") {
    post_params = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(msg.body)
    }
  }
  fetchAppsScriptJson(url, post_params)
    .then(data => sendResponse({ ok: true, data }))
    .catch(err => sendResponse({ ok: false, error: String(err) }));
  return true; // важно для async-ответа
});

// for test
// https://script.google.com/macros/s/AKfycbxVyz1zUQlCz1wiWX8mhQUpal7G8DwN7E0XfMNztNIRa6chy_19Ns4xodKtwpnXRRql/exec?secret=my-token&v=1&v=2
// https://script.google.com/macros/s/AKfycbwaNUG1mJbdwItyPLpMOct6zSWfGKbtsYC4ASPhQ3Wurz7Cueuhp7KcVWnOUVT3cQ0U/exec?secret=my-token&v=1&v=2