const grabBtn = document.getElementById("transferBtn");
grabBtn.addEventListener("click",() => {    
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        var tab = tabs[0];
        if (tab) {
            chrome.scripting.executeScript(
                {
                    target:{tabId: tab.id, allFrames: true},
                    func:grabImages
                },
                (frames) => {
                    // Проверяем ошибку внедрения — иначе молчаливый провал
                    if (chrome.runtime.lastError) {
                        console.error("executeScript failed:", chrome.runtime.lastError.message);
                        alert("Не удалось внедрить скрипт: " + chrome.runtime.lastError.message);
                        return;
                    }
                    // Ошибок нет — обрабатываем результат как раньше
                    onResult(frames);
    }
            )
        } else {
            alert("There are no active tabs")
        }
    })
    // chrome.runtime.sendMessage(
    // { type: "APPS_SCRIPT_GET", params: { secret: "my-token", v: ["hello from MV3", "new"] } },
    // resp => console.log("GET:", resp)
    // );
})

function grabImages() {
  console.log("[inject] выполняюсь на", location.href);

  function parseOrderDateTime(input, { baseYear } = {}) {
    // 0) Получаем строку (если вдруг прилетел DOM-элемент)
    let str = (typeof input === 'string')
      ? input
      : (input && input.innerText) ? input.innerText : String(input ?? '');

    // 1) Нормализация юникода и пробелов
    str = str
      .normalize('NFC') // унифицируем составные символы
      .replace(/[\u00A0\u202F\u2000-\u200A\u205F\u3000]+/g, ' ') // все «редкие» пробелы -> обычный
      .trim();

    // 2) Месяцы: допускаем "январь|января", "...ь|...я", "май|мая", "март|марта" и т.п.
    const monthMap = {
      'январь':0,'января':0,
      'февраль':1,'февраля':1,
      'март':2,'марта':2,
      'апрель':3,'апреля':3,
      'май':4,'мая':4,
      'июнь':5,'июня':5,
      'июль':6,'июля':6,
      'август':7,'августа':7,
      'сентябрь':8,'сентября':8,
      'октябрь':9,'октября':9,
      'ноябрь':10,'ноября':10,
      'декабрь':11,'декабря':11
    };

    // 3) Гибкий паттерн: … 4 октября в 09:56 (допускаем ":" или "․", любой регистр, юникод)
    const re = /(\d{1,2})\s+(январь|января|февраль|февраля|март|марта|апрель|апреля|май|мая|июнь|июня|июль|июля|август|августа|сентябрь|сентября|октябрь|октября|ноябрь|ноября|декабрь|декабря)\s+[вВ]\s+(\d{1,2})[:.](\d{2})/iu;

    const m = str.match(re);
    if (!m) return null;

    const day = +m[1];
    const month = monthMap[m[2].toLowerCase()];
    const hour = +m[3];
    const minute = +m[4];

    const now = new Date();
    let year = baseYear ?? now.getFullYear();

    const d = new Date(year, month, day, hour, minute); // локальное время (MDN) :contentReference[oaicite:1]{index=1}

    // Небольшой «антибудущее» хелпер: если дата получилась в будущем >1 суток — считаем прошлым годом
    if (!baseYear && d.getTime() - now.getTime() > 24*3600*1000) {
      d.setFullYear(year - 1);
    }
    return d;
  }




  function getWindowHtml() {
      let windowName = ".ContentStyles__Card-sc-19y55e6-0"
      return document.querySelectorAll(windowName)[0];
  };

  function getOrderName(windowHtml) {
      return windowHtml.children[1].children[0].children[0].children[0].textContent
  };

  function getOrderCreatedDate(windowHtml) {
      let content =  windowHtml.querySelectorAll(".order-card-param-subitem-list__element")[0].querySelectorAll("p")[0].textContent
      console.log(content)
      dt = parseOrderDateTime(content);
      console.log(dt);
      const dd = String(dt.getDate()).padStart(2, '0');
      const mm = String(dt.getMonth() + 1).padStart(2, '0');
      const yy = String(dt.getFullYear()).slice(-2);

      const dateFmt1 = `${dd}.${mm}.${yy}`;
      const dateFmt2 = `${yy}.${mm}.${dd}`;
      return { date1: dateFmt1, date2: dateFmt2 };
  };

  function getReview(windowHtml) {
      let value = windowHtml.querySelector(".order-card-client__top-container").querySelector(".CountReviews__CommentsSection-sc-n7wfgq-0")
      if (value === null) {
        return false
      }
      return true
  };

  function extractResponseRank(str) {
    const re = /ваш отклик\s+(\d+)\s*-?й/i;

    const match = str.match(re);
    if (!match) {
      return null;
    }
    const num = parseInt(match[1], 10);
    return num;
  }

  function getOrderUrl() {
      return window.location.href
  }

  function getResponsePrice(windowHtml) {
    let priceClassName = ".order-card-price__container";
    price_text = windowHtml.querySelectorAll(priceClassName)[0].childNodes[1].textContent
    const re = /(\d+(?:[\s\u00A0]\d{3})*(?:\.\d{1,2})?)/;

    const match = price_text.match(re);
    if (!match) {
      return null;
    }
    // убираем пробелы внутри чисел, например "1 600" → "1600"
    const numString = match[1].replace(/[\s\u00A0]/g, '');
    return parseFloat(numString);
  }

  function getResponseRank(windowHtml) {
    let text = windowHtml.querySelector(".order-card-additional-info__container").textContent
    return extractResponseRank(text)
  }

  function summaryLog() {
    let windowHtml = getWindowHtml();
    if (!windowHtml) {
      return null
    }

    console.log(windowHtml);
    let orderName = getOrderName(windowHtml);
    let orderCreatedDate = getOrderCreatedDate(windowHtml);
    let review = getReview(windowHtml)
    let orderUrl = getOrderUrl();
    let responsePrice = getResponsePrice(windowHtml);
    let responseRank = getResponseRank(windowHtml);
    console.log(orderCreatedDate);
    orderName = `${orderCreatedDate.date2} ${orderName}`
    return [
      [orderCreatedDate.date1, orderName, orderUrl, responseRank - 1, "", review, ""],
      [orderCreatedDate.date1, orderName, orderUrl, "Профи", "", "", "", "", responsePrice]
    ]
    console.log(orderName);
    console.log(orderCreatedDate);
    console.log(review);
    console.log(orderUrl);
    console.log(responsePrice);
    console.log(responseRank);
  }
  return summaryLog();
}

function onResult(frames) {
  console.log("[onResult] lastError:", chrome.runtime.lastError && chrome.runtime.lastError.message);
  console.log("[onResult] frames:", frames);

  // Если результатов нет
  if (!frames || !frames.length) { 
      alert("Could not retrieve data from specified page");
      return;
  }
  // alert(frames[0].result);
  // Объединить списки URL из каждого фрейма в один массив
  if (frames[0].result !== null) {
    chrome.runtime.sendMessage(
      { type: "APPS_SCRIPT_GET", params: { secret: "my-token", v: frames[0].result[0] } },
      resp => console.log("GET:", resp)
    );
    chrome.runtime.sendMessage(
      { type: "APPS_SCRIPT_GET_RESPONSE", params: { secret: "my-token", v: frames[0].result[1] } },
      resp => console.log("GET:", resp)
    );
  }
  else {
    console.log("Карточка не найдена или результат null:", frames);
  }
}
