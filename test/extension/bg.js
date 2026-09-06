const DEPLOYMENT_ORDER = "AKfycbxVyz1zUQlCz1wiWX8mhQUpal7G8DwN7E0XfMNztNIRa6chy_19Ns4xodKtwpnXRRql";
const DEPLOYMENT_RESPONSE = "AKfycbyckDEFaDnLb1V6Tkc5jaKHkH5l8hdQXsyoFzpa8BjaX3OGJfhxIw33g-4EGR0zdP_Q";


function buildQS(params) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue;
    if (Array.isArray(v)) v.forEach(x => qs.append(k, String(x)));
    else qs.append(k, String(v));
  }
  return qs.toString();
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  console.log(msg);
  if (msg.type === "APPS_SCRIPT_GET") {
    const qs = buildQS(msg.params);
    const url = `https://script.google.com/macros/s/${DEPLOYMENT_ORDER}/exec?` + qs.toString();
    fetch(url, { method: "GET", redirect: "follow" })
      .then(r => r.json())
      .then(data => sendResponse({ ok: true, data }))
      .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true; // важно для async-ответа
  }

  if (msg.type === "APPS_SCRIPT_GET_RESPONSE") {
    const qs = buildQS(msg.params);
    const url = `https://script.google.com/macros/s/${DEPLOYMENT_RESPONSE}/exec?` + qs.toString();
    fetch(url, { method: "GET", redirect: "follow" })
      .then(r => r.json())
      .then(data => sendResponse({ ok: true, data }))
      .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true; // важно для async-ответа
  }

  if (msg.type === "APPS_SCRIPT_POST") {
    const url = `https://script.google.com/macros/s/${DEPLOYMENT_ORDER}/exec`;
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(msg.body),
      redirect: "follow"
    })
      .then(r => r.json())
      .then(data => sendResponse({ ok: true, data }))
      .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
});

// for test
// https://script.google.com/macros/s/AKfycbxVyz1zUQlCz1wiWX8mhQUpal7G8DwN7E0XfMNztNIRa6chy_19Ns4xodKtwpnXRRql/exec?secret=my-token&v=1&v=2
// https://script.google.com/macros/s/AKfycbwaNUG1mJbdwItyPLpMOct6zSWfGKbtsYC4ASPhQ3Wurz7Cueuhp7KcVWnOUVT3cQ0U/exec?secret=my-token&v=1&v=2