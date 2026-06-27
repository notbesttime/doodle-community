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
        if (!res.ok) throw new Error(data.error || '请求失败');
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
        register(username, password, email) {
            return Api.request('/auth/register', {
                method: 'POST',
                body: JSON.stringify({ username, password, email })
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
        list(page = 1, search = '', type = 'post') {
            return Api.request(`/posts?page=${page}&limit=20&search=${encodeURIComponent(search)}&type=${type}`);
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
        addComment(postId, text) {
            return Api.request(`/posts/${postId}/comments`, {
                method: 'POST',
                body: JSON.stringify({ text })
            });
        },
        like(postId) { return Api.request(`/posts/${postId}/like`, { method: 'POST' }); },
        unlike(postId) { return Api.request(`/posts/${postId}/like`, { method: 'DELETE' }); },
        favorite(postId) { return Api.request(`/posts/${postId}/favorite`, { method: 'POST' }); },
        unfavorite(postId) { return Api.request(`/posts/${postId}/favorite`, { method: 'DELETE' }); }
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
        favorites() { return Api.request('/user/favorites'); }
    },

    // ===== 消息 =====
    messages: {
        list(type = 'all', unread = false) {
            return Api.request(`/messages?type=${type}&unread=${unread}`);
        },
        markRead(id) {
            return Api.request(`/messages/${id}/read`, { method: 'PUT' });
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
    }
};
