/**
 * 勤怠システム（試作）— 2画面で共通の部品
 *
 * 裏（Apps Script の Web API）とのやりとり・端末の鍵の保存・登録の画面・知らせの帯。
 * サーバーから来た文字は、必ず textContent で入れる（innerHTML を使わない）。
 */

// ── 送る先（作り方 B）──────────────────────────────────
// 作り方 A（Apps Script の画面）に切り替える時は、送る() の中身だけを google.script.run に差し替える
var 送り先 = 'https://script.google.com/macros/s/AKfycbw54aR61c9ros8DOI3nWWVoNLmjFMQG2DQeKlh7jTiUgRxE5IpyKZ8KYMWXe1RYBvaA/exec';
var 応答の待ち時間 = 20000;   // 公開直後に35秒かかったことがある。切れても同じ操作IDで送り直すので二重にはならない

/**
 * 裏に1回送る。返すのは { 届いた, 応答 }。
 * 届いた=false は「送れたか分からない」。通信の失敗・時間切れ・形の違う応答をまとめてこう扱う
 * （公開直後に、打刻を送ったのに別の応答が返ったことがある）。
 * 形が正しいか は ok:true の応答の形を確かめる関数。
 */
function 送る(依頼, 形が正しいか) {
  var 止め = typeof AbortController === 'function' ? new AbortController() : null;
  var 時間切れ;
  var 待つ = new Promise(function (済む) {
    時間切れ = setTimeout(function () { if (止め) 止め.abort(); 済む(null); }, 応答の待ち時間);
  });
  var 通信 = fetch(送り先, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // CORS の事前確認を起こさない
    body: JSON.stringify(依頼),
    credentials: 'omit',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
    signal: 止め ? 止め.signal : undefined
  }).then(function (res) {
    return res.ok ? res.json().catch(function () { return null; }) : null;
  }).catch(function () { return null; });

  return Promise.race([通信, 待つ]).then(function (応答) {
    clearTimeout(時間切れ);
    if (!応答 || typeof 応答 !== 'object' || typeof 応答.ok !== 'boolean') return { 届いた: false };
    if (応答.ok && 形が正しいか && !形が正しいか(応答)) return { 届いた: false };
    if (!応答.ok && (typeof 応答.コード !== 'string' || typeof 応答.理由 !== 'string')) return { 届いた: false };
    return { 届いた: true, 応答: 応答 };
  });
}

// ── 端末の中の置き場（使えない環境でも画面は動く）───────────────────
var 置き場の頭 = 'kintai-shisaku:';

function 取り出す(キー) {
  try {
    var 値 = localStorage.getItem(置き場の頭 + キー);
    return 値 === null ? null : JSON.parse(値);
  } catch (e) { return null; }
}

/** 値に null を渡すと消す。しまえなかったら false */
function しまう(キー, 値) {
  try {
    if (値 === null) localStorage.removeItem(置き場の頭 + キー);
    else localStorage.setItem(置き場の頭 + キー, JSON.stringify(値));
    return true;
  } catch (e) { return false; }
}

function 新しい操作ID() {
  if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  var b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
}

// ── 画面の部品 ─────────────────────────────────────────

function 要素(id) { return document.getElementById(id); }

/** 要素を作る。属性の text は textContent に入れる。中身の文字は文字のまま入る */
function 作る(タグ, 属性, 中身) {
  var el = document.createElement(タグ);
  Object.keys(属性 || {}).forEach(function (k) {
    if (k === 'text') el.textContent = 属性[k];
    else if (k === 'class') el.className = 属性[k];
    else el.setAttribute(k, 属性[k]);
  });
  (中身 || []).forEach(function (子) {
    if (子 === null || 子 === undefined) return;
    el.appendChild(typeof 子 === 'string' ? document.createTextNode(子) : 子);
  });
  return el;
}

/** 読み込み中・登録・本体 のうち1つだけを見せる */
function 画面を切り替える(見せる) {
  ['読み込み中', '登録', '本体'].forEach(function (id) {
    var el = 要素(id);
    if (el) el.hidden = id !== 見せる;
  });
}

