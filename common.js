/**
 * 勤怠システム（試作）— 2画面で共通の部品
 *
 * 裏（Apps Script の Web API）とのやりとり・端末の鍵の保存・登録の画面・知らせの帯。
 * サーバーから来た文字は、必ず textContent で入れる（innerHTML を使わない）。
 */

// ── 送る先（作り方 B）──────────────────────────────────
// 作り方 A（Apps Script の画面）に切り替える時は、送る() の中身だけを google.script.run に差し替える
var 送り先 = 'https://script.google.com/macros/s/AKfycbw54aR61c9ros8DOI3nWWVoNLmjFMQG2DQeKlh7jTiUgRxE5IpyKZ8KYMWXe1RYBvaA/exec';
// 裏の処理は1.2〜3.3秒で終わる（実行数で確認）。それより遅いのは Google の返事の窓口が崩れている時なので、
// 8秒で切って送り直す方が早く済む（2026-10-11 の計測で決定）。送り直しても二重にならない依頼だけを送り直す
var 応答の待ち時間 = 8000;
var 送り直しの間 = [0, 1000, 3000];   // 送り直しつきで送る() の待ち（ミリ秒）。最大3回

/**
 * 裏に1回送る。返すのは { 届いた, 応答 }。
 * 届いた=false は「送れたか分からない」。通信の失敗・時間切れ・形の違う応答をまとめてこう扱う
 * （公開直後に、打刻を送ったのに別の応答が返ったことがある）。
 * 形が正しいか は ok:true の応答の形を確かめる関数。
 */
function 送る(依頼, 形が正しいか) {
  // どの依頼への返事かを照合するための印。送り直す時は同じ依頼を渡すので、同じ印のまま
  if (!依頼.依頼ID) 依頼.依頼ID = 新しい操作ID();
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
    // この依頼への返事か（「開く」の返事や、別の依頼の返事ではないか）を、断りの返事も含めて照合する
    if (応答.操作 !== 依頼.操作 || 応答.依頼ID !== 依頼.依頼ID) return { 届いた: false };
    if (応答.ok && 形が正しいか && !形が正しいか(応答)) return { 届いた: false };
    if (!応答.ok && (typeof 応答.コード !== 'string' || typeof 応答.理由 !== 'string')) return { 届いた: false };
    return { 届いた: true, 応答: 応答 };
  });
}

/**
 * 届かなければ送り直す（最大3回）。送り直しても二重にならない依頼に使う：
 * 読むだけ・登録（同じトークンなら登録済みと返る）・端末を止める・番号を出す（最後に出た番号が使える）。
 * 打刻は staff.js が自分で送り直す（押した時刻と「送っています」の表示があるため）
 */
function 送り直しつきで送る(依頼, 形が正しいか) {
  var 回 = 0;
  function 一回() {
    return new Promise(function (済む) { setTimeout(済む, 送り直しの間[回]); })
      .then(function () { return 送る(依頼, 形が正しいか); })
      .then(function (結果) {
        var もう一度 = !結果.届いた || ['混雑', '内部'].indexOf(結果.応答.コード) >= 0;
        回++;
        if (もう一度 && 回 < 送り直しの間.length) return 一回();
        return 結果;
      });
  }
  return 一回();
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

/** 端末のトークン（英小文字と数字の64桁の乱数）。登録の画面を出すたびに新しく作る */
function 新しいトークン() {
  var b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
}

function 新しい操作ID() {
  if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  var b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
}

// ── 画面の部品 ─────────────────────────────────────────

/**
 * ほかのページの中に埋め込まれていたら、何もしない（埋め込んだ画面の上から「止める」などを押させる手口を防ぐ）。
 * GitHub Pages ではヘッダーで埋め込みを禁止できず、meta の CSP では frame-ancestors が効かないため。止めたら true
 */
function 埋め込まれていたら止める() {
  var 埋め込み;
  try { 埋め込み = window.top !== window.self; } catch (e) { 埋め込み = true; }
  if (!埋め込み) return false;
  document.body.textContent = '';
  document.body.appendChild(作る('p', { class: 'loading', text: 'この画面は、ほかのページの中では使えません。' }));
  return true;
}

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
 * トークンはこの端末で作り、送る前に「登録中のトークン」としてしまう。返事が届かないまま押し直しても、
 * 開き直しても、同じトークンで送るので、裏は「登録済み」か「続きから登録」で応じる（番号だけ使い切らない）。
 * 済んだら({ トークン, 名前, 役割 }) は、トークンをしまってから呼ぶ。前置き は断られて戻ってきた時の一言。
 */
function 登録の画面を出す(前置き, 済んだら) {
  var 入れ物 = 要素('登録');
  入れ物.textContent = '';
  画面を切り替える('登録');
  知らせる(null);
  var トークン = 取り出す('登録中のトークン');
  if (typeof トークン !== 'string' || !/^[0-9a-f]{64}$/.test(トークン)) トークン = 新しいトークン();

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
    // 送る前にしまう。しまえない画面（プライベートブラウズなど）では、番号を使う前に止める
    if (!しまう('登録中のトークン', トークン)) {
      返事.textContent = 'この画面では登録を残せません（プライベートブラウズなど）。ふつうの画面で開き直してください。';
      return;
    }
    ボタン.disabled = true;
    返事.textContent = '登録しています…';
    送り直しつきで送る({ 操作: '登録', 番号: 番号.value, 端末名: 名前.value, トークン: トークン }, function (r) {
      return typeof r.名前 === 'string' && typeof r.役割 === 'string';
    }).then(function (結果) {
      ボタン.disabled = false;
      if (!結果.届いた) {
        返事.textContent = '送れませんでした。電波のよい所で、もう一度押してください。';
        return;
      }
      if (!結果.応答.ok) {
        // 登録中のトークンが、前に登録されて止められたものだった時。新しいトークンに替えて押し直してもらう
        if (結果.応答.コード === '未登録') {
          トークン = 新しいトークン();
          しまう('登録中のトークン', null);
          返事.textContent = 'もう一度「登録する」を押してください。';
          return;
        }
        返事.textContent = 結果.応答.理由;
        return;
      }
      if (!しまう('トークン', トークン)) {
        返事.textContent = 'この画面では登録を残せません。ふつうの画面で開き直して、代表に新しい番号をもらってください。';
        return;
      }
      しまう('登録中のトークン', null);
      済んだら({ トークン: トークン, 名前: 結果.応答.名前, 役割: 結果.応答.役割 });
    });
  });

  入れ物.appendChild(用紙);
}
