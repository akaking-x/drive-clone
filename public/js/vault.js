class VaultApp {
  constructor() {
    this.credentials = [];
    this.services = [];
    this.currentFilter = 'all';
    this.reportingCredentialId = null;
    this.init();
  }

  async init() {
    await this.checkAuth();
    this.bindEvents();
    await this.loadData();
  }

  async checkAuth() {
    try {
      const response = await fetch('/api/auth/me');
      const data = await response.json();
      if (!response.ok) {
        window.location.href = '/login';
        return;
      }
      this.user = data;
      document.getElementById('userName').textContent = data.username || 'Người dùng';
      if (data.isAdmin) {
        document.getElementById('navAdmin').style.display = '';
        document.getElementById('navAdminVault').style.display = '';
      }
    } catch (error) {
      window.location.href = '/login';
    }
  }

  bindEvents() {
    // Sidebar toggle (mobile)
    document.getElementById('menuToggle').addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('open');
      document.getElementById('sidebarOverlay').classList.toggle('active');
    });
    document.getElementById('sidebarOverlay').addEventListener('click', () => {
      document.getElementById('sidebar').classList.remove('open');
      document.getElementById('sidebarOverlay').classList.remove('active');
    });

    // Sidebar filter clicks
    document.querySelectorAll('.vault-nav-item[data-filter]').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        this.setFilter(item.dataset.filter);
        this.closeSidebar();
      });
    });

    // Logout
    document.getElementById('btnLogout').addEventListener('click', async () => {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/login';
    });

    // Report modal
    document.getElementById('closeReportModal').addEventListener('click', () => this.closeModal('reportModal'));
    document.getElementById('cancelReport').addEventListener('click', () => this.closeModal('reportModal'));
    document.getElementById('submitReport').addEventListener('click', () => this.submitReport());

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.remove('active');
      });
    });
  }

  closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('active');
  }

  async loadData() {
    try {
      const [credRes, svcRes] = await Promise.all([
        fetch('/api/vault/credentials'),
        fetch('/api/vault/services')
      ]);
      this.credentials = await credRes.json();
      this.services = await svcRes.json();
      this.buildServiceNav();
      this.renderCredentials();
    } catch (error) {
      this.showToast('Không thể tải dữ liệu', 'error');
    }
  }

  buildServiceNav() {
    const container = document.getElementById('serviceNavItems');
    // Get services that have credentials shared with user
    const serviceIds = [...new Set(this.credentials.map(c => c.service_id?._id).filter(Boolean))];
    const usedServices = this.services.filter(s => serviceIds.includes(s._id));

    container.innerHTML = usedServices.map(s => `
      <a href="#" class="vault-nav-item" data-filter="${s._id}">
        <span style="font-size:18px;">${this.escapeHtml(s.icon || '🔑')}</span>
        ${this.escapeHtml(s.name)}
      </a>
    `).join('');

    // Rebind click events for dynamic items
    container.querySelectorAll('.vault-nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        this.setFilter(item.dataset.filter);
        this.closeSidebar();
      });
    });
  }

  setFilter(filter) {
    this.currentFilter = filter;
    document.querySelectorAll('.vault-nav-item').forEach(n => n.classList.remove('active'));
    const active = document.querySelector(`.vault-nav-item[data-filter="${filter}"]`);
    if (active) active.classList.add('active');

    if (filter === 'all') {
      document.getElementById('pageTitle').textContent = 'Tất cả tài khoản';
    } else {
      const svc = this.services.find(s => s._id === filter);
      document.getElementById('pageTitle').textContent = svc ? svc.name : 'Tài khoản';
    }

    this.renderCredentials();
  }

  renderCredentials() {
    const container = document.getElementById('credentialsList');
    let creds = this.credentials;

    if (this.currentFilter !== 'all') {
      creds = creds.filter(c => c.service_id?._id === this.currentFilter);
    }

    if (creds.length === 0) {
      container.innerHTML = `
        <div class="vault-empty">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
          <p>Chưa có tài khoản nào được chia sẻ cho bạn</p>
        </div>
      `;
      return;
    }

    // Group by service if showing all
    if (this.currentFilter === 'all') {
      const grouped = {};
      creds.forEach(c => {
        const svcId = c.service_id?._id || 'unknown';
        if (!grouped[svcId]) grouped[svcId] = { service: c.service_id, creds: [] };
        grouped[svcId].creds.push(c);
      });

      container.innerHTML = Object.values(grouped).map(group => `
        <div class="vault-service-section">
          <div class="vault-service-title">
            <span class="vault-service-icon">${this.escapeHtml(group.service?.icon || '🔑')}</span>
            ${this.escapeHtml(group.service?.name || 'Dịch vụ không xác định')}
          </div>
          ${group.creds.map(c => this.renderCard(c)).join('')}
          ${group.service?.guide_text ? this.renderGuide(group.service.guide_text, group.service._id) : ''}
        </div>
      `).join('');
    } else {
      const svc = this.services.find(s => s._id === this.currentFilter);
      container.innerHTML = `
        <div class="vault-service-section">
          ${creds.map(c => this.renderCard(c)).join('')}
          ${svc?.guide_text ? this.renderGuide(svc.guide_text, svc._id) : ''}
        </div>
      `;
    }
  }

  renderCard(cred) {
    const statusMap = { active: 'Hoạt động', error: 'Lỗi', inactive: 'Tạm ngưng' };
    const statusClass = cred.status === 'active' ? 'vault-status-active' :
                        cred.status === 'error' ? 'vault-status-error' : 'vault-status-inactive';
    const statusLabel = statusMap[cred.status] || cred.status;

    const extraFields = (cred.credentials?.extra_fields || []).map(f => `
      <div class="vault-field">
        <span class="vault-field-label">${this.escapeHtml(f.key)}</span>
        <span class="vault-field-value">${this.escapeHtml(f.value)}</span>
        <div class="vault-field-actions">
          <button class="vault-btn-icon" onclick="vault.copyText('${this.escapeAttr(f.value)}')" title="Sao chép">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
        </div>
      </div>
    `).join('');

    return `
      <div class="vault-card" data-id="${cred._id}">
        <div class="vault-card-header">
          <span class="vault-card-label">${this.escapeHtml(cred.label)}</span>
          <span class="vault-status-badge ${statusClass}">${statusLabel}</span>
        </div>
        <div class="vault-field">
          <span class="vault-field-label">Tài khoản</span>
          <span class="vault-field-value">${this.escapeHtml(cred.credentials?.username || '')}</span>
          <div class="vault-field-actions">
            <button class="vault-btn-icon" onclick="vault.copyText('${this.escapeAttr(cred.credentials?.username || '')}')" title="Sao chép tài khoản">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
          </div>
        </div>
        <div class="vault-field">
          <span class="vault-field-label">Mật khẩu</span>
          <span class="vault-field-value" id="pwd-${cred._id}">••••••••</span>
          <div class="vault-field-actions">
            <button class="vault-btn-icon" onclick="vault.togglePassword('${cred._id}')" title="Hiện mật khẩu" id="pwd-toggle-${cred._id}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </button>
            <button class="vault-btn-icon" onclick="vault.copyPassword('${cred._id}')" title="Sao chép mật khẩu">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
          </div>
        </div>
        ${extraFields}
        ${cred.notes ? `<p style="font-size:13px; color:var(--text-secondary); margin-top:8px;">${this.escapeHtml(cred.notes)}</p>` : ''}
        <div class="vault-card-footer">
          <button class="vault-btn-report" onclick="vault.openReport('${cred._id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            Báo lỗi
          </button>
        </div>
      </div>
    `;
  }

  renderGuide(text, serviceId) {
    const html = this.escapeHtml(text)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
    const guideId = `guide-${serviceId || 'default'}`;
    return `
      <button class="vault-guide-toggle" onclick="vault.toggleGuide('${guideId}', this)">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>
        Hướng dẫn sử dụng
      </button>
      <div class="vault-guide-body" id="${guideId}">
        <div class="vault-guide-content">${html}</div>
      </div>
    `;
  }

  toggleGuide(id, btn) {
    const body = document.getElementById(id);
    if (!body) return;
    const isOpen = body.classList.toggle('open');
    btn.classList.toggle('open', isOpen);
  }

  async togglePassword(credId) {
    const el = document.getElementById(`pwd-${credId}`);
    if (el.dataset.visible === 'true') {
      el.textContent = '••••••••';
      el.dataset.visible = 'false';
      return;
    }

    try {
      const response = await fetch(`/api/vault/credentials/${credId}/password`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      el.textContent = data.password;
      el.dataset.visible = 'true';
      // Auto-hide after 10 seconds
      setTimeout(() => {
        el.textContent = '••••••••';
        el.dataset.visible = 'false';
      }, 10000);
    } catch (error) {
      this.showToast(error.message || 'Không thể lấy mật khẩu', 'error');
    }
  }

  async copyPassword(credId) {
    try {
      const response = await fetch(`/api/vault/credentials/${credId}/password`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      this.clipboardWrite(data.password);
      this.showToast('Đã sao chép mật khẩu', 'success');
    } catch (error) {
      this.showToast(error.message || 'Không thể sao chép mật khẩu', 'error');
    }
  }

  copyText(text) {
    this.clipboardWrite(text);
    this.showToast('Đã sao chép', 'success');
  }

  clipboardWrite(text) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text);
      return;
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }

  openReport(credId) {
    this.reportingCredentialId = credId;
    document.getElementById('reportMessage').value = '';
    document.getElementById('reportModal').classList.add('active');
  }

  async submitReport() {
    const message = document.getElementById('reportMessage').value.trim();
    if (!this.reportingCredentialId) return;

    try {
      const response = await fetch(`/api/vault/credentials/${this.reportingCredentialId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message || 'Tài khoản không hoạt động' })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      this.showToast('Đã gửi báo lỗi thành công', 'success');
      this.closeModal('reportModal');
      await this.loadData();
    } catch (error) {
      this.showToast(error.message || 'Không thể gửi báo lỗi', 'error');
    }
  }

  openModal(id) { document.getElementById(id).classList.add('active'); }
  closeModal(id) { document.getElementById(id).classList.remove('active'); }

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  escapeAttr(text) {
    return (text || '').replace(/'/g, "\\'").replace(/"/g, '\\"');
  }
}

const vault = new VaultApp();
