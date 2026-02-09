// Admin Content Dashboard

class AdminContentDashboard {
  constructor() {
    this.contentPage = 1;
    this.postsPage = 1;
    this.init();
  }

  async init() {
    try {
      await this.checkAuth();
      this.bindEvents();
      await Promise.all([
        this.loadStats(),
        this.loadContent(),
        this.loadPosts(),
        this.loadUsers()
      ]);
    } catch (error) {
      console.error('[AdminContent] Init error:', error);
    }
  }

  async checkAuth() {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (!res.ok || !data.isAdmin) {
      window.location.href = '/login';
    }
  }

  bindEvents() {
    // Export
    document.getElementById('btnExport').addEventListener('click', () => this.exportExcel());

    // Content filters
    let searchDebounce;
    document.getElementById('filterSearch').addEventListener('input', (e) => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => { this.contentPage = 1; this.loadContent(); }, 300);
    });
    document.getElementById('filterUser').addEventListener('change', () => { this.contentPage = 1; this.loadContent(); });
    document.getElementById('filterCat').addEventListener('change', () => { this.contentPage = 1; this.loadContent(); });

    // Posts filter
    document.getElementById('filterPostStatus').addEventListener('change', () => { this.postsPage = 1; this.loadPosts(); });
  }

  async loadStats() {
    try {
      const res = await fetch('/api/admin-content/stats');
      const data = await res.json();
      if (!data.success) return;

      const s = data.stats;
      document.getElementById('statUsers').textContent = s.totalUsers;
      document.getElementById('statContent').textContent = s.totalContent;
      document.getElementById('statPosts').textContent = s.totalPosts;
      document.getElementById('statFollows').textContent = s.totalFollows;

      // Status chart
      const statusLabels = Object.keys(s.statusCounts);
      const statusData = Object.values(s.statusCounts);
      const statusColors = {
        draft: '#9e9e9e',
        hidden: '#ea4335',
        done: '#34a853',
        posted: '#4285f4'
      };

      if (typeof Chart !== 'undefined') {
        new Chart(document.getElementById('statusChart'), {
          type: 'doughnut',
          data: {
            labels: statusLabels,
            datasets: [{
              data: statusData,
              backgroundColor: statusLabels.map(l => statusColors[l] || '#999')
            }]
          },
          options: {
            responsive: true,
            plugins: { legend: { position: 'bottom' } }
          }
        });

        // Users chart
        if (s.topUsers && s.topUsers.length > 0) {
          new Chart(document.getElementById('usersChart'), {
            type: 'bar',
            data: {
              labels: s.topUsers.map(u => u.username),
              datasets: [{
                label: 'Total Posts',
                data: s.topUsers.map(u => u.totalPosts),
                backgroundColor: '#4285f4'
              }]
            },
            options: {
              responsive: true,
              plugins: { legend: { display: false } },
              scales: { y: { beginAtZero: true } }
            }
          });
        }
      }

      // Recent posts
      const recentList = document.getElementById('recentPostsList');
      if (s.recentPosts && s.recentPosts.length > 0) {
        recentList.innerHTML = s.recentPosts.map(p => `
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-color);font-size:13px;">
            <span><strong>${this.escapeHtml(p.content_id?.content_name || 'Unknown')}</strong> #${p.post_number}</span>
            <span style="color:var(--text-secondary);">${p.owner?.username || ''} - ${new Date(p.createdAt).toLocaleDateString()}</span>
          </div>
        `).join('');
      } else {
        recentList.innerHTML = '<div style="padding:12px;color:var(--text-secondary);font-size:13px;">No recent posts</div>';
      }

      // Categories for filter
      if (s.categoryCounts) {
        const catSelect = document.getElementById('filterCat');
        s.categoryCounts.forEach(c => {
          const opt = document.createElement('option');
          opt.value = c._id;
          opt.textContent = `${c._id} (${c.count})`;
          catSelect.appendChild(opt);
        });
      }
    } catch (error) {
      console.error('[AdminContent] Load stats error:', error);
    }
  }

  async loadUsers() {
    try {
      const res = await fetch('/api/admin-content/users');
      const data = await res.json();
      if (data.success) {
        const select = document.getElementById('filterUser');
        data.users.forEach(u => {
          const opt = document.createElement('option');
          opt.value = u._id;
          opt.textContent = u.username;
          select.appendChild(opt);
        });
      }
    } catch(e) {}
  }

  async loadContent() {
    const search = document.getElementById('filterSearch').value;
    const userId = document.getElementById('filterUser').value;
    const category = document.getElementById('filterCat').value;

    let url = `/api/admin-content/content?page=${this.contentPage}&limit=15`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (userId) url += `&userId=${userId}`;
    if (category) url += `&category=${encodeURIComponent(category)}`;

    try {
      const res = await fetch(url);
      const data = await res.json();
      if (!data.success) return;

      const tbody = document.getElementById('contentTableBody');
      if (data.contents.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-secondary);">No content found</td></tr>';
      } else {
        tbody.innerHTML = data.contents.map(c => `
          <tr>
            <td><strong>${this.escapeHtml(c.content_name)}</strong></td>
            <td>${this.escapeHtml(c.owner?.username || 'Unknown')}</td>
            <td>${this.escapeHtml(c.category || '-')}</td>
            <td>${c.post_count || 0}</td>
            <td>${(c.collaborators || []).filter(x => x.status === 'accepted').length}</td>
            <td>${c.is_public ? '<span class="badge badge-success">Yes</span>' : 'No'}</td>
            <td>${c.updatedAt ? new Date(c.updatedAt).toLocaleDateString() : '-'}</td>
          </tr>
        `).join('');
      }

      this.renderPagination('contentPagination', data.pagination, (page) => {
        this.contentPage = page;
        this.loadContent();
      });
    } catch (error) {
      console.error('[AdminContent] Load content error:', error);
    }
  }

  async loadPosts() {
    const status = document.getElementById('filterPostStatus').value;
    let url = `/api/admin-content/posts?page=${this.postsPage}&limit=15`;
    if (status) url += `&status=${status}`;

    try {
      const res = await fetch(url);
      const data = await res.json();
      if (!data.success) return;

      const tbody = document.getElementById('postsTableBody');
      if (data.posts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-secondary);">No posts found</td></tr>';
      } else {
        tbody.innerHTML = data.posts.map(p => `
          <tr>
            <td>${this.escapeHtml(p.content_id?.content_name || 'Unknown')}</td>
            <td>#${p.post_number}</td>
            <td>${this.escapeHtml(p.owner?.username || 'Unknown')}</td>
            <td>${this.escapeHtml(p.uploaded_by?.username || '-')}</td>
            <td><span class="ac-status ac-status-${p.status}">${p.status}</span></td>
            <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${this.escapeHtml(p.text_content?.hook || '-')}</td>
            <td>${p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '-'}</td>
          </tr>
        `).join('');
      }

      this.renderPagination('postsPagination', data.pagination, (page) => {
        this.postsPage = page;
        this.loadPosts();
      });
    } catch (error) {
      console.error('[AdminContent] Load posts error:', error);
    }
  }

  renderPagination(containerId, pagination, onClick) {
    const container = document.getElementById(containerId);
    if (!pagination || pagination.pages <= 1) {
      container.innerHTML = '';
      return;
    }

    let html = '';
    for (let i = 1; i <= pagination.pages; i++) {
      if (i === 1 || i === pagination.pages || Math.abs(i - pagination.page) <= 2) {
        html += `<button class="ac-page-btn ${i === pagination.page ? 'active' : ''}" data-page="${i}">${i}</button>`;
      } else if (Math.abs(i - pagination.page) === 3) {
        html += '<span>...</span>';
      }
    }

    container.innerHTML = html;
    container.querySelectorAll('.ac-page-btn').forEach(btn => {
      btn.addEventListener('click', () => onClick(parseInt(btn.dataset.page)));
    });
  }

  async exportExcel() {
    const userId = document.getElementById('filterUser').value;
    const category = document.getElementById('filterCat').value;
    const status = document.getElementById('filterPostStatus').value;

    let url = '/api/admin-content/export?';
    const params = [];
    if (userId) params.push(`userId=${userId}`);
    if (category) params.push(`category=${encodeURIComponent(category)}`);
    if (status) params.push(`status=${status}`);
    url += params.join('&');

    this.showToast('Generating export...', 'info');
    window.open(url, '_blank');
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

new AdminContentDashboard();
