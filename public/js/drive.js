// Drive Clone - Main JavaScript

class DriveApp {
  constructor() {
    this.currentFolder = null;
    this.currentView = 'drive'; // 'drive' or 'recent'
    this.selectedItem = null;
    this.selectedType = null;
    this.selectedName = null;

    // Navigation history
    this.history = [null]; // Start with root
    this.historyIndex = 0;

    // Current files for preview navigation
    this.currentFiles = [];
    this.previewIndex = 0;

    this.init();
  }

  async init() {
    console.log('[Drive] Initializing app...');
    try {
      await this.checkAuth();
      this.bindEvents();
      console.log('[Drive] Loading initial files...');
      await this.loadFiles();
      this.loadStorageInfo();
      console.log('[Drive] Init complete');
    } catch (error) {
      console.error('[Drive] Init error:', error);
    }
  }

  async checkAuth() {
    try {
      const response = await fetch('/api/auth/me');
      const data = await response.json();

      if (response.ok) {
        document.getElementById('userName').textContent = data.username;
        if (data.isAdmin) {
          document.getElementById('navAdmin').style.display = 'flex';
        }
      } else {
        window.location.href = '/login';
      }
    } catch (error) {
      window.location.href = '/login';
    }
  }

  bindEvents() {
    // Menu toggle (mobile)
    document.getElementById('menuToggle').addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('open');
      document.getElementById('sidebarOverlay').classList.toggle('active');
    });

    document.getElementById('sidebarOverlay').addEventListener('click', () => {
      document.getElementById('sidebar').classList.remove('open');
      document.getElementById('sidebarOverlay').classList.remove('active');
    });

    // Navigation buttons
    document.getElementById('btnBack').addEventListener('click', () => this.goBack());
    document.getElementById('btnForward').addEventListener('click', () => this.goForward());

    // View switching
    document.getElementById('navMyDrive').addEventListener('click', (e) => {
      e.preventDefault();
      this.switchView('drive');
    });

    document.getElementById('navRecent').addEventListener('click', (e) => {
      e.preventDefault();
      this.switchView('recent');
    });

    // New button dropdown (sidebar)
    const btnNewSidebar = document.getElementById('btnNewSidebar');
    const newDropdown = document.getElementById('newDropdown');

    btnNewSidebar.addEventListener('click', (e) => {
      e.stopPropagation();
      const rect = btnNewSidebar.getBoundingClientRect();
      const menu = newDropdown.querySelector('.dropdown-menu');
      menu.style.top = `${rect.bottom + 8}px`;
      menu.style.left = `${rect.left}px`;
      newDropdown.classList.toggle('active');
    });

    // Upload file from dropdown
    document.getElementById('btnUploadFile').addEventListener('click', () => {
      newDropdown.classList.remove('active');
      this.openModal('uploadModal');
    });

    // New folder from dropdown
    document.getElementById('btnNewFolderDropdown').addEventListener('click', () => {
      newDropdown.classList.remove('active');
      this.openFolderModal();
    });

    // Header upload button
    document.getElementById('btnUploadHeader').addEventListener('click', () => {
      document.getElementById('fileInputHeader').click();
    });

    document.getElementById('fileInputHeader').addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.handleFiles(e.target.files);
        e.target.value = '';
      }
    });

    // New folder button in header
    document.getElementById('btnNewFolder').addEventListener('click', () => {
      this.openFolderModal();
    });

    // Refresh
    document.getElementById('btnRefresh').addEventListener('click', () => {
      this.loadFiles();
      this.loadStorageInfo();
    });

    // Logout
    document.getElementById('btnLogout').addEventListener('click', async () => {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/login';
    });

    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
      if (!newDropdown.contains(e.target) && e.target !== btnNewSidebar) {
        newDropdown.classList.remove('active');
      }
      this.hideContextMenu();
    });

    // Upload modal
    document.getElementById('closeUploadModal').addEventListener('click', () => {
      this.closeModal('uploadModal');
    });

    // Folder modal
    document.getElementById('closeFolderModal').addEventListener('click', () => {
      this.closeModal('folderModal');
    });
    document.getElementById('cancelFolder').addEventListener('click', () => {
      this.closeModal('folderModal');
    });
    document.getElementById('createFolder').addEventListener('click', () => {
      this.createFolder();
    });
    document.getElementById('folderName').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.createFolder();
    });

    // Rename modal
    document.getElementById('closeRenameModal').addEventListener('click', () => {
      this.closeModal('renameModal');
    });
    document.getElementById('cancelRename').addEventListener('click', () => {
      this.closeModal('renameModal');
    });
    document.getElementById('confirmRename').addEventListener('click', () => {
      this.renameItem();
    });
    document.getElementById('newName').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.renameItem();
    });

    // Preview modal
    document.getElementById('closePreview').addEventListener('click', () => {
      this.closeModal('previewModal');
    });
    document.getElementById('previewDownload').addEventListener('click', () => {
      if (this.currentFiles[this.previewIndex]) {
        this.downloadFile(this.currentFiles[this.previewIndex]._id);
      }
    });
    document.getElementById('previewPrev').addEventListener('click', () => {
      this.previewPrev();
    });
    document.getElementById('previewNext').addEventListener('click', () => {
      this.previewNext();
    });

    // File upload (dropzone)
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('fileInput');

    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('active');
    });
    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('active');
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('active');
      this.handleFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', (e) => {
      this.handleFiles(e.target.files);
    });

    // Content area drag and drop
    const contentArea = document.getElementById('contentArea');
    contentArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      contentArea.style.background = 'rgba(66, 133, 244, 0.05)';
    });
    contentArea.addEventListener('dragleave', () => {
      contentArea.style.background = '';
    });
    contentArea.addEventListener('drop', (e) => {
      e.preventDefault();
      contentArea.style.background = '';
      if (e.dataTransfer.files.length > 0) {
        this.handleFiles(e.dataTransfer.files);
      }
    });

    // Context menu actions
    document.querySelectorAll('.context-menu-item').forEach(item => {
      item.addEventListener('click', () => {
        const action = item.dataset.action;
        this.handleContextAction(action);
      });
    });

    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.classList.remove('active');
        }
      });
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeAllModals();
        this.hideContextMenu();
      }

      // Preview navigation
      if (document.getElementById('previewModal').classList.contains('active')) {
        if (e.key === 'ArrowLeft') this.previewPrev();
        if (e.key === 'ArrowRight') this.previewNext();
      }
    });

    // Swipe gestures for mobile preview
    this.setupSwipeGestures();
  }

  setupSwipeGestures() {
    const previewBody = document.getElementById('previewBody');
    let startX = 0;
    let startY = 0;

    previewBody.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }, { passive: true });

    previewBody.addEventListener('touchend', (e) => {
      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const diffX = endX - startX;
      const diffY = endY - startY;

      // Only trigger if horizontal swipe is dominant
      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
        if (diffX > 0) {
          this.previewPrev();
        } else {
          this.previewNext();
        }
      }
    }, { passive: true });
  }

  switchView(view) {
    this.currentView = view;

    // Update nav items
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.remove('active');
    });

    if (view === 'drive') {
      document.getElementById('navMyDrive').classList.add('active');
      document.getElementById('breadcrumbsBar').style.display = 'block';
      this.loadFiles();
    } else if (view === 'recent') {
      document.getElementById('navRecent').classList.add('active');
      document.getElementById('breadcrumbsBar').style.display = 'none';
      this.loadRecentFiles();
    }

    // Close sidebar on mobile
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('active');
  }

  // Navigation history
  goBack() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.currentFolder = this.history[this.historyIndex];
      this.loadFiles(false);
    }
  }

  goForward() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.currentFolder = this.history[this.historyIndex];
      this.loadFiles(false);
    }
  }

  updateNavButtons() {
    document.getElementById('btnBack').disabled = this.historyIndex <= 0;
    document.getElementById('btnForward').disabled = this.historyIndex >= this.history.length - 1;
  }

  addToHistory(folderId) {
    // Remove any forward history
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(folderId);
    this.historyIndex = this.history.length - 1;
    this.updateNavButtons();
  }

  async loadFiles(addToHistory = true) {
    // Show loading state
    const grid = document.getElementById('fileGrid');
    const emptyState = document.getElementById('emptyState');
    emptyState.style.display = 'none';
    grid.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading...</p></div>';

    try {
      const url = this.currentFolder
        ? `/api/files?folder=${this.currentFolder}`
        : '/api/files';

      console.log('[Drive] Loading files from:', url);
      const response = await fetch(url);
      const data = await response.json();
      console.log('[Drive] API Response:', data);

      if (response.ok) {
        // Ensure data structure is correct
        const files = data.files || [];
        const folders = data.folders || [];
        const breadcrumbs = data.breadcrumbs || [];

        console.log('[Drive] Files:', files.length, 'Folders:', folders.length);

        this.currentFiles = files;
        this.renderFiles({ files, folders, breadcrumbs });
        this.renderBreadcrumbs(breadcrumbs);
        this.updatePathDisplay(breadcrumbs);

        if (addToHistory && this.currentView === 'drive') {
          // Only add to history if it's different from current
          if (this.history[this.historyIndex] !== this.currentFolder) {
            this.addToHistory(this.currentFolder);
          }
        }
        this.updateNavButtons();
      } else {
        console.error('[Drive] API Error:', data.error);
        this.showToast(data.error || 'Failed to load files', 'error');
      }
    } catch (error) {
      console.error('[Drive] Connection error:', error);
      this.showToast('Connection error', 'error');
    }
  }

  async loadRecentFiles() {
    try {
      console.log('[Drive] Loading recent files...');
      const response = await fetch('/api/files/recent');
      const data = await response.json();
      console.log('[Drive] Recent files response:', data);

      if (response.ok) {
        const files = data.files || [];
        this.currentFiles = files;
        this.renderRecentFiles(files);
        this.updatePathDisplay([], true);
      } else {
        console.error('[Drive] Recent files error:', data.error);
        this.showToast(data.error || 'Failed to load recent files', 'error');
      }
    } catch (error) {
      console.error('[Drive] Recent files connection error:', error);
      this.showToast('Connection error', 'error');
    }
  }

  updatePathDisplay(breadcrumbs, isRecent = false) {
    const pathText = document.getElementById('pathText');

    if (isRecent) {
      pathText.textContent = '/Recent';
      return;
    }

    let path = '/My Drive';
    if (breadcrumbs && breadcrumbs.length > 0) {
      path += '/' + breadcrumbs.map(b => b.name).join('/');
    }
    pathText.textContent = path;
  }

  renderFiles(data) {
    const grid = document.getElementById('fileGrid');
    const emptyState = document.getElementById('emptyState');

    // Ensure arrays exist
    const folders = Array.isArray(data.folders) ? data.folders : [];
    const files = Array.isArray(data.files) ? data.files : [];

    console.log('[Drive] Rendering - Folders:', folders.length, 'Files:', files.length);

    if (folders.length === 0 && files.length === 0) {
      grid.innerHTML = '';
      document.getElementById('emptyTitle').textContent = 'This folder is empty';
      document.getElementById('emptyText').textContent = 'Drop files here or click "Upload" to add files';
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';

    let html = '';

    // Render folders first
    folders.forEach(folder => {
      console.log('[Drive] Rendering folder:', folder.name, folder._id);
      html += this.renderFolderItem(folder);
    });

    // Render files
    files.forEach((file, index) => {
      html += this.renderFileItem(file, index);
    });

    grid.innerHTML = html;
    this.bindFileEvents();
  }

  renderRecentFiles(files) {
    const grid = document.getElementById('fileGrid');
    const emptyState = document.getElementById('emptyState');

    if (files.length === 0) {
      grid.innerHTML = '';
      document.getElementById('emptyTitle').textContent = 'No recent files';
      document.getElementById('emptyText').textContent = 'Files you access will appear here';
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';

    let html = '';
    files.forEach((file, index) => {
      html += this.renderFileItem(file, index);
    });

    grid.innerHTML = html;
    this.bindFileEvents();
  }

  renderFolderItem(folder) {
    const safeName = this.escapeHtml(folder.name).replace(/'/g, '&#39;');
    return `
      <div class="file-item" data-id="${folder._id}" data-type="folder" data-name="${safeName}">
        <div class="file-actions">
          <button class="btn btn-icon btn-context" data-item-id="${folder._id}" data-item-type="folder">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="2"></circle>
              <circle cx="12" cy="5" r="2"></circle>
              <circle cx="12" cy="19" r="2"></circle>
            </svg>
          </button>
        </div>
        <div class="file-thumbnail">
          <div class="file-icon folder-icon">
            <svg viewBox="0 0 24 24" fill="#5f6368">
              <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
            </svg>
          </div>
        </div>
        <div class="file-name">${this.escapeHtml(folder.name)}</div>
      </div>
    `;
  }

  renderFileItem(file, index) {
    const isImage = file.mimeType && file.mimeType.startsWith('image/');
    const safeName = this.escapeHtml(file.name).replace(/'/g, '&#39;');
    const fileIcon = this.getFileIcon(file.mimeType);

    let thumbnailContent;
    if (isImage) {
      thumbnailContent = `<img src="/api/files/${file._id}/thumbnail" alt="${safeName}" loading="lazy" data-fallback-icon="true">`;
    } else {
      thumbnailContent = `<div class="file-icon">${fileIcon}</div>`;
    }

    return `
      <div class="file-item" data-id="${file._id}" data-type="file" data-name="${safeName}" data-index="${index}" data-mime="${file.mimeType || ''}">
        <div class="file-actions">
          <button class="btn btn-icon btn-context" data-item-id="${file._id}" data-item-type="file">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="2"></circle>
              <circle cx="12" cy="5" r="2"></circle>
              <circle cx="12" cy="19" r="2"></circle>
            </svg>
          </button>
        </div>
        <div class="file-thumbnail ${isImage ? 'loading' : ''}">
          ${thumbnailContent}
        </div>
        <div class="file-name">${this.escapeHtml(file.name)}</div>
        <div class="file-size">${this.formatSize(file.size)}</div>
        <button class="file-download-btn" data-file-id="${file._id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <span>Download</span>
        </button>
      </div>
    `;
  }

  bindFileEvents() {
    const grid = document.getElementById('fileGrid');

    grid.querySelectorAll('.file-item').forEach(item => {
      const id = item.dataset.id;
      const type = item.dataset.type;
      const name = item.dataset.name;

      // Single click
      item.addEventListener('click', (e) => {
        if (e.target.closest('.file-download-btn') || e.target.closest('.file-actions')) {
          return;
        }

        if (type === 'folder') {
          this.openFolder(id);
        } else {
          // Preview file
          const index = parseInt(item.dataset.index);
          this.openPreview(index);
        }
      });

      // Context menu
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.showContextMenu(e, id, type, name);
      });

      // Handle image load and error
      const img = item.querySelector('.file-thumbnail img');
      if (img) {
        img.addEventListener('load', () => {
          img.parentElement.classList.remove('loading');
        });
        img.addEventListener('error', () => {
          const mimeType = item.dataset.mime || '';
          const fallbackIcon = this.getFileIcon(mimeType);
          img.parentElement.innerHTML = `<div class="file-icon">${fallbackIcon}</div>`;
          img.parentElement.classList.remove('loading');
        });
      }
    });

    // Bind context menu buttons
    grid.querySelectorAll('.btn-context').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = e.target.closest('.file-item');
        const id = btn.dataset.itemId;
        const type = btn.dataset.itemType;
        const name = item.dataset.name;
        this.showContextMenu(e, id, type, name);
      });
    });

    // Bind download buttons
    grid.querySelectorAll('.file-download-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const fileId = btn.dataset.fileId;
        this.downloadFile(fileId);
      });
    });
  }

  renderBreadcrumbs(breadcrumbs) {
    const container = document.getElementById('breadcrumbs');
    let html = `<a href="#" class="breadcrumb-item${!this.currentFolder ? ' active' : ''}" data-folder="" onclick="app.openFolder(null); return false;">My Drive</a>`;

    if (breadcrumbs) {
      breadcrumbs.forEach((crumb, index) => {
        const isLast = index === breadcrumbs.length - 1;
        html += `
          <span class="breadcrumb-separator">›</span>
          <a href="#" class="breadcrumb-item${isLast ? ' active' : ''}" data-folder="${crumb.id}" onclick="app.openFolder('${crumb.id}'); return false;">${this.escapeHtml(crumb.name)}</a>
        `;
      });
    }

    container.innerHTML = html;
  }

  openFolder(folderId) {
    this.currentFolder = folderId;
    this.currentView = 'drive';

    // Update nav items
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    document.getElementById('navMyDrive').classList.add('active');
    document.getElementById('breadcrumbsBar').style.display = 'block';

    this.loadFiles();
  }

  openFolderModal() {
    this.openModal('folderModal');
    document.getElementById('folderName').value = '';
    document.getElementById('folderName').focus();
  }

  async loadStorageInfo() {
    try {
      const response = await fetch('/api/storage');
      const data = await response.json();

      if (response.ok) {
        document.getElementById('storageBar').style.width = `${data.percentage}%`;
        document.getElementById('storageText').textContent =
          `${this.formatSize(data.used)} of ${this.formatSize(data.limit)} used`;
      }
    } catch (error) {
      console.error('Failed to load storage info');
    }
  }

  async handleFiles(files) {
    // Close upload modal if open
    this.closeModal('uploadModal');

    // Show upload progress container
    const progressContainer = document.getElementById('uploadProgressContainer');
    progressContainer.style.display = 'block';
    const progressList = document.getElementById('uploadProgressList');

    for (const file of files) {
      await this.uploadFile(file, progressList);
    }

    // Hide progress after a delay
    setTimeout(() => {
      progressContainer.style.display = 'none';
      progressList.innerHTML = '';
    }, 2000);

    // Refresh after all uploads
    this.loadFiles();
    this.loadStorageInfo();
  }

  // Chunk size: 50MB (to stay under Cloudflare's 100MB limit)
  CHUNK_SIZE = 50 * 1024 * 1024;

  async uploadFile(file, progressList) {
    // Create progress item
    const progressItem = document.createElement('div');
    progressItem.className = 'upload-progress-item';
    progressItem.innerHTML = `
      <div class="upload-progress-info">
        <span class="upload-progress-name">${this.escapeHtml(file.name)}</span>
        <span class="upload-progress-status">0%</span>
      </div>
      <div class="upload-progress-bar">
        <div class="upload-progress-fill" style="width: 0%"></div>
      </div>
    `;
    progressList.appendChild(progressItem);

    const progressFill = progressItem.querySelector('.upload-progress-fill');
    const progressStatus = progressItem.querySelector('.upload-progress-status');

    try {
      // Use chunked upload for files > 50MB
      if (file.size > this.CHUNK_SIZE) {
        await this.uploadFileChunked(file, progressFill, progressStatus);
      } else {
        await this.uploadFileSimple(file, progressFill, progressStatus);
      }
    } catch (error) {
      progressFill.style.background = 'var(--danger-color)';
      progressStatus.textContent = 'Error';
      this.showToast(`Upload failed: ${file.name}`, 'error');
    }
  }

  // Simple upload for small files
  uploadFileSimple(file, progressFill, progressStatus) {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('file', file);
      if (this.currentFolder) {
        formData.append('folder', this.currentFolder);
      }

      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          progressFill.style.width = percent + '%';
          progressStatus.textContent = percent + '%';
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          try {
            const data = JSON.parse(xhr.responseText);
            if (data.success) {
              progressFill.style.width = '100%';
              progressFill.style.background = 'var(--success-color)';
              progressStatus.textContent = 'Done';
              this.showToast(`Uploaded: ${file.name}`, 'success');
              resolve();
            } else {
              progressFill.style.background = 'var(--danger-color)';
              progressStatus.textContent = 'Failed';
              this.showToast(data.error || `Failed: ${file.name}`, 'error');
              reject(new Error(data.error));
            }
          } catch (e) {
            reject(e);
          }
        } else {
          reject(new Error(`HTTP ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => reject(new Error('Network error')));
      xhr.open('POST', '/api/files/upload');
      xhr.send(formData);
    });
  }

  // Chunked upload for large files
  async uploadFileChunked(file, progressFill, progressStatus) {
    const totalChunks = Math.ceil(file.size / this.CHUNK_SIZE);
    const uploadId = Date.now().toString(36) + Math.random().toString(36).substr(2);

    console.log(`[Upload] Starting chunked upload: ${file.name}, ${totalChunks} chunks`);

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const start = chunkIndex * this.CHUNK_SIZE;
      const end = Math.min(start + this.CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);

      const overallProgress = Math.round(((chunkIndex) / totalChunks) * 100);
      progressStatus.textContent = `${overallProgress}% (chunk ${chunkIndex + 1}/${totalChunks})`;

      await this.uploadChunk({
        chunk,
        chunkIndex,
        totalChunks,
        uploadId,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        folder: this.currentFolder
      }, (chunkProgress) => {
        const totalProgress = ((chunkIndex + chunkProgress) / totalChunks) * 100;
        progressFill.style.width = totalProgress + '%';
      });
    }

    // Complete the upload
    const result = await this.completeChunkedUpload(uploadId, file.name, file.size, file.type, this.currentFolder);

    if (result.success) {
      progressFill.style.width = '100%';
      progressFill.style.background = 'var(--success-color)';
      progressStatus.textContent = 'Done';
      this.showToast(`Uploaded: ${file.name}`, 'success');
    } else {
      throw new Error(result.error);
    }
  }

  uploadChunk(params, onProgress) {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('chunk', params.chunk);
      formData.append('chunkIndex', params.chunkIndex);
      formData.append('totalChunks', params.totalChunks);
      formData.append('uploadId', params.uploadId);
      formData.append('fileName', params.fileName);
      formData.append('fileSize', params.fileSize);
      formData.append('mimeType', params.mimeType);
      if (params.folder) {
        formData.append('folder', params.folder);
      }

      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          onProgress(e.loaded / e.total);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          const data = JSON.parse(xhr.responseText);
          if (data.success) {
            resolve(data);
          } else {
            reject(new Error(data.error));
          }
        } else {
          reject(new Error(`HTTP ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => reject(new Error('Network error')));
      xhr.open('POST', '/api/files/upload-chunk');
      xhr.send(formData);
    });
  }

  async completeChunkedUpload(uploadId, fileName, fileSize, mimeType, folder) {
    const response = await fetch('/api/files/upload-complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploadId, fileName, fileSize, mimeType, folder })
    });
    return response.json();
  }

  async createFolder() {
    const name = document.getElementById('folderName').value.trim();
    if (!name) {
      this.showToast('Please enter a folder name', 'error');
      return;
    }

    try {
      const response = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          parentId: this.currentFolder
        })
      });

      const data = await response.json();

      if (data.success) {
        this.closeModal('folderModal');
        this.loadFiles();
        this.showToast('Folder created', 'success');
      } else {
        this.showToast(data.error || 'Failed to create folder', 'error');
      }
    } catch (error) {
      this.showToast('Connection error', 'error');
    }
  }

  downloadFile(fileId) {
    // Track access for recent files
    fetch(`/api/files/${fileId}/access`, { method: 'POST' }).catch(() => {});
    window.open(`/api/files/${fileId}/download`, '_blank');
  }

  // Preview functionality
  openPreview(index) {
    this.previewIndex = index;
    const file = this.currentFiles[index];

    if (!file) return;

    // Track access for recent files
    fetch(`/api/files/${file._id}/access`, { method: 'POST' }).catch(() => {});

    document.getElementById('previewTitle').textContent = file.name;
    this.updatePreviewCounter();
    this.loadPreviewContent(file);
    this.openModal('previewModal');
  }

  updatePreviewCounter() {
    const counter = document.getElementById('previewCounter');
    counter.textContent = `${this.previewIndex + 1} / ${this.currentFiles.length}`;

    document.getElementById('previewPrev').disabled = this.previewIndex <= 0;
    document.getElementById('previewNext').disabled = this.previewIndex >= this.currentFiles.length - 1;
  }

  previewPrev() {
    if (this.previewIndex > 0) {
      this.previewIndex--;
      const file = this.currentFiles[this.previewIndex];
      document.getElementById('previewTitle').textContent = file.name;
      this.updatePreviewCounter();
      this.loadPreviewContent(file);
    }
  }

  previewNext() {
    if (this.previewIndex < this.currentFiles.length - 1) {
      this.previewIndex++;
      const file = this.currentFiles[this.previewIndex];
      document.getElementById('previewTitle').textContent = file.name;
      this.updatePreviewCounter();
      this.loadPreviewContent(file);
    }
  }

  async loadPreviewContent(file) {
    const previewBody = document.getElementById('previewBody');
    previewBody.innerHTML = `
      <div class="preview-loading">
        <div class="spinner"></div>
        <span>Loading preview...</span>
      </div>
    `;

    const mimeType = file.mimeType || '';

    try {
      if (mimeType.startsWith('image/')) {
        previewBody.innerHTML = `<img src="/api/files/${file._id}/download" alt="${this.escapeHtml(file.name)}">`;
      } else if (mimeType.startsWith('video/')) {
        previewBody.innerHTML = `
          <video controls autoplay>
            <source src="/api/files/${file._id}/download" type="${mimeType}">
            Your browser does not support video playback.
          </video>
        `;
      } else if (mimeType.startsWith('audio/')) {
        previewBody.innerHTML = `
          <audio controls autoplay>
            <source src="/api/files/${file._id}/download" type="${mimeType}">
            Your browser does not support audio playback.
          </audio>
        `;
      } else if (mimeType === 'application/pdf') {
        previewBody.innerHTML = `
          <div class="pdf-preview">
            <iframe src="/api/files/${file._id}/download#toolbar=1"></iframe>
          </div>
        `;
      } else if (mimeType.startsWith('text/') || this.isTextFile(file.name)) {
        // Load text content
        const response = await fetch(`/api/files/${file._id}/content`);
        if (response.ok) {
          const text = await response.text();
          previewBody.innerHTML = `
            <div class="text-preview">
              <div class="text-preview-header">
                ${this.escapeHtml(file.name)} • ${this.formatSize(file.size)}
              </div>
              <div class="text-preview-content">${this.escapeHtml(text)}</div>
            </div>
          `;
        } else {
          this.showUnsupportedPreview(previewBody, file);
        }
      } else {
        this.showUnsupportedPreview(previewBody, file);
      }
    } catch (error) {
      this.showUnsupportedPreview(previewBody, file);
    }
  }

  isTextFile(filename) {
    const textExtensions = ['.txt', '.md', '.json', '.js', '.ts', '.css', '.html', '.xml', '.csv', '.log', '.ini', '.cfg', '.conf', '.sh', '.bat', '.py', '.java', '.c', '.cpp', '.h', '.hpp', '.sql', '.yml', '.yaml', '.env', '.gitignore'];
    const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    return textExtensions.includes(ext);
  }

  showUnsupportedPreview(container, file) {
    container.innerHTML = `
      <div class="unsupported-preview">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
        </svg>
        <h3>Preview not available</h3>
        <p>${this.escapeHtml(file.name)} • ${this.formatSize(file.size)}</p>
        <button class="btn btn-primary" onclick="app.downloadFile('${file._id}')">
          Download File
        </button>
      </div>
    `;
  }

  showContextMenu(e, id, type, name) {
    e.preventDefault();
    e.stopPropagation();

    this.selectedItem = id;
    this.selectedType = type;
    this.selectedName = name;

    const menu = document.getElementById('contextMenu');
    const previewItem = menu.querySelector('[data-action="preview"]');
    const downloadItem = menu.querySelector('[data-action="download"]');

    // Hide preview and download for folders
    previewItem.style.display = type === 'folder' ? 'none' : 'flex';
    downloadItem.style.display = type === 'folder' ? 'none' : 'flex';

    // Position menu
    let x = e.clientX || e.pageX;
    let y = e.clientY || e.pageY;

    // Adjust if menu goes off screen
    const menuWidth = 180;
    const menuHeight = 200;

    if (x + menuWidth > window.innerWidth) {
      x = window.innerWidth - menuWidth - 10;
    }
    if (y + menuHeight > window.innerHeight) {
      y = window.innerHeight - menuHeight - 10;
    }

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.classList.add('active');
  }

  hideContextMenu() {
    document.getElementById('contextMenu').classList.remove('active');
  }

  handleContextAction(action) {
    this.hideContextMenu();

    switch (action) {
      case 'preview':
        if (this.selectedType === 'file') {
          const index = this.currentFiles.findIndex(f => f._id === this.selectedItem);
          if (index >= 0) {
            this.openPreview(index);
          }
        }
        break;
      case 'download':
        if (this.selectedType === 'file') {
          this.downloadFile(this.selectedItem);
        }
        break;
      case 'rename':
        this.openModal('renameModal');
        document.getElementById('newName').value = this.selectedName;
        document.getElementById('newName').select();
        break;
      case 'delete':
        this.deleteItem();
        break;
    }
  }

  async renameItem() {
    const newName = document.getElementById('newName').value.trim();
    if (!newName) {
      this.showToast('Please enter a name', 'error');
      return;
    }

    const endpoint = this.selectedType === 'folder'
      ? `/api/folders/${this.selectedItem}`
      : `/api/files/${this.selectedItem}`;

    try {
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName })
      });

      const data = await response.json();

      if (data.success) {
        this.closeModal('renameModal');
        this.loadFiles();
        this.showToast('Renamed successfully', 'success');
      } else {
        this.showToast(data.error || 'Failed to rename', 'error');
      }
    } catch (error) {
      this.showToast('Connection error', 'error');
    }
  }

  async deleteItem() {
    if (!confirm(`Are you sure you want to delete this ${this.selectedType}?`)) {
      return;
    }

    const endpoint = this.selectedType === 'folder'
      ? `/api/folders/${this.selectedItem}`
      : `/api/files/${this.selectedItem}`;

    try {
      const response = await fetch(endpoint, { method: 'DELETE' });
      const data = await response.json();

      if (data.success) {
        this.loadFiles();
        this.loadStorageInfo();
        this.showToast('Deleted successfully', 'success');
      } else {
        this.showToast(data.error || 'Failed to delete', 'error');
      }
    } catch (error) {
      this.showToast('Connection error', 'error');
    }
  }

  openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
  }

  closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
  }

  closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(modal => {
      modal.classList.remove('active');
    });
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3000);
  }

  getFileIcon(mimeType) {
    if (!mimeType) mimeType = '';

    if (mimeType.startsWith('image/')) {
      return `<svg viewBox="0 0 24 24" fill="#4285f4"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>`;
    }
    if (mimeType.startsWith('video/')) {
      return `<svg viewBox="0 0 24 24" fill="#ea4335"><path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/></svg>`;
    }
    if (mimeType.startsWith('audio/')) {
      return `<svg viewBox="0 0 24 24" fill="#fbbc05"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`;
    }
    if (mimeType === 'application/pdf') {
      return `<svg viewBox="0 0 24 24" fill="#ea4335"><path d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8.5 7.5c0 .83-.67 1.5-1.5 1.5H9v2H7.5V7H10c.83 0 1.5.67 1.5 1.5v1zm5 2c0 .83-.67 1.5-1.5 1.5h-2.5V7H15c.83 0 1.5.67 1.5 1.5v3zm4-3H19v1h1.5V11H19v2h-1.5V7h3v1.5zM9 9.5h1v-1H9v1zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm10 5.5h1v-3h-1v3z"/></svg>`;
    }
    if (mimeType.startsWith('text/') || mimeType.includes('json') || mimeType.includes('javascript')) {
      return `<svg viewBox="0 0 24 24" fill="#4285f4"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>`;
    }
    if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('tar') || mimeType.includes('compressed')) {
      return `<svg viewBox="0 0 24 24" fill="#5f6368"><path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-2 6h-2v2h2v2h-2v2h-2v-2h2v-2h-2v-2h2v-2h-2V8h2v2h2v2z"/></svg>`;
    }
    // Default file icon
    return `<svg viewBox="0 0 24 24" fill="#5f6368"><path d="M6 2c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6H6zm7 7V3.5L18.5 9H13z"/></svg>`;
  }

  formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize app
const app = new DriveApp();
