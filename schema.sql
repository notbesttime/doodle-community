-- ================================================
-- 乱涂彩社区 - D1 数据库 Schema
-- 在 Cloudflare D1 面板执行此文件建表
-- ================================================

-- 1. 用户表
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uid TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    nickname TEXT NOT NULL,
    email TEXT DEFAULT '',
    email_verified INTEGER DEFAULT 0,
    avatar TEXT DEFAULT '',
    signature TEXT DEFAULT '这个人很懒，什么都没留下~',
    level INTEGER DEFAULT 1,
    exp INTEGER DEFAULT 0,
    caps INTEGER DEFAULT 0,
    rename_count INTEGER DEFAULT 0,
    followers INTEGER DEFAULT 0,
    following INTEGER DEFAULT 0,
    role TEXT DEFAULT 'user',
    daily_likes INTEGER DEFAULT 0,
    daily_comments INTEGER DEFAULT 0,
    daily_posts INTEGER DEFAULT 0,
    daily_favorites INTEGER DEFAULT 0,
    daily_tips_given INTEGER DEFAULT 0,
    daily_likes_received INTEGER DEFAULT 0,
    daily_tasks_date TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
);

-- 2. 会话表
CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 3. 帖子表
CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    author_name TEXT NOT NULL,
    author_level INTEGER DEFAULT 1,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    images TEXT DEFAULT '[]',
    video_url TEXT DEFAULT '',
    likes_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    favorites_count INTEGER DEFAULT 0,
    tips_count INTEGER DEFAULT 0,
    caps INTEGER DEFAULT 0,
    is_private INTEGER DEFAULT 0,
    is_deleted INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);

-- 4. 评论表
CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    author_name TEXT NOT NULL,
    content TEXT NOT NULL,
    likes_count INTEGER DEFAULT 0,
    parent_id INTEGER DEFAULT 0,
    is_deleted INTEGER DEFAULT 0,
    deleted_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (post_id) REFERENCES posts(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);

-- 5. 点赞表
CREATE TABLE IF NOT EXISTS likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(post_id, user_id)
);

-- 6. 收藏表
CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(post_id, user_id)
);

-- 7. 签到表
CREATE TABLE IF NOT EXISTS signins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    sign_date TEXT NOT NULL,
    exp_gained INTEGER NOT NULL,
    caps_gained INTEGER NOT NULL,
    consecutive_days INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, sign_date)
);

-- 8. 消息表
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    sender_name TEXT NOT NULL,
    content TEXT NOT NULL,
    related_post_id INTEGER,
    is_read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id, is_read);

-- 9. 排行榜表
CREATE TABLE IF NOT EXISTS rank_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    user_id INTEGER,
    nickname TEXT NOT NULL,
    game_uid TEXT,
    server TEXT DEFAULT '',
    signature TEXT,
    guild_name TEXT DEFAULT '',
    sponsor_amount REAL DEFAULT 0,
    rank_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rank_type ON rank_entries(type, rank_order);

-- 10. 排行榜申请表
CREATE TABLE IF NOT EXISTS rank_applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    nickname TEXT NOT NULL,
    game_uid TEXT,
    server TEXT DEFAULT '',
    signature TEXT,
    guild_name TEXT DEFAULT '',
    sponsor_amount REAL DEFAULT 0,
    status TEXT DEFAULT 'pending',
    admin_note TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    reviewed_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 初始管理员（部署后手动执行更新语句设置）
-- UPDATE users SET role = 'admin' WHERE username = '你的用户名';

-- 11. 评论点赞表
CREATE TABLE IF NOT EXISTS comment_likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    comment_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_cl_comment ON comment_likes(comment_id);

-- 12. 举报表
CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    target_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    reason TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(type, target_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);

-- 13. 关注关系表
CREATE TABLE IF NOT EXISTS follows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    follower_id INTEGER NOT NULL,
    following_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(follower_id, following_id),
    FOREIGN KEY (follower_id) REFERENCES users(id),
    FOREIGN KEY (following_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);

-- 14. 关注动态已读记录表（每条帖子单独标记）
CREATE TABLE IF NOT EXISTS feed_reads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    post_id INTEGER NOT NULL,
    read_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, post_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (post_id) REFERENCES posts(id)
);

CREATE INDEX IF NOT EXISTS idx_feed_reads_user ON feed_reads(user_id);

-- 15. D1限流表（KV降级备用）
CREATE TABLE IF NOT EXISTS rate_limits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL,
    count INTEGER DEFAULT 0,
    expires_at TEXT NOT NULL,
    UNIQUE(key)
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_key ON rate_limits(key, expires_at);

-- 16. IP黑名单表
CREATE TABLE IF NOT EXISTS ip_blacklist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL UNIQUE,
    reason TEXT DEFAULT '',
    locked_until TEXT,
    note TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ip_blacklist_ip ON ip_blacklist(ip);

-- 17. 管理员登录失败记录表
CREATE TABLE IF NOT EXISTS admin_login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL,
    fail_count INTEGER DEFAULT 0,
    locked_until TEXT,
    captcha_fails INTEGER DEFAULT 0,
    captcha_locked_until TEXT,
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(ip)
);
CREATE INDEX IF NOT EXISTS idx_admin_attempts_ip ON admin_login_attempts(ip);

-- 18. 数学题验证码表
CREATE TABLE IF NOT EXISTS captchas (
    id TEXT PRIMARY KEY,
    answer TEXT NOT NULL,
    ip TEXT NOT NULL,
    fails INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_captchas_ip ON captchas(ip);

-- ===== v4 新表 =====

-- 19. 投盖记录表
CREATE TABLE IF NOT EXISTS post_tips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(post_id, user_id),
    FOREIGN KEY (post_id) REFERENCES posts(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_tips_post ON post_tips(post_id);
CREATE INDEX IF NOT EXISTS idx_tips_user ON post_tips(user_id);

-- 20. 用户每日任务进度表
CREATE TABLE IF NOT EXISTS user_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    task_id TEXT NOT NULL,
    progress INTEGER DEFAULT 0,
    target INTEGER NOT NULL,
    claimed INTEGER DEFAULT 0,
    task_date TEXT NOT NULL,
    UNIQUE(user_id, task_id, task_date),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 21. 用户每日获赞计数（自己帖子收到的赞）
CREATE TABLE IF NOT EXISTS daily_received_likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    count INTEGER DEFAULT 0,
    record_date TEXT NOT NULL,
    UNIQUE(user_id, record_date),
    FOREIGN KEY (user_id) REFERENCES users(id)
);
