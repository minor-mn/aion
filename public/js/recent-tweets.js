(function(global) {
  const stateByRoot = new WeakMap();
  const EMPTY_TEXT = '最近のポストはありません';
  const STYLE_TAG_ID = 'recent-tweets-style';

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
        display: grid;
        gap: 8px;
      }
      .recent-tweets-image {
        width: 100%;
        max-width: 100%;
        max-height: 300px;
        object-fit: contain;
        border-radius: 6px;
        display: block;
        background: #15152a;
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
    const content = `
      ${header}
      <div class="recent-tweets-text">${escapeHtml(post.raw_text || '')}</div>
      ${images}
    `;

    if (postLink) {
      return `
        <a class="recent-tweets-card recent-tweets-card-link" href="${escapeHtml(postLink)}" target="_blank" rel="noopener noreferrer">
          ${content}
        </a>
      `;
    }

    return `<article class="recent-tweets-card">${content}</article>`;
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
