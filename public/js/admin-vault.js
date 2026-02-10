class AdminVaultApp {
  constructor() {
    this.services = [];
    this.groups = [];
    this.credentials = [];
    this.users = [];
    this.init();
  }

  async init() {
    await this.checkAuth();
    this.bindEvents();
    await this.loadAll();
  }

  async checkAuth() {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (!res.ok || !data.isAdmin) window.location.href = '/login';
      document.getElementById('userName').textContent = data.username || 'Admin';
    } catch { window.location.href = '/login'; }
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

    // Logout
    document.getElementById('btnLogout').addEventListener('click', async () => {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/login';
    });

    // Tabs
    document.querySelectorAll('.av-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.av-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.av-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`panel-${tab.dataset.tab}`).classList.add('active');
      });
    });

    // Add buttons
    document.getElementById('btnAddService').addEventListener('click', () => this.openServiceModal());
    document.getElementById('btnAddGroup').addEventListener('click', () => this.openGroupModal());
    document.getElementById('btnAddCredential').addEventListener('click', () => this.openCredentialModal());

    // Save buttons
    document.getElementById('saveService').addEventListener('click', () => this.saveService());
    document.getElementById('saveGroup').addEventListener('click', () => this.saveGroup());
    document.getElementById('saveCredential').addEventListener('click', () => this.saveCredential());
    document.getElementById('confirmAddMember').addEventListener('click', () => this.addMember());
    document.getElementById('addExtraField').addEventListener('click', () => this.addExtraFieldRow());

    // Modal close on overlay
    document.querySelectorAll('.modal-overlay').forEach(o => {
      o.addEventListener('click', (e) => { if (e.target === o) o.classList.remove('active'); });
    });
  }

  async loadAll() {
    try {
      const [svc, grp, cred, usr] = await Promise.all([
        fetch('/api/admin/vault/services').then(r => r.json()),
        fetch('/api/admin/vault/groups').then(r => r.json()),
        fetch('/api/admin/vault/credentials').then(r => r.json()),
        fetch('/api/admin/vault/users').then(r => r.json())
      ]);
      this.services = svc;
      this.groups = grp;
      this.credentials = cred;
      this.users = usr;
      this.renderServices();
      this.renderGroups();
      this.renderCredentials();
    } catch (error) {
      this.showToast('Failed to load data', 'error');
    }
  }

  // ========== Services ==========
  renderServices() {
    document.getElementById('servicesCount').textContent = `${this.services.length} service(s)`;
    const container = document.getElementById('servicesList');
    if (this.services.length === 0) {
      container.innerHTML = '<p style="text-align:center; padding:40px; color:var(--text-secondary);">No services yet</p>';
      return;
    }
    container.innerHTML = this.services.map(s => `
      <div class="av-card">
        <div class="av-card-header">
          <span class="av-card-title">${this.esc(s.icon || '🔑')} ${this.esc(s.name)}</span>
          <div class="av-card-actions">
            <button class="btn btn-sm btn-secondary" onclick="avApp.openServiceModal('${s._id}')">Edit</button>
            <button class="btn btn-sm btn-danger" onclick="avApp.deleteService('${s._id}')">Delete</button>
          </div>
        </div>
        ${s.guide_text ? `<div class="av-card-meta" style="white-space:pre-line;">${this.esc(s.guide_text).substring(0, 200)}${s.guide_text.length > 200 ? '...' : ''}</div>` : ''}
      </div>
    `).join('');
  }

  openServiceModal(id) {
    const s = id ? this.services.find(x => x._id === id) : null;
    document.getElementById('serviceEditId').value = id || '';
    document.getElementById('serviceModalTitle').textContent = s ? 'Edit Service' : 'Add Service';
    document.getElementById('serviceName').value = s?.name || '';
    document.getElementById('serviceIcon').value = s?.icon || '';
    document.getElementById('serviceGuide').value = s?.guide_text || '';
    this.openModal('serviceModal');
  }

  async saveService() {
    const id = document.getElementById('serviceEditId').value;
    const body = {
      name: document.getElementById('serviceName').value.trim(),
      icon: document.getElementById('serviceIcon').value.trim(),
      guide_text: document.getElementById('serviceGuide').value
    };
    if (!body.name) return this.showToast('Name is required', 'error');

    try {
      const url = id ? `/api/admin/vault/services/${id}` : '/api/admin/vault/services';
      const method = id ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      this.showToast(id ? 'Service updated' : 'Service created', 'success');
      this.closeModal('serviceModal');
      await this.loadAll();
    } catch (error) {
      this.showToast(error.message, 'error');
    }
  }

  async deleteService(id) {
    if (!confirm('Delete this service?')) return;
    try {
      const res = await fetch(`/api/admin/vault/services/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      this.showToast('Service deleted', 'success');
      await this.loadAll();
    } catch (error) {
      this.showToast(error.message, 'error');
    }
  }

  // ========== Groups ==========
  renderGroups() {
    document.getElementById('groupsCount').textContent = `${this.groups.length} group(s)`;
    const container = document.getElementById('groupsList');
    if (this.groups.length === 0) {
      container.innerHTML = '<p style="text-align:center; padding:40px; color:var(--text-secondary);">No groups yet</p>';
      return;
    }
    container.innerHTML = this.groups.map(g => `
      <div class="av-card">
        <div class="av-card-header">
          <span class="av-card-title">${this.esc(g.name)}</span>
          <div class="av-card-actions">
            <button class="btn btn-sm btn-primary" onclick="avApp.openAddMemberModal('${g._id}')">+ Member</button>
            <button class="btn btn-sm btn-secondary" onclick="avApp.openGroupModal('${g._id}')">Edit</button>
            <button class="btn btn-sm btn-danger" onclick="avApp.deleteGroup('${g._id}')">Delete</button>
          </div>
        </div>
        ${g.description ? `<div class="av-card-meta">${this.esc(g.description)}</div>` : ''}
        <div class="av-members">
          ${g.members.map(m => `
            <span class="av-member-chip">
              ${this.esc(m.user_id?.username || 'Unknown')}
              <span class="remove" onclick="avApp.removeMember('${g._id}', '${m.user_id?._id}')">&times;</span>
            </span>
          `).join('')}
          ${g.members.length === 0 ? '<span style="font-size:13px; color:var(--text-secondary);">No members</span>' : ''}
        </div>
      </div>
    `).join('');
  }

  openGroupModal(id) {
    const g = id ? this.groups.find(x => x._id === id) : null;
    document.getElementById('groupEditId').value = id || '';
    document.getElementById('groupModalTitle').textContent = g ? 'Edit Group' : 'Add Group';
    document.getElementById('groupName').value = g?.name || '';
    document.getElementById('groupDescription').value = g?.description || '';
    this.openModal('groupModal');
  }

  async saveGroup() {
    const id = document.getElementById('groupEditId').value;
    const body = {
      name: document.getElementById('groupName').value.trim(),
      description: document.getElementById('groupDescription').value.trim()
    };
    if (!body.name) return this.showToast('Name is required', 'error');

    try {
      const url = id ? `/api/admin/vault/groups/${id}` : '/api/admin/vault/groups';
      const method = id ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      this.showToast(id ? 'Group updated' : 'Group created', 'success');
      this.closeModal('groupModal');
      await this.loadAll();
    } catch (error) {
      this.showToast(error.message, 'error');
    }
  }

  async deleteGroup(id) {
    if (!confirm('Delete this group? Credentials shared with this group will lose access.')) return;
    try {
      const res = await fetch(`/api/admin/vault/groups/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      this.showToast('Group deleted', 'success');
      await this.loadAll();
    } catch (error) {
      this.showToast(error.message, 'error');
    }
  }

  openAddMemberModal(groupId) {
    document.getElementById('addMemberGroupId').value = groupId;
    const group = this.groups.find(g => g._id === groupId);
    const memberIds = (group?.members || []).map(m => m.user_id?._id);
    const select = document.getElementById('addMemberSelect');
    select.innerHTML = '<option value="">Select a user...</option>' +
      this.users.filter(u => !memberIds.includes(u._id)).map(u =>
        `<option value="${u._id}">${this.esc(u.username)}</option>`
      ).join('');
    this.openModal('addMemberModal');
  }

  async addMember() {
    const groupId = document.getElementById('addMemberGroupId').value;
    const userId = document.getElementById('addMemberSelect').value;
    if (!userId) return this.showToast('Select a user', 'error');

    try {
      const res = await fetch(`/api/admin/vault/groups/${groupId}/members`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      this.showToast('Member added', 'success');
      this.closeModal('addMemberModal');
      await this.loadAll();
    } catch (error) {
      this.showToast(error.message, 'error');
    }
  }

  async removeMember(groupId, userId) {
    if (!confirm('Remove this member?')) return;
    try {
      const res = await fetch(`/api/admin/vault/groups/${groupId}/members/${userId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      this.showToast('Member removed', 'success');
      await this.loadAll();
    } catch (error) {
      this.showToast(error.message, 'error');
    }
  }

  // ========== Credentials ==========
  renderCredentials() {
    document.getElementById('credentialsCount').textContent = `${this.credentials.length} credential(s)`;
    const container = document.getElementById('adminCredentialsList');
    if (this.credentials.length === 0) {
      container.innerHTML = '<p style="text-align:center; padding:40px; color:var(--text-secondary);">No credentials yet</p>';
      return;
    }
    container.innerHTML = this.credentials.map(c => {
      const statusClass = c.status === 'active' ? 'vault-status-active' :
                          c.status === 'error' ? 'vault-status-error' : 'vault-status-inactive';

      const unresolvedErrors = (c.error_reports || []).filter(r => !r.resolved);

      return `
        <div class="av-card">
          <div class="av-card-header">
            <span class="av-card-title">
              ${this.esc(c.service_id?.icon || '🔑')} ${this.esc(c.service_id?.name || 'Unknown')} - ${this.esc(c.label)}
            </span>
            <div class="av-card-actions">
              <span class="vault-status-badge ${statusClass}">${c.status}</span>
              <button class="btn btn-sm btn-secondary" onclick="avApp.openCredentialModal('${c._id}')">Edit</button>
              <button class="btn btn-sm btn-danger" onclick="avApp.deleteCredential('${c._id}')">Delete</button>
            </div>
          </div>
          <div class="av-card-meta">Username: <strong>${this.esc(c.credentials?.username || '-')}</strong></div>
          ${(c.credentials?.extra_fields || []).length > 0 ? `
            <div class="av-card-meta" style="margin-top:4px;">
              Extra: ${c.credentials.extra_fields.map(f => `<strong>${this.esc(f.key)}</strong>: ${this.esc(f.value)}`).join(', ')}
            </div>
          ` : ''}
          <div class="av-sharing" style="margin-top:8px;">
            ${(c.shared_with_users || []).map(u => `<span class="av-share-chip user">${this.esc(u.username || 'Unknown')}</span>`).join('')}
            ${(c.shared_with_groups || []).map(g => `<span class="av-share-chip group">${this.esc(g.name || 'Unknown')}</span>`).join('')}
            ${(c.shared_with_users || []).length === 0 && (c.shared_with_groups || []).length === 0 ? '<span style="font-size:12px; color:var(--text-secondary);">Not shared</span>' : ''}
          </div>
          ${unresolvedErrors.length > 0 ? `
            <div class="av-error-reports">
              <strong style="font-size:13px; color:var(--danger-color);">Error Reports (${unresolvedErrors.length}):</strong>
              ${unresolvedErrors.map((r, i) => {
                const realIdx = c.error_reports.indexOf(r);
                return `
                  <div class="av-error-item">
                    <span>${this.esc(r.reported_by?.username || 'Unknown')}: ${this.esc(r.message)}</span>
                    <button class="btn btn-sm btn-secondary" onclick="avApp.resolveError('${c._id}', ${realIdx})">Resolve</button>
                  </div>
                `;
              }).join('')}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  openCredentialModal(id) {
    const c = id ? this.credentials.find(x => x._id === id) : null;
    document.getElementById('credentialEditId').value = id || '';
    document.getElementById('credentialModalTitle').textContent = c ? 'Edit Credential' : 'Add Credential';

    // Populate service dropdown
    const svcSelect = document.getElementById('credService');
    svcSelect.innerHTML = this.services.map(s =>
      `<option value="${s._id}" ${c?.service_id?._id === s._id ? 'selected' : ''}>${this.esc(s.icon || '')} ${this.esc(s.name)}</option>`
    ).join('');

    document.getElementById('credLabel').value = c?.label || '';
    document.getElementById('credUsername').value = c?.credentials?.username || '';
    document.getElementById('credPassword').value = '';
    document.getElementById('credStatus').value = c?.status || 'active';
    document.getElementById('credNotes').value = c?.notes || '';

    // Populate share users
    const userSelect = document.getElementById('credShareUsers');
    const sharedUserIds = (c?.shared_with_users || []).map(u => u._id);
    userSelect.innerHTML = this.users.map(u =>
      `<option value="${u._id}" ${sharedUserIds.includes(u._id) ? 'selected' : ''}>${this.esc(u.username)}</option>`
    ).join('');

    // Populate share groups
    const groupSelect = document.getElementById('credShareGroups');
    const sharedGroupIds = (c?.shared_with_groups || []).map(g => g._id);
    groupSelect.innerHTML = this.groups.map(g =>
      `<option value="${g._id}" ${sharedGroupIds.includes(g._id) ? 'selected' : ''}>${this.esc(g.name)}</option>`
    ).join('');

    // Extra fields
    const container = document.getElementById('extraFieldsContainer');
    container.innerHTML = '';
    (c?.credentials?.extra_fields || []).forEach(f => this.addExtraFieldRow(f.key, f.value));

    this.openModal('credentialModal');
  }

  addExtraFieldRow(key = '', value = '') {
    const container = document.getElementById('extraFieldsContainer');
    const row = document.createElement('div');
    row.className = 'av-extra-field-row';
    row.innerHTML = `
      <input type="text" placeholder="Field name" value="${this.esc(key)}" class="ef-key">
      <input type="text" placeholder="Value" value="${this.esc(value)}" class="ef-value">
      <button type="button" class="btn btn-sm btn-danger" onclick="this.parentElement.remove()">X</button>
    `;
    container.appendChild(row);
  }

  async saveCredential() {
    const id = document.getElementById('credentialEditId').value;
    const extraFields = [];
    document.querySelectorAll('.av-extra-field-row').forEach(row => {
      const key = row.querySelector('.ef-key').value.trim();
      const value = row.querySelector('.ef-value').value.trim();
      if (key) extraFields.push({ key, value });
    });

    const body = {
      service_id: document.getElementById('credService').value,
      label: document.getElementById('credLabel').value.trim(),
      username: document.getElementById('credUsername').value.trim(),
      extra_fields: extraFields,
      shared_with_users: Array.from(document.getElementById('credShareUsers').selectedOptions).map(o => o.value),
      shared_with_groups: Array.from(document.getElementById('credShareGroups').selectedOptions).map(o => o.value),
      status: document.getElementById('credStatus').value,
      notes: document.getElementById('credNotes').value.trim()
    };

    const password = document.getElementById('credPassword').value;
    if (password || !id) {
      body.password = password;
    }

    if (!body.service_id || !body.label) return this.showToast('Service and label are required', 'error');

    try {
      const url = id ? `/api/admin/vault/credentials/${id}` : '/api/admin/vault/credentials';
      const method = id ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      this.showToast(id ? 'Credential updated' : 'Credential created', 'success');
      this.closeModal('credentialModal');
      await this.loadAll();
    } catch (error) {
      this.showToast(error.message, 'error');
    }
  }

  async deleteCredential(id) {
    if (!confirm('Delete this credential?')) return;
    try {
      const res = await fetch(`/api/admin/vault/credentials/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      this.showToast('Credential deleted', 'success');
      await this.loadAll();
    } catch (error) {
      this.showToast(error.message, 'error');
    }
  }

  async resolveError(credId, idx) {
    try {
      const res = await fetch(`/api/admin/vault/credentials/${credId}/resolve-error/${idx}`, { method: 'PATCH' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      this.showToast('Error resolved', 'success');
      await this.loadAll();
    } catch (error) {
      this.showToast(error.message, 'error');
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

  esc(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }
}

const avApp = new AdminVaultApp();
