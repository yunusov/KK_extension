const grabBtn = document.getElementById("transferBtn");
const IDLE_TEXT = "TRANSFER NOW";

function setButtonState(text, disabled) {
  grabBtn.textContent = text;
  grabBtn.disabled = disabled;
}

function resetButton() {
  setButtonState(IDLE_TEXT, false);
}

grabBtn.addEventListener("click",() => {  
    setButtonState("⏳ Обработка...", true);
  
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
                        resetButton();
                        console.error("executeScript failed:", chrome.runtime.lastError.message);
                        alert("Не удалось внедрить скрипт: " + chrome.runtime.lastError.message);
                        return;
                    }
                    // Ошибок нет — обрабатываем результат как раньше
                    onResult(frames);
    }
            )
        } else {
            alert("There are no active tabs");
            resetButton();
        }
    })
    // chrome.runtime.sendMessage(
    // { type: "APPS_SCRIPT_GET", params: { secret: "my-token", v: ["hello from MV3", "new"] } },
    // resp => console.log("GET:", resp)
    // );
})

function grabImages() {
  console.log("[inject] выполняюсь на", location.href);

  const card = document.querySelector(".order-card__container");
  if (!card) return null;
  console.log("[inject] card:", card);

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

    // 3a) Относительная дата: «N минут/часов/дней/недель назад» (без года/месяца)
    console.log("str = ", str)
    const mRel = str.match(
      /(\d+)\s+(секунду?|секунды|секунд|секунда|минуту?|минута|минуты|минут|час|часа|часов|день|дня|дней|неделю?|неделя|недели|недель)\s+назад/iu
    );
    const mShort = str.match(/(сегодня|вчера|позавчера)/iu);
    if (mShort) {
      const offsetDays = { сегодня: 0, вчера: -1, позавчера: -2 };
      return new Date(Date.now() + offsetDays[mShort[1].toLowerCase()] * 86400e3);
    }
    if (mRel) {
      const n = parseInt(mRel[1], 10);
      console.log("mRel n = " + n)
      const u = mRel[2].toLowerCase();
      console.log("mRel u = " + u)
      let ms;
      if (/^час|^часов/.test(u)) {
        ms = n * 3600e3;
      }
      else if (/^минут/.test(u)) {
        ms = n * 60e3;
      }
      else if (/^дн|^день|^дня/.test(u)) {
        ms = n * 86400e3;
      }
      else if (/^недел/.test(u)) {
        ms = n * 604800e3;
      }
      else {
        return null;
      }
      return new Date(Date.now() - ms);
    }

    // 3b) Абсолютная дата: «4 октября в 09:56» (допускаем ":" или "․", любой регистр, юникод)
    const re = /(\d{1,2})\s+(январь|января|февраль|февраля|март|марта|апрель|апреля|май|мая|июнь|июня|июль|июля|август|августа|сентябрь|сентября|октябрь|октября|ноябрь|ноября|декабрь|декабря)\s+[вВ]\s+(\d{1,2})[:.](\d{2})/iu;

    const m = str.match(re);
    if (!m) return null;

    const day = +m[1];
    const month = monthMap[m[2].toLowerCase()];
    const hour = +m[3];
    const minute = +m[4];

    const now = new Date();
    let year = baseYear ?? now.getFullYear();

    const d = new Date(year, month, day, hour, minute); // локальное время

    // Небольшой «антибудущее» хелпер: если дата получилась в будущем >1 суток — считаем прошлым годом
    if (!baseYear && d.getTime() - now.getTime() > 24*3600*1000) {
      d.setFullYear(year - 1);
    }
    return d;
  }

  // Корень карточки (.order-card__container) выбирается в теле grabImages.

  function getOrderName(card) {
    const el = card.querySelector(".order-card-header__title-container p");
    return el ? el.textContent.trim() : null;
  }

  function getOrderCreatedDate(card) {
    const el = card.querySelector(
      ".order-card-param-subitem-list__element .order-card-param-subitem__text"
    );
    if (!el) {
      return null;
    }
    const dt = parseOrderDateTime(el.textContent)
    console.log("dt = ", dt)
    if (!dt) {
      return null;
    }

    const dd = String(dt.getDate()).padStart(2, '0');
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const yy = String(dt.getFullYear()).slice(-2);
    const dateFmt1 = `${dd}.${mm}.${yy}`;
    const dateFmt2 = `${yy}.${mm}.${dd}`;
    return el ? { date1: dateFmt1, date2: dateFmt2 } : null;
  }

  function getReview(card) {
    // устойчивый якорь: data-testid, а не хэш-класс
    return !!card.querySelector('[data-testid="review"]');
  }

  function extractResponseRank(str) {
    // «ваш отклик 3-й», «ваш отклик: 3», «ваш отклик 17-ий»
    const re = /ваш\s+отклик\s*[:#№]?\s*(\d+)(?:-?и?й)?/iu;

    const match = str.match(re);
    if (!match) {
      return null;
    }
    const num = parseInt(match[1], 10);
    return num;
  }

  // orderUrl берётся через window.location.href в summaryLog.

  function getResponsePrice(card) {
    const el = card.querySelector(".order-card-price__container .order-card-param__text p");
    if (!el) return null;
    const m = el.textContent.match(/(\d+(?:[\s\u00A0]\d{3})*(?:[.,]\d{1,2})?)/);
    if (!m) return null;
    const numString = m[1].replace(/[\s\u00A0]/g, "").replace(",", ".");
    return parseFloat(numString);
  }

  function getResponseRank(card) {
    const el = card.querySelector(".order-card-additional-info__container");
    return el ? extractResponseRank(el.textContent) : null;
  }

  function summaryLog(card) {
    try {
      const orderName = getOrderName(card);
      const orderCreatedDate = getOrderCreatedDate(card);
      const review = getReview(card);
      const responsePrice = getResponsePrice(card);
      const responseRank = getResponseRank(card);
      const orderUrl = window.location.href;

      let date1 = null, date2 = null;
      if (orderCreatedDate) {
        date1 = orderCreatedDate.date1; // ДД.ММ.ГГ
        date2 = orderCreatedDate.date2; // ГГ.ММ.ДД
      }
      else {
        console.error("[inject] дата не распарсилась (orderCreatedDate = null)");
      }

      const prefixName = `${date2} ${orderName ?? ""}`;
      const rank = typeof responseRank === "number" ? responseRank - 1 : "";

      return [
        [date1, prefixName, orderUrl, "Профи", "", "", "", "", responsePrice],
        [date1, prefixName, orderUrl, rank, "", review, "", "", ""]
      ];
    } catch (err) {
      console.error("[inject] parse error:", err);
      return null;
    }
  }

  return summaryLog(card);
}

