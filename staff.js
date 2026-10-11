/**
 * 勤怠システム（試作）— 職員の画面（出勤・退勤）
 *
 * 押した瞬間に表示を変え、裏の確定はあとから届く。
 * 届かない間は「待ち」として端末にしまい、同じ操作IDで送り直す（裏で1回分にまとまる）。
 * 時刻は裏が決める（届いた時点）ので、長く届かなかった分は自動では送らず、本人に聞く。
 */
(function () {
  var 送り直しの間隔 = [0, 2000, 4000, 8000, 15000, 30000];   // ミリ秒。全部で約1分
  var 自動で送り直す時間 = 2 * 60000;   // 開き直した時、押してからこれ以内なら自動で送る

  var 鍵 = 取り出す('トークン');
  var 待ち = 取り出す('待ち');          // { 操作ID, 種類, 押した(ミリ秒) }
  var 記録 = [];                        // 自分の直近の記録（新しい順）
  var 送っている = false;
  var 状態の文 = '';

  要素('今日').textContent = 今日の表示();
  要素('出勤').addEventListener('click', function () { 押した('出勤'); });
  要素('退勤').addEventListener('click', function () { 押した('退勤'); });
  要素('送り直す').addEventListener('click', 送り続ける);
  要素('やめる').addEventListener('click', function () {
    待ち = null;
    しまう('待ち', null);
    状態の文 = '';
    描く();
  });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && 鍵) { 要素('今日').textContent = 今日の表示(); 描く(); }
  });

  if (鍵) 読み込む(); else 登録の画面を出す('', 登録できた);

  function 登録できた(応答) {
    鍵 = 応答.トークン;
    読み込む();
  }

  function 読み込む() {
    画面を切り替える('読み込み中');
    送る({ 操作: '自分の記録', トークン: 鍵 }, function (r) {
      return typeof r.名前 === 'string' && Array.isArray(r.記録);
    }).then(function (結果) {
      if (!結果.届いた) {
        知らせる('読み込めませんでした。電波のよい所で、もう一度ためしてください。', { 名前: 'もう一度', 押したら: 読み込む });
        return;
      }
      if (!結果.応答.ok) { 断られた(結果.応答); return; }
      要素('名前').textContent = 結果.応答.名前 + ' さん';
      要素('代表へ').hidden = 結果.応答.役割 !== '管理者';
      記録 = 結果.応答.記録;
      画面を切り替える('本体');
      描く();
      if (待ち && Date.now() - 待ち.押した < 自動で送り直す時間) 送り続ける();
    });
  }

  function 押した(種類) {
    if (待ち || !鍵) return;
    待ち = { 操作ID: 新しい操作ID(), 種類: 種類, 押した: Date.now() };
    しまう('待ち', 待ち);
    状態の文 = '';
    送り続ける();
  }

  function 送り続ける() {
    if (送っている || !待ち) return;
    送っている = true;
    描く();
    var 回 = 0;
    (function 一回() {
      setTimeout(function () {
        送る({ 操作: '打刻', トークン: 鍵, 種類: 待ち.種類, 操作ID: 待ち.操作ID }, function (r) {
          return r.記録 && typeof r.記録.記録ID === 'string' && typeof r.記録.時刻 === 'string';
        }).then(function (結果) {
          if (結果.届いた && 結果.応答.ok) { 届いた(結果.応答.記録); return; }
          // 混み合い・中の失敗は、時間をおけば通ることがある。ほかの断りは送り直しても同じ
          if (結果.届いた && ['混雑', '内部'].indexOf(結果.応答.コード) < 0) { 送っている = false; 断られた(結果.応答); return; }
          回++;
          if (回 < 送り直しの間隔.length) { 一回(); return; }
          送っている = false;
          描く();
        });
      }, 送り直しの間隔[回]);
    })();
  }

  function 届いた(r) {
    待ち = null;
    しまう('待ち', null);
    送っている = false;
    記録 = [r].concat(記録.filter(function (x) { return x.記録ID !== r.記録ID; })).slice(0, 10);
    状態の文 = r.種類 + 'を記録しました（' + 時分(r.時刻) + '）';
    描く();
  }

  function 断られた(応答) {
    if (応答.コード === '未登録') {
      鍵 = null;
      しまう('トークン', null);
      if (待ち) { 待ち = null; しまう('待ち', null); }
      登録の画面を出す(応答.理由, 登録できた);
      return;
    }
    // 回数の上限は、待てば送れるので「待ち」を残す。ほかは送り直しても同じなので消す
    if (応答.コード !== '回数' && 待ち) { 待ち = null; しまう('待ち', null); }
    描く();
    知らせる(応答.理由);
  }

  function 描く() {
    var 今日 = 今日の日付();
    var 今日の記録 = 記録.filter(function (r) { return r.時刻.slice(0, 10) === 今日; });
    var 最後 = 今日の記録[0];
    var 最後の = function (種類) {
      return 今日の記録.filter(function (r) { return r.種類 === 種類; })[0];
    };

    ['出勤', '退勤'].forEach(function (種類) {
      var b = 要素(種類), 小 = 要素(種類 + 'の時刻');
      var 済 = 最後の(種類);
      if (待ち && 待ち.種類 === 種類) {
        小.textContent = 端末の時分(待ち.押した) + (送っている ? ' 送っています…' : ' 送れていません');
      } else {
        小.textContent = 済 ? '記録 ' + 時分(済.時刻) : (種類 === '出勤' ? '押すと時刻が残る' : '—');
      }
      b.classList.toggle('pending', !!(待ち && 待ち.種類 === 種類));
      // 最後が出勤なら退勤だけ、それ以外は出勤だけを押せる。待ちがある間はどちらも押せない
      b.disabled = !!待ち || (種類 === '出勤' ? (最後 && 最後.種類 === '出勤') : !(最後 && 最後.種類 === '出勤'));
    });

    要素('状態').textContent = 状態の文;

    var 帯 = 要素('待ちの知らせ');
    帯.hidden = !(待ち && !送っている);
    if (待ち) {
      要素('待ちの文').textContent = 端末の時分(待ち.押した) + ' に押した「' + 待ち.種類 +
          '」が、まだ届いていません。電波のよい所で「もう一度送る」を押してください。';
    }

    var 一覧 = 要素('記録');
    一覧.textContent = '';
    if (待ち) {
      var 押した日 = new Date(待ち.押した);
      一覧.appendChild(作る('li', { class: 'li pending' }, [
        作る('span', { class: 'd', text: (押した日.getMonth() + 1) + '/' + 押した日.getDate() }),
        作る('span', { text: 待ち.種類 + (送っている ? '（送信中）' : '（まだ届いていない）') }),
        作る('span', { class: 't', text: 端末の時分(待ち.押した) })
      ]));
    }
    記録.forEach(function (r) {
      一覧.appendChild(作る('li', { class: 'li' }, [
        作る('span', { class: 'd', text: 月日(r.時刻) }), 作る('span', { text: r.種類 }),
        作る('span', { class: 't', text: 時分(r.時刻) })
      ]));
    });
    if (!待ち && !記録.length) 一覧.appendChild(作る('li', { class: 'li empty', text: 'まだ記録はありません' }));
  }
})();
