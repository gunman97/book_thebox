(function ($) {
  'use strict';

  if (!$) return;

  var API_BASE = 'https://airpage.org/thebox/api.php';

  var section = document.querySelector('.interact-section');
  if (!section) return;

  var epId      = section.getAttribute('data-ep');
  var likeBtn   = document.getElementById('likeBtn');
  var likeCount = likeBtn ? likeBtn.querySelector('.like-count') : null;
  var likeHeart = likeBtn ? likeBtn.querySelector('.like-heart') : null;
  var cmtForm   = document.getElementById('commentForm');
  var cmtList   = document.getElementById('commentList');
  var cmtTotal  = document.getElementById('commentTotal');

  var LIKE_KEY      = 'thebox_liked_ep' + epId;
  var PAGE_SIZE     = 10;
  var currentOffset = 0;
  var totalComments = 0;
  var hasLoaded     = false;
  var cmtMoreBtn    = null;

  /* ── AJAX helper ─────────────────────────────────────────────── */
  function apiCall(url, options) {
    var opts = options || {};
    var settings = {
      url: url,
      type: opts.method || 'GET',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      dataType: 'json'
    };
    if (opts.body) {
      settings.contentType = 'application/json; charset=utf-8';
      settings.data = opts.body;
    }
    return $.ajax(settings);
  }

  /* ── Likes ───────────────────────────────────────────────────── */
  function setLikeUI(count, liked) {
    if (likeCount) likeCount.textContent = count;
    if (likeHeart) likeHeart.textContent = liked ? '♥' : '♡';
    if (likeBtn) {
      if (liked) likeBtn.classList.add('liked');
      else likeBtn.classList.remove('liked');
    }
  }

  function loadLikes() {
    apiCall(API_BASE + '?action=get_likes&ep=' + epId)
      .done(function (d) {
        var liked = d.liked;
        localStorage.setItem(LIKE_KEY, liked ? '1' : '0');
        setLikeUI(d.count || 0, liked);
      })
      .fail(function () {
        if (likeCount) likeCount.textContent = '?';
      });
  }

  if (likeBtn) {
    likeBtn.addEventListener('click', function () {
      var wasLiked = likeBtn.classList.contains('liked');
      var prev = parseInt(likeCount.textContent) || 0;
      var next = wasLiked ? Math.max(0, prev - 1) : prev + 1;
      setLikeUI(next, !wasLiked);

      apiCall(API_BASE + '?action=toggle_like', {
        method: 'POST',
        body: JSON.stringify({ ep: epId })
      })
        .done(function (d) {
          localStorage.setItem(LIKE_KEY, d.liked ? '1' : '0');
          setLikeUI(d.count || 0, d.liked);
        })
        .fail(function () {
          setLikeUI(prev, wasLiked);
        });
    });
  }

  /* ── Comments ────────────────────────────────────────────────── */
  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtDate(s) {
    var d = new Date((s || '').replace(' ', 'T'));
    if (isNaN(d.getTime())) return s;
    var p = function (n) { return ('0' + n).slice(-2); };
    return d.getFullYear() + '.' + p(d.getMonth() + 1) + '.' + p(d.getDate())
      + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* Event delegation — edit/delete buttons */
  if (cmtList) {
    cmtList.addEventListener('click', function (e) {
      var btn = e.target;
      if (!btn || !btn.classList) return;

      var item = btn;
      while (item && !item.classList.contains('cmt-item')) {
        item = item.parentNode;
      }
      if (!item) return;

      var id = item.getAttribute('data-id');

      if (btn.classList.contains('cmt-btn-edit')) {
        var contentEl = item.querySelector('.cmt-content');
        var text = contentEl ? (contentEl.innerText || contentEl.textContent) : '';
        showModal('댓글 수정', [
          { key: 'content', label: '내용', tag: 'textarea', value: text, rows: 5 },
          { key: 'password', label: '비밀번호', tag: 'input', type: 'password' }
        ], function (vals, close) {
          if (!vals.content.trim() || !vals.password) { alert('내용과 비밀번호를 입력해주세요.'); return; }
          apiCall(API_BASE + '?action=edit_comment', {
            method: 'POST',
            body: JSON.stringify({ id: id, content: vals.content.trim(), password: vals.password })
          })
            .done(function (d) {
              if (d.error) { alert(d.error); return; }
              close(); loadComments(true);
            })
            .fail(function () { alert('수정에 실패했습니다.'); });
        });

      } else if (btn.classList.contains('cmt-btn-delete')) {
        showModal('댓글 삭제', [
          { key: 'password', label: '비밀번호를 입력하면 댓글이 삭제됩니다', tag: 'input', type: 'password' }
        ], function (vals, close) {
          if (!vals.password) { alert('비밀번호를 입력해주세요.'); return; }
          apiCall(API_BASE + '?action=delete_comment', {
            method: 'POST',
            body: JSON.stringify({ id: id, password: vals.password })
          })
            .done(function (d) {
              if (d.error) { alert(d.error); return; }
              close(); loadComments(true);
            })
            .fail(function () { alert('삭제에 실패했습니다.'); });
        });
      }
    });
  }

  function updateMoreBtn() {
    if (cmtMoreBtn && cmtMoreBtn.parentNode) {
      cmtMoreBtn.parentNode.removeChild(cmtMoreBtn);
      cmtMoreBtn = null;
    }
    if (currentOffset < totalComments) {
      var remaining = totalComments - currentOffset;
      cmtMoreBtn = document.createElement('button');
      cmtMoreBtn.className = 'cmt-more-btn';
      cmtMoreBtn.type = 'button';
      cmtMoreBtn.textContent = '더 보기 (' + remaining + '개)';
      cmtMoreBtn.addEventListener('click', function () { loadComments(false); });
      cmtList.parentNode.insertBefore(cmtMoreBtn, cmtList.nextSibling);
    }
  }

  function renderComments(list, append) {
    if (!cmtList) return;

    if (!append) {
      cmtList.innerHTML = '';
    }

    if (!list || list.length === 0) {
      if (!append && cmtList.children.length === 0) {
        cmtList.innerHTML = '<p class="cmt-empty">아직 댓글이 없습니다. 첫 번째 댓글을 남겨보세요.</p>';
      }
      updateMoreBtn();
      return;
    }

    var empty = cmtList.querySelector('.cmt-empty');
    if (empty) cmtList.removeChild(empty);

    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      var edited = c.updated_at ? ' <span class="cmt-edited">(수정됨)</span>' : '';
      var div = document.createElement('div');
      div.className = 'cmt-item';
      div.setAttribute('data-id', String(c.id));
      div.innerHTML = '<div class="cmt-header">'
        + '<span class="cmt-nick">' + esc(c.nickname) + '</span>'
        + '<span class="cmt-date">' + fmtDate(c.created_at) + edited + '</span>'
        + '<div class="cmt-actions">'
        + '<button class="cmt-btn cmt-btn-edit" type="button">수정</button>'
        + '<button class="cmt-btn cmt-btn-delete" type="button">삭제</button>'
        + '</div></div>'
        + '<div class="cmt-content">' + esc(c.content).replace(/\n/g, '<br>') + '</div>';
      cmtList.appendChild(div);
    }

    updateMoreBtn();
  }

  function loadComments(reset) {
    if (reset) {
      currentOffset = 0;
      totalComments = 0;
      hasLoaded = false;
      if (cmtMoreBtn && cmtMoreBtn.parentNode) {
        cmtMoreBtn.parentNode.removeChild(cmtMoreBtn);
        cmtMoreBtn = null;
      }
    }

    apiCall(API_BASE + '?action=get_comments&ep=' + epId + '&offset=' + currentOffset)
      .done(function (d) {
        var list = d.comments || [];
        totalComments = d.total || 0;
        currentOffset += list.length;

        if (cmtTotal) {
          cmtTotal.textContent = totalComments > 0 ? totalComments + '개' : '';
        }

        renderComments(list, hasLoaded);
        hasLoaded = true;
      })
      .fail(function () {
        if (cmtList) cmtList.innerHTML = '<p class="cmt-error">댓글을 불러오지 못했습니다.</p>';
      });
  }

  if (cmtForm) {
    cmtForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var nick    = document.getElementById('cmtNick').value.trim();
      var pw      = document.getElementById('cmtPw').value;
      var content = document.getElementById('cmtContent').value.trim();
      if (!nick || !pw || !content) { alert('닉네임, 비밀번호, 내용을 모두 입력해주세요.'); return; }

      var btn = cmtForm.querySelector('.comment-submit');
      btn.disabled = true;
      btn.textContent = '등록 중…';

      apiCall(API_BASE + '?action=add_comment', {
        method: 'POST',
        body: JSON.stringify({ ep: epId, nickname: nick, password: pw, content: content })
      })
        .done(function (d) {
          if (d.error) { alert(d.error); return; }
          document.getElementById('cmtNick').value = '';
          document.getElementById('cmtPw').value = '';
          document.getElementById('cmtContent').value = '';
          loadComments(true);
        })
        .fail(function () { alert('댓글 등록에 실패했습니다. 다시 시도해주세요.'); })
        .always(function () { btn.disabled = false; btn.textContent = '등록'; });
    });
  }

  /* ── Modal helper ────────────────────────────────────────────── */
  function showModal(title, fields, onConfirm) {
    var overlay = document.createElement('div');
    overlay.className = 'cmt-modal-overlay';

    var modal = document.createElement('div');
    modal.className = 'cmt-modal';

    var h = document.createElement('div');
    h.className = 'cmt-modal-title';
    h.textContent = title;
    modal.appendChild(h);

    var inputs = {};
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      var label = document.createElement('label');
      label.className = 'cmt-modal-label';
      label.textContent = f.label;
      modal.appendChild(label);

      var el = document.createElement(f.tag);
      el.className = 'cmt-modal-input';
      if (f.tag === 'input') el.type = f.type || 'text';
      if (f.rows) el.rows = f.rows;
      if (f.value != null) el.value = f.value;
      modal.appendChild(el);
      inputs[f.key] = el;
    }

    var btnRow = document.createElement('div');
    btnRow.className = 'cmt-modal-btns';

    var close = function () { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); };

    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'cmt-modal-btn cmt-modal-cancel';
    cancelBtn.textContent = '취소';
    cancelBtn.type = 'button';
    cancelBtn.addEventListener('click', close);

    var confirmBtn = document.createElement('button');
    confirmBtn.className = 'cmt-modal-btn cmt-modal-confirm';
    confirmBtn.textContent = '확인';
    confirmBtn.type = 'button';
    confirmBtn.addEventListener('click', function () {
      var vals = {};
      for (var k in inputs) vals[k] = inputs[k].value;
      onConfirm(vals, close);
    });

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(confirmBtn);
    modal.appendChild(btnRow);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    var first = modal.querySelector('input, textarea');
    if (first) first.focus();
  }

  /* ── Init ────────────────────────────────────────────────────── */
  loadLikes();
  loadComments(true);
}(window.jQuery));
