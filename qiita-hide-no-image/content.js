(() => {
  "use strict";

  /* =========================
     設定
  ========================= */
  const BODY_SELECTOR = ".it-MdContent";
  const ARTICLE_SELECTOR = "article";
  const HIDE_STYLE = "display:none !important;";
  const MAX_CONCURRENT_FETCH = 3;
  const CACHE_PREFIX = "qiita_has_img:";

  /* =========================
     ユーティリティ
  ========================= */
  function normalizeUrl(href) {
    try {
      const u = new URL(href, location.origin);
      u.hash = "";
      u.search = "";
      return u.toString();
    } catch {
      return null;
    }
  }

  function isItemUrl(url) {
    try {
      const u = new URL(url);
      return /^\/[^\/]+\/items\/[^\/]+$/.test(u.pathname);
    } catch {
      return false;
    }
  }

  function cacheGet(url) {
    const v = sessionStorage.getItem(CACHE_PREFIX + url);
    if (v === null) return null;
    return v === "1";
  }

  function cacheSet(url, hasImg) {
    sessionStorage.setItem(CACHE_PREFIX + url, hasImg ? "1" : "0");
  }

  async function fetchHtml(url, signal) {
    const res = await fetch(url, {
      credentials: "include",
      headers: { Accept: "text/html" },
      signal
    });
    if (!res.ok) throw new Error(res.status);
    return res.text();
  }

  /* =========================
     判定ロジック（超重要）
  ========================= */
  function hasImageInMdContent(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const md = doc.querySelector(BODY_SELECTOR);

    // .it-MdContent が存在しない → 画像あり扱い
    if (!md) return true;

    // 本文内 img のみを見る
    return md.querySelector("img") !== null;
  }

  /* =========================
     非表示
  ========================= */
  function hideArticle(article) {
    if (!(article instanceof HTMLElement)) return;
    article.style.display = "none";
  }

  /* =========================
     fetch キュー（負荷対策）
  ========================= */
  const queue = [];
  let active = 0;

  function enqueue(task) {
    queue.push(task);
    pump();
  }

  function pump() {
    while (active < MAX_CONCURRENT_FETCH && queue.length) {
      const task = queue.shift();
      active++;
      task().finally(() => {
        active--;
        pump();
      });
    }
  }

  /* =========================
     メイン処理
  ========================= */
  const processed = new WeakSet();

  function scan() {
    const articles = document.querySelectorAll(ARTICLE_SELECTOR);

    articles.forEach(article => {
      if (processed.has(article)) return;
      processed.add(article);

      // article 内の items リンクを1つ探す
      const link = article.querySelector("a[href*='/items/']");
      if (!link) return;

      const url = normalizeUrl(link.href);
      if (!url || !isItemUrl(url)) return;

      // キャッシュ確認
      const cached = cacheGet(url);
      if (cached === false) {
        hideArticle(article);
        return;
      }
      if (cached === true) {
        return;
      }

      enqueue(async () => {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), 10000);

        try {
          const html = await fetchHtml(url, ac.signal);
          const hasImg = hasImageInMdContent(html);
          cacheSet(url, hasImg);

          if (!hasImg) {
            hideArticle(article);
          }
        } catch {
          // 失敗時は安全側（消さない）
        } finally {
          clearTimeout(timer);
        }
      });
    });
  }

  /* =========================
     初期化
  ========================= */
  scan();

  // 無限スクロール対応
  const observer = new MutationObserver(scan);
  observer.observe(document.body, { childList: true, subtree: true });

})();

