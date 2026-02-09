// Content Manager - TikTok Style

class ContentManagerApp {
  constructor() {
    this.currentContentId = null;
    this.currentContent = null;
    this.posts = [];
    this.viewerIndex = 0;
    this.isOwner = false;
    this.isEditor = false;
    this.notifInterval = null;
    this.searchDebounce = null;
    this.init();
  }

  async init() {
    try {
      await this.checkAuth();
      this.bindEvents();
      await this.loadContents();
      this.startNotifPolling();
    } catch (error) {
      console.error('[CM] Init error:', error);
    }
  }

  async checkAuth() {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (!res.ok) { window.location.href = '/login'; return; }
    this.username = data.username;
    this.isAdmin = data.isAdmin;
    document.getElementById('userName').textContent = data.username;
    if (data.isAdmin) {
      document.getElementById('navAdminPanel').style.display = 'flex';
      document.getElementById('navAdminContent').style.display = 'flex';
    }
  }

  bindEvents() {
    // Sidebar toggle
    document.getElementById('menuToggle').addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('open');
      document.getElementById('sidebarOverlay').classList.toggle('active');
    });
    document.getElementById('sidebarOverlay').addEventListener('click', () => {
      document.getElementById('sidebar').classList.remove('open');
      document.getElementById('sidebarOverlay').classList.remove('active');
    });

    // New content
    document.getElementById('btnNewContent').addEventListener('click', () => this.openModal('createContentModal'));
    document.getElementById('btnWelcomeCreate').addEventListener('click', () => this.openModal('createContentModal'));
    document.getElementById('btnCreateContent').addEventListener('click', () => this.createContent());

    // Upload post
    document.getElementById('btnUploadPost').addEventListener('click', () => this.openUploadModal());
    document.getElementById('btnDoUpload').addEventListener('click', () => this.uploadPost());

    // Upload zones
    this.setupDropzone('videoDropzone', 'videoInput', 'videoDropContent');
    this.setupDropzone('thumbDropzone', 'thumbInput', 'thumbDropContent');

    // Text mode toggle
    document.getElementById('modeStructured').addEventListener('click', () => this.setTextMode('structured'));
    document.getElementById('modeRaw').addEventListener('click', () => this.setTextMode('raw'));

    // Content settings
    document.getElementById('btnContentSettings').addEventListener('click', () => this.openContentSettings());
    document.getElementById('btnSaveContentSettings').addEventListener('click', () => this.saveContentSettings());
    document.getElementById('btnDeleteContent').addEventListener('click', () => this.deleteContent());
    document.getElementById('btnInviteCollab').addEventListener('click', () => this.inviteCollab());

    // Filter
    document.getElementById('filterStatus').addEventListener('change', () => this.loadPosts());

    // Viewer
    document.getElementById('btnViewerClose').addEventListener('click', () => this.closeModal('viewerModal'));
    document.getElementById('btnViewerPrev').addEventListener('click', () => this.viewerNav(-1));
    document.getElementById('btnViewerNext').addEventListener('click', () => this.viewerNav(1));
    document.getElementById('btnDeletePost').addEventListener('click', () => this.deletePost());

    // Copy buttons
    document.getElementById('btnCopyHook').addEventListener('click', () => this.copyField('hook'));
    document.getElementById('btnCopyCaption').addEventListener('click', () => this.copyField('caption'));
    document.getElementById('btnCopyTags').addEventListener('click', () => this.copyField('hashtags'));
    document.getElementById('btnCopyAll').addEventListener('click', () => this.copyAll());

    // Status buttons
    document.querySelectorAll('.cm-status-btn').forEach(btn => {
      btn.addEventListener('click', () => this.changePostStatus(btn.dataset.status));
    });

    // Copyable text
    document.querySelectorAll('.cm-copyable').forEach(el => {
      el.addEventListener('click', () => this.copyToClipboard(el.textContent));
    });

    // Explore
    document.getElementById('navExplore').addEventListener('click', (e) => { e.preventDefault(); this.openExplore(); });
    document.getElementById('searchUsers').addEventListener('input', (e) => {
      clearTimeout(this.searchDebounce);
      this.searchDebounce = setTimeout(() => this.searchUsers(e.target.value), 300);
    });

    // Following
    document.getElementById('navFollowing').addEventListener('click', (e) => { e.preventDefault(); this.openExplore(); });

    // Notifications
    document.getElementById('btnNotifications').addEventListener('click', () => this.openNotifications());
    document.getElementById('btnMarkAllRead').addEventListener('click', () => this.markAllRead());

    // Logout
    document.getElementById('btnLogout').addEventListener('click', async () => {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/login';
    });

    // Close modals
    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => this.closeModal(btn.dataset.close));
    });
    document.querySelectorAll('.cm-modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.remove('active');
      });
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeAllModals();
      if (!document.getElementById('viewerModal').classList.contains('active')) return;

      switch(e.key) {
        case 'ArrowLeft': this.viewerNav(-1); break;
        case 'ArrowRight': this.viewerNav(1); break;
        case 'd': case 'D': this.changePostStatus('draft'); break;
        case 'h': case 'H': this.copyField('hook'); break;
        case 'c': case 'C': this.copyField('caption'); break;
        case 't': case 'T': this.copyField('hashtags'); break;
        case 'a': case 'A': this.copyAll(); break;
        case 'p': case 'P': this.changePostStatus('posted'); break;
      }
    });

    // Swipe in viewer
    this.setupViewerSwipe();
  }

  setupDropzone(zoneId, inputId, contentId) {
    const zone = document.getElementById(zoneId);
    const input = document.getElementById(inputId);
    const content = document.getElementById(contentId);

    zone.addEventListener('click', () => input.click());
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('active'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('active'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('active');
      if (e.dataTransfer.files[0]) {
        input.files = e.dataTransfer.files;
        this.updateDropzonePreview(zone, content, e.dataTransfer.files[0]);
      }
    });
    input.addEventListener('change', () => {
      if (input.files[0]) this.updateDropzonePreview(zone, content, input.files[0]);
    });
  }

  updateDropzonePreview(zone, content, file) {
    zone.classList.add('has-file');
    const isVideo = file.type.startsWith('video/');
    content.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--success-color)" stroke-width="2">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      <span style="font-size:12px;">${this.escapeHtml(file.name)}</span>
      <small>${this.formatSize(file.size)}</small>
    `;
  }

  setTextMode(mode) {
    document.getElementById('modeStructured').classList.toggle('active', mode === 'structured');
    document.getElementById('modeRaw').classList.toggle('active', mode === 'raw');
    document.getElementById('structuredFields').style.display = mode === 'structured' ? '' : 'none';
    document.getElementById('rawFields').style.display = mode === 'raw' ? '' : 'none';
  }

  setupViewerSwipe() {
    const viewer = document.querySelector('.cm-viewer');
    if (!viewer) return;
    let startX = 0;
    viewer.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
    viewer.addEventListener('touchend', (e) => {
      const diff = e.changedTouches[0].clientX - startX;
      if (Math.abs(diff) > 60) this.viewerNav(diff > 0 ? -1 : 1);
    }, { passive: true });
  }

  // === Data ===

  async loadContents() {
    try {
      const res = await fetch('/api/content');
      const data = await res.json();
      if (!data.success) return;

      const myList = document.getElementById('myContentList');
      const collabList = document.getElementById('collabContentList');
      const userId = (await fetch('/api/auth/me').then(r => r.json())).username;

      let myContents = [];
      let collabContents = [];

      data.contents.forEach(c => {
        if (c.owner?.username === this.username) {
          myContents.push(c);
        } else {
          collabContents.push(c);
        }
      });

      document.getElementById('myContentCount').textContent = myContents.length;
      document.getElementById('collabContentCount').textContent = collabContents.length;

      myList.innerHTML = myContents.map(c => this.renderContentItem(c)).join('') || '<div style="padding:8px 12px;font-size:12px;color:var(--text-secondary)">No content yet</div>';
      collabList.innerHTML = collabContents.map(c => this.renderContentItem(c)).join('') || '<div style="padding:8px 12px;font-size:12px;color:var(--text-secondary)">No collaborations</div>';

      // Bind content items
      document.querySelectorAll('.cm-content-item').forEach(item => {
        item.addEventListener('click', () => this.selectContent(item.dataset.id));
      });

      // Load categories for datalist
      const catRes = await fetch('/api/content-categories');
      const catData = await catRes.json();
      if (catData.success) {
        const datalist = document.getElementById('categoryList');
        datalist.innerHTML = catData.categories.map(c => `<option value="${this.escapeHtml(c)}">`).join('');
      }
    } catch (error) {
      console.error('[CM] Load contents error:', error);
    }
  }

  renderContentItem(content) {
    const initial = content.content_name.charAt(0).toUpperCase();
    const isActive = this.currentContentId === content._id;
    return `
      <div class="cm-content-item ${isActive ? 'active' : ''}" data-id="${content._id}">
        <div class="cm-content-icon">${initial}</div>
        <div class="cm-content-item-name">${this.escapeHtml(content.content_name)}</div>
        <span class="cm-content-item-count">${content.post_count || 0}</span>
      </div>
    `;
  }

  async selectContent(contentId) {
    this.currentContentId = contentId;

    // Mark active
    document.querySelectorAll('.cm-content-item').forEach(item => {
      item.classList.toggle('active', item.dataset.id === contentId);
    });

    // Load content details
    const res = await fetch(`/api/content/${contentId}`);
    const data = await res.json();
    if (!data.success) { this.showToast(data.error || 'Error', 'error'); return; }

    this.currentContent = data.content;
    this.isOwner = data.isOwner;
    this.isEditor = data.isOwner || data.isCollab;

    // Update header
    document.getElementById('headerTitle').textContent = data.content.content_name;
    document.getElementById('btnUploadPost').style.display = this.isEditor ? 'inline-flex' : 'none';
    document.getElementById('btnContentSettings').style.display = data.isOwner ? 'inline-flex' : 'none';

    // Hide welcome, show grid
    document.getElementById('welcomeState').style.display = 'none';
    document.getElementById('postGrid').style.display = '';

    // Close sidebar on mobile
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('active');

    await this.loadPosts();
  }

  async loadPosts() {
    if (!this.currentContentId) return;

    const grid = document.getElementById('postGrid');
    const empty = document.getElementById('emptyState');

    // Show skeleton
    grid.innerHTML = Array(6).fill('<div class="cm-skeleton cm-skeleton-card"></div>').join('');
    empty.style.display = 'none';

    const status = document.getElementById('filterStatus').value;
    let url = `/api/video-posts?content_id=${this.currentContentId}`;
    if (status) url += `&status=${status}`;

    try {
      const res = await fetch(url);
      const data = await res.json();
      if (!data.success) return;

      this.posts = data.posts;
      this.isOwner = data.access?.isOwner || false;
      this.isEditor = data.access?.isEditor || this.isOwner;

      if (this.posts.length === 0) {
        grid.innerHTML = '';
        empty.style.display = '';
        return;
      }

      empty.style.display = 'none';
      grid.innerHTML = this.posts.map((post, i) => this.renderPostCard(post, i)).join('');

      // Bind card clicks
      grid.querySelectorAll('.cm-post-card').forEach(card => {
        card.addEventListener('click', () => this.openViewer(parseInt(card.dataset.index)));

        // Hover preview
        let hoverVideo = null;
        card.addEventListener('mouseenter', () => {
          if (!post) return;
          const idx = parseInt(card.dataset.index);
          const p = this.posts[idx];
          if (!p || !p.video || !p.video.s3Key) return;

          // Delay to avoid excessive loading
          card._hoverTimer = setTimeout(async () => {
            try {
              const res = await fetch(`/api/video-posts/${p._id}/video`);
              const data = await res.json();
              if (data.url) {
                hoverVideo = document.createElement('video');
                hoverVideo.className = 'cm-hover-preview';
                hoverVideo.src = data.url;
                hoverVideo.muted = true;
                hoverVideo.loop = true;
                hoverVideo.playsInline = true;
                card.querySelector('.cm-post-card-inner').appendChild(hoverVideo);
                hoverVideo.play().catch(() => {});
              }
            } catch(e) {}
          }, 500);
        });
        card.addEventListener('mouseleave', () => {
          clearTimeout(card._hoverTimer);
          if (hoverVideo) {
            hoverVideo.pause();
            hoverVideo.remove();
            hoverVideo = null;
          }
        });
      });
    } catch (error) {
      console.error('[CM] Load posts error:', error);
      grid.innerHTML = '';
    }
  }

  renderPostCard(post, index) {
    const statusClass = `cm-status-${post.status}`;
    const hookText = post.text_content?.hook || post.text_content?.caption || '';
    const hasThumb = post.thumbnail && post.thumbnail.s3Key;

    return `
      <div class="cm-post-card" data-index="${index}" data-id="${post._id}">
        <div class="cm-post-card-inner">
          <div class="cm-post-card-thumb">
            ${hasThumb
              ? `<img src="/api/video-posts/${post._id}/thumbnail" alt="Post ${post.post_number}" loading="lazy">`
              : `<div class="cm-post-no-thumb">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                </div>`
            }
          </div>
          <div class="cm-post-card-status ${statusClass}">${post.status}</div>
          <div class="cm-post-card-number">#${post.post_number}</div>
          ${hookText ? `<div class="cm-post-card-footer"><div class="cm-post-card-hook">${this.escapeHtml(hookText)}</div></div>` : ''}
        </div>
      </div>
    `;
  }

  // === Viewer ===

  async openViewer(index) {
    this.viewerIndex = index;
    const post = this.posts[index];
    if (!post) return;

    this.openModal('viewerModal');
    this.updateViewer(post);

    // Load video URL
    if (post.video && post.video.s3Key) {
      document.getElementById('viewerVideo').style.display = '';
      document.getElementById('viewerVideoPlaceholder').style.display = 'none';
      try {
        const res = await fetch(`/api/video-posts/${post._id}/video`);
        const data = await res.json();
        if (data.url) {
          const video = document.getElementById('viewerVideo');
          video.src = data.url;
          video.play().catch(() => {});
        }
      } catch(e) {}
    } else {
      document.getElementById('viewerVideo').style.display = 'none';
      document.getElementById('viewerVideoPlaceholder').style.display = '';
    }
  }

  updateViewer(post) {
    // Thumbnail
    const hasThumb = post.thumbnail && post.thumbnail.s3Key;
    document.getElementById('viewerThumbImg').style.display = hasThumb ? '' : 'none';
    document.getElementById('viewerThumbPlaceholder').style.display = hasThumb ? 'none' : '';
    if (hasThumb) {
      document.getElementById('viewerThumbImg').src = `/api/video-posts/${post._id}/thumbnail`;
    }

    // Meta
    document.getElementById('viewerPostNum').textContent = `#${post.post_number}`;
    const statusEl = document.getElementById('viewerStatus');
    statusEl.textContent = post.status;
    statusEl.className = `cm-viewer-status cm-status-${post.status}`;
    document.getElementById('viewerUploader').textContent = `by ${post.uploaded_by?.username || 'unknown'}`;
    document.getElementById('viewerDate').textContent = new Date(post.createdAt).toLocaleDateString();
    document.getElementById('viewerNotes').textContent = post.notes || 'No notes';

    // Text
    const tc = post.text_content || {};
    document.getElementById('viewerHook').textContent = tc.hook || '-';
    document.getElementById('viewerCaption').textContent = tc.caption || '-';
    document.getElementById('viewerHashtags').textContent = tc.hashtags || '-';

    if (tc.mode === 'raw' && tc.raw_text) {
      document.getElementById('viewerRawBlock').style.display = '';
      document.getElementById('viewerRawText').textContent = tc.raw_text;
    } else {
      document.getElementById('viewerRawBlock').style.display = 'none';
    }

    // Status buttons
    document.querySelectorAll('.cm-status-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.status === post.status);
    });

    // Counter
    document.getElementById('viewerCounter').textContent = `${this.viewerIndex + 1}/${this.posts.length}`;

    // Show/hide edit actions based on permission
    const canEdit = this.isOwner || this.isEditor;
    document.getElementById('btnDeletePost').style.display = canEdit ? '' : 'none';
    document.querySelectorAll('.cm-status-btn').forEach(btn => {
      btn.style.display = canEdit ? '' : 'none';
    });
  }

  viewerNav(dir) {
    const newIndex = this.viewerIndex + dir;
    if (newIndex < 0 || newIndex >= this.posts.length) return;
    this.viewerIndex = newIndex;

    // Pause current video
    const video = document.getElementById('viewerVideo');
    video.pause();
    video.src = '';

    this.updateViewer(this.posts[newIndex]);

    // Load new video
    const post = this.posts[newIndex];
    if (post.video && post.video.s3Key) {
      video.style.display = '';
      document.getElementById('viewerVideoPlaceholder').style.display = 'none';
      fetch(`/api/video-posts/${post._id}/video`)
        .then(r => r.json())
        .then(data => {
          if (data.url) { video.src = data.url; video.play().catch(() => {}); }
        }).catch(() => {});
    } else {
      video.style.display = 'none';
      document.getElementById('viewerVideoPlaceholder').style.display = '';
    }
  }

  // === Actions ===

  async createContent() {
    const name = document.getElementById('inputContentName').value.trim();
    if (!name) { this.showToast('Content name is required', 'error'); return; }

    const tags = document.getElementById('inputTags').value.split(',').map(t => t.trim()).filter(Boolean);
    const links = document.getElementById('inputRefLinks').value.split('\n').map(l => l.trim()).filter(Boolean);

    const res = await fetch('/api/content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content_name: name,
        category: document.getElementById('inputCategory').value.trim(),
        platform_tags: tags,
        reference_links: links,
        description: document.getElementById('inputDescription').value.trim()
      })
    });

    const data = await res.json();
    if (data.success) {
      this.closeModal('createContentModal');
      // Clear form
      ['inputContentName', 'inputCategory', 'inputTags', 'inputRefLinks', 'inputDescription'].forEach(id => {
        document.getElementById(id).value = '';
      });
      await this.loadContents();
      this.selectContent(data.content._id);
      this.showToast('Content created', 'success');
    } else {
      this.showToast(data.error || 'Error', 'error');
    }
  }

  openUploadModal() {
    // Reset
    document.getElementById('videoInput').value = '';
    document.getElementById('thumbInput').value = '';
    document.getElementById('videoDropContent').innerHTML = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg><span>Drop video or click</span><small>MP4, MOV, WebM</small>';
    document.getElementById('thumbDropContent').innerHTML = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg><span>Thumbnail</span><small>JPG, PNG</small>';
    document.getElementById('videoDropzone').classList.remove('has-file');
    document.getElementById('thumbDropzone').classList.remove('has-file');
    ['inputHook', 'inputCaption', 'inputHashtags', 'inputRawText', 'inputNotes'].forEach(id => {
      document.getElementById(id).value = '';
    });
    document.getElementById('uploadProgress').style.display = 'none';
    this.setTextMode('structured');
    this.openModal('uploadPostModal');
  }

  async uploadPost() {
    if (!this.currentContentId) return;

    const videoFile = document.getElementById('videoInput').files[0];
    const thumbFile = document.getElementById('thumbInput').files[0];

    if (!videoFile && !thumbFile) {
      this.showToast('Please select at least a video or thumbnail', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('content_id', this.currentContentId);
    if (videoFile) formData.append('video', videoFile);
    if (thumbFile) formData.append('thumbnail', thumbFile);

    const isStructured = document.getElementById('modeStructured').classList.contains('active');
    formData.append('text_mode', isStructured ? 'structured' : 'raw');
    formData.append('hook', document.getElementById('inputHook').value);
    formData.append('caption', document.getElementById('inputCaption').value);
    formData.append('hashtags', document.getElementById('inputHashtags').value);
    formData.append('raw_text', document.getElementById('inputRawText').value);
    formData.append('notes', document.getElementById('inputNotes').value);

    // Show progress
    document.getElementById('uploadProgress').style.display = '';
    document.getElementById('uploadProgressText').textContent = 'Uploading...';
    document.getElementById('uploadProgressFill').style.width = '0';

    try {
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          document.getElementById('uploadProgressFill').style.width = pct + '%';
          document.getElementById('uploadProgressText').textContent = `Uploading... ${pct}%`;
        }
      });

      const result = await new Promise((resolve, reject) => {
        xhr.addEventListener('load', () => {
          if (xhr.status === 200) resolve(JSON.parse(xhr.responseText));
          else reject(new Error(xhr.responseText));
        });
        xhr.addEventListener('error', () => reject(new Error('Network error')));
        xhr.open('POST', '/api/video-posts');
        xhr.send(formData);
      });

      if (result.success) {
        this.closeModal('uploadPostModal');
        await this.loadPosts();
        await this.loadContents();
        this.showToast('Post uploaded', 'success');
      } else {
        this.showToast(result.error || 'Upload failed', 'error');
      }
    } catch (error) {
      this.showToast('Upload failed: ' + error.message, 'error');
    } finally {
      document.getElementById('uploadProgress').style.display = 'none';
    }
  }

  async changePostStatus(status) {
    const post = this.posts[this.viewerIndex];
    if (!post) return;

    const res = await fetch(`/api/video-posts/${post._id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });

    const data = await res.json();
    if (data.success) {
      post.status = status;
      this.updateViewer(post);
      // Update grid card
      const card = document.querySelector(`.cm-post-card[data-id="${post._id}"]`);
      if (card) {
        const badge = card.querySelector('.cm-post-card-status');
        badge.className = `cm-post-card-status cm-status-${status}`;
        badge.textContent = status;
      }
      this.showToast(`Status: ${status}`, 'success');
    }
  }

  async deletePost() {
    const post = this.posts[this.viewerIndex];
    if (!post || !confirm('Delete this post? This cannot be undone.')) return;

    const res = await fetch(`/api/video-posts/${post._id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      this.closeModal('viewerModal');
      await this.loadPosts();
      await this.loadContents();
      this.showToast('Post deleted', 'success');
    } else {
      this.showToast(data.error || 'Delete failed', 'error');
    }
  }

  // === Copy ===

  copyField(field) {
    const post = this.posts[this.viewerIndex];
    if (!post) return;
    const tc = post.text_content || {};
    let text = '';
    switch (field) {
      case 'hook': text = tc.hook || ''; break;
      case 'caption': text = tc.caption || ''; break;
      case 'hashtags': text = tc.hashtags || ''; break;
    }
    this.copyToClipboard(text);
  }

  copyAll() {
    const post = this.posts[this.viewerIndex];
    if (!post) return;
    const tc = post.text_content || {};
    const parts = [];
    if (tc.hook) parts.push(tc.hook);
    if (tc.caption) parts.push(tc.caption);
    if (tc.hashtags) parts.push(tc.hashtags);
    this.copyToClipboard(parts.join('\n\n'));
  }

  async copyToClipboard(text) {
    if (!text || text === '-') return;
    try {
      await navigator.clipboard.writeText(text);
      this.showToast('Copied!', 'success');
    } catch (e) {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      this.showToast('Copied!', 'success');
    }
  }

  // === Content Settings ===

  async openContentSettings() {
    if (!this.currentContent) return;
    const c = this.currentContent;
    document.getElementById('editContentName').value = c.content_name;
    document.getElementById('editCategory').value = c.category || '';
    document.getElementById('editTags').value = (c.platform_tags || []).join(', ');
    document.getElementById('editDescription').value = c.description || '';
    document.getElementById('editPublic').checked = c.is_public || false;

    // Load collaborators
    this.renderCollaborators();

    // Load activity
    this.loadActivity();

    this.openModal('contentSettingsModal');
  }

  renderCollaborators() {
    const list = document.getElementById('collabList');
    const collabs = this.currentContent?.collaborators || [];
    if (collabs.length === 0) {
      list.innerHTML = '<div style="font-size:12px;color:var(--text-secondary);padding:8px 0;">No collaborators</div>';
      return;
    }
    list.innerHTML = collabs.map(c => `
      <div class="cm-collab-item">
        <span>${this.escapeHtml(c.user_id?.username || 'Unknown')} (${c.role}) - ${c.status}</span>
        ${this.isOwner ? `<button class="cm-btn-sm cm-btn-danger" onclick="app.removeCollab('${c.user_id?._id}')">Remove</button>` : ''}
      </div>
    `).join('');
  }

  async inviteCollab() {
    const username = document.getElementById('collabUsername').value.trim();
    const role = document.getElementById('collabRole').value;
    if (!username) return;

    const res = await fetch(`/api/content/${this.currentContentId}/collaborators`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, role })
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById('collabUsername').value = '';
      // Reload content
      const r = await fetch(`/api/content/${this.currentContentId}`);
      const d = await r.json();
      if (d.success) { this.currentContent = d.content; this.renderCollaborators(); }
      this.showToast('Invitation sent', 'success');
    } else {
      this.showToast(data.error || 'Error', 'error');
    }
  }

  async removeCollab(userId) {
    if (!confirm('Remove this collaborator?')) return;
    const res = await fetch(`/api/content/${this.currentContentId}/collaborators/${userId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      const r = await fetch(`/api/content/${this.currentContentId}`);
      const d = await r.json();
      if (d.success) { this.currentContent = d.content; this.renderCollaborators(); }
      this.showToast('Removed', 'success');
    }
  }

  async loadActivity() {
    const log = document.getElementById('activityLog');
    try {
      const res = await fetch(`/api/content/${this.currentContentId}/activity`);
      const data = await res.json();
      if (data.success && data.logs.length > 0) {
        log.innerHTML = data.logs.map(l => `
          <div class="cm-activity-item">
            <strong>${this.escapeHtml(l.actor_id?.username || 'Unknown')}</strong> ${this.escapeHtml(l.action)} - ${this.escapeHtml(l.details || '')}
            <br><small>${new Date(l.createdAt).toLocaleString()}</small>
          </div>
        `).join('');
      } else {
        log.innerHTML = '<div class="cm-activity-empty">No activity yet</div>';
      }
    } catch(e) {
      log.innerHTML = '<div class="cm-activity-empty">Failed to load</div>';
    }
  }

  async saveContentSettings() {
    const tags = document.getElementById('editTags').value.split(',').map(t => t.trim()).filter(Boolean);

    const res = await fetch(`/api/content/${this.currentContentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content_name: document.getElementById('editContentName').value.trim(),
        category: document.getElementById('editCategory').value.trim(),
        platform_tags: tags,
        description: document.getElementById('editDescription').value.trim(),
        is_public: document.getElementById('editPublic').checked
      })
    });

    const data = await res.json();
    if (data.success) {
      this.closeModal('contentSettingsModal');
      this.currentContent = data.content;
      document.getElementById('headerTitle').textContent = data.content.content_name;
      await this.loadContents();
      this.showToast('Saved', 'success');
    } else {
      this.showToast(data.error || 'Error', 'error');
    }
  }

  async deleteContent() {
    if (!confirm('Delete this content and ALL its posts? This cannot be undone.')) return;

    const res = await fetch(`/api/content/${this.currentContentId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      this.closeModal('contentSettingsModal');
      this.currentContentId = null;
      this.currentContent = null;
      this.posts = [];
      document.getElementById('headerTitle').textContent = 'Select or Create Content';
      document.getElementById('welcomeState').style.display = '';
      document.getElementById('postGrid').style.display = 'none';
      document.getElementById('btnUploadPost').style.display = 'none';
      document.getElementById('btnContentSettings').style.display = 'none';
      await this.loadContents();
      this.showToast('Content deleted', 'success');
    } else {
      this.showToast(data.error || 'Error', 'error');
    }
  }

  // === Explore & Follow ===

  async openExplore() {
    document.getElementById('searchUsers').value = '';
    document.getElementById('userSearchResults').innerHTML = '';
    this.openModal('exploreModal');
    await this.loadFollowData();
  }

  async loadFollowData() {
    // Pending requests
    const reqRes = await fetch('/api/follows/pending');
    const reqData = await reqRes.json();
    const reqList = document.getElementById('followRequests');
    if (reqData.success && reqData.requests.length > 0) {
      reqList.innerHTML = reqData.requests.map(r => `
        <div class="cm-follow-request-item">
          <span>${this.escapeHtml(r.requester_id?.username || 'Unknown')}</span>
          <div style="display:flex;gap:4px;">
            <button class="cm-btn-sm cm-btn-primary" onclick="app.respondFollow('${r._id}', true)">Accept</button>
            <button class="cm-btn-sm cm-btn-secondary" onclick="app.respondFollow('${r._id}', false)">Decline</button>
          </div>
        </div>
      `).join('');
    } else {
      reqList.innerHTML = '<div style="padding:8px 0;font-size:12px;color:var(--text-secondary)">No pending requests</div>';
    }

    // Following
    const fRes = await fetch('/api/follows/following');
    const fData = await fRes.json();
    const fList = document.getElementById('followingList');
    if (fData.success && fData.following.length > 0) {
      fList.innerHTML = fData.following.map(f => `
        <div class="cm-following-item">
          <span style="cursor:pointer;" onclick="app.viewFollowedContent('${f.target_id?._id}', '${this.escapeHtml(f.target_id?.username || '')}')">${this.escapeHtml(f.target_id?.username || 'Unknown')}</span>
          <button class="cm-btn-sm cm-btn-secondary" onclick="app.unfollow('${f.target_id?._id}')">Unfollow</button>
        </div>
      `).join('');
    } else {
      fList.innerHTML = '<div style="padding:8px 0;font-size:12px;color:var(--text-secondary)">Not following anyone</div>';
    }
  }

  async searchUsers(query) {
    const results = document.getElementById('userSearchResults');
    if (!query || query.length < 2) { results.innerHTML = ''; return; }

    const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    if (data.success) {
      results.innerHTML = data.users.map(u => `
        <div class="cm-user-result-item">
          <span>${this.escapeHtml(u.username)}</span>
          <button class="cm-btn-sm cm-btn-primary" onclick="app.sendFollowRequest('${u._id}')">Follow</button>
        </div>
      `).join('') || '<div style="padding:8px;font-size:12px;color:var(--text-secondary)">No users found</div>';
    }
  }

  async sendFollowRequest(targetId) {
    const res = await fetch('/api/follows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_id: targetId })
    });
    const data = await res.json();
    if (data.success) {
      this.showToast('Follow request sent', 'success');
    } else {
      this.showToast(data.error || 'Error', 'error');
    }
  }

  async respondFollow(followId, accept) {
    const res = await fetch(`/api/follows/${followId}/respond`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accept })
    });
    const data = await res.json();
    if (data.success) {
      this.showToast(accept ? 'Accepted' : 'Declined', 'success');
      await this.loadFollowData();
    }
  }

  async unfollow(targetId) {
    if (!confirm('Unfollow this user?')) return;
    await fetch(`/api/follows/${targetId}`, { method: 'DELETE' });
    await this.loadFollowData();
    this.showToast('Unfollowed', 'success');
  }

  async viewFollowedContent(userId, username) {
    this.closeModal('exploreModal');
    document.getElementById('followedContentTitle').textContent = `${username}'s Content`;

    const res = await fetch(`/api/follows/${userId}/content`);
    const data = await res.json();
    const list = document.getElementById('followedContentList');

    if (data.success && data.contents.length > 0) {
      list.innerHTML = data.contents.map(c => `
        <div class="cm-followed-content-item" onclick="app.viewFollowedPosts('${c._id}', '${this.escapeHtml(c.content_name)}')">
          <h4>${this.escapeHtml(c.content_name)}</h4>
          <p>${c.post_count || 0} posts - ${c.category || 'No category'}</p>
        </div>
      `).join('');
    } else {
      list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary)">No public content</div>';
    }

    this.openModal('followedContentModal');
  }

  async viewFollowedPosts(contentId, name) {
    // Switch to viewing this content (read-only via follow)
    this.closeModal('followedContentModal');
    this.currentContentId = contentId;

    const res = await fetch(`/api/content/${contentId}`);
    const data = await res.json();
    if (!data.success) { this.showToast(data.error || 'Error', 'error'); return; }

    this.currentContent = data.content;
    this.isOwner = data.isOwner;
    this.isEditor = false;

    document.getElementById('headerTitle').textContent = name + ' (Read-only)';
    document.getElementById('btnUploadPost').style.display = 'none';
    document.getElementById('btnContentSettings').style.display = 'none';
    document.getElementById('welcomeState').style.display = 'none';
    document.getElementById('postGrid').style.display = '';

    await this.loadPosts();
  }

  // === Notifications ===

  async openNotifications() {
    this.openModal('notificationsModal');
    const res = await fetch('/api/notifications');
    const data = await res.json();
    const list = document.getElementById('notificationsList');

    if (data.success && data.notifications.length > 0) {
      list.innerHTML = data.notifications.map(n => `
        <div class="cm-notification-item ${n.is_read ? '' : 'unread'}">
          <div class="cm-notification-item-text">
            <strong>${this.escapeHtml(n.from_user_id?.username || 'System')}</strong>
            ${this.escapeHtml(n.message)}
          </div>
          <div class="cm-notification-item-time">${this.timeAgo(n.createdAt)}</div>
        </div>
      `).join('');
    } else {
      list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary)">No notifications</div>';
    }
  }

  async markAllRead() {
    await fetch('/api/notifications/mark-read', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: 'all' })
    });
    document.getElementById('notifBadge').style.display = 'none';
    document.querySelectorAll('.cm-notification-item.unread').forEach(el => el.classList.remove('unread'));
    this.showToast('All marked as read', 'success');
  }

  startNotifPolling() {
    this.pollNotifCount();
    this.notifInterval = setInterval(() => this.pollNotifCount(), 30000);
  }

  async pollNotifCount() {
    try {
      const res = await fetch('/api/notifications/unread-count');
      const data = await res.json();
      if (data.success) {
        const badge = document.getElementById('notifBadge');
        if (data.count > 0) {
          badge.textContent = data.count > 99 ? '99+' : data.count;
          badge.style.display = '';
        } else {
          badge.style.display = 'none';
        }
      }
    } catch(e) {}
  }

  // === Utilities ===

  openModal(id) { document.getElementById(id).classList.add('active'); }
  closeModal(id) { document.getElementById(id).classList.remove('active'); }
  closeAllModals() {
    document.querySelectorAll('.cm-modal-overlay').forEach(m => m.classList.remove('active'));
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  formatSize(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  timeAgo(date) {
    const seconds = Math.floor((Date.now() - new Date(date)) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    return Math.floor(seconds / 86400) + 'd ago';
  }
}

const app = new ContentManagerApp();
