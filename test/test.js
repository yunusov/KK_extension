function parseOrderDateTime(str) {
  // создаём маппинг названий месяцев на номер (0-11)
  const months = {
    'января': 0,
    'февраля': 1,
    'марта': 2,
    'апреля': 3,
    'мая': 4,
    'июня': 5,
    'июля': 6,
    'августа': 7,
    'сентября': 8,
    'октября': 9,
    'ноября': 10,
    'декабря': 11
  };

  const re = /(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+в\s+(\d{1,2}):(\d{2})/i;

  const match = str.match(re);
  if (!match) {
    return null;  // не удалось распарсить
  }

  const day = parseInt(match[1], 10);
  const monthName = match[2].toLowerCase();
  const hour = parseInt(match[3], 10);
  const minute = parseInt(match[4], 10);

  const monthIndex = months[monthName];
  if (monthIndex === undefined) {
    return null;
  }

  // на сегодняшний год — но можно параметризовать год
  const now = new Date();
  const year = now.getFullYear();

  // создаём объект Date (месяцы 0-11)
  const date = new Date(year, monthIndex, day, hour, minute);
  return date;
}


function getWindowHtml() {
    let windowName = ".ContentStyles__Card-sc-19y55e6-0"
    return document.querySelectorAll(windowName)[0];
};

function getOrderName(windowHtml) {
    return windowHtml.children[1].textContent
};

function getOrderCreatedDate(windowHtml) {
    let content =  windowHtml.querySelectorAll(".order-card-param-subitem-list__element")[0].querySelectorAll("p")[0].textContent
    dt = parseOrderDateTime(content);
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
  let orderName = getOrderName(windowHtml);
  let orderCreatedDate = getOrderCreatedDate(windowHtml);
  let review = getReview(windowHtml)
  let orderUrl = getOrderUrl();
  let responsePrice = getResponsePrice(windowHtml);
  let responseRank = getResponseRank(windowHtml);
  console.log(orderName);
  console.log(orderCreatedDate);
  console.log(review);
  console.log(orderUrl);
  console.log(responsePrice);
  console.log(responseRank);
  return orderName
}

summaryLog();
