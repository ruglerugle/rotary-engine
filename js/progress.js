/* ============================================================
   rotary-quest 進捗管理・クイズ判定
   quest-template（design-system.css）の見た目に対して、
   ステージ一覧の描画・localStorageでの進捗保存・クイズ正誤判定を行う。
   ============================================================ */
(function (global) {
  "use strict";

  var STORAGE_KEY = "rotaryQuestProgress_v1";

  var BOOK_RECOMMEND = {
    title: "Amazonで「ロータリーエンジン」の本を探す（構造・歴史・整備の解説書）",
    url: "https://www.amazon.co.jp/s?k=%E3%83%AD%E3%83%BC%E3%82%BF%E3%83%AA%E3%83%BC%E3%82%A8%E3%83%B3%E3%82%B8%E3%83%B3&tag=senjin-22"
  };

  // 各ステージのクイズ正解（クイズカードの出現順に、正解の選択肢のインデックス）
  var ANSWERS = {
    1: [1, 2, 0],
    2: [2, 0, 1],
    3: [0, 2, 1],
    4: [1, 0, 2],
    5: [2, 1, 0],
    6: [0, 2, 1],
    7: [1, 0, 2],
    8: [1, 0, 2]
  };

  var STAGES = [
    { n: 1, file: "stage1.html", title: "おむすびは、なぜ回る", sub: "観察と、角度から座標を取り出す道具" },
    { n: 2, file: "stage2.html", title: "中心がずれた軸", sub: "偏心量 e と創成半径 R" },
    { n: 3, file: "stage3.html", title: "ゆっくり回るローター", sub: "歯車 2:3 と α/3 の法則" },
    { n: 4, file: "stage4.html", title: "頂点が描く曲線", sub: "ハウジング＝ペリトロコイド" },
    { n: 5, file: "stage5.html", title: "ローターを削り出す", sub: "はみ出さない最大の形と円弧近似" },
    { n: 6, file: "stage6.html", title: "3つの部屋、4つの行程", sub: "面積の計算と排気量" },
    { n: 7, file: "stage7.html", title: "完成図を描く", sub: "歯車・吸排気口・点火プラグ" },
    { n: 8, file: "stage8.html", title: "思いついた人たち", sub: "ヴァンケル・パシュケ・マツダ" }
  ];

  function getCleared() {
    try {
      var raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch (e) {
      return [];
    }
  }

  function setCleared(stageNum) {
    var cleared = getCleared();
    if (cleared.indexOf(stageNum) === -1) {
      cleared.push(stageNum);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cleared));
    }
  }

  function isUnlocked(stageNum, cleared) {
    if (stageNum === 1) return true;
    return cleared.indexOf(stageNum - 1) !== -1 || cleared.indexOf(stageNum) !== -1;
  }

  function renderSidebar(currentStage) {
    var list = document.getElementById("side-list");
    if (!list) return;
    var cleared = getCleared();
    list.innerHTML = "";
    STAGES.forEach(function (stage) {
      var unlocked = isUnlocked(stage.n, cleared) || stage.n === currentStage;
      var isCleared = cleared.indexOf(stage.n) !== -1;
      var item = document.createElement(unlocked ? "a" : "div");
      item.className = "side-item";
      if (stage.n === currentStage) item.className += " active";
      if (!unlocked) item.className += " locked";
      if (unlocked) {
        item.href = stage.file;
        item.setAttribute("aria-label", stage.title);
      } else {
        item.setAttribute("aria-disabled", "true");
      }
      var icon = isCleared ? "✅" : unlocked ? "🔓" : "🔒";
      var label = "STAGE" + stage.n;
      item.innerHTML =
        '<span class="side-icon">' + icon + '</span>' +
        '<span class="side-text"><div class="side-main">' + label + " " + stage.title + '</div>' +
        '<div class="side-sub">' + stage.sub + "</div></span>";
      list.appendChild(item);
    });
  }

  function coreClearedCount(cleared) {
    return cleared.filter(function (n) { return n >= 1 && n <= STAGES.length; }).length;
  }

  function updateHeaderProgress() {
    var cleared = coreClearedCount(getCleared());
    var total = STAGES.length;
    var label = document.getElementById("progress-label");
    var fill = document.getElementById("progress-fill");
    if (label) label.textContent = "クリア " + cleared + " / " + total;
    if (fill) {
      fill.style.width = Math.round((cleared / total) * 100) + "%";
      if (fill.parentNode && fill.parentNode.setAttribute) {
        fill.parentNode.setAttribute("aria-valuenow", cleared);
      }
    }
  }

  function markSolved(card) {
    card.setAttribute("data-solved", "true");
    var explain = card.querySelector(".quiz-explain");
    if (explain) explain.hidden = false;
  }

  function allSolved(root) {
    var cards = root.querySelectorAll(".quiz-card[data-quiz]");
    if (cards.length === 0) return true;
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].getAttribute("data-solved") !== "true") return false;
    }
    return true;
  }

  function initQuiz(stageNum, onAllSolved) {
    var answers = ANSWERS[stageNum] || [];
    var cards = document.querySelectorAll(".quiz-card[data-quiz]");
    // クイズのないステージでは onAllSolved が永久に呼ばれず「次へ」が押せなくなるため、先に解放する
    if (cards.length === 0) { onAllSolved(); return; }
    // ANSWERS の件数がクイズ数と食い違うと、該当カードが永久に正解できずステージがクリア不能になる。
    // 無言で壊れるのを防ぐため、開発時に気づけるよう警告を出す
    if (answers.length !== cards.length && window.console && console.warn) {
      console.warn("[progress] STAGE" + stageNum + ": ANSWERS の件数(" + answers.length + ")がクイズ数(" + cards.length + ")と一致しません");
    }
    cards.forEach(function (card, cardIndex) {
      var live = document.createElement("p");
      live.className = "sr-only";
      live.setAttribute("aria-live", "polite");
      card.appendChild(live);
      var buttons = card.querySelectorAll(".choice-btn");
      buttons.forEach(function (btn, btnIndex) {
        btn.addEventListener("click", function () {
          if (card.getAttribute("data-solved") === "true") return;
          var correct = answers[cardIndex] === btnIndex;
          live.textContent = correct ? "正解です" : "不正解です。もう一度選んでください";
          if (correct) {
            // 正解のボタンは disabled にせず、フォーカスを保ったまま操作だけ止める
            // （押した瞬間にフォーカスが body へ飛ぶと、キーボード利用者が位置を見失うため）
            buttons.forEach(function (b) { if (b !== btn) b.disabled = true; });
            btn.setAttribute("aria-disabled", "true");
            btn.classList.add("choice-ok");
            markSolved(card);
            if (allSolved(document)) {
              onAllSolved();
            }
          } else {
            btn.classList.add("choice-ng");
            track("quiz_wrong", { stage: stageNum, quiz: cardIndex + 1, choice: btnIndex + 1 });
          }
        });
      });
    });
  }

  function setMissionAchieved() {
    var status = document.getElementById("mission-status");
    if (status) {
      status.textContent = "達成！";
      status.classList.add("ok");
    }
  }

  function showClearBanner() {
    if (document.querySelector(".stage-clear-banner")) return;
    var nav = document.querySelector(".stage-nav");
    if (!nav) return;
    var banner = document.createElement("div");
    banner.className = "stage-clear-banner";
    banner.setAttribute("role", "status");
    banner.textContent = "🎉 STAGE CLEAR!";
    nav.parentNode.insertBefore(banner, nav);
  }

  function track(eventName, params) {
    if (typeof window.gtag === "function") window.gtag("event", eventName, params || {});
  }

  function enableNext(stageNum) {
    var nextBtn = document.getElementById("btn-next");
    if (nextBtn) nextBtn.disabled = false;
    setCleared(stageNum);
    updateHeaderProgress();
    showClearBanner();
    track("stage_clear", { stage: stageNum });
    if (coreClearedCount(getCleared()) === STAGES.length) {
      track("all_clear");
    }
  }

  function bindResetAll() {
    var btn = document.getElementById("btn-reset-all");
    if (!btn) return;
    btn.addEventListener("click", function () {
      if (window.confirm("進捗をすべてリセットして最初からやり直しますか？")) {
        localStorage.removeItem(STORAGE_KEY);
        window.location.href = "index.html";
      }
    });
  }

  function renderBookRecommend() {
    var el = document.getElementById("book-recommend");
    if (!el) return;
    el.innerHTML =
      '<p class="book-recommend-label">参考文献</p>' +
      '<div class="book-recommend-body">' +
      '<div>' +
      '<p class="book-recommend-lead">もっと深く学びたい方へ</p>' +
      '<a href="' + BOOK_RECOMMEND.url + '" target="_blank" rel="sponsored noopener">' + BOOK_RECOMMEND.title + "</a>" +
      "</div>" +
      "</div>" +
      '<p class="book-recommend-note">※ Amazonのアソシエイトとして、当サイトは適格販売により収入を得ています。</p>';
  }

  function bindSidebarToggle() {
    var shell = document.getElementById("app-shell");
    if (!shell) return;
    function toggleSide() { shell.classList.toggle("side-collapsed"); }
    var t1 = document.getElementById("sidebar-toggle");
    var t2 = document.getElementById("head-nav-toggle");
    var backdrop = document.getElementById("side-backdrop");
    if (t1) t1.addEventListener("click", toggleSide);
    if (t2) t2.addEventListener("click", toggleSide);
    if (backdrop) backdrop.addEventListener("click", function () { shell.classList.add("side-collapsed"); });
  }

  function initStagePage(stageNum) {
    // ロック中でも直URLアクセスは許可する（検索エンジン経由の流入を妨げないため）。
    // 順路の誘導はトップのカードとサイドバーのロック表示で行う。
    document.addEventListener("DOMContentLoaded", function () {
      var cleared = getCleared();
      renderSidebar(stageNum);
      updateHeaderProgress();
      bindResetAll();
      bindSidebarToggle();
      renderBookRecommend();

      var nextBtn = document.getElementById("btn-next");
      var alreadyCleared = cleared.indexOf(stageNum) !== -1;

      if (alreadyCleared) {
        var cards = document.querySelectorAll(".quiz-card[data-quiz]");
        cards.forEach(function (card) {
          card.setAttribute("data-solved", "true");
          var explain = card.querySelector(".quiz-explain");
          if (explain) explain.hidden = false;
          card.querySelectorAll(".choice-btn").forEach(function (b) { b.disabled = true; });
        });
        setMissionAchieved();
        if (nextBtn) nextBtn.disabled = false;
      } else if (allSolved(document) === false) {
        if (nextBtn) nextBtn.disabled = true;
      }

      initQuiz(stageNum, function () {
        setMissionAchieved();
        enableNext(stageNum);
      });

      if (nextBtn) {
        nextBtn.addEventListener("click", function () {
          var next = STAGES[stageNum]; // stageNum is 1-indexed, so STAGES[stageNum] is the next stage
          window.location.href = next ? next.file : "complete.html";
        });
      }
    });
  }

  function initCompletePage() {
    if (coreClearedCount(getCleared()) < STAGES.length) {
      window.location.replace("index.html");
      return;
    }
    document.addEventListener("DOMContentLoaded", function () {
      bindResetAll();
      renderBookRecommend();
    });
  }

  function initCoverPage() {
    document.addEventListener("DOMContentLoaded", function () {
      var cleared = getCleared();
      document.querySelectorAll(".quest-card[data-stage]").forEach(function (card) {
        var n = parseInt(card.getAttribute("data-stage"), 10);
        if (!isUnlocked(n, cleared)) {
          card.classList.add("locked");
          card.removeAttribute("href");
        }
        if (cleared.indexOf(n) !== -1) {
          card.classList.add("cleared");
          var cta = card.querySelector(".q-cta");
          if (cta) cta.textContent = "クリア済み ✓";
        }
      });
      renderBookRecommend();
    });
  }

  global.RQ = {
    STAGES: STAGES,
    getCleared: getCleared,
    initStagePage: initStagePage,
    initCoverPage: initCoverPage,
    initCompletePage: initCompletePage
  };
})(window);
