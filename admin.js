/**
 * 勤怠システム（試作）— 代表の画面（記録の一覧・登録番号を出す・端末を止める）
 *
 * 読み込みボタンは置かない。開いた時と、ほかのアプリから戻った時に自動で読み込む
 * （池田建設で「読込ボタン・押してから遅い」が不満になった）。
 */
(function () {
  if (埋め込まれていたら止める()) return;

  var 読み直しの間隔 = 5000;   // ミリ秒。戻るたびに読みすぎない

  var 鍵 = 取り出す('トークン');
  var 読んでいる = false;
  var 最後に読んだ = 0;
  var 選んでいた職員ID = '';

  要素('番号を出す').addEventListener('click', 番号を出す);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') 戻ってきた();
  });
  window.addEventListener('pageshow', function (e) { if (e.persisted) 戻ってきた(); });

  if (鍵) 読み込む(true); else 登録の画面を出す('', 登録できた);

  function 登録できた(応答) {
    鍵 = 応答.トークン;
    読み込む(true);
  }

  function 戻ってきた() {
    if (鍵 && Date.now() - 最後に読んだ > 読み直しの間隔) 読み込む(false);
  }

  /** 初めて = true の時だけ「読み込んでいます」を出す。2回目からは今の表示のまま裏で読み直す */
  function 読み込む(初めて) {
    if (読んでいる) return;
    読んでいる = true;
    if (初めて) 画面を切り替える('読み込み中');
    else 要素('読んだ時刻').textContent = '読み込んでいます…';
    送り直しつきで送る({ 操作: '管理の一覧', トークン: 鍵 }, 一覧の形か).then(function (結果) {
      読んでいる = false;
      if (!結果.届いた) {
        要素('読んだ時刻').textContent = '';
        知らせる('読み込めませんでした。電波のよい所で、もう一度ためしてください。', {
          名前: 'もう一度', 押したら: function () { 読み込む(初めて); }
        });
        return;
      }
      if (!結果.応答.ok) { 断られた(結果.応答); return; }
      最後に読んだ = Date.now();
      知らせる(null);
      描く(結果.応答);
      画面を切り替える('本体');
    });
  }

  function 断られた(応答) {
    if (応答.コード === '未登録') {
      鍵 = null;
      しまう('トークン', null);
      登録の画面を出す(応答.理由, 登録できた);
      return;
    }
    if (応答.コード === '権限なし') {
      画面を切り替える('');
      知らせる('この画面は代表だけが使えます。');
      要素('職員の画面へ').hidden = false;
      return;
    }
    知らせる(応答.理由);
  }

  function 描く(中身) {
    要素('名前').textContent = 中身.自分.名前;
    要素('読んだ時刻').textContent = 端末の時分(Date.now()) + ' に読み込み';

    // 登録番号を出す相手。選んでいた人は、読み直しても選んだまま
    var 選ぶ = 要素('職員を選ぶ');
    選ぶ.textContent = '';
    中身.職員.forEach(function (人) {
      var o = 作る('option', { value: 人.職員ID, text: 人.名前 + (人.役割 === '管理者' ? '（代表）' : '') });
      if (人.職員ID === 選んでいた職員ID) o.selected = true;
      選ぶ.appendChild(o);
    });

    var 表 = 要素('記録');
    表.textContent = '';
    中身.記録.forEach(function (r) {
      表.appendChild(作る('tr', {}, [
        作る('td', { class: 'mono', text: 月日(r.時刻) + ' ' + 時分(r.時刻) }),
        作る('td', { text: r.名前 }),
        作る('td', {}, [作る('span', { class: 'tag ' + (r.種類 === '出勤' ? 'in' : 'out'), text: r.種類 })])
      ]));
    });
    if (!中身.記録.length) 表.appendChild(作る('tr', {}, [作る('td', { colspan: '3', class: 'muted', text: 'まだ記録はありません' })]));

    // 端末は表にしない。スマホ幅で「止めますか？」を出しても横にはみ出さないように、1台1行で折り返す
    var 端末一覧 = 要素('端末');
    端末一覧.textContent = '';
    中身.端末.forEach(function (t) {
      var 操作 = 作る('div', { class: 'act' });
      if (t.自分) 操作.appendChild(作る('span', { class: 'muted small', text: 'この端末' }));
      else 止めるボタンを置く(操作, t);
      端末一覧.appendChild(作る('div', { class: 'device' }, [
        作る('div', {}, [
          作る('div', { class: 'who', text: t.名前 }),
          作る('div', { class: 'muted small', text: t.端末名 + '・' + 月日(t.登録日時) + ' に登録' })
        ]),
        操作
      ]));
    });
  }

  /** 止める → その場で「止めますか？」を出してから送る */
  function 止めるボタンを置く(枠, t) {
    枠.textContent = '';
    var b = 作る('button', { type: 'button', class: 'btn ghost small', text: '止める' });
    b.addEventListener('click', function () {
      枠.textContent = '';
      var はい = 作る('button', { type: 'button', class: 'btn danger small', text: '止める' });
      var いいえ = 作る('button', { type: 'button', class: 'btn ghost small', text: 'やめる' });
      いいえ.addEventListener('click', function () { 止めるボタンを置く(枠, t); });
      はい.addEventListener('click', function () { 止める(枠, t); });
      枠.appendChild(作る('span', { class: 'ask', text: '止めますか？' }));
      枠.appendChild(はい);
      枠.appendChild(いいえ);
    });
    枠.appendChild(b);
  }

  /** 一覧の中身の形を、1件ずつ確かめる（欠けた記録を描いて画面が崩れたり、別の返事を一覧と取り違えたりしない） */
  function 一覧の形か(r) {
    var 文字 = function (o, キー) { return キー.every(function (k) { return typeof o[k] === 'string'; }); };
    return !!r.自分 && typeof r.自分.名前 === 'string' &&
        Array.isArray(r.職員) && r.職員.every(function (p) { return 文字(p, ['職員ID', '名前', '役割']); }) &&
        Array.isArray(r.端末) && r.端末.every(function (t) {
          return 文字(t, ['端末ID', '職員ID', '名前', '端末名', '登録日時']) && typeof t.自分 === 'boolean';
        }) &&
        Array.isArray(r.記録) && r.記録.every(function (k) { return 文字(k, ['記録ID', '名前', '種類', '時刻']); });
  }

  function 止める(枠, t) {
    枠.textContent = '止めています…';
    送り直しつきで送る({ 操作: '失効', トークン: 鍵, 端末ID: t.端末ID }, function (r) {
      return r.端末ID === t.端末ID;
    }).then(function (結果) {
      if (!結果.届いた) {
        止めるボタンを置く(枠, t);
        知らせる('止められたか分かりませんでした。もう一度ためしてください。');
        return;
      }
      if (!結果.応答.ok) { 止めるボタンを置く(枠, t); 断られた(結果.応答); return; }
      枠.textContent = '止めました';
      読み込む(false);
    });
  }

  function 番号を出す() {
    var 職員ID = 要素('職員を選ぶ').value;
    var ボタン = 要素('番号を出す');
    var 箱 = 要素('番号の箱');
    if (!職員ID) return;
    選んでいた職員ID = 職員ID;
    ボタン.disabled = true;
    箱.hidden = false;
    要素('番号').textContent = '······';
    要素('番号の説明').textContent = '番号を出しています…';
    // 押すたびに操作IDを1つ付ける。送り直しも、遅れて届いた元の依頼も、裏は同じ番号を返す
    送り直しつきで送る({ 操作: '番号を出す', トークン: 鍵, 職員ID: 職員ID, 操作ID: 新しい操作ID() }, function (r) {
      return /^\d{6}$/.test(r.番号) && typeof r.期限 === 'string' && typeof r.名前 === 'string' && r.職員ID === 職員ID;
    }).then(function (結果) {
      ボタン.disabled = false;
      if (!結果.届いた) {
        箱.hidden = true;
        知らせる('番号を出せませんでした。もう一度押してください。');
        return;
      }
      if (!結果.応答.ok) { 箱.hidden = true; 断られた(結果.応答); return; }
      // 待っている間に別の人を選び直していたら、取り違えないよう番号は出さない（もう一度押してもらう）
      if (要素('職員を選ぶ').value !== 職員ID) { 箱.hidden = true; return; }
      要素('番号').textContent = 結果.応答.番号.slice(0, 3) + ' ' + 結果.応答.番号.slice(3);
      要素('番号の説明').textContent = 結果.応答.名前 + ' さんの番号です。' + 時分(結果.応答.期限) +
          ' まで、1回だけ使えます。新しく出すと、この番号は使えなくなります。';
    });
  }
})();
