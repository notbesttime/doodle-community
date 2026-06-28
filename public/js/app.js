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
        sortMode: 'hot', // hot | latest
        posts: [],
        currentPage: 1,
        hasMorePosts: false,
        rankType: 'thanks',
        rankSearchType: 'nickname',
        selectedImages: [],
        currentPostDetail: null,
        messageFilter: 'all',
        theme: 'light',
        unreadMessages: { total: 0 },
        feedUnread: 0,
        replyTo: null,
        followViewTarget: null, // 粉丝/关注列表的目标用户
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
        if (['following', 'messages', 'favorites', 'profile', 'post-editor'].includes(view) && !this.isLoggedIn()) {
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
        if (view === 'community') this.loadPosts();
        if (view === 'following') this.loadFollowingFeed();
        if (view === 'messages') this.loadMessages();
        if (view === 'favorites') this.loadFavorites();
        if (view === 'profile') { this.loadProfile().then(() => this.loadTasks()); }
        if (view === 'follow-list') this.loadFollowList();
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
        document.getElementById('auth-captcha').value = '';
        document.getElementById('captcha-id').value = '';
        document.getElementById('auth-hint').textContent = '';
        this.openModal('modal-auth');
        this.loadCaptcha();
    },

    switchAuthMode(mode) {
        this.state.authMode = mode;
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        const tab = document.querySelector(`.auth-tab[data-mode="${mode}"]`);
        if (tab) tab.classList.add('active');
        const submitBtn = document.getElementById('btn-auth-submit');
        const confirmGroup = document.getElementById('auth-confirm-group');
        const captchaGroup = document.getElementById('auth-captcha-group');
        const hint = document.getElementById('auth-hint');
        if (mode === 'register') {
            submitBtn.textContent = '注册';
            confirmGroup.style.display = 'flex';
            captchaGroup.classList.add('visible');
            this.loadCaptcha();
        } else {
            submitBtn.textContent = '登录';
            confirmGroup.style.display = 'none';
            captchaGroup.classList.remove('visible');
        }
        hint.textContent = '';
    },

    async loadCaptcha() {
        const questionEl = document.getElementById('captcha-question');
        const idEl = document.getElementById('captcha-id');
        const inputEl = document.getElementById('auth-captcha');
        try {
            const data = await Api.request('/auth/captcha');
            questionEl.textContent = data.question || '';
            questionEl.style.display = data.question ? 'inline-flex' : 'none';
            idEl.value = data.captchaId || '';
            inputEl.value = '';
        } catch(e) {
            questionEl.textContent = '加载失败';
            questionEl.style.display = 'inline-flex';
            idEl.value = '';
        }
    },

    refreshCaptcha() {
        const btn = document.getElementById('btn-captcha-refresh');
        if (btn) {
            btn.disabled = true;
            btn.style.transform = 'rotate(180deg)';
            setTimeout(() => { btn.style.transform = ''; }, 300);
        }
        this.loadCaptcha().finally(() => {
            if (btn) btn.disabled = false;
        });
    },

    async submitAuth() {
        const username = document.getElementById('auth-username').value.trim();
        const password = document.getElementById('auth-password').value;
        const confirm = document.getElementById('auth-confirm').value;
        const captchaId = document.getElementById('captcha-id').value;
        const captchaAnswer = document.getElementById('auth-captcha').value;
        const hint = document.getElementById('auth-hint');
        const submitBtn = document.getElementById('btn-auth-submit');

        if (!username || username.length < 10 || username.length > 16) { hint.textContent = '用户名长度需10-16位'; return; }
        if (!/^[a-zA-Z0-9_]+$/.test(username)) { hint.textContent = '用户名只能包含字母、数字、下划线'; return; }
        if (password.length < 6) { hint.textContent = '密码至少6位'; return; }

        submitBtn.disabled = true;
        submitBtn.textContent = '处理中...';

        try {
            if (this.state.authMode === 'register') {
                if (password !== confirm) { hint.textContent = '两次密码不一致'; submitBtn.disabled = false; submitBtn.textContent = '注册'; return; }
                if (!captchaId) { hint.textContent = '验证码未加载，请刷新'; submitBtn.disabled = false; submitBtn.textContent = '注册'; return; }
                const data = await Api.auth.register(username, password, '', captchaId, captchaAnswer);
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
            if (this.state.authMode === 'register') {
                this.loadCaptcha();
            }
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
            const expForNext = u.expToNext || (u.level < 30 ? Math.floor(2.5 * u.level * u.level + 10 * u.level) : u.exp);
            const expProgress = u.level >= 30 ? 100 : Math.min((u.exp / expForNext) * 100, 100);
            const levelColor = u.levelColor || '#FFFFFF';
            const levelClass = u.level >= 25 ? 'level-rainbow' : '';
            card.innerHTML = `
                <div class="pc-avatar">${u.avatar ? `<img src="${u.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">` : u.nickname.charAt(0)}</div>
                <span class="pc-nickname">${this.escape(u.nickname)}</span>
                <span class="pc-uid">UID: ${u.uid}</span>
                <div class="pc-level-badge ${levelClass}" style="--level-color: ${levelColor}">Lv.${u.level}</div>
                <div class="pc-exp-bar"><div class="pc-exp-fill" style="width:${expProgress}%;"></div></div>
                <div class="pc-exp-text"><span>经验</span><span>${u.exp}/${u.level >= 30 ? '∞' : expForNext}</span></div>
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
            const data = await Api.posts.list(1, search, this.state.inlineSearchType, this.state.sortMode);
            this.state.posts = data.posts;
            this.state.currentPage = 1;
            this.state.hasMorePosts = data.hasMore;
            this.renderPosts();
            this.updateLoadMoreBtn();
        } catch(e) {
            if (list) list.innerHTML = `<div class="empty-state"><p>加载失败: ${e.message}</p></div>`;
        }
    },

    // ===== 切换排序模式 =====
    setSortMode(mode) {
        this.state.sortMode = mode;
        document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
        const btn = document.querySelector(`.sort-btn[data-mode="${mode}"]`);
        if (btn) btn.classList.add('active');
        this.loadPosts(document.getElementById('search-inline-input') ? document.getElementById('search-inline-input').value.trim() : '');
    },

    updateLoadMoreBtn() {
        const btn = document.getElementById('load-more');
        if (btn) {
            btn.style.display = this.state.hasMorePosts ? 'block' : 'none';
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
        const followBtn = this.isLoggedIn() && post.authorId !== this.state.currentUser.id ? `<button class="follow-btn-sm ${post.isFollowing ? 'following' : ''}" onclick="event.stopPropagation();App.toggleFollow(${post.authorId}, this)">${post.isFollowing ? '已关注' : '+ 关注'}</button>` : '';
        const newBadge = post.isNew ? '<span class="new-badge">新</span>' : '';
        const tipBtn = this.isLoggedIn() && post.authorId !== this.state.currentUser.id ? `<span class="post-stat tip-btn ${post.tipped ? 'tipped' : ''}" onclick="event.stopPropagation();App.openTipModal(${post.id}, ${post.tipped || false}, ${post.tips || 0})"><span class="tip-circle">盖</span><span class="stat-num">${post.tips || 0}</span></span>` : `<span class="post-stat tip-btn tipped"><span class="tip-circle">盖</span><span class="stat-num">${post.tips || 0}</span></span>`;
        return `
            <div class="post-card" onclick="App.openPostDetail(${post.id})">
                <div class="post-card-header">
                    <div class="post-author-avatar">${initial}</div>
                    <div class="post-author-info">
                        <div class="post-author-name">${this.escape(post.author)} ${newBadge}</div>
                        <div class="post-author-meta"><span class="post-level-badge" style="--badge-color:${post.levelColor || '#6C5CE7'}">Lv.${post.authorLevel}</span><span>${post.createdAt}</span></div>
                    </div>
                    ${followBtn}
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
                    ${tipBtn}
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
                    ${this.isLoggedIn() && post.authorId !== this.state.currentUser.id ? `<button class="follow-btn-sm ${post.isFollowing ? 'following' : ''}" onclick="App.toggleFollow(${post.authorId}, this)">${post.isFollowing ? '已关注' : '+ 关注'}</button>` : ''}
                </div>
                <h1 class="post-detail-title">${this.escape(post.title)}</h1>
                <div class="post-detail-content">${this.escape(post.content).replace(/\n/g, '<br>')}</div>
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
                    <span class="post-stat tip-btn ${post.tipped ? 'tipped' : ''}" id="detail-tip-btn" onclick="App.openTipModal(${post.id}, ${post.tipped || false}, ${post.tips || 0})">
                        <span class="tip-circle">盖</span>
                        <span class="stat-num">${post.tips || 0}</span> 盖
                    </span>
                    <span class="post-stat report-btn" id="report-post-${post.id}" onclick="App.reportTarget('post', ${post.id}, this)" title="举报">
                        <svg viewBox="0 0 24 24" fill="none" width="20" height="20"><path d="M12 8V12M12 16H12.01M20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12C4 7.58172 7.58172 4 12 4C16.4183 4 20 7.58172 20 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 16H12.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        举报
                    </span>
                </div>
                ${post.authorId === (this.state.currentUser ? this.state.currentUser.id : 0) || (this.state.currentUser && this.state.currentUser.role === 'admin') ? `
                <div class="post-owner-actions">
                    <button class="post-owner-btn" onclick="App.editPost(${post.id})">✏️ 编辑</button>
                    <button class="post-owner-btn" onclick="App.togglePrivacy(${post.id})">${post.isPrivate ? '🔓 设为公开' : '🔒 设为私密'}</button>
                    <button class="post-owner-btn btn-danger-text" onclick="App.deletePost(${post.id})">🗑️ 删除</button>
                </div>
                ` : ''}
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
        // 软删除评论显示"该评论已删除"
        if (c.isDeleted) {
            return `
                <div class="comment-item comment-deleted" id="comment-${c.id}">
                    <div class="comment-avatar" style="opacity:0.3">-</div>
                    <div class="comment-body">
                        <div class="comment-text" style="color:#999;font-style:italic;">该评论已删除</div>
                    </div>
                </div>
            `;
        }
        const isOwner = this.state.currentUser && (this.state.currentUser.id === c.authorId || this.state.currentUser.role === 'admin');
        return `
            <div class="comment-item" id="comment-${c.id}">
                <div class="comment-avatar">${c.author.charAt(0)}</div>
                <div class="comment-body">
                    <div class="comment-header"><span class="comment-author">${this.escape(c.author)}</span><span class="comment-time">${c.time}</span></div>
                    ${c.parentId ? `<div class="comment-reply-to">回复 #${c.parentId}</div>` : ''}
                    <div class="comment-text">${this.escape(c.text)}</div>
                    <div class="comment-actions">
                        <span class="comment-action ${c.liked ? 'liked' : ''}" onclick="App.toggleCommentLike(${c.id}, this)">
                            ❤️ <span class="cl-count">${c.likesCount || 0}</span>
                        </span>
                        <span class="comment-action" onclick="App.replyComment(${c.id}, '${this.escape(c.author)}')">💬 回复</span>
                        <span class="comment-action report-btn-small" onclick="App.reportTarget('comment', ${c.id}, this)" title="举报">⚠️</span>
                        ${isOwner ? `<span class="comment-action" style="color:#e74c3c" onclick="App.deleteComment(${c.id})">🗑️</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    },

    async submitComment() {
        if (!this.isLoggedIn()) { this.showToast('请先登录', 'info'); this.openAuthModal(); return; }
        if (this._commenting) return;
        const input = document.getElementById('comment-input');
        const text = input.value.trim();
        if (!text) return;
        const postId = this.state.currentPostDetail.id;
        const parentId = this.state.replyTo || 0;

        this._commenting = true;
        const btn = document.querySelector('[onclick="App.submitComment()"]');
        if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }
        try {
            const data = await Api.post.addComment(postId, text, parentId);
            const list = document.getElementById('comments-list');
            list.insertAdjacentHTML('beforeend', this.renderComment(data.comment));
            input.value = '';
            this.state.replyTo = null;
            const hint = document.getElementById('reply-hint');
            if (hint) hint.remove();
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
        } finally {
            this._commenting = false;
            if (btn) { btn.disabled = false; btn.style.opacity = ''; }
        }
    },

    // ===== 评论点赞 =====
    async toggleCommentLike(id, el) {
        if (!this.isLoggedIn()) { this.showToast('请先登录', 'info'); this.openAuthModal(); return; }
        try {
            const data = await Api.comment.like(id);
            if (el) {
                el.classList.toggle('liked', data.liked);
                const countSpan = el.querySelector('.cl-count');
                if (countSpan) countSpan.textContent = parseInt(countSpan.textContent) + (data.liked ? 1 : -1);
            }
            this.showToast(data.message, 'success');
        } catch(e) { this.showToast(e.message, 'error'); }
    },

    // ===== 回复评论 =====
    replyComment(commentId, authorName) {
        const input = document.getElementById('comment-input');
        if (!input) return;
        input.value = `@${authorName} `;
        input.focus();
        // 存储回复目标，提交时带上 parentId
        this.state.replyTo = commentId;
        // 加一个提示标签
        let hint = document.getElementById('reply-hint');
        if (!hint) {
            hint = document.createElement('div');
            hint.id = 'reply-hint';
            hint.style.cssText = 'font-size:12px;color:#6C5CE7;padding:4px 0;display:flex;justify-content:space-between;';
            input.parentNode.insertBefore(hint, input);
        }
        hint.innerHTML = `<span>回复 @${this.escape(authorName)}</span><span style="cursor:pointer;color:#999" onclick="App.cancelReply()">取消回复</span>`;
    },

    cancelReply() {
        this.state.replyTo = null;
        const hint = document.getElementById('reply-hint');
        if (hint) hint.remove();
        const input = document.getElementById('comment-input');
        if (input) input.value = '';
    },

    // ===== 举报 =====
    async reportTarget(type, targetId, el) {
        if (!this.isLoggedIn()) { this.showToast('请先登录', 'info'); this.openAuthModal(); return; }
        // 检查是否已举报（变红=已举报）
        if (el && el.classList.contains('reported')) {
            // 已举报，点击取消
            if (!confirm('您已举报过该内容，要取消举报吗？')) return;
            try {
                await Api.report.cancel(type, targetId);
                el.classList.remove('reported');
                this.showToast('已取消举报', 'info');
            } catch(e) { this.showToast(e.message, 'error'); }
            return;
        }
        try {
            const data = await Api.post.report ? 
                (type === 'post' ? await Api.post.report(targetId) : await Api.comment.report(targetId)) :
                await (type === 'post' ? Api.post.report(targetId) : Api.comment.report(targetId));
            if (el) el.classList.add('reported');
            this.showToast('举报成功，感谢您为社区做出的贡献！', 'success');
        } catch(e) {
            if (e.message.includes('已举报')) {
                if (el) el.classList.add('reported');
                this.showToast('您已举报过该内容', 'info');
            } else {
                this.showToast(e.message, 'error');
            }
        }
    },

    // ===== 删除评论 =====
    async deleteComment(id) {
        if (!confirm('确定删除这条评论？')) return;
        try {
            const data = await Api.comment.delete(id);
            const el = document.getElementById('comment-' + id);
            if (el) el.remove();
            // 更新评论数
            const countEl = document.getElementById('comment-count');
            if (countEl) countEl.textContent = Math.max(0, parseInt(countEl.textContent) - 1);
            const detailCountEl = document.getElementById('detail-comment-count');
            if (detailCountEl) detailCountEl.textContent = Math.max(0, parseInt(detailCountEl.textContent) - 1);
            this.showToast(data.message, 'success');
        } catch(e) { this.showToast(e.message, 'error'); }
    },

    // ===== 删除帖子 =====
    async deletePost(id) {
        if (!confirm('确定删除这篇帖子？删除后仅你和管理员可查看。')) return;
        try {
            await Api.post.delete(id);
            this.showToast('帖子已删除', 'success');
            this.go('community');
        } catch(e) { this.showToast(e.message, 'error'); }
    },

    // ===== 切换私密 =====
    async togglePrivacy(id) {
        try {
            const data = await Api.post.privacy(id);
            this.showToast(data.message, 'success');
            // 刷新详情
            this.openPostDetail(id);
        } catch(e) { this.showToast(e.message, 'error'); }
    },

    // ===== 编辑帖子 =====
    editPost(id) {
        const post = this.state.currentPostDetail;
        if (!post) return;
        // 弹窗编辑
        const title = prompt('修改标题：', post.title);
        if (title === null) return;
        const content = prompt('修改内容：', post.content);
        if (content === null) return;
        Api.post.edit(id, { title: title.trim(), content: content.trim() })
            .then(data => {
                this.showToast(data.message, 'success');
                this.openPostDetail(id);
            })
            .catch(e => this.showToast(e.message, 'error'));
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
        // 同时加载关注动态未读数
        if (this.isLoggedIn()) {
            try {
                const feedData = await Api.feed.unreadCount();
                this.updateFeedBadge(feedData.count);
            } catch(e) {}
        }
    },
    updateMessageBadge(unread) {
        this.state.unreadMessages = unread;
        // 导航栏总数徽章
        const badge = document.getElementById('message-badge');
        if (badge) {
            if (unread.total > 0) {
                badge.textContent = unread.total > 99 ? '99+' : unread.total;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }
        // 消息页标题总数徽章
        const totalBadge = document.getElementById('msg-total-badge');
        if (totalBadge) {
            if (unread.total > 0) {
                totalBadge.textContent = unread.total > 99 ? '99+' : unread.total;
                totalBadge.style.display = 'inline-flex';
            } else {
                totalBadge.style.display = 'none';
            }
        }
        // 更新统计卡片和 tab 徽章
        const types = ['comment', 'like', 'favorite', 'mention', 'system'];
        types.forEach(type => {
            const count = unread[type] || 0;
            // 统计卡片
            const statNum = document.getElementById('msg-stat-' + type);
            if (statNum) statNum.textContent = count;
            // tab 徽章
            const tabBadge = document.getElementById('msg-tab-' + type);
            if (tabBadge) {
                if (count > 0) {
                    tabBadge.textContent = count > 99 ? '99+' : count;
                    tabBadge.style.display = 'inline-flex';
                } else {
                    tabBadge.style.display = 'none';
                }
            }
        });
    },
    updateFeedBadge(count) {
        this.state.feedUnread = count;
        const badge = document.getElementById('feed-badge');
        if (badge) {
            if (count > 0) {
                badge.textContent = count > 99 ? '99+' : count;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }
    },
    async filterMessages(type) {
        document.querySelectorAll('.msg-tab').forEach(t => t.classList.remove('active'));
        document.querySelector(`.msg-tab[data-type="${type}"]`).classList.add('active');
        this.state.messageFilter = type;
        document.querySelectorAll('.message-item').forEach(item => {
            if (type === 'all' || item.dataset.type === type) item.style.display = 'flex';
            else item.style.display = 'none';
        });
        // 点进该分类就标记已读
        if (type !== 'all') {
            try {
                const data = await Api.messages.readAll(type);
                this.updateMessageBadge(data.unread);
            } catch(e) {}
        }
    },
    async markAllRead() {
        try {
            const data = await Api.messages.readAll('all');
            this.updateMessageBadge(data.unread);
            // 刷新消息列表（去掉未读样式）
            document.querySelectorAll('.message-item.unread').forEach(item => item.classList.remove('unread'));
            this.showToast('已全部标记为已读', 'success');
        } catch(e) { this.showToast('操作失败', 'error'); }
    },

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
            const expForNext = data.level < 30 ? Math.floor(2.5 * data.level * data.level + 10 * data.level) : data.exp;
            const expProgress = data.level >= 30 ? 100 : Math.min((data.exp / expForNext) * 100, 100);
            const levelColor = data.levelColor || '#FFFFFF';
            const levelClass = data.level >= 25 ? 'level-rainbow' : '';
            container.innerHTML = `
                <div class="profile-header">
                    <div class="profile-avatar-large">${data.avatar ? `<img src="${data.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">` : data.nickname.charAt(0)}</div>
                    <div class="profile-nickname">${this.escape(data.nickname)}</div>
                    <div class="profile-uid">UID: ${data.uid} · @${data.username}</div>
                    <div class="profile-signature">${this.escape(data.signature)}</div>
                    <div class="profile-level-badge ${levelClass}" style="--level-color: ${levelColor}">Lv.${data.level}</div>
                    <div class="exp-bar-container">
                        <div class="exp-bar-info"><span>经验</span><span>${data.exp}/${data.level >= 30 ? '∞' : expForNext}</span></div>
                        <div class="exp-bar"><div class="exp-bar-fill" style="width:${expProgress}%"></div></div>
                    </div>
                    <div class="profile-stats">
                        <div class="profile-stat"><div class="profile-stat-value">${data.caps}</div><div class="profile-stat-label">瓶盖</div></div>
                        <div class="profile-stat clickable" onclick="App.openFollowList(${data.id}, 'followers')"><div class="profile-stat-value">${data.followers || 0}</div><div class="profile-stat-label">粉丝</div></div>
                        <div class="profile-stat clickable" onclick="App.openFollowList(${data.id}, 'following')"><div class="profile-stat-value">${data.following || 0}</div><div class="profile-stat-label">关注</div></div>
                        <div class="profile-stat"><div class="profile-stat-value">${data.postCount}</div><div class="profile-stat-label">发帖</div></div>
                    </div>
                    <button class="profile-edit-btn" onclick="App.openEditProfile()">编辑资料</button>
                    <button class="profile-edit-btn" onclick="App.logout()">退出登录</button>
                </div>
                <div class="profile-section-title">🎯 瓶盖任务</div>
                <div id="profile-task-list" class="task-list">
                    <div class="empty-state"><p>加载中...</p></div>
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
            } else if (tab === 'comments') {
                const data = await Api.user.comments();
                if (data.comments.length === 0) {
                    list.innerHTML = '<div class="empty-state"><p>还没有发过评论</p></div>';
                } else {
                    list.innerHTML = data.comments.map(c => `
                        <div class="post-card" onclick="App.openPostDetail(${c.postId})">
                            <div class="post-author-meta" style="margin-bottom:4px"><span style="color:var(--color-text-lighter);font-size:12px">在「${this.escape(c.postTitle)}」中评论</span></div>
                            <p class="post-content-preview">${this.escape(c.content)}</p>
                            <div class="post-card-footer">
                                <span class="post-stat">❤️ ${c.likes}</span>
                                <span class="post-stat" style="margin-left:auto">${c.createdAt}</span>
                            </div>
                        </div>
                    `).join('');
                }
            }
        } catch(e) {
            list.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
        }
    },
    openEditProfile() {
        const modal = document.getElementById('modal-edit-profile');
        if (modal) {
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }
    },
    openEditNickname() {
        App.closeModal('modal-edit-profile');
        const user = this.state.currentUser;
        const input = document.getElementById('edit-nickname-input');
        if (input) input.value = user.nickname;
        const modal = document.getElementById('modal-edit-nickname');
        if (modal) {
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }
    },
    submitNickname() {
        const input = document.getElementById('edit-nickname-input');
        const newNickname = input ? input.value.trim() : '';
        const user = this.state.currentUser;
        if (!newNickname || newNickname === user.nickname) {
            this.showToast('昵称未更改', 'info');
            App.closeModal('modal-edit-nickname');
            return;
        }
        App.closeModal('modal-edit-nickname');
        this.doRename(newNickname);
    },
    openEditSignature() {
        App.closeModal('modal-edit-profile');
        const user = this.state.currentUser;
        const input = document.getElementById('edit-signature-input');
        if (input) input.value = user.signature || '';
        const modal = document.getElementById('modal-edit-signature');
        if (modal) {
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }
    },
    async submitSignature() {
        const input = document.getElementById('edit-signature-input');
        const newSignature = input ? input.value.trim() : '';
        const user = this.state.currentUser;
        if (newSignature === (user.signature || '')) {
            this.showToast('签名未更改', 'info');
            App.closeModal('modal-edit-signature');
            return;
        }
        App.closeModal('modal-edit-signature');
        try {
            const data = await Api.user.updateProfile({ signature: newSignature });
            this.state.currentUser.signature = newSignature;
            this.showToast('签名修改成功', 'success');
            this.renderProfileCard();
            this.loadProfile();
        } catch(e) {
            this.showToast(e.message, 'error');
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
                list.innerHTML = this.renderEmptyRank(type);
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
            list.innerHTML = this.renderEmptyRank(type);
        }
    },

    renderEmptyRank(type) {
        const conditions = {
            thanks: [
                { title: '方式一：游戏成就', desc: 'Q80区内玩家通关所有主线剧情且在世界频道发送"一路向北最厉害啦~"' },
                { title: '方式二：赞助支持', desc: '赞助0.91元（v我0.91）' },
                { title: '提交方式', desc: '满足以上任意一条，发送相关证明到邮箱 xingguang2482@outlook.com 或QQ群453862830中，我们将在1-3个工作日内审核通过。需发送：游戏昵称、区服、社团截图和你想展示的个性签名。' },
                { title: '鸣谢标语', desc: '感谢您的付出，并督促我完善社区。' }
            ],
            sponsor: [
                { title: '赞助条件', desc: '赞助超过2.99元。如果您愿意为我们的网站开发维护包括后续更换更优秀的服务器做出贡献，您将会成为我们的衣食父母！' },
                { title: '提交方式', desc: '将赞助记录发送至邮箱 xingguang2482@outlook.com 或QQ群453862830中，我们将在1-3个工作日内审核通过。需发送：游戏昵称、区服、社团截图和你想展示的个性签名。注意：排行榜按照赞助金额排名。' },
                { title: '赞助标语', desc: '感谢您成为我们的衣食父母，我们将抽取一部分用于捐款和继续网站的开发与维护，甚至发放福利（包括但不限于抽奖和创作者福利）。' }
            ],
            master: [
                { title: '方式一：区服统考第一名', desc: '在Q80区统考中获得第一名' },
                { title: '方式二：社区贡献', desc: '为本网站做出较大贡献（包括但不限于大力维护社区安全）' },
                { title: '提交方式', desc: '满足以上任意一条，发送相关证明到邮箱 xingguang2482@outlook.com 或QQ群453862830中，我们将在1-3个工作日内审核通过。需发送：游戏昵称、区服、社团截图和你想展示的个性签名。' }
            ]
        };
        const items = conditions[type] || [];
        return `
            <div class="rank-empty">
                <div class="rank-empty-icon">🏆</div>
                <p class="rank-empty-text">暂无人上榜，快来成为第一人吧~</p>
            </div>
            <div class="rank-conditions">
                <div class="rank-conditions-header">
                    <h3 class="rank-conditions-title">📜 入榜条件</h3>
                    <a href="javascript:void(0)" class="sponsor-link" onclick="App.openSponsorQR()">赞助我们！</a>
                </div>
                ${items.map((item, i) => `
                    <div class="rank-condition-item ${item.title.includes('标语') ? 'rank-condition-slogan' : ''}">
                        <h4>${item.title}</h4>
                        <p>${item.desc}</p>
                    </div>
                `).join('')}
                <button class="btn-rank-apply" onclick="App.openRankMethod('${type}')">查看详情 & 申请入榜</button>
            </div>
        `;
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
                        <p>Q80区内玩家通关所有主线剧情且在世界频道发送"一路向北最厉害啦~"</p>
                    </div>
                    <div class="rank-method-item">
                        <h4>方式二：赞助支持</h4>
                        <p>赞助0.91元（v我0.91）</p>
                    </div>
                    <div class="rank-method-item">
                        <h4>提交方式</h4>
                        <p>满足以上任意一条，发送相关证明到邮箱 xingguang2482@outlook.com 或QQ群453862830中，我们将在1-3个工作日内审核通过。<br>需发送：游戏昵称、区服、社团截图和你想展示的个性签名。</p>
                    </div>
                    <div class="rank-method-item rank-method-slogan">
                        <h4>鸣谢标语</h4>
                        <p>感谢您的付出，并督促我完善社区。</p>
                    </div>
                </div>
            `,
            sponsor: `
                <h3 style="font-family:var(--font-heading);font-size:20px;margin-bottom:var(--space-lg)">${titles.sponsor} · 入榜方式</h3>
                <div class="rank-method-content">
                    <div class="rank-method-item">
                        <h4>赞助条件</h4>
                        <p>赞助超过2.99元。如果您愿意为我们的网站开发维护包括后续更换更优秀的服务器做出贡献，您将会成为我们的衣食父母！</p>
                    </div>
                    <div class="rank-method-item">
                        <h4>提交方式</h4>
                        <p>将赞助记录发送至邮箱 xingguang2482@outlook.com 或QQ群453862830中，我们将在1-3个工作日内审核通过。<br>需发送：游戏昵称、区服、社团截图和你想展示的个性签名。<br>注意：排行榜按照赞助金额排名。</p>
                    </div>
                    <div class="rank-method-item rank-method-slogan">
                        <h4>赞助标语</h4>
                        <p>感谢您成为我们的衣食父母，我们将抽取一部分用于捐款和继续网站的开发与维护，甚至发放福利（包括但不限于抽奖和创作者福利）。</p>
                    </div>
                    <div style="text-align:center;margin-top:var(--space-md)">
                        <a href="javascript:void(0)" class="sponsor-link" onclick="App.openSponsorQR()">赞助我们！</a>
                    </div>
                </div>
            `,
            master: `
                <h3 style="font-family:var(--font-heading);font-size:20px;margin-bottom:var(--space-lg)">${titles.master} · 入榜方式</h3>
                <div class="rank-method-content">
                    <div class="rank-method-item">
                        <h4>方式一：区服统考第一名</h4>
                        <p>在Q80区统考中获得第一名</p>
                    </div>
                    <div class="rank-method-item">
                        <h4>方式二：社区贡献</h4>
                        <p>为本网站做出较大贡献（包括但不限于大力维护社区安全）</p>
                    </div>
                    <div class="rank-method-item">
                        <h4>提交方式</h4>
                        <p>满足以上任意一条，发送相关证明到邮箱 xingguang2482@outlook.com 或QQ群453862830中，我们将在1-3个工作日内审核通过。<br>需发送：游戏昵称、区服、社团截图和你想展示的个性签名。</p>
                    </div>
                </div>
            `,
        };
        body.innerHTML = methods[type];
        this.openModal('modal-rank-method');
    },

    // ===== 开发说明 & 用户协议 =====
    openDevNotes() { this.openModal('modal-dev-notes'); },
    showAgreement() { this.openModal('modal-agreement'); },
    openSponsorQR() { this.openModal('modal-sponsor-qr'); },

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
    async loadMorePosts() {
        if (!this.state.hasMorePosts) return;
        try {
            const nextPage = this.state.currentPage + 1;
            const search = document.getElementById('search-inline-input') ? document.getElementById('search-inline-input').value.trim() : '';
            const data = await Api.posts.list(nextPage, search, this.state.inlineSearchType, this.state.sortMode);
            this.state.posts = this.state.posts.concat(data.posts);
            this.state.currentPage = nextPage;
            this.state.hasMorePosts = data.hasMore;
            this.renderPosts();
            this.updateLoadMoreBtn();
        } catch(e) { this.showToast('加载更多失败', 'error'); }
    },

    // ===== 关注系统 =====
    async toggleFollow(userId, btn) {
        if (!this.isLoggedIn()) { this.showToast('请先登录', 'info'); this.openAuthModal(); return; }
        try {
            const data = await Api.follow.toggle(userId);
            if (btn) {
                if (data.following) {
                    btn.textContent = '已关注';
                    btn.classList.add('following');
                } else {
                    btn.textContent = '+ 关注';
                    btn.classList.remove('following');
                }
            }
            this.showToast(data.message, 'success');
            // 重新加载未读数
            this.loadUnreadCount();
        } catch(e) { this.showToast(e.message, 'error'); }
    },

    // ===== 关注动态流 =====
    async loadFollowingFeed() {
        const list = document.getElementById('feed-list');
        if (list) list.innerHTML = `<div class="empty-state"><p>加载中...</p></div>`;
        try {
            const data = await Api.feed.following(1);
            if (data.posts.length === 0) {
                list.innerHTML = `<div class="empty-state"><p>还没有关注动态</p><p style="font-size:13px;color:#999;margin-top:8px">去社区关注一些有趣的玩家吧！</p></div>`;
            } else {
                this.state.posts = data.posts;
                list.innerHTML = data.posts.map(post => this.renderPostCard(post)).join('');
            }
            // 加载后清除未读徽章
            this.updateFeedBadge(0);
        } catch(e) {
            if (list) list.innerHTML = `<div class="empty-state"><p>加载失败: ${e.message}</p></div>`;
        }
    },

    // ===== 粉丝/关注列表 =====
    openFollowList(userId, type) {
        this.state.followViewTarget = { userId, type };
        this.go('follow-list');
    },

    async loadFollowList() {
        const target = this.state.followViewTarget;
        if (!target) { this.go('community'); return; }
        const container = document.getElementById('follow-list-container');
        if (container) container.innerHTML = `<div class="empty-state"><p>加载中...</p></div>`;
        try {
            const data = target.type === 'followers'
                ? await Api.follow.followers(target.userId, 1)
                : await Api.follow.following(target.userId, 1);
            const list = target.type === 'followers' ? data.followers : data.following;
            const title = target.type === 'followers' ? '粉丝列表' : '关注列表';
            if (list.length === 0) {
                container.innerHTML = `<div class="empty-state"><p>${title}为空</p></div>`;
                return;
            }
            container.innerHTML = list.map(u => this.renderUserCard(u)).join('');
        } catch(e) {
            container.innerHTML = `<div class="empty-state"><p>加载失败: ${e.message}</p></div>`;
        }
    },

    renderUserCard(u) {
        const initial = u.nickname.charAt(0);
        const followBtn = this.isLoggedIn() && u.id !== this.state.currentUser.id
            ? `<button class="follow-btn-sm ${u.isFollowing ? 'following' : ''}" onclick="App.toggleFollow(${u.id}, this)">${u.isFollowing ? '已关注' : '+ 关注'}</button>`
            : '';
        return `
            <div class="user-card" onclick="App.viewUserProfile(${u.id})">
                <div class="user-card-avatar">${initial}</div>
                <div class="user-card-info">
                    <div class="user-card-name">${this.escape(u.nickname)}</div>
                    <div class="user-card-meta"><span class="post-level-badge">Lv.${u.level}</span> <span>粉丝 ${u.followers}</span> <span>关注 ${u.following}</span></div>
                    <div class="user-card-sig">${this.escape(u.signature || '')}</div>
                </div>
                ${followBtn}
            </div>
        `;
    },

    async viewUserProfile(userId) {
        if (!this.isLoggedIn()) { this.showToast('请先登录', 'info'); this.openAuthModal(); return; }
        if (userId === this.state.currentUser.id) { this.go('profile'); return; }
        const container = document.getElementById('user-profile-container');
        if (container) container.innerHTML = `<div class="empty-state"><p>加载中...</p></div>`;
        this.go('user-profile');
        try {
            const data = await Api.follow.profile(userId);
            const expForNext = data.level * 100;
            const expProgress = Math.min((data.exp / expForNext) * 100, 100);
            const followBtn = `<button class="follow-btn-sm ${data.isFollowing ? 'following' : ''}" style="margin-top:12px" onclick="App.toggleFollow(${data.id}, this)">${data.isFollowing ? '已关注' : '+ 关注'}</button>`;
            container.innerHTML = `
                <button class="post-detail-back" onclick="App.go('community')" style="margin-bottom:16px">
                    <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M19 12H5M12 19L5 12L12 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    返回
                </button>
                <div class="profile-header">
                    <div class="profile-avatar-large">${data.avatar ? `<img src="${data.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">` : data.nickname.charAt(0)}</div>
                    <div class="profile-nickname">${this.escape(data.nickname)}</div>
                    <div class="profile-uid">UID: ${data.uid}</div>
                    <div class="profile-signature">${this.escape(data.signature)}</div>
                    <div class="exp-bar-container">
                        <div class="exp-bar-info"><span>Lv.${data.level}</span><span>${data.exp}/${expForNext}</span></div>
                        <div class="exp-bar"><div class="exp-bar-fill" style="width:${expProgress}%"></div></div>
                    </div>
                    <div class="profile-stats">
                        <div class="profile-stat"><div class="profile-stat-value">${data.followers}</div><div class="profile-stat-label">粉丝</div></div>
                        <div class="profile-stat clickable" onclick="App.openFollowList(${data.id}, 'following')"><div class="profile-stat-value">${data.following}</div><div class="profile-stat-label">关注</div></div>
                        <div class="profile-stat"><div class="profile-stat-value">${data.postCount}</div><div class="profile-stat-label">发帖</div></div>
                    </div>
                    ${followBtn}
                </div>
                <div class="profile-tabs">
                    <button class="profile-tab active">TA的帖子</button>
                </div>
                <div class="post-list" id="user-profile-posts">
                    ${data.posts.length > 0 ? data.posts.map(p => this.renderPostCard({...p, author: data.nickname, authorId: data.id, authorLevel: data.level, liked: false, favorited: false, isFollowing: data.isFollowing})).join('') : '<div class="empty-state"><p>TA还没有发过帖子</p></div>'}
                </div>
            `;
        } catch(e) {
            container.innerHTML = `<div class="empty-state"><p>加载失败: ${e.message}</p></div>`;
        }
    },

    // ===== 投盖功能 =====
    async openTipModal(postId, tipped, tipsCount) {
        if (!this.isLoggedIn()) { this.showToast('请先登录', 'info'); this.openAuthModal(); return; }
        if (tipped) { this.showToast('已经投过该帖了', 'info'); return; }
        this.state.tipPostId = postId;
        this.state.tipTipsCount = tipsCount;
        document.getElementById('tip-modal-post-id').textContent = postId;
        document.getElementById('tip-modal-current').textContent = tipsCount;
        document.getElementById('tip-modal-daily-used').textContent = '0';
        document.getElementById('tip-modal-daily-limit').textContent = '10';
        try {
            const status = await Api.post.tipStatus(postId);
            document.getElementById('tip-modal-daily-used').textContent = status.dailyUsed ?? 0;
            document.getElementById('tip-modal-daily-limit').textContent = status.dailyLimit ?? 10;
        } catch(e) {}
        document.getElementById('modal-tip').style.display = 'flex';
    },
    async doTip(amount) {
        const postId = this.state.tipPostId;
        if (!postId) return;
        try {
            const data = await Api.post.tip(postId, amount);
            if (data.success) {
                document.getElementById('modal-tip').style.display = 'none';
                this.showToast(`投盖成功！消耗${amount}瓶盖`, 'success');
                // 更新本地帖子数据
                const post = this.state.posts.find(p => p.id === postId);
                if (post) { post.tipped = true; post.tips = data.postTipsCount; }
                if (this.state.currentPostDetail && this.state.currentPostDetail.id === postId) {
                    this.state.currentPostDetail.tipped = true;
                    this.state.currentPostDetail.tips = data.postTipsCount;
                }
                // 更新用户瓶盖
                if (this.state.currentUser) this.state.currentUser.caps = data.userCaps;
                this.renderProfileCard();
                this.renderPosts();
            } else {
                this.showToast(data.message, 'error');
            }
        } catch(e) {
            this.showToast(e.message, 'error');
        }
    },

    // ===== 任务系统 =====
    async loadTasks() {
        const container = document.getElementById('profile-task-list');
        if (!container) return;
        container.innerHTML = '<div class="empty-state"><p>加载中...</p></div>';
        try {
            const data = await Api.user.tasks();
            this.state.currentUser.tasks = data.tasks;
            this.renderTasks(data.tasks);
        } catch(e) {
            container.innerHTML = `<div class="empty-state"><p>加载失败: ${e.message}</p></div>`;
        }
    },
    renderTasks(tasks) {
        const container = document.getElementById('profile-task-list');
        if (!container) return;
        if (!tasks || tasks.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>暂无任务</p></div>';
            return;
        }
        container.innerHTML = tasks.map(t => {
            const progressPercent = Math.min((t.progress / t.target) * 100, 100);
            const isCompleted = t.progress >= t.target;
            const isClaimed = t.claimed;
            const canClaim = isCompleted && !isClaimed;
            const capsReward = typeof t.capsReward === 'string' ? t.capsReward : `+${t.capsReward}`;
            const expReward = typeof t.expReward === 'string' ? t.expReward : `+${t.expReward}`;
            return `
                <div class="task-item ${isClaimed ? 'claimed' : ''} ${canClaim ? 'can-claim' : ''}">
                    <div class="task-info">
                        <div class="task-name">${this.escape(t.name)}</div>
                        <div class="task-desc">${this.escape(t.desc)}</div>
                        <div class="task-progress-bar"><div class="task-progress-fill" style="width:${progressPercent}%"></div></div>
                        <div class="task-progress-text">${t.progress}/${t.target}</div>
                    </div>
                    <div class="task-reward">
                        <div class="task-reward-caps">${capsReward} 瓶盖</div>
                        <div class="task-reward-exp">${expReward} 经验</div>
                    </div>
                    ${canClaim ? `<button class="task-claim-btn" onclick="App.claimTask('${t.id}')">领取</button>` : ''}
                    ${isClaimed ? '<span class="task-claimed-label">已领取</span>' : ''}
                </div>
            `;
        }).join('');
    },
    async claimTask(taskId) {
        try {
            const data = await Api.user.claimTask(taskId);
            this.showToast(`领取成功！${data.capsGain}瓶盖 ${data.expGain}经验`, 'success');
            if (data.user) {
                this.state.currentUser.exp = data.user.exp;
                this.state.currentUser.level = data.user.level;
                this.state.currentUser.caps = data.user.caps;
                this.renderProfileCard();
            }
            this.loadTasks();
        } catch(e) {
            this.showToast(e.message, 'error');
        }
    },

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
        // 回到顶部按钮
        window.addEventListener('scroll', () => {
            const btn = document.getElementById('scroll-top-btn');
            if (!btn) return;
            btn.style.display = window.scrollY > 400 ? 'flex' : 'none';
        });
    },
};

document.addEventListener('DOMContentLoaded', () => App.init());