function onResult(frames) {
  console.log("[onResult] lastError:", chrome.runtime.lastError && chrome.runtime.lastError.message);
  if (chrome.runtime.lastError) {
    alert("[onResult] lastError:", chrome.runtime.lastError && chrome.runtime.lastError.message);
  }
  console.log("[onResult] frames:", frames);

  // Если результатов нет
  if (!frames || !frames.length) { 
      alert("Could not retrieve data from specified page");
      resetButton();                          // вернули исходную
      return;
  }
  // alert(frames[0].result);
  // Объединить списки URL из каждого фрейма в один массив
  if (Array.isArray(frames[0].result)) {
    setButtonState("✓ Готово", true);

    const p1 = chrome.runtime.sendMessage(
      { type: "APPS_SCRIPT_GET", params: { secret: "my-token", v: frames[0].result[0] } }
    );
    const p2 = chrome.runtime.sendMessage(
      { type: "APPS_SCRIPT_GET_RESPONSE", params: { secret: "my-token", v: frames[0].result[1] } }
    );

    // «finally» асинхронного сценария: ждём оба ответа, затем возвращаем кнопку
    Promise.allSettled([p1, p2]).then(
      (results) => {
        results.forEach((r, i) =>
          console.log(i === 0 ? "GET:" : "GET_RESPONSE:", r.status, r.value ?? r.reason)
        );
        setTimeout(resetButton, 1500);
      }
    );
    setTimeout(resetButton, 15000); // страховка от «подвисших» ответов сервера
  } else {
    setButtonState("✗ Не найдено", true);
    console.log("Карточка не найдена или результат null:", frames);
    setTimeout(resetButton, 1500); // даём увидеть статус, затем разблокируем
  }
}
