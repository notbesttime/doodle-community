/* ================================================
   超级无敌:乱涂彩社区 - 应用逻辑 v3
   全面对接后端 API，替换所有 localStorage/mock 数据
   ================================================ */

const App = {
    state: {
        currentUser: null,
        authMode: 'register',
        inlineSearchType: 'post',
        currentView: 'community',
        posts: [],
        rankType: 'thanks',
        rankSearchType: 'nickname',
        selectedImages: [],
        currentPostDetail: null,
        messageFilter: 'all',
        theme: 'light',
        unreadMessages: { total: 0 },
    },

    // ===== 初始化 =====
    async init() {
        this.loadTheme();
        await this.restoreSession();
        await this.loadPosts();
        this.updateAuthUI();
        this.renderProfileCard();
        this.bindEvents();
        if (this.isLoggedIn()) {
            this.checkSignInStatus();
            this.loadUnreadCount();
        }
    },

    // ===== 主题 =====
    loadTheme() {
        const saved = localStorage.getItem('doodle-theme');
        if (saved) {
            this.state.theme = saved;
            document.documentElement.setAttribute('data-theme', saved);
        }
    },
    toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme') || 'light';
        const next = current === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', next);
        this.state.theme = next;
        localStorage.setItem('doodle-theme', next);
    },

    // ===== 会话（通过 token + API） =====
    async restoreSession() {
        if (!Api.token) return;
        try {
            const data = await Api.auth.me();
            this.state.currentUser = data.user;
        } catch(e) {
            Api.clearToken();
        }
    },
    isLoggedIn() { return !!this.state.currentUser; },
    clearSession() {
        this.state.currentUser = null;
        Api.clearToken();
    },

    // ===== 视图路由 =====
    go(view) {
        document.getElementById('mobile-menu').style.display = 'none';
        if (['messages', 'favorites', 'profile', 'post-editor'].includes(view) && !this.isLoggedIn()) {
            this.showToast('请先登录', 'info');
            this.openAuthModal();
            return;
        }
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        const el = document.getElementById('view-' + view);
        if (el) el.classList.add('active');

        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        const tab = document.querySelector(`.nav-tab[data-view="${view}"]`);
        if (tab) tab.classList.add('active');

        this.state.currentView = view;
        if (view === 'messages') this.loadMessages();
        if (view === 'favorites') this.loadFavorites();
        if (view === 'profile') this.loadProfile();
        if (view === 'rank-thanks') this.loadRankPage('thanks');
        if (view === 'rank-sponsor') this.loadRankPage('sponsor');
        if (view === 'rank-master') this.loadRankPage('master');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    toggleMobileMenu() {
        const menu = document.getElementById('mobile-menu');
        menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
    },

    // ===== 注册/登录 =====
    handleAvatarClick() {
        if (this.isLoggedIn()) { this.go('profile'); }
        else { this.openAuthModal(); }
    },

    openAuthModal() {
        this.state.authMode = 'register';
        this.switchAuthMode('register');
        document.getElementById('auth-username').value = '';
        document.getElementById('auth-password').value = '';
        document.getElementById('auth-confirm').value = '';
        document.getElementById('auth-hint').textContent = '';
        this.openModal('modal-auth');
    },

    switchAuthMode(mode) {
        this.state.authMode = mode;
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        const tab = document.querySelector(`.auth-tab[data-mode="${mode}"]`);
        if (tab) tab.classList.add('active');
        const submitBtn = document.getElementById('btn-auth-submit');
        const confirmGroup = document.getElementById('auth-confirm-group');
        const hint = document.getElementById('auth-hint');
        if (mode === 'register') {
            submitBtn.textContent = '注册';
            confirmGroup.style.display = 'flex';
        } else {
            submitBtn.textContent = '登录';
            confirmGroup.style.display = 'none';
        }
        hint.textContent = '';
    },

    async submitAuth() {
        const username = document.getElementById('auth-username').value.trim();
        const password = document.getElementById('auth-password').value;
        const confirm = document.getElementById('auth-confirm').value;
        const hint = document.getElementById('auth-hint');
        const submitBtn = document.getElementById('btn-auth-submit');

        if (!username || username.length < 3) { hint.textContent = '用户名至少3位'; return; }
        if (!/^[a-zA-Z0-9_]+$/.test(username)) { hint.textContent = '用户名只能包含字母、数字、下划线'; return; }
        if (password.length < 6) { hint.textContent = '密码至少6位'; return; }

        submitBtn.disabled = true;
        submitBtn.textContent = '处理中...';

        try {
            if (this.state.authMode === 'register') {
                if (password !== confirm) { hint.textContent = '两次密码不一致'; submitBtn.disabled = false; submitBtn.textContent = '注册'; return; }
                const data = await Api.auth.register(username, password, '');
                Api.setToken(data.token);
                this.state.currentUser = data.user;
                this.updateAuthUI();
                this.renderProfileCard();
                this.closeModal('modal-auth');
                this.showToast('注册成功！欢迎加入乱涂彩社区', 'success');
                await this.loadPosts();
                this.checkSignInStatus();
            } else {
                const data = await Api.auth.login(username, password);
                Api.setToken(data.token);
                this.state.currentUser = data.user;
                this.updateAuthUI();
                this.renderProfileCard();
                this.closeModal('modal-auth');
                this.showToast('登录成功！', 'success');
                await this.loadPosts();
                this.checkSignInStatus();
                this.loadUnreadCount();
            }
        } catch(e) {
            hint.textContent = e.message;
        }
        submitBtn.disabled = false;
        submitBtn.textContent = this.state.authMode === 'register' ? '注册' : '登录';
    },

    // 退出登录（带确认弹窗）
    logout() { this.openModal('modal-logout-confirm'); },
    async confirmLogout() {
        try { await Api.auth.logout(); } catch(e) {}
        this.clearSession();
        this.updateAuthUI();
        this.renderProfileCard();
        this.closeModal('modal-logout-confirm');
        this.go('community');
        this.showToast('已退出登录', 'info');
        await this.loadPosts();
    },

    // ===== 更新认证UI =====
    updateAuthUI() {
        const avatarBtn = document.getElementById('user-avatar-btn');
        if (this.isLoggedIn()) {
            const user = this.state.currentUser;
            if (user.avatar) {
                avatarBtn.innerHTML = `<img src="${user.avatar}" alt="avatar" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
            } else {
                avatarBtn.innerHTML = `<div style="width:100%;height:100%;border-radius:50%;background:var(--gradient-primary);display:flex;align-items:center;justify-content:center;color:white;font-weight:600;font-size:16px;">${user.nickname.charAt(0)}</div>`;
            }
        } else {
            avatarBtn.innerHTML = `
                <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="20" cy="20" r="19" fill="white" stroke="var(--color-purple)" stroke-width="1.5" opacity="0.3"/>
                    <circle cx="20" cy="16" r="6" fill="var(--color-purple)" opacity="0.2"/>
                    <path d="M8 34C8 28 13 24 20 24C27 24 32 28 32 34" fill="var(--color-purple)" opacity="0.2"/>
                </svg>
            `;
        }
    },

    // ===== B站风格用户卡片 =====
    renderProfileCard() {
        const card = document.getElementById('profile-card');
        if (this.isLoggedIn()) {
            const u = this.state.currentUser;
            const expForNext = u.level * 100;
            const expProgress = Math.min((u.exp / expForNext) * 100, 100);
            card.innerHTML = `
                <div class="pc-avatar">${u.avatar ? `<img src="${u.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">` : u.nickname.charAt(0)}</div>
                <span class="pc-nickname">${this.escape(u.nickname)}</span>
                <span class="pc-uid">UID: ${u.uid}</span>
                <div class="pc-exp-bar"><div class="pc-exp-fill" style="width:${expProgress}%"></div></div>
                <div class="pc-exp-text"><span>Lv.${u.level}</span><span>${u.exp}/${expForNext}</span></div>
                <div class="pc-stats">
                    <div class="pc-stat"><span class="pc-stat-value">${u.caps}</span><span class="pc-stat-label">瓶盖</span></div>
                    <div class="pc-stat"><span class="pc-stat-value">${u.followers || 0}</span><span class="pc-stat-label">粉丝</span></div>
                    <div class="pc-stat"><span class="pc-stat-value">${u.following || 0}</span><span class="pc-stat-label">关注</span></div>
                </div>
                <div class="pc-menu">
                    <button class="pc-menu-btn" onclick="App.go('profile')">
                        <svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M20 21V19C20 17.94 19.58 16.92 18.83 16.17C18.08 15.42 17.06 15 16 15H8C6.94 15 5.92 15.42 5.17 16.17C4.42 16.92 4 17.94 4 19V21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="7" r="4" stroke="currentColor" stroke-width="2"/></svg>
                        个人主页
                    </button>
                    <button class="pc-menu-btn danger" onclick="App.logout()">
                        <svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M9 21H5C4.47 21 3.96 20.79 3.59 20.41C3.21 20.04 3 19.53 3 19V5C3 4.47 3.21 3.96 3.59 3.59C3.96 3.21 4.47 3 5 3H9M16 17L21 12L16 7M21 12H9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        退出登录
                    </button>
                </div>
            `;
        } else {
            card.innerHTML = `
                <div class="pc-avatar">?</div>
                <span class="pc-nickname">未注册</span>
                <span class="pc-uid">登录后解锁更多功能</span>
                <button class="pc-login-btn" onclick="App.openAuthModal()">登录 / 注册</button>
            `;
        }
    },

    // ===== 签到 =====
    async doSignIn() {
        if (!this.isLoggedIn()) { this.showToast('请先登录', 'info'); this.openAuthModal(); return; }
        try {
            const data = await Api.community.signin();
            this.state.currentUser.exp = data.user.exp;
            this.state.currentUser.caps = data.user.caps;
            this.state.currentUser.level = data.user.level;
            this.renderProfileCard();
            document.getElementById('signin-exp').textContent = '+' + data.exp;
            document.getElementById('signin-caps').textContent = '+' + data.caps;
            this.openModal('modal-signin-success');
            const btn = document.getElementById('btn-sign-in');
            btn.classList.add('signed');
            btn.querySelector('span').textContent = '已签到';
        } catch(e) {
            this.showToast(e.message, 'info');
        }
    },
    async checkSignInStatus() {
        if (!this.isLoggedIn()) return;
        try {
            const data = await Api.community.signinStatus();
            const btn = document.getElementById('btn-sign-in');
            if (btn) {
                if (data.signedToday) {
                    btn.classList.add('signed');
                    btn.querySelector('span').textContent = '已签到';
                } else {
                    btn.classList.remove('signed');
                    btn.querySelector('span').textContent = '签到';
                }
            }
        } catch(e) {}
    },

    // ===== 页面内搜索（服务端搜索，带防抖） =====
    searchTimer: null,
    setInlineSearchType(type) {
        this.state.inlineSearchType = type;
        document.querySelectorAll('.search-type-inline').forEach(b => b.classList.remove('active'));
        document.querySelector(`.search-type-inline[data-type="${type}"]`).classList.add('active');
        const input = document.getElementById('search-inline-input');
        input.placeholder = type === 'post' ? '搜索帖子标题...' : '搜索用户昵称...';
        this.filterPostsInline(input.value);
    },
    filterPostsInline(query) {
        clearTimeout(this.searchTimer);
        this.searchTimer = setTimeout(() => this.loadPosts(query), 300);
    },

    // ===== 加载帖子列表（从后端） =====
    async loadPosts(search = '') {
        const list = document.getElementById('post-list');
        if (list) list.innerHTML = `<div class="empty-state"><p>加载中...</p></div>`;
        try {
            const data = await Api.posts.list(1, search, this.state.inlineSearchType);
            this.state.posts = data.posts;
            this.renderPosts();
        } catch(e) {
            if (list) list.innerHTML = `<div class="empty-state"><p>加载失败: ${e.message}</p></div>`;
        }
    },

    // ===== 发帖（独立页面） =====
    openPostEditor() {
        if (!this.isLoggedIn()) { this.showToast('请先登录', 'info'); this.openAuthModal(); return; }
        document.getElementById('post-title').value = '';
        document.getElementById('post-content').value = '';
        document.getElementById('post-images-preview').innerHTML = '';
        document.getElementById('post-video-url').value = '';
        document.getElementById('post-video-url').style.display = 'none';
        this.state.selectedImages = [];
        this.go('post-editor');
    },
    triggerImageUpload() { document.getElementById('post-images').click(); },
    handleImageSelect(event) {
        const files = Array.from(event.target.files);
        files.forEach(file => {
            if (file.size > 2 * 1024 * 1024) { this.showToast(`图片 "${file.name}" 超过2MB限制`, 'error'); return; }
            this.state.selectedImages.push(file);
            const reader = new FileReader();
            reader.onload = (e) => {
                const preview = document.getElementById('post-images-preview');
                const img = document.createElement('img');
                img.src = e.target.result;
                img.onclick = () => { img.remove(); this.state.selectedImages = this.state.selectedImages.filter(f => f.name !== file.name); };
                img.style.cursor = 'pointer';
                img.title = '点击移除';
                preview.appendChild(img);
            };
            reader.readAsDataURL(file);
        });
    },
    toggleVideoLink() {
        const input = document.getElementById('post-video-url');
        input.style.display = input.style.display === 'none' ? 'block' : 'none';
    },
    async submitPost() {
        const title = document.getElementById('post-title').value.trim();
        const content = document.getElementById('post-content').value.trim();
        if (!title) { this.showToast('请输入标题', 'error'); return; }
        if (!content) { this.showToast('请输入内容', 'error'); return; }

        const submitBtn = document.getElementById('btn-submit-post');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '发布中...'; }

        try {
            // 先上传图片
            const imageUrls = [];
            for (const file of this.state.selectedImages) {
                const uploadData = await Api.upload(file, 'post');
                imageUrls.push(uploadData.url);
            }

            const videoUrl = document.getElementById('post-video-url').value.trim();
            const data = await Api.posts.create({ title, content, images: imageUrls, videoUrl });

            // 更新本地用户数据
            if (data.user) {
                this.state.currentUser.exp = data.user.exp;
                this.state.currentUser.caps = data.user.caps;
                this.state.currentUser.level = data.user.level;
                this.renderProfileCard();
            }

            this.go('community');
            this.showToast(data.message || '发帖成功！经验+2 瓶盖+3', 'success');
            await this.loadPosts();
        } catch(e) {
            this.showToast(e.message, 'error');
        }
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '发布'; }
    },

    renderPosts() {
        const list = document.getElementById('post-list');
        if (!list) return;
        if (this.state.posts.length === 0) {
            list.innerHTML = `<div class="empty-state"><p>没有找到相关帖子</p></div>`;
            return;
        }
        list.innerHTML = this.state.posts.map(post => this.renderPostCard(post)).join('');
    },

    renderPostCard(post) {
        const initial = post.author.charAt(0);
        const imagesHtml = post.images && post.images.length > 0 ? `<div class="post-images-grid">${post.images.slice(0, 4).map(img => `<img class="post-image-thumb" src="${img}" alt="">`).join('')}</div>` : '';
        const videoHtml = post.videoUrl ? `<div class="post-video-embed"><iframe src="${this.convertVideoUrl(post.videoUrl)}" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true"></iframe></div>` : '';
        return `
            <div class="post-card" onclick="App.openPostDetail(${post.id})">
                <div class="post-card-header">
                    <div class="post-author-avatar">${initial}</div>
                    <div class="post-author-info">
                        <div class="post-author-name">${this.escape(post.author)}</div>
                        <div class="post-author-meta"><span class="post-level-badge">Lv.${post.authorLevel}</span><span>${post.createdAt}</span></div>
                    </div>
                </div>
                <h3 class="post-title">${this.escape(post.title)}</h3>
                <p class="post-content-preview">${this.escape(post.content)}</p>
                ${imagesHtml}${videoHtml}
                <div class="post-card-footer">
                    <span class="post-stat ${post.liked ? 'liked' : ''}" onclick="event.stopPropagation();App.toggleLike(${post.id}, this)">
                        <svg viewBox="0 0 24 24" fill="${post.liked ? 'currentColor' : 'none'}" width="18" height="18"><path d="M14 9V5C14 4.47 13.79 3.96 13.41 3.59C13.04 3.21 12.53 3 12 3L7 12V21H18.28C19.3 21 20.19 20.27 20.38 19.27L21.72 11.27C21.84 10.62 21.66 9.95 21.22 9.46C20.78 8.97 20.14 8.69 19.48 8.69H14M7 21H4C3.47 21 2.96 20.79 2.59 20.41C2.21 20.04 2 19.53 2 19V12C2 11.47 2.21 10.96 2.59 10.59C2.96 10.21 3.47 10 4 10H7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        <span class="stat-num">${post.likes}</span>
                    </span>
                    <span class="post-stat">
                        <svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M21 15C21 15.53 20.79 16.04 20.41 16.41C20.04 16.79 19.53 17 19 17H8L3 22V5C3 4.47 3.21 3.96 3.59 3.59C3.96 3.21 4.47 3 5 3H19C19.53 3 20.04 3.21 20.41 3.59C20.79 3.96 21 4.47 21 5V15Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        ${post.comments}
                    </span>
                    <span class="post-stat ${post.favorited ? 'favorited' : ''}" onclick="event.stopPropagation();App.toggleFavorite(${post.id}, this)">
                        <svg viewBox="0 0 24 24" fill="${post.favorited ? 'currentColor' : 'none'}" width="18" height="18"><path d="M19 21L12 16L5 21V5C5 4.47 5.21 3.96 5.59 3.59C5.96 3.21 6.47 3 7 3H17C17.53 3 18.04 3.21 18.41 3.59C18.79 3.96 19 4.47 19 5V21Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        <span class="stat-num">${post.favorites}</span>
                    </span>
                </div>
            </div>
        `;
    },

    // ===== 帖子详情（独立页面，从后端加载） =====
    async openPostDetail(id) {
        const page = document.getElementById('post-detail-page');
        page.innerHTML = `<div class="empty-state"><p>加载中...</p></div>`;
        this.go('post-detail');

        try {
            const post = await Api.posts.get(id);
            this.state.currentPostDetail = post;
            const commentsData = await Api.post.comments(id);
            const comments = commentsData.comments;

            const imagesHtml = post.images && post.images.length > 0 ? `<div class="post-detail-images">${post.images.map(img => `<img src="${img}" alt="" onclick="window.open('${img}')">`).join('')}</div>` : '';

            page.innerHTML = `
                <button class="post-detail-back" onclick="App.go('community')">
                    <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M19 12H5M12 19L5 12L12 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    返回社区
                </button>
                <div class="post-detail-header">
                    <div class="post-author-avatar">${post.author.charAt(0)}</div>
                    <div class="post-author-info">
                        <div class="post-author-name">${this.escape(post.author)}</div>
                        <div class="post-author-meta"><span class="post-level-badge">Lv.${post.authorLevel}</span><span>${post.createdAt}</span></div>
                    </div>
                </div>
                <h1 class="post-detail-title">${this.escape(post.title)}</h1>
                <div class="post-detail-content">${this.escape(post.content)}</div>
                ${imagesHtml}
                <div class="post-detail-actions">
                    <span class="post-stat ${post.liked ? 'liked' : ''}" id="detail-like-btn" onclick="App.toggleLike(${post.id}, this)">
                        <svg viewBox="0 0 24 24" fill="${post.liked ? 'currentColor' : 'none'}" width="20" height="20"><path d="M14 9V5C14 4.47 13.79 3.96 13.41 3.59C13.04 3.21 12.53 3 12 3L7 12V21H18.28C19.3 21 20.19 20.27 20.38 19.27L21.72 11.27C21.84 10.62 21.66 9.95 21.22 9.46C20.78 8.97 20.14 8.69 19.48 8.69H14M7 21H4C3.47 21 2.96 20.79 2.59 20.41C2.21 20.04 2 19.53 2 19V12C2 11.47 2.21 10.96 2.59 10.59C2.96 10.21 3.47 10 4 10H7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        <span class="stat-num">${post.likes}</span> 赞
                    </span>
                    <span class="post-stat">
                        <svg viewBox="0 0 24 24" fill="none" width="20" height="20"><path d="M21 15C21 15.53 20.79 16.04 20.41 16.41C20.04 16.79 19.53 17 19 17H8L3 22V5C3 4.47 3.21 3.96 3.59 3.59C3.96 3.21 4.47 3 5 3H19C19.53 3 20.04 3.21 20.41 3.59C20.79 3.96 21 4.47 21 5V15Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        <span id="detail-comment-count">${post.comments}</span> 评论
                    </span>
                    <span class="post-stat ${post.favorited ? 'favorited' : ''}" id="detail-fav-btn" onclick="App.toggleFavorite(${post.id}, this)">
                        <svg viewBox="0 0 24 24" fill="${post.favorited ? 'currentColor' : 'none'}" width="20" height="20"><path d="M19 21L12 16L5 21V5C5 4.47 5.21 3.96 5.59 3.59C5.96 3.21 6.47 3 7 3H17C17.53 3 18.04 3.21 18.41 3.59C18.79 3.96 19 4.47 19 5V21Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        <span class="stat-num">${post.favorites}</span> 收藏
                    </span>
                </div>
                <div class="comments-section">
                    <div class="comments-title">评论 (<span id="comment-count">${comments.length}</span>)</div>
                    <div id="comments-list">${comments.map(c => this.renderComment(c)).join('')}</div>
                    <div class="comment-input-area">
                        <input type="text" id="comment-input" placeholder="写评论...（经验+2 瓶盖+2）" onkeydown="if(event.key==='Enter')App.submitComment()">
                        <button class="btn-primary" style="padding:8px 20px;font-size:14px" onclick="App.submitComment()">发送</button>
                    </div>
                </div>
            `;
        } catch(e) {
            page.innerHTML = `<div class="empty-state"><p>加载失败: ${e.message}</p></div>`;
        }
    },

    renderComment(c) {
        return `
            <div class="comment-item">
                <div class="comment-avatar">${c.author.charAt(0)}</div>
                <div class="comment-body">
                    <div class="comment-header"><span class="comment-author">${this.escape(c.author)}</span><span class="comment-time">${c.time}</span></div>
                    <div class="comment-text">${this.escape(c.text)}</div>
                    <div class="comment-actions"><span class="comment-action" onclick="App.showToast('点赞+1','success')">点赞</span><span class="comment-action" onclick="App.showToast('回复功能开发中','info')">回复</span></div>
                </div>
            </div>
        `;
    },

    async submitComment() {
        if (!this.isLoggedIn()) { this.showToast('请先登录', 'info'); this.openAuthModal(); return; }
        const input = document.getElementById('comment-input');
        const text = input.value.trim();
        if (!text) return;
        const postId = this.state.currentPostDetail.id;

        try {
            const data = await Api.post.addComment(postId, text);
            const list = document.getElementById('comments-list');
            list.insertAdjacentHTML('beforeend', this.renderComment(data.comment));
            input.value = '';
            // 更新评论数
            const countEl = document.getElementById('comment-count');
            if (countEl) countEl.textContent = parseInt(countEl.textContent) + 1;
            const detailCountEl = document.getElementById('detail-comment-count');
            if (detailCountEl) detailCountEl.textContent = parseInt(detailCountEl.textContent) + 1;
            // 更新用户经验
            if (data.user) {
                this.state.currentUser.exp = data.user.exp;
                this.state.currentUser.caps = data.user.caps;
                this.state.currentUser.level = data.user.level;
                this.renderProfileCard();
            }
            this.showToast(data.message || '评论成功！经验+2 瓶盖+2', 'success');
        } catch(e) {
            this.showToast(e.message, 'error');
        }
    },

    // ===== 点赞（带特效+API同步） =====
    async toggleLike(id, el) {
        if (!this.isLoggedIn()) { this.showToast('请先登录', 'info'); this.openAuthModal(); return; }
        const post = this.state.posts.find(p => p.id === id) || this.state.currentPostDetail;
        if (!post) return;

        const wasLiked = post.liked;
        // 乐观更新
        post.liked = !wasLiked;
        post.likes += wasLiked ? -1 : 1;
        this.updateLikeUI(el, post);

        try {
            const data = wasLiked ? await Api.post.unlike(id) : await Api.post.like(id);
            post.likes = data.likes;
            post.liked = data.liked;
            this.updateLikeUI(el, post);
            // 同步详情页按钮
            const detailBtn = document.getElementById('detail-like-btn');
            if (detailBtn && detailBtn !== el) this.updateLikeUI(detailBtn, post);
            if (!wasLiked) {
                if (data.user) {
                    this.state.currentUser.exp = data.user.exp;
                    this.state.currentUser.level = data.user.level;
                    this.renderProfileCard();
                }
                this.spawnHeartParticles(el);
            }
        } catch(e) {
            // 回滚
            post.liked = wasLiked;
            post.likes += wasLiked ? 1 : -1;
            this.updateLikeUI(el, post);
            this.showToast(e.message, 'error');
        }
    },
    updateLikeUI(el, post) {
        const svg = el.querySelector('svg');
        const num = el.querySelector('.stat-num');
        if (svg) svg.setAttribute('fill', post.liked ? 'currentColor' : 'none');
        el.classList.toggle('liked', post.liked);
        if (num) num.textContent = post.likes;
    },

    spawnHeartParticles(el) {
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        for (let i = 0; i < 5; i++) {
            const p = document.createElement('div');
            p.className = 'heart-particle';
            p.textContent = '♥';
            p.style.left = cx + 'px';
            p.style.top = cy + 'px';
            p.style.setProperty('--px', (Math.random() * 60 - 30) + 'px');
            p.style.animationDelay = (i * 0.05) + 's';
            document.body.appendChild(p);
            setTimeout(() => p.remove(), 1100);
        }
    },

    async toggleFavorite(id, el) {
        if (!this.isLoggedIn()) { this.showToast('请先登录', 'info'); this.openAuthModal(); return; }
        const post = this.state.posts.find(p => p.id === id) || this.state.currentPostDetail;
        if (!post) return;

        const wasFav = post.favorited;
        post.favorited = !wasFav;
        post.favorites += wasFav ? -1 : 1;

        try {
            const data = wasFav ? await Api.post.unfavorite(id) : await Api.post.favorite(id);
            post.favorites = data.favorites;
            post.favorited = data.favorited;
            const svg = el.querySelector('svg');
            const num = el.querySelector('.stat-num');
            if (svg) svg.setAttribute('fill', post.favorited ? 'currentColor' : 'none');
            el.classList.toggle('favorited', post.favorited);
            if (num) num.textContent = post.favorites;
            // 同步详情页
            const detailBtn = document.getElementById('detail-fav-btn');
            if (detailBtn && detailBtn !== el) {
                const dSvg = detailBtn.querySelector('svg');
                const dNum = detailBtn.querySelector('.stat-num');
                if (dSvg) dSvg.setAttribute('fill', post.favorited ? 'currentColor' : 'none');
                detailBtn.classList.toggle('favorited', post.favorited);
                if (dNum) dNum.textContent = post.favorites;
            }
            if (!wasFav) {
                if (data.user) {
                    this.state.currentUser.exp = data.user.exp;
                    this.state.currentUser.level = data.user.level;
                    this.renderProfileCard();
                }
                this.showToast('收藏成功！经验+1', 'success');
            } else {
                this.showToast('已取消收藏', 'info');
            }
        } catch(e) {
            post.favorited = wasFav;
            post.favorites += wasFav ? 1 : -1;
            this.showToast(e.message, 'error');
        }
    },

    // ===== 消息 =====
    async loadMessages() {
        const list = document.getElementById('message-list');
        if (list) list.innerHTML = `<div class="empty-state"><p>加载中...</p></div>`;
        try {
            const data = await Api.messages.list('all', false);
            const messages = data.messages;
            if (messages.length === 0) {
                list.innerHTML = `<div class="empty-state"><p>暂无消息</p></div>`;
                return;
            }
            list.innerHTML = messages.map(m => `
                <div class="message-item ${m.unread ? 'unread' : ''}" data-type="${m.type}">
                    <div class="message-avatar">${m.sender.charAt(0)}</div>
                    <div class="message-content">
                        <div class="message-sender">${this.escape(m.sender)}</div>
                        <div class="message-text">${this.escape(m.text)}</div>
                        <div class="message-time">${m.time}</div>
                    </div>
                </div>
            `).join('');
            // 更新未读计数
            this.updateMessageBadge(data.unread);
        } catch(e) {
            list.innerHTML = `<div class="empty-state"><p>加载失败</p></div>`;
        }
    },
    async loadUnreadCount() {
        try {
            const data = await Api.messages.list('all', true);
            this.updateMessageBadge(data.unread);
        } catch(e) {}
    },
    updateMessageBadge(unread) {
        this.state.unreadMessages = unread;
        const badge = document.getElementById('message-badge');
        if (badge) {
            if (unread.total > 0) {
                badge.textContent = unread.total > 99 ? '99+' : unread.total;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }
    },
    filterMessages(type) {
        document.querySelectorAll('.msg-tab').forEach(t => t.classList.remove('active'));
        document.querySelector(`.msg-tab[data-type="${type}"]`).classList.add('active');
        this.state.messageFilter = type;
        document.querySelectorAll('.message-item').forEach(item => {
            if (type === 'all' || item.dataset.type === type) item.style.display = 'flex';
            else item.style.display = 'none';
        });
    },
    openMessageSettings() { this.showToast('消息设置功能开发中', 'info'); },

    // ===== 收藏 =====
    async loadFavorites() {
        const list = document.getElementById('favorite-list');
        if (list) list.innerHTML = `<div class="empty-state"><p>加载中...</p></div>`;
        try {
            const data = await Api.user.favorites();
            if (data.posts.length === 0) {
                list.innerHTML = `<div class="empty-state"><p>还没有收藏任何帖子</p></div>`;
            } else {
                this.state.posts = data.posts;
                list.innerHTML = data.posts.map(p => this.renderPostCard(p)).join('');
            }
        } catch(e) {
            list.innerHTML = `<div class="empty-state"><p>加载失败</p></div>`;
        }
    },

    // ===== 个人主页 =====
    async loadProfile() {
        const user = this.state.currentUser;
        if (!user) return;
        const container = document.getElementById('profile-container');
        container.innerHTML = `<div class="empty-state"><p>加载中...</p></div>`;

        try {
            const data = await Api.user.profile();
            const expForNext = data.level * 100;
            const expProgress = Math.min((data.exp / expForNext) * 100, 100);
            container.innerHTML = `
                <div class="profile-header">
                    <div class="profile-avatar-large">${data.avatar ? `<img src="${data.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">` : data.nickname.charAt(0)}</div>
                    <div class="profile-nickname">${this.escape(data.nickname)}</div>
                    <div class="profile-uid">UID: ${data.uid} · @${data.username}</div>
                    <div class="profile-signature">${this.escape(data.signature)}</div>
                    <div class="exp-bar-container">
                        <div class="exp-bar-info"><span>Lv.${data.level}</span><span>${data.exp}/${expForNext}</span></div>
                        <div class="exp-bar"><div class="exp-bar-fill" style="width:${expProgress}%"></div></div>
                    </div>
                    <div class="profile-stats">
                        <div class="profile-stat"><div class="profile-stat-value">${data.caps}</div><div class="profile-stat-label">瓶盖</div></div>
                        <div class="profile-stat"><div class="profile-stat-value">${data.followers || 0}</div><div class="profile-stat-label">粉丝</div></div>
                        <div class="profile-stat"><div class="profile-stat-value">${data.following || 0}</div><div class="profile-stat-label">关注</div></div>
                        <div class="profile-stat"><div class="profile-stat-value">${data.postCount}</div><div class="profile-stat-label">发帖</div></div>
                    </div>
                    <button class="profile-edit-btn" onclick="App.openEditProfile()">编辑资料</button>
                    <button class="profile-edit-btn" onclick="App.logout()">退出登录</button>
                </div>
                <div class="profile-tabs">
                    <button class="profile-tab active" onclick="App.switchProfileTab('posts')">我的发帖</button>
                    <button class="profile-tab" onclick="App.switchProfileTab('comments')">我的评论</button>
                    <button class="profile-tab" onclick="App.switchProfileTab('favorites')">我的收藏</button>
                </div>
                <div class="post-list" id="profile-post-list">
                    <div class="empty-state"><p>点击上方标签查看</p></div>
                </div>
            `;
        } catch(e) {
            container.innerHTML = `<div class="empty-state"><p>加载失败</p></div>`;
        }
    },
    async switchProfileTab(tab) {
        document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
        event.target.classList.add('active');
        const list = document.getElementById('profile-post-list');
        list.innerHTML = `<div class="empty-state"><p>加载中...</p></div>`;
        try {
            if (tab === 'favorites') {
                const data = await Api.user.favorites();
                list.innerHTML = data.posts.length > 0 ? data.posts.map(p => this.renderPostCard(p)).join('') : '<div class="empty-state"><p>还没有收藏帖子</p></div>';
            } else if (tab === 'posts') {
                const data = await Api.posts.list(1, this.state.currentUser.nickname, 'user');
                list.innerHTML = data.posts.length > 0 ? data.posts.map(p => this.renderPostCard(p)).join('') : '<div class="empty-state"><p>还没有发过帖子</p></div>';
            } else {
                list.innerHTML = '<div class="empty-state"><p>评论功能开发中</p></div>';
            }
        } catch(e) {
            list.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
        }
    },
    openEditProfile() {
        const user = this.state.currentUser;
        const newNickname = prompt('输入新昵称（首次免费，后续5瓶盖/次）：', user.nickname);
        if (newNickname && newNickname.trim() && newNickname !== user.nickname) {
            this.doRename(newNickname.trim());
        }
    },
    async doRename(newNickname) {
        try {
            const data = await Api.user.rename(newNickname);
            this.state.currentUser.nickname = data.nickname;
            this.state.currentUser.caps = data.caps;
            this.state.currentUser.rename_count = data.renameCount;
            this.updateAuthUI();
            this.renderProfileCard();
            this.showToast(data.message, 'success');
            this.loadProfile();
        } catch(e) {
            this.showToast(e.message, 'error');
        }
    },

    // ===== 排行榜（独立页面） =====
    async loadRankPage(type) {
        this.state.rankType = type;
        const titles = { thanks: '鸣谢榜', sponsor: '赞助榜', master: '大神榜' };
        const page = document.getElementById('rank-page');
        page.innerHTML = `
            <div class="rank-page-header">
                <h1 class="rank-page-title">${titles[type]}</h1>
                <div class="rank-page-actions">
                    <button class="btn-rank-action" onclick="App.openRankMethod('${type}')">
                        <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M12 16V12M12 8H12.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                        入榜方式
                    </button>
                </div>
            </div>
            <div class="rank-search-inline">
                <svg viewBox="0 0 24 24" fill="none" width="18" height="18"><circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2"/><path d="M21 21L16.65 16.65" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                <input type="text" placeholder="搜索昵称..." oninput="App.filterRank(this.value, '${type}')">
            </div>
            <div class="rank-list" id="rank-list">
                <div class="empty-state"><p>加载中...</p></div>
            </div>
        `;
        await this.loadRankData(type, '');
    },
    async loadRankData(type, search) {
        const list = document.getElementById('rank-list');
        try {
            const data = await Api.ranks.list(type);
            const entries = search ? data.entries.filter(e => e.nickname.includes(search)) : data.entries;
            if (entries.length === 0) {
                list.innerHTML = `<div class="empty-state"><p>暂无人上榜，快来申请吧~</p></div>`;
            } else {
                list.innerHTML = entries.map(e => `
                    <div class="rank-item">
                        <div class="rank-number">${e.rank}</div>
                        <div class="rank-avatar">${e.nickname.charAt(0)}</div>
                        <div class="rank-info">
                            <div class="rank-name">${this.escape(e.nickname)}</div>
                            <div class="rank-meta"><span class="rank-server">&lt;${e.server || 'Q80区'}&gt;</span> ${this.escape(e.signature || '')}</div>
                        </div>
                    </div>
                `).join('');
            }
        } catch(e) {
            list.innerHTML = `<div class="empty-state"><p>加载失败</p></div>`;
        }
    },
    filterRank(query, type) {
        this.loadRankData(type, query);
    },

    openRankMethod(type) {
        const titles = { thanks: '鸣谢榜', sponsor: '赞助榜', master: '大神榜' };
        const body = document.getElementById('rank-method-body');
        const methods = {
            thanks: `
                <h3 style="font-family:var(--font-heading);font-size:20px;margin-bottom:var(--space-lg)">${titles.thanks} · 入榜方式</h3>
                <div class="rank-method-content">
                    <div class="rank-method-item">
                        <h4>方式一：游戏成就</h4>
                        <p>Q80区内玩家通关所有主线剧情且在世界频道发送"一路向北最厉害啦~"，发送相关截图到xingguang2482@outlook.com或80区QQ群:453862830中，我们将在1-3个工作日内开放权限；</p>
                    </div>
                    <div class="rank-method-item">
                        <h4>方式二：赞助支持</h4>
                        <p>v我0.91，赞助记录发送至同上两种途径即可，感谢您喵~</p>
                    </div>
                </div>
            `,
            sponsor: `
                <h3 style="font-family:var(--font-heading);font-size:20px;margin-bottom:var(--space-lg)">${titles.sponsor} · 入榜方式</h3>
                <div class="rank-method-content">
                    <div class="rank-method-item">
                        <h4>赞助说明</h4>
                        <p>如果您愿意为我们的网站开发维护包括后续的更换更优秀的服务器做出贡献，您将会成为我们的衣食父母!赞助超过2.99元并赞助记录发送至xingguang2482@outlook.com或80区QQ群:453862830中，我们将立即、马上为您开通vvvvvip大道。（注意排行榜按照赞助排名来）</p>
                    </div>
                    <div class="qr-codes">
                        <div class="qr-code-item">
                            <img src="assets/sponsor/alipay.jpg" alt="支付宝收款码">
                            <span>支付宝</span>
                        </div>
                        <div class="qr-code-item">
                            <img src="assets/sponsor/wechat.jpg" alt="微信收款码">
                            <span>微信</span>
                        </div>
                    </div>
                </div>
            `,
            master: `
                <h3 style="font-family:var(--font-heading);font-size:20px;margin-bottom:var(--space-lg)">${titles.master} · 入榜方式</h3>
                <div class="rank-method-content">
                    <div class="rank-method-item">
                        <h4>方式一：Q80区通关</h4>
                        <p>通关Q80区所有主线剧情，并在世界频道发送"一路向北最厉害啦~"，截图提交给管理员审核。</p>
                    </div>
                    <div class="rank-method-item">
                        <h4>方式二：成就达成</h4>
                        <p>达成特定游戏成就（如全角色收集、无伤通关等），提交截图证明。</p>
                    </div>
                    <div class="rank-method-item">
                        <h4>注意</h4>
                        <p>大神榜由管理员人工审核，确保真实性。提交时请附上游戏UID和截图，发送至xingguang2482@outlook.com或80区QQ群:453862830。</p>
                    </div>
                </div>
            `,
        };
        body.innerHTML = methods[type];
        this.openModal('modal-rank-method');
    },

    // ===== 开发说明 =====
    openDevNotes() { this.openModal('modal-dev-notes'); },

    // ===== 弹窗管理 =====
    openModal(id) {
        const el = document.getElementById(id);
        if (el) { el.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
    },
    closeModal(id) {
        const el = document.getElementById(id);
        if (el) { el.style.display = 'none'; document.body.style.overflow = ''; }
    },

    // ===== Toast =====
    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = 'toast ' + type;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 2800);
    },

    // ===== 工具方法 =====
    escape(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },
    convertVideoUrl(url) {
        if (url.includes('bilibili.com/video/')) {
            const match = url.match(/bilibili\.com\/video\/(BV\w+)/);
            if (match) return `https://player.bilibili.com/player.html?bvid=${match[1]}&high_quality=1`;
        }
        return url;
    },
    loadMorePosts() { this.showToast('没有更多帖子了', 'info'); },

    // ===== 事件绑定 =====
    bindEvents() {
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) { overlay.style.display = 'none'; document.body.style.overflow = ''; }
            });
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal-overlay').forEach(o => {
                    if (o.style.display !== 'none' && o.id !== 'modal-auth') {
                        o.style.display = 'none'; document.body.style.overflow = '';
                    }
                });
            }
        });
    },
};

document.addEventListener('DOMContentLoaded', () => App.init());