/** 画面の上の知らせの帯。文に null を渡すと消す。ボタン = { 名前, 押したら } */
function 知らせる(文, ボタン) {
  var 帯 = 要素('知らせ');
  帯.textContent = '';
  if (!文) { 帯.hidden = true; return; }
  帯.appendChild(作る('span', { text: 文 }));
  if (ボタン) {
    var b = 作る('button', { type: 'button', class: 'btn', text: ボタン.名前 });
    b.addEventListener('click', function () { 知らせる(null); ボタン.押したら(); });
    帯.appendChild(b);
  }
  帯.hidden = false;
}

// ── 時刻の表示（サーバーは「2026-10-11 09:05:12」の形で返す）──────────

function 時分(日時) {
  var m = /^\d{4}-\d\d-\d\d (\d\d):(\d\d)/.exec(日時 || '');
  return m ? Number(m[1]) + ':' + m[2] : '';
}

function 月日(日時) {
  var m = /^\d{4}-(\d\d)-(\d\d)/.exec(日時 || '');
  return m ? Number(m[1]) + '/' + Number(m[2]) : '';
}

/** 日本時間の今日を「2026-10-11」の形で */
function 今日の日付() {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
}

function 今日の表示() {
  var d = new Date(Date.now() + 9 * 3600000);
  return (d.getUTCMonth() + 1) + '月' + d.getUTCDate() + '日（' + '日月火水木金土'[d.getUTCDay()] + '）';
}

function 端末の時分(ミリ秒) {
  var d = new Date(ミリ秒);
  return d.getHours() + ':' + ('0' + d.getMinutes()).slice(-2);
}

// ── 登録の画面（2画面で同じもの）───────────────────────────

function 端末名の見当() {
  var ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  return 'パソコン';
}

/**
 * 代表からもらった6けたの番号で、この端末を登録する。
 * 済んだら(応答) は、トークンをしまってから呼ぶ。前置き は断られて戻ってきた時の一言。
 */
function 登録の画面を出す(前置き, 済んだら) {
  var 入れ物 = 要素('登録');
  入れ物.textContent = '';
  画面を切り替える('登録');
  知らせる(null);

  var 番号 = 作る('input', {
    id: '番号の欄', type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code',
    maxlength: '8', class: 'input code-input'
  });
  var 名前 = 作る('input', { id: '端末名の欄', type: 'text', maxlength: '30', class: 'input' });
  名前.value = 端末名の見当();
  var ボタン = 作る('button', { type: 'submit', class: 'btn big', text: '登録する' });
  var 返事 = 作る('p', { class: 'reply', role: 'status' });
  if (前置き) 返事.textContent = 前置き;

  var 用紙 = 作る('form', { class: 'card', novalidate: '' }, [
    作る('h2', { text: 'この端末を登録します' }),
    作る('p', { text: '代表からもらった6けたの番号を入れてください。登録は最初の1回だけです。' }),
    作る('label', { for: '番号の欄', class: 'field' }, [作る('span', { text: '番号' }), 番号]),
    作る('label', { for: '端末名の欄', class: 'field' }, [
      作る('span', { text: 'この端末の名前（代表の画面で見分けるため）' }), 名前
    ]),
    ボタン,
    返事,
    作る('p', { class: 'muted small', text: 'iPhone でホーム画面に追加して使う時は、追加したアイコンから開いて登録してください（ホーム画面とブラウザでは、登録が別になります）。' })
  ]);

  用紙.addEventListener('submit', function (e) {
    e.preventDefault();
    ボタン.disabled = true;
    返事.textContent = '登録しています…';
    送る({ 操作: '登録', 番号: 番号.value, 端末名: 名前.value }, function (r) {
      return typeof r.トークン === 'string' && /^[0-9a-f]{64}$/.test(r.トークン);
    }).then(function (結果) {
      ボタン.disabled = false;
      if (!結果.届いた) {
        返事.textContent = '送れませんでした。電波のよい所で、もう一度押してください。続く時は、代表に新しい番号をもらってください。';
        return;
      }
      if (!結果.応答.ok) { 返事.textContent = 結果.応答.理由; return; }
      if (!しまう('トークン', 結果.応答.トークン)) {
        返事.textContent = 'この画面では登録を残せません（プライベートブラウズなど）。ふつうの画面で開き直して、代表に新しい番号をもらってください。';
        return;
      }
      済んだら(結果.応答);
    });
  });

  入れ物.appendChild(用紙);
}
