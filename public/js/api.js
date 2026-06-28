/* ================================================
   API 客户端 - 封装所有后端接口调用
   ================================================ */

const Api = {
    baseUrl: '/api',
    token: localStorage.getItem('doodle-token') || '',

    setToken(token) {
        this.token = token;
        localStorage.setItem('doodle-token', token);
    },

    clearToken() {
        this.token = '';
        localStorage.removeItem('doodle-token');
    },

    async request(path, options = {}) {
        const res = await fetch(this.baseUrl + path, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...(this.token ? { 'Authorization': 'Bearer ' + this.token } : {}),
                ...options.headers
            }
        });
        const data = await res.json();
        if (!res.ok) {
            if (res.status === 403 && data.remaining_minutes) {
                throw new Error(`您的IP已被封禁，剩余${data.remaining_minutes}分钟\n原因：${data.reason || '违规操作'}`);
            }
            throw new Error(data.error || '请求失败');
        }
        return data;
    },

    async upload(file, type = 'post') {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', type);
        const res = await fetch(this.baseUrl + '/upload/image', {
            method: 'POST',
            headers: this.token ? { 'Authorization': 'Bearer ' + this.token } : {},
            body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '上传失败');
        return data;
    },

    // ===== 认证 =====
    auth: {
        register(username, password, email, captchaId, captchaAnswer) {
            return Api.request('/auth/register', {
                method: 'POST',
                body: JSON.stringify({ username, password, email, captchaId, captchaAnswer })
            });
        },
        login(username, password) {
            return Api.request('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ username, password })
            });
        },
        me() { return Api.request('/auth/me'); },
        logout() { return Api.request('/auth/logout', { method: 'POST' }); },
        sendCode(email, purpose) {
            return Api.request('/auth/send-code', {
                method: 'POST',
                body: JSON.stringify({ email, purpose })
            });
        },
        verifyCode(email, code) {
            return Api.request('/auth/verify-code', {
                method: 'POST',
                body: JSON.stringify({ email, code })
            });
        },
        forgotPassword(email, code, newPassword) {
            return Api.request('/auth/forgot-password', {
                method: 'POST',
                body: JSON.stringify({ email, code, newPassword })
            });
        }
    },

    // ===== 帖子 =====
    posts: {
        list(page = 1, search = '', type = 'post', sort = 'hot') {
            return Api.request(`/posts?page=${page}&limit=20&search=${encodeURIComponent(search)}&type=${type}&sort=${sort}`);
        },
        get(id) { return Api.request(`/posts/${id}`); },
        create(data) {
            return Api.request('/posts', {
                method: 'POST',
                body: JSON.stringify(data)
            });
        }
    },

    // ===== 帖子互动 =====
    post: {
        comments(postId) { return Api.request(`/posts/${postId}/comments`); },
        addComment(postId, text, parentId) {
            return Api.request(`/posts/${postId}/comments`, {
                method: 'POST',
                body: JSON.stringify({ text, parentId: parentId || 0 })
            });
        },
        like(postId) { return Api.request(`/posts/${postId}/like`, { method: 'POST' }); },
        unlike(postId) { return Api.request(`/posts/${postId}/like`, { method: 'DELETE' }); },
        favorite(postId) { return Api.request(`/posts/${postId}/favorite`, { method: 'POST' }); },
        unfavorite(postId) { return Api.request(`/posts/${postId}/favorite`, { method: 'DELETE' }); },
        edit(postId, data) {
            return Api.request(`/posts/${postId}/edit`, {
                method: 'POST',
                body: JSON.stringify(data)
            });
        },
        delete(postId) {
            return Api.request(`/posts/${postId}/delete`, { method: 'POST' });
        },
        privacy(postId) {
            return Api.request(`/posts/${postId}/privacy`, { method: 'POST' });
        },
        report(postId, reason) {
            return Api.request('/reports', {
                method: 'POST',
                body: JSON.stringify({ type: 'post', targetId: postId, reason })
            });
        },
        tipStatus(postId) { return Api.request(`/posts/${postId}/tip`); },
        tip(postId, amount) {
            return Api.request(`/posts/${postId}/tip`, {
                method: 'POST',
                body: JSON.stringify({ amount })
            });
        }
    },

    // ===== 社区 =====
    community: {
        signin() { return Api.request('/community/signin', { method: 'POST' }); },
        signinStatus() { return Api.request('/community/signin/status'); }
    },

    // ===== 用户 =====
    user: {
        profile() { return Api.request('/user/profile'); },
        updateProfile(data) {
            return Api.request('/user/profile', {
                method: 'PUT',
                body: JSON.stringify(data)
            });
        },
        rename(newNickname) {
            return Api.request('/user/rename', {
                method: 'PUT',
                body: JSON.stringify({ newNickname })
            });
        },
        favorites() { return Api.request('/user/favorites'); },
        comments() { return Api.request('/user/comments'); },
        tasks() { return Api.request('/user/tasks'); },
        claimTask(taskId) { return Api.request(`/user/tasks/${taskId}/claim`, { method: 'POST' }); }
    },

    // ===== 消息 =====
    messages: {
        list(type = 'all', unread = false) {
            return Api.request(`/messages?type=${type}&unread=${unread}`);
        },
        markRead(id) {
            return Api.request(`/messages/${id}/read`, { method: 'PUT' });
        },
        readAll(type = 'all') {
            return Api.request('/messages/read-all', {
                method: 'POST',
                body: JSON.stringify({ type })
            });
        }
    },

    // ===== 排行榜 =====
    ranks: {
        list(type) { return Api.request(`/ranks/${type}`); },
        apply(data) {
            return Api.request('/ranks/apply', {
                method: 'POST',
                body: JSON.stringify(data)
            });
        }
    },

    // ===== 评论操作 =====
    comment: {
        like(commentId) { return Api.request(`/comments/${commentId}/like`, { method: 'POST' }); },
        delete(commentId) { return Api.request(`/comments/${commentId}/delete`, { method: 'POST' }); },
        report(commentId, reason) {
            return Api.request('/reports', {
                method: 'POST',
                body: JSON.stringify({ type: 'comment', targetId: commentId, reason })
            });
        }
    },

    // ===== 举报 =====
    report: {
        cancel(type, targetId) {
            return Api.request('/reports/cancel', {
                method: 'POST',
                body: JSON.stringify({ type, targetId })
            });
        }
    },

    // ===== 管理 =====
    admin: {
        rankApplications(status, type) {
            let url = '/admin/ranks/applications?status=' + (status || 'pending');
            if (type) url += '&type=' + type;
            return Api.request(url);
        },
        reviewRankApp(data) {
            return Api.request('/admin/ranks/review', {
                method: 'POST',
                body: JSON.stringify(data)
            });
        },
        reports(status) {
            return Api.request('/admin/reports?status=' + (status || 'pending'));
        },
        reviewReport(data) {
            return Api.request('/admin/reports/review', {
                method: 'POST',
                body: JSON.stringify(data)
            });
        },
        users(search, role) {
            let url = '/admin/users?limit=200';
            if (search) url += '&search=' + encodeURIComponent(search);
            if (role) url += '&role=' + role;
            return Api.request(url);
        },
        resetPassword(userId, password) {
            return Api.request('/admin/users/' + userId + '/reset-password', {
                method: 'POST',
                body: JSON.stringify({ password })
            });
        }
    },

    // ===== 关注系统 =====
    follow: {
        toggle(userId) {
            return Api.request(`/users/${userId}/follow`, { method: 'POST' });
        },
        followers(userId, page = 1) {
            return Api.request(`/users/${userId}/followers?page=${page}&limit=20`);
        },
        following(userId, page = 1) {
            return Api.request(`/users/${userId}/following?page=${page}&limit=20`);
        },
        profile(userId) {
            return Api.request(`/users/${userId}/profile`);
        }
    },

    // ===== 关注动态 =====
    feed: {
        following(page = 1) {
            return Api.request(`/feed/following?page=${page}&limit=20`);
        },
        unreadCount() {
            return Api.request('/feed/unread-count');
        }
    }
};
