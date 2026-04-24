(function(global) {
  const stateByRoot = new WeakMap();
  const EMPTY_TEXT = '最近のポストはありません';
  const STYLE_TAG_ID = 'recent-tweets-style';
  const IMAGE_MODAL_ID = 'recent-tweets-image-modal';

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatPostedAt(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('ja-JP', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function stripTcoUrls(text) {
    return String(text || '')
      .replace(/https:\/\/t\.co\/[\w.-]+/g, '')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  function isSmartPhone() {
    const ua = navigator.userAgent || '';
    const mobileLike = /iPhone|iPod|Android.*Mobile|Windows Phone|webOS|BlackBerry|Opera Mini/i.test(ua);
    const iPadOSLike = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
    return mobileLike || iPadOSLike;
  }

  function buildPostLink(post) {
    if (post.source_post_id) {
      if (isSmartPhone()) return `twitter://status?id=${encodeURIComponent(post.source_post_id)}`;
      return `https://x.com/i/web/status/${encodeURIComponent(post.source_post_id)}`;
    }
    return post.source_post_url || '';
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_TAG_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_TAG_ID;
    style.textContent = `
      .recent-tweets-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .recent-tweets-card {
        border-radius: 8px;
        border: 1px solid #3a3a5c;
        background: #1e1e38;
        padding: 12px 14px;
      }
      .recent-tweets-card-link {
        display: block;
        color: inherit;
        text-decoration: none;
      }
      .recent-tweets-card-link:hover {
        border-color: #59598a;
      }
      .recent-tweets-body-link {
        display: block;
        color: inherit;
        text-decoration: none;
      }
      .recent-tweets-body-link:hover {
        opacity: 0.95;
      }
      .recent-tweets-card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 8px;
      }
      .recent-tweets-user {
        font-size: 0.82rem;
        color: #b9b9d4;
        font-weight: 700;
      }
      .recent-tweets-time {
        font-size: 0.78rem;
        color: #9a9ab4;
        white-space: nowrap;
      }
      .recent-tweets-text {
        color: #f1f1ff;
        font-size: 0.9rem;
        line-height: 1.5;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .recent-tweets-images {
        margin-top: 10px;
        display: flex;
        flex-direction: row;
        overflow-x: auto;
        gap: 8px;
        padding-bottom: 2px;
      }
      .recent-tweets-image {
        width: auto;
        height: auto;
        max-width: 220px;
        max-height: 220px;
        flex: 0 0 auto;
        object-fit: contain;
        border-radius: 6px;
        display: block;
        background: #15152a;
        cursor: zoom-in;
      }
      .recent-tweets-image-modal {
        position: fixed;
        inset: 0;
        z-index: 20000;
        display: none;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.86);
        padding: 16px;
      }
      .recent-tweets-image-modal.open {
        display: flex;
      }
      .recent-tweets-image-modal img {
        max-width: min(96vw, 1600px);
        max-height: 92vh;
        width: auto;
        height: auto;
        object-fit: contain;
        border-radius: 8px;
        box-shadow: 0 14px 28px rgba(0, 0, 0, 0.45);
      }
      .recent-tweets-image-modal-close {
        position: absolute;
        top: 10px;
        right: 14px;
        background: transparent;
        border: none;
        color: #fff;
        font-size: 28px;
        line-height: 1;
        cursor: pointer;
      }
      @media (max-width: 640px) {
        .recent-tweets-card-header {
          flex-wrap: wrap;
          row-gap: 4px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function postCard(post) {
    const displayText = stripTcoUrls(post.raw_text || '');
    const username = post.source_username ? '@' + escapeHtml(post.source_username) : '';
    const postedAt = formatPostedAt(post.source_posted_at);
    const header = username || postedAt ? `
      <div class="recent-tweets-card-header">
        <span class="recent-tweets-user">${username}</span>
        <span class="recent-tweets-time">${escapeHtml(postedAt)}</span>
      </div>
    ` : '';
    const postLink = buildPostLink(post);
    const imageUrls = Array.isArray(post.image_urls) ? post.image_urls.filter(Boolean) : [];
    const images = imageUrls.length > 0
      ? `<div class="recent-tweets-images">${imageUrls.map((url) => `<img class="recent-tweets-image" src="${escapeHtml(url)}" alt="" loading="lazy">`).join('')}</div>`
      : '';
    const textContent = `
      ${header}
      <div class="recent-tweets-text">${escapeHtml(displayText)}</div>
    `;

    const content = `
      ${textContent}
      ${images}
    `;

    const body = postLink
      ? `<a class="recent-tweets-body-link" href="${escapeHtml(postLink)}" target="_blank" rel="noopener noreferrer">${textContent}</a>${images}`
      : content;

    return `<article class="recent-tweets-card">${body}</article>`;
  }

  function ensureImageModal() {
    let modal = document.getElementById(IMAGE_MODAL_ID);
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = IMAGE_MODAL_ID;
    modal.className = 'recent-tweets-image-modal';
    modal.innerHTML = `
      <button type="button" class="recent-tweets-image-modal-close" aria-label="閉じる">&times;</button>
      <img src="" alt="">
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', (event) => {
      if (event.target === modal || event.target.classList.contains('recent-tweets-image-modal-close')) {
        closeImageModal();
      }
    });

    return modal;
  }

  function openImageModal(url) {
    if (!url) return;
    const modal = ensureImageModal();
    const image = modal.querySelector('img');
    if (!image) return;
    image.src = url;
    modal.classList.add('open');
    document.body.classList.add('modal-open');
  }

  function closeImageModal() {
    const modal = document.getElementById(IMAGE_MODAL_ID);
    if (!modal) return;
    const image = modal.querySelector('img');
    if (image) image.src = '';
    modal.classList.remove('open');
    document.body.classList.remove('modal-open');
  }

  function render(target, options) {
    if (!target) return;
    const posts = options && Array.isArray(options.posts) ? options.posts : [];
    const loading = Boolean(options && options.loading);
    const emptyText = (options && options.emptyText) || '最近のポストはありません';

    if (loading) {
      target.innerHTML = '<div class="loading">読み込み中</div>';
      return;
    }

    if (posts.length === 0) {
      target.innerHTML = `<div class="no-data">${escapeHtml(emptyText)}</div>`;
      return;
    }

    target.innerHTML = `<div class="recent-tweets-list">${posts.map(postCard).join('')}</div>`;
  }

  async function fetchRecentPosts(staffId, limit) {
    const size = Number(limit) > 0 ? Number(limit) : 3;
    const response = await API.request('GET', `/v1/staffs/${staffId}/recent_posts?limit=${size}`);
    return response && Array.isArray(response.recent_posts) ? response.recent_posts : [];
  }

  function parseLimit(root) {
    const value = Number(root.dataset.limit);
    if (!Number.isFinite(value) || value <= 0) return 3;
    return Math.floor(value);
  }

  function getState(root) {
    return stateByRoot.get(root) || { staffId: null, limit: 3, requestId: 0 };
  }

  function setState(root, state) {
    stateByRoot.set(root, state);
  }

  async function updateRoot(root) {
    if (!root || !root.isConnected) return;
    const staffId = root.dataset.staffId;
    const limit = parseLimit(root);

    if (!staffId) {
      render(root, { posts: [], loading: false, emptyText: EMPTY_TEXT });
      setState(root, { staffId: null, limit: limit, requestId: 0 });
      return;
    }

    const prev = getState(root);
    if (prev.staffId === String(staffId) && prev.limit === limit) return;

    const nextRequestId = prev.requestId + 1;
    setState(root, { staffId: String(staffId), limit: limit, requestId: nextRequestId });
    render(root, { posts: [], loading: true, emptyText: EMPTY_TEXT });

    try {
      const posts = await fetchRecentPosts(staffId, limit);
      const current = getState(root);
      if (current.requestId !== nextRequestId) return;
      render(root, { posts: posts, loading: false, emptyText: EMPTY_TEXT });
    } catch (e) {
      const current = getState(root);
      if (current.requestId !== nextRequestId) return;
      render(root, { posts: [], loading: false, emptyText: EMPTY_TEXT });
    }
  }

  function scanRoots() {
    const roots = document.querySelectorAll('.recent-tweets-root');
    for (const root of roots) {
      updateRoot(root);
    }
  }

  function init() {
    ensureStyles();
    ensureImageModal();
    scanRoots();
    const observer = new MutationObserver((mutations) => {
      let shouldRescan = false;
      for (const mutation of mutations) {
        if (mutation.type === 'attributes') {
          if (mutation.target instanceof Element && mutation.target.classList.contains('recent-tweets-root')) {
            updateRoot(mutation.target);
          }
          continue;
        }
        shouldRescan = true;
      }
      if (shouldRescan) scanRoots();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [ 'data-staff-id', 'data-limit' ]
    });

    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.classList.contains('recent-tweets-image')) return;
      const src = target.getAttribute('src');
      openImageModal(src);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeImageModal();
    });
  }

  global.RecentTweetsRenderer = {
    render: render,
    fetchRecentPosts: fetchRecentPosts
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})(window);
