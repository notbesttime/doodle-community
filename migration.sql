-- 给已有表加字段（兼容旧表结构）
ALTER TABLE posts ADD COLUMN is_private INTEGER DEFAULT 0;
ALTER TABLE posts ADD COLUMN is_deleted INTEGER DEFAULT 0;

-- 如果上述 ALTER 已存在列会报错，忽略即可

-- 评论表加字段
ALTER TABLE comments ADD COLUMN likes_count INTEGER DEFAULT 0;
ALTER TABLE comments ADD COLUMN parent_id INTEGER DEFAULT 0;

-- 新表（已存在会跳过）
CREATE TABLE IF NOT EXISTS comment_likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    comment_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(comment_id, user_id)
);

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
CREATE INDEX IF NOT EXISTS idx_cl_comment ON comment_likes(comment_id);

-- 13. 关注关系表
CREATE TABLE IF NOT EXISTS follows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    follower_id INTEGER NOT NULL,
    following_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(follower_id, following_id)
);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);

-- 14. 关注动态已读记录表
CREATE TABLE IF NOT EXISTS feed_reads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    post_id INTEGER NOT NULL,
    read_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, post_id)
);
CREATE INDEX IF NOT EXISTS idx_feed_reads_user ON feed_reads(user_id);

-- 评论表加软删除字段
ALTER TABLE comments ADD COLUMN is_deleted INTEGER DEFAULT 0;
ALTER TABLE comments ADD COLUMN deleted_at TEXT;

-- 15. D1限流表
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

-- ===== v4 新增表 =====

-- 19. 用户每日点赞计数（用于任务进度）
ALTER TABLE users ADD COLUMN daily_likes INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN daily_comments INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN daily_posts INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN daily_favorites INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN daily_tips_given INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN daily_likes_received INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN daily_tasks_date TEXT DEFAULT '';

-- 20. 投盖记录表
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

-- 21. 用户每日任务进度表
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

-- 22. 帖子投盖计数（冗余字段方便查询）
ALTER TABLE posts ADD COLUMN tips_count INTEGER DEFAULT 0;
ALTER TABLE posts ADD COLUMN caps INTEGER DEFAULT 0;

-- 23. IP黑名单加剩余时间字段
ALTER TABLE ip_blacklist ADD COLUMN locked_until TEXT;
ALTER TABLE ip_blacklist ADD COLUMN note TEXT DEFAULT '';

-- 24. 用户每日获赞计数（自己帖子收到的赞）
CREATE TABLE IF NOT EXISTS daily_received_likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    count INTEGER DEFAULT 0,
    record_date TEXT NOT NULL,
    UNIQUE(user_id, record_date),
    FOREIGN KEY (user_id) REFERENCES users(id)
);
