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

    // Upload zones (individual)
    this.setupDropzone('videoDropzone', 'videoInput', 'videoDropContent');
    this.setupDropzone('thumbDropzone', 'thumbInput', 'thumbDropContent');
    this.setupDropzone('txtDropzone', 'txtInput', 'txtDropContent');

    // When txt file is selected, validate and read into text fields
    document.getElementById('txtInput').addEventListener('change', () => {
      const file = document.getElementById('txtInput').files[0];
      if (file) this.readTxtFile(file);
    });

    // Batch upload zone
    this.setupBatchDropzone();

    // Live two-way sync between raw text and structured fields
    this._syncing = false;
    document.getElementById('inputRawText').addEventListener('input', () => this.syncRawToStructured());
    document.getElementById('inputHook').addEventListener('input', () => this.syncStructuredToRaw());
    document.getElementById('inputCaption').addEventListener('input', () => this.syncStructuredToRaw());
    document.getElementById('inputHashtags').addEventListener('input', () => this.syncStructuredToRaw());

    // Fill template button
    document.getElementById('btnFillTemplate').addEventListener('click', () => this.fillTemplate());

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
    document.getElementById('btnDownloadVideo').addEventListener('click', () => this.downloadVideo());

    // Click on video to toggle play/pause
    const viewerVideo = document.getElementById('viewerVideo');
    viewerVideo.addEventListener('click', (e) => {
      const video = e.target;
      if (video.paused) video.play(); else video.pause();
    });

    // Video progress bar
    viewerVideo.addEventListener('timeupdate', () => {
      if (!viewerVideo.duration) return;
      const pct = (viewerVideo.currentTime / viewerVideo.duration) * 100;
      document.getElementById('viewerProgressFill').style.width = pct + '%';
      document.getElementById('viewerProgressHandle').style.left = pct + '%';
    });
    const progressBar = document.getElementById('viewerProgress');
    const seekVideo = (e) => {
      if (!viewerVideo.duration) return;
      const rect = progressBar.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      viewerVideo.currentTime = pct * viewerVideo.duration;
    };
    progressBar.addEventListener('click', seekVideo);
    // Drag to seek
    let seekDragging = false;
    progressBar.addEventListener('mousedown', (e) => { seekDragging = true; progressBar.classList.add('active'); seekVideo(e); });
    document.addEventListener('mousemove', (e) => { if (seekDragging) seekVideo(e); });
    document.addEventListener('mouseup', () => { seekDragging = false; progressBar.classList.remove('active'); });
    progressBar.addEventListener('touchstart', (e) => { seekDragging = true; progressBar.classList.add('active'); seekVideo(e.touches[0]); }, { passive: true });
    progressBar.addEventListener('touchmove', (e) => { if (seekDragging) seekVideo(e.touches[0]); }, { passive: true });
    progressBar.addEventListener('touchend', () => { seekDragging = false; progressBar.classList.remove('active'); });

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
        if (e.target === overlay) this.closeModal(overlay.id);
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
        // If this is the txt dropzone, also read the file content
        if (inputId === 'txtInput') this.readTxtFile(e.dataTransfer.files[0]);
      }
    });
    input.addEventListener('change', () => {
      if (input.files[0]) this.updateDropzonePreview(zone, content, input.files[0]);
    });
  }

  updateDropzonePreview(zone, content, file) {
    zone.classList.add('has-file');
    content.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--success-color)" stroke-width="2">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      <span style="font-size:12px;">${this.escapeHtml(file.name)}</span>
      <small>${this.formatSize(file.size)}</small>
    `;
  }

  // === Text Sync ===

  fillTemplate() {
    const raw = document.getElementById('inputRawText');
    const current = raw.value.trim();
    if (current && !confirm('This will replace current raw text with the template. Continue?')) return;
    raw.value = 'Hook: \nCaption: \nHashtags: ';
    raw.focus();
    raw.setSelectionRange(6, 6); // cursor after "Hook: "
    this.syncRawToStructured();
  }

  syncRawToStructured() {
    if (this._syncing) return;
    this._syncing = true;

    const text = document.getElementById('inputRawText').value;
    const parsed = this._parseRawText(text);

    document.getElementById('inputHook').value = parsed.hook;
    document.getElementById('inputCaption').value = parsed.caption;
    document.getElementById('inputHashtags').value = parsed.hashtags;

    this._syncing = false;
  }

  syncStructuredToRaw() {
    if (this._syncing) return;
    this._syncing = true;

    const hook = document.getElementById('inputHook').value;
    const caption = document.getElementById('inputCaption').value;
    const hashtags = document.getElementById('inputHashtags').value;

    const parts = [];
    parts.push(`Hook: ${hook}`);
    parts.push(`Caption: ${caption}`);
    parts.push(`Hashtags: ${hashtags}`);
    document.getElementById('inputRawText').value = parts.join('\n');

    this._syncing = false;
  }

  _parseRawText(text) {
    const result = { hook: '', caption: '', hashtags: '' };
    const labelPattern = /^(hook|caption|hashtags?)\s*[:：]\s*/i;
    let currentField = null;
    let currentValue = [];
    const fieldMap = {};

    for (const line of text.split('\n')) {
      const match = line.match(labelPattern);
      if (match) {
        if (currentField) fieldMap[currentField] = currentValue.join('\n').trim();
        const raw = match[1].toLowerCase();
        currentField = raw.startsWith('hashtag') ? 'hashtags' : raw;
        currentValue = [line.replace(labelPattern, '')];
      } else if (currentField) {
        currentValue.push(line);
      }
    }
    if (currentField) fieldMap[currentField] = currentValue.join('\n').trim();

    if ('hook' in fieldMap) result.hook = fieldMap.hook;
    if ('caption' in fieldMap) result.caption = fieldMap.caption;
    if ('hashtags' in fieldMap) result.hashtags = fieldMap.hashtags;

    return result;
  }

  // === Batch Upload ===

  setupBatchDropzone() {
    const zone = document.getElementById('batchDropzone');
    const input = document.getElementById('batchInput');

    zone.addEventListener('click', () => input.click());
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('active'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('active'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('active');
      if (e.dataTransfer.files.length > 0) {
        this.handleBatchFiles(e.dataTransfer.files);
      }
    });
    input.addEventListener('change', () => {
      if (input.files.length > 0) this.handleBatchFiles(input.files);
    });
  }

  handleBatchFiles(fileList) {
    const files = Array.from(fileList);
    let videoFile = null, thumbFile = null, txtFile = null;
    const unmatched = [];

    for (const f of files) {
      const ext = f.name.split('.').pop().toLowerCase();
      if (!videoFile && f.type.startsWith('video/')) {
        videoFile = f;
      } else if (!thumbFile && f.type.startsWith('image/')) {
        thumbFile = f;
      } else if (!txtFile && (f.type === 'text/plain' || ext === 'txt')) {
        txtFile = f;
      } else {
        unmatched.push(f);
      }
    }

    // Assign to individual inputs via DataTransfer
    if (videoFile) {
      const dt = new DataTransfer();
      dt.items.add(videoFile);
      document.getElementById('videoInput').files = dt.files;
      this.updateDropzonePreview(
        document.getElementById('videoDropzone'),
        document.getElementById('videoDropContent'),
        videoFile
      );
    }
    if (thumbFile) {
      const dt = new DataTransfer();
      dt.items.add(thumbFile);
      document.getElementById('thumbInput').files = dt.files;
      this.updateDropzonePreview(
        document.getElementById('thumbDropzone'),
        document.getElementById('thumbDropContent'),
        thumbFile
      );
    }
    if (txtFile) {
      const dt = new DataTransfer();
      dt.items.add(txtFile);
      document.getElementById('txtInput').files = dt.files;
      this.updateDropzonePreview(
        document.getElementById('txtDropzone'),
        document.getElementById('txtDropContent'),
        txtFile
      );
      this.readTxtFile(txtFile);
    }

    // Update batch zone summary
    const batchZone = document.getElementById('batchDropzone');
    const batchContent = document.getElementById('batchDropContent');
    const tags = [];
    if (videoFile) tags.push(`<span class="cm-batch-tag cm-batch-tag-video">${this.escapeHtml(videoFile.name)}</span>`);
    if (thumbFile) tags.push(`<span class="cm-batch-tag cm-batch-tag-image">${this.escapeHtml(thumbFile.name)}</span>`);
    if (txtFile) tags.push(`<span class="cm-batch-tag cm-batch-tag-text">${this.escapeHtml(txtFile.name)}</span>`);
    unmatched.forEach(f => tags.push(`<span class="cm-batch-tag cm-batch-tag-unknown">${this.escapeHtml(f.name)} (?)</span>`));

    if (tags.length > 0) {
      batchZone.classList.add('has-file');
      batchContent.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--success-color)" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span style="font-size:12px;">${files.length} file(s) detected</span>
        <div class="cm-batch-upload-summary">${tags.join('')}</div>
      `;
    }

    if (unmatched.length > 0) {
      this.showToast(`${unmatched.length} file(s) not recognized`, 'warning');
    }
  }

  // === TXT Validation ===

  readTxtFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      document.getElementById('inputRawText').value = text;

      // Validate and parse
      const result = this.validateTxtContent(text);
      this.showTxtValidation(result);

      if (result.hook !== null) document.getElementById('inputHook').value = result.hook;
      if (result.caption !== null) document.getElementById('inputCaption').value = result.caption;
      if (result.hashtags !== null) document.getElementById('inputHashtags').value = result.hashtags;
    };
    reader.onerror = () => this.showToast('Failed to read text file', 'error');
    reader.readAsText(file, 'utf-8');
  }

  validateTxtContent(text) {
    const lines = text.split('\n');
    const result = { valid: true, errors: [], fields: {}, hook: null, caption: null, hashtags: null };

    // Find fields (support multiline values between labels)
    const labelPattern = /^(hook|caption|hashtags?)\s*[:：]\s*/i;
    let currentField = null;
    let currentValue = [];
    const fieldMap = {};

    for (const line of lines) {
      const match = line.match(labelPattern);
      if (match) {
        // Save previous field
        if (currentField) fieldMap[currentField] = currentValue.join('\n').trim();
        const raw = match[1].toLowerCase();
        const normalized = raw.startsWith('hashtag') ? 'hashtags' : raw;
        currentField = normalized;
        currentValue = [line.replace(labelPattern, '')];
      } else if (currentField) {
        currentValue.push(line);
      }
    }
    if (currentField) fieldMap[currentField] = currentValue.join('\n').trim();

    // Validate required fields
    const hasHook = 'hook' in fieldMap && fieldMap.hook.length > 0;
    const hasCaption = 'caption' in fieldMap && fieldMap.caption.length > 0;
    const hasHashtags = 'hashtags' in fieldMap;

    result.fields = { hook: hasHook, caption: hasCaption, hashtags: hasHashtags };

    if (hasHook) result.hook = fieldMap.hook;
    if (hasCaption) result.caption = fieldMap.caption;
    if (hasHashtags) result.hashtags = fieldMap.hashtags;

    if (!hasHook) { result.valid = false; result.errors.push('Missing "Hook:" field'); }
    if (!hasCaption) { result.valid = false; result.errors.push('Missing "Caption:" field'); }

    // If no structured labels found at all, treat as raw-only
    if (!hasHook && !hasCaption && !hasHashtags) {
      result.errors = ['No structured labels found (Hook: / Caption: / Hashtags:). Content loaded as raw text only.'];
      result.caption = text; // fallback
    }

    return result;
  }

  showTxtValidation(result) {
    const el = document.getElementById('txtValidation');
    if (!result) { el.style.display = 'none'; return; }

    el.style.display = '';
    el.className = 'cm-txt-validation ' + (result.valid ? 'valid' : 'invalid');

    let html = '';
    if (result.valid) {
      html += '<div><strong>TXT validated</strong></div>';
      html += `<div class="cm-txt-field-ok">Hook: ${this.escapeHtml((result.hook || '').substring(0, 60))}${(result.hook || '').length > 60 ? '...' : ''}</div>`;
      html += `<div class="cm-txt-field-ok">Caption: ${this.escapeHtml((result.caption || '').substring(0, 60))}${(result.caption || '').length > 60 ? '...' : ''}</div>`;
      if (result.fields.hashtags) {
        html += `<div class="cm-txt-field-ok">Hashtags: ${this.escapeHtml((result.hashtags || '').substring(0, 60))}</div>`;
      } else {
        html += `<div class="cm-txt-field-miss">Hashtags: (optional, not found)</div>`;
      }
    } else {
      html += '<div><strong>TXT validation failed</strong></div>';
      result.errors.forEach(err => { html += `<div>${this.escapeHtml(err)}</div>`; });
      if (result.fields.hook) html += `<div class="cm-txt-field-ok">Hook: found</div>`;
      if (result.fields.caption) html += `<div class="cm-txt-field-ok">Caption: found</div>`;
    }

    el.innerHTML = html;
  }

  setupViewerSwipe() {
    const viewer = document.querySelector('.cm-viewer');
    if (!viewer) return;
    let startX = 0, startY = 0;
    viewer.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }, { passive: true });
    viewer.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      // Horizontal swipe for navigation (prioritize if horizontal > vertical)
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 60) {
        this.viewerNav(dx > 0 ? -1 : 1);
      }
      // Vertical swipe down to close
      else if (dy > 120) {
        this.closeModal('viewerModal');
      }
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

      // Bind card action buttons (copy/download on thumbnail)
      grid.querySelectorAll('.cm-card-action').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const action = btn.dataset.cardAction;
          const postId = btn.dataset.postId;
          if (action === 'copyAll') this.copyAllByPostId(postId, btn);
          if (action === 'download') this.downloadByPostId(postId, btn);
        });
      });

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
    const hasVideo = post.video && post.video.s3Key;

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
          <div class="cm-post-card-actions">
            <button class="cm-card-action" data-card-action="copyAll" data-post-id="${post._id}" title="Copy All">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
            ${hasVideo ? `<button class="cm-card-action" data-card-action="download" data-post-id="${post._id}" title="Download">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            </button>` : ''}
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
    // Meta
    document.getElementById('viewerPostNum').textContent = `#${post.post_number}`;
    const statusEl = document.getElementById('viewerStatus');
    statusEl.textContent = post.status;
    statusEl.className = `cm-v-status cm-status-${post.status}`;
    document.getElementById('viewerUploader').textContent = `@${post.uploaded_by?.username || 'unknown'}`;

    // Text
    const tc = post.text_content || {};
    document.getElementById('viewerHook').textContent = tc.hook || '';
    document.getElementById('viewerCaption').textContent = tc.caption || '';
    document.getElementById('viewerHashtags').textContent = tc.hashtags || '';

    if (tc.mode === 'raw' && tc.raw_text) {
      document.getElementById('viewerRawBlock').style.display = '';
      document.getElementById('viewerRawText').textContent = tc.raw_text;
    } else {
      document.getElementById('viewerRawBlock').style.display = 'none';
    }

    // Status buttons in viewer
    document.querySelectorAll('#viewerModal .cm-status-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.status === post.status);
    });

    // Counter
    document.getElementById('viewerCounter').textContent = `${this.viewerIndex + 1}/${this.posts.length}`;

    // Show/hide download button
    document.getElementById('btnDownloadVideo').style.display = (post.video && post.video.s3Key) ? '' : 'none';

    // Show/hide edit actions based on permission
    const canEdit = this.isOwner || this.isEditor;
    document.getElementById('btnDeletePost').style.display = canEdit ? '' : 'none';
    document.querySelectorAll('#viewerModal .cm-status-btn').forEach(btn => {
      btn.style.display = canEdit ? '' : 'none';
    });
  }

  viewerNav(dir) {
    const newIndex = this.viewerIndex + dir;
    if (newIndex < 0 || newIndex >= this.posts.length) return;
    if (this._navLock) return;
    this._navLock = true;
    this.viewerIndex = newIndex;

    const viewer = document.querySelector('.cm-viewer');
    const video = document.getElementById('viewerVideo');

    // Fade out
    viewer.classList.add('cm-v-sliding');
    video.pause();

    setTimeout(() => {
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
            if (data.url) {
              video.src = data.url;
              video.play().catch(() => {});
            }
            viewer.classList.remove('cm-v-sliding');
            this._navLock = false;
          }).catch(() => {
            viewer.classList.remove('cm-v-sliding');
            this._navLock = false;
          });
      } else {
        video.style.display = 'none';
        document.getElementById('viewerVideoPlaceholder').style.display = '';
        viewer.classList.remove('cm-v-sliding');
        this._navLock = false;
      }
    }, 150);
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
    // Reset all file inputs
    ['videoInput', 'thumbInput', 'txtInput', 'batchInput'].forEach(id => {
      document.getElementById(id).value = '';
    });
    // Reset individual dropzones
    document.getElementById('videoDropContent').innerHTML = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg><span>Drop video or click</span><small>MP4, MOV, WebM</small>';
    document.getElementById('thumbDropContent').innerHTML = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg><span>Thumbnail</span><small>JPG, PNG</small>';
    document.getElementById('txtDropContent').innerHTML = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg><span>Text File</span><small>TXT</small>';
    ['videoDropzone', 'thumbDropzone', 'txtDropzone'].forEach(id => {
      document.getElementById(id).classList.remove('has-file');
    });
    // Reset batch zone
    document.getElementById('batchDropzone').classList.remove('has-file');
    document.getElementById('batchDropContent').innerHTML = '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg><span>Drop all files here or click to select</span><small>Select video + thumbnail + txt in one go</small>';
    // Reset validation & text fields
    document.getElementById('txtValidation').style.display = 'none';
    ['inputHook', 'inputCaption', 'inputHashtags', 'inputRawText', 'inputNotes'].forEach(id => {
      document.getElementById(id).value = '';
    });
    document.getElementById('uploadProgress').style.display = 'none';
    this.openModal('uploadPostModal');
  }

  async uploadPost() {
    if (!this.currentContentId) return;

    const videoFile = document.getElementById('videoInput').files[0];
    const thumbFile = document.getElementById('thumbInput').files[0];
    const txtFile = document.getElementById('txtInput').files[0];

    if (!videoFile && !thumbFile && !txtFile) {
      this.showToast('Please select at least one file (video, thumbnail, or text)', 'error');
      return;
    }

    // Show progress
    document.getElementById('uploadProgress').style.display = '';
    document.getElementById('uploadProgressText').textContent = 'Requesting upload URLs...';
    document.getElementById('uploadProgressFill').style.width = '0%';

    try {
      // Step 1: Get presigned URLs from server
      const filesToPresign = [];
      if (videoFile) filesToPresign.push({ field: 'video', filename: videoFile.name, contentType: videoFile.type, size: videoFile.size });
      if (thumbFile) filesToPresign.push({ field: 'thumbnail', filename: thumbFile.name, contentType: thumbFile.type, size: thumbFile.size });
      if (txtFile) filesToPresign.push({ field: 'textfile', filename: txtFile.name, contentType: txtFile.type || 'text/plain', size: txtFile.size });

      const presignRes = await fetch('/api/video-posts/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content_id: this.currentContentId, files: filesToPresign })
      });
      const presignData = await presignRes.json();
      if (!presignData.success) {
        throw new Error(presignData.error || 'Failed to get upload URLs');
      }

      const { postNumber, presigned } = presignData;
      console.log('[CM] Presigned URLs received, postNumber:', postNumber);

      // Step 2: Upload files directly to S3
      const uploadTasks = [];
      const fileMap = { video: videoFile, thumbnail: thumbFile, textfile: txtFile };
      const totalBytes = Object.keys(presigned).reduce((sum, key) => sum + (fileMap[key]?.size || 0), 0);
      const progressMap = {};

      const updateTotalProgress = () => {
        const loaded = Object.values(progressMap).reduce((s, v) => s + v, 0);
        const pct = totalBytes > 0 ? Math.round((loaded / totalBytes) * 100) : 0;
        document.getElementById('uploadProgressFill').style.width = pct + '%';
        document.getElementById('uploadProgressText').textContent =
          pct < 100 ? `Uploading to S3... ${pct}%` : 'Finalizing...';
      };

      for (const [field, info] of Object.entries(presigned)) {
        const file = fileMap[field];
        if (!file) continue;
        progressMap[field] = 0;

        const task = new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.timeout = 30 * 60 * 1000;

          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
              progressMap[field] = e.loaded;
              updateTotalProgress();
            }
          });

          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              console.log(`[CM] S3 upload OK: ${field} (${xhr.status})`);
              resolve();
            } else {
              console.error(`[CM] S3 upload failed: ${field}`, xhr.status, xhr.responseText);
              reject(new Error(`S3 upload failed for ${field} (${xhr.status})`));
            }
          });
          xhr.addEventListener('error', () => reject(new Error(`Network error uploading ${field}`)));
          xhr.addEventListener('timeout', () => reject(new Error(`Timeout uploading ${field}`)));

          xhr.open('PUT', info.url);
          xhr.setRequestHeader('Content-Type', info.contentType);
          xhr.send(file);
        });
        uploadTasks.push(task);
      }

      await Promise.all(uploadTasks);
      console.log('[CM] All S3 uploads complete');

      // Step 3: Confirm with server to create DB record
      document.getElementById('uploadProgressText').textContent = 'Saving post...';

      const confirmBody = {
        content_id: this.currentContentId,
        postNumber,
        text_mode: 'structured',
        hook: document.getElementById('inputHook').value,
        caption: document.getElementById('inputCaption').value,
        hashtags: document.getElementById('inputHashtags').value,
        raw_text: document.getElementById('inputRawText').value,
        notes: document.getElementById('inputNotes').value
      };

      // Attach file metadata
      if (presigned.video) {
        confirmBody.video = { s3Key: presigned.video.key, originalName: videoFile.name, mimeType: videoFile.type, size: videoFile.size };
      }
      if (presigned.thumbnail) {
        confirmBody.thumbnail = { s3Key: presigned.thumbnail.key, originalName: thumbFile.name, mimeType: thumbFile.type, size: thumbFile.size };
      }
      if (presigned.textfile) {
        confirmBody.text_file = { s3Key: presigned.textfile.key, originalName: txtFile.name, mimeType: txtFile.type || 'text/plain', size: txtFile.size };
      }

      const confirmRes = await fetch('/api/video-posts/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(confirmBody)
      });
      const result = await confirmRes.json();

      if (result.success) {
        this.closeModal('uploadPostModal');
        await this.loadPosts();
        await this.loadContents();
        this.showToast('Post uploaded', 'success');
      } else {
        this.showToast(result.error || 'Upload failed', 'error');
      }
    } catch (error) {
      console.error('[CM] Upload failed:', error);
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
    let text = '', label = field;
    switch (field) {
      case 'hook': text = tc.hook || ''; break;
      case 'caption': text = tc.caption || ''; break;
      case 'hashtags': text = tc.hashtags || ''; label = 'tags'; break;
    }
    this.copyToClipboard(text, null, label);
  }

  copyAll() {
    const post = this.posts[this.viewerIndex];
    if (!post) return;
    const tc = post.text_content || {};
    const parts = [];
    if (tc.hook) parts.push(tc.hook);
    if (tc.caption) parts.push(tc.caption);
    if (tc.hashtags) parts.push(tc.hashtags);
    this.copyToClipboard(parts.join('\n\n'), null, 'all');
  }

  async copyToClipboard(text, btnEl, label) {
    if (!text || text === '-') return;
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    // Show feedback
    const isViewer = document.getElementById('viewerModal')?.classList.contains('active');
    if (isViewer) {
      this.showViewerFeedback(`Copied ${label || ''}!`);
    } else {
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
  closeModal(id) {
    document.getElementById(id).classList.remove('active');
    if (id === 'viewerModal') this.stopViewerVideo();
  }
  closeAllModals() {
    document.querySelectorAll('.cm-modal-overlay').forEach(m => m.classList.remove('active'));
    this.stopViewerVideo();
  }

  stopViewerVideo() {
    const video = document.getElementById('viewerVideo');
    if (video) { video.pause(); video.src = ''; }
  }

  async downloadVideo() {
    const post = this.posts[this.viewerIndex];
    if (!post || !post.video?.s3Key) return;
    this.showViewerFeedback('Downloading...');
    await this._downloadPost(post);
  }

  async _downloadPost(post) {
    try {
      const res = await fetch(`/api/video-posts/${post._id}/video`);
      const data = await res.json();
      if (!data.url) return;

      // iOS Safari doesn't support <a download> for cross-origin
      // Fetch as blob then create object URL
      const videoRes = await fetch(data.url);
      const blob = await videoRes.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = post.video.originalName || `video-${post.post_number}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
      this.showViewerFeedback('Downloaded!');
    } catch(e) {
      this.showToast('Download failed', 'error');
    }
  }

  // Copy all from a card (by post ID)
  copyAllByPostId(postId, btn) {
    const post = this.posts.find(p => p._id === postId);
    if (!post) return;
    const tc = post.text_content || {};
    const parts = [];
    if (tc.hook) parts.push(tc.hook);
    if (tc.caption) parts.push(tc.caption);
    if (tc.hashtags) parts.push(tc.hashtags);
    this.copyToClipboard(parts.join('\n\n'), btn);
  }

  // Download from a card (by post ID)
  async downloadByPostId(postId, btn) {
    const post = this.posts.find(p => p._id === postId);
    if (!post || !post.video?.s3Key) return;
    if (btn) { btn.style.opacity = '0.5'; btn.style.pointerEvents = 'none'; }
    await this._downloadPost(post);
    if (btn) { btn.style.opacity = ''; btn.style.pointerEvents = ''; }
  }

  // Viewer inline feedback (replaces toast for viewer actions)
  showViewerFeedback(text) {
    const el = document.getElementById('viewerFeedback');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth; // reflow
    el.classList.add('show');
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
