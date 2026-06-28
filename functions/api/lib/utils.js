// 共享工具函数 - 供所有 API 路由使用
export { filterSensitiveWords, containsSensitiveWord } from './sensitive-words.js';

// ===== 密码哈希（Web Crypto API PBKDF2） =====
export async function hashPassword(password) {
    const encoder = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const keyMaterial = await crypto.subtle.importKey(
        'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
    );
    const hash = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
        keyMaterial, 256
    );
    const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
    const hashHex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    return saltHex + ':' + hashHex;
}

export async function verifyPassword(password, storedHash) {
    if (!storedHash || !storedHash.includes(':')) return false;
    const [saltHex, hashHex] = storedHash.split(':');
    // 校验是否为合法的十六进制字符串
    if (!/^[0-9a-f]+$/i.test(saltHex) || !/^[0-9a-f]+$/i.test(hashHex)) return false;
    const salt = new Uint8Array(saltHex.match(/.{2}/g).map(b => parseInt(b, 16)));
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
    );
    const hash = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
        keyMaterial, 256
    );
    const computedHex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    return computedHex === hashHex;
}

// ===== Token 生成 =====
export function generateToken() {
    const arr = crypto.getRandomValues(new Uint8Array(32));
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ===== 8位数字UID =====
export function generateUID() {
    let uid = '';
    for (let i = 0; i < 8; i++) uid += Math.floor(Math.random() * 10);
    return uid;
}

// ===== 随机昵称 =====
export function generateNickname() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let suffix = '';
    for (let i = 0; i < 4; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
    return '热心神明' + suffix;
}

// ===== 6位验证码 =====
export function generateCode() {
    return String(Math.floor(Math.random() * 900000) + 100000);
}

// ===== 邮件发送（EmailJS） =====
export async function sendEmail(env, to, code) {
    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            service_id: env.EMAILJS_SERVICE_ID,
            template_id: env.EMAILJS_TEMPLATE_ID,
            user_id: env.EMAILJS_PUBLIC_KEY,
            template_params: {
                to_email: to,
                code: code,
                site_name: '乱涂彩社区'
            }
        })
    });
    return res.ok;
}

// ===== 验证码存取（KV，容错处理） =====
export async function storeCode(kv, email, code) {
    try {
        await kv.put('code:' + email, code, { expirationTtl: 600 }); // 10分钟
    } catch(e) {}
}

export async function getCode(kv, email) {
    try {
        return await kv.get('code:' + email);
    } catch(e) {
        return null;
    }
}

export async function deleteCode(kv, email) {
    try {
        await kv.delete('code:' + email);
    } catch(e) {}
}

// ===== 频率限制（KV优先，失败降级D1） =====
let kvAvailable = true; // 模块级标志位

export async function checkRateLimit(kv, key, maxCount, windowSec, db = null) {
    // 优先用KV
    if (kvAvailable) {
        try {
            const count = parseInt(await kv.get('rl:' + key) || '0');
            if (count >= maxCount) return false;
            await kv.put('rl:' + key, String(count + 1), { expirationTtl: windowSec });
            return true;
        } catch(e) {
            kvAvailable = false; // KV挂了，后续直接走D1
        }
    }
    // 降级到D1
    if (!db) return true; // 没传db就放行
    try {
        const now = new Date().toISOString();
        const expiresAt = new Date(Date.now() + windowSec * 1000).toISOString();
        // 顺带清理过期记录
        await db.prepare('DELETE FROM rate_limits WHERE expires_at < ?').bind(now).run();
        // 查当前key的计数
        const row = await db.prepare('SELECT count, expires_at FROM rate_limits WHERE key = ?').bind(key).first();
        if (row && new Date(row.expires_at) > new Date(now) && row.count >= maxCount) {
            return false;
        }
        // 更新或插入
        if (row && new Date(row.expires_at) > new Date(now)) {
            await db.prepare('UPDATE rate_limits SET count = count + 1 WHERE key = ?').bind(key).run();
        } else {
            await db.prepare('INSERT OR REPLACE INTO rate_limits (key, count, expires_at) VALUES (?, 1, ?)').bind(key, expiresAt).run();
        }
        return true;
    } catch(e) {
        return true; // D1也挂了就放行
    }
}

// ===== IP黑名单检查（返回剩余时间） =====
export async function checkIpBlacklist(env, request) {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    try {
        const row = await env.DB.prepare('SELECT id, reason, locked_until, note FROM ip_blacklist WHERE ip = ?').bind(ip).first();
        if (row) {
            const reason = row.reason || row.note || '';
            if (!row.locked_until) {
                return { blocked: true, ip, reason, remaining_minutes: null, permanent: true };
            }
            const lockedUntil = new Date(row.locked_until + 'Z');
            const now = new Date();
            if (lockedUntil > now) {
                const remainingMinutes = Math.ceil((lockedUntil - now) / 60000);
                return { blocked: true, ip, reason, remaining_minutes: remainingMinutes, permanent: false };
            }
            // 已过期，自动移除
            await env.DB.prepare('DELETE FROM ip_blacklist WHERE id = ?').bind(row.id).run();
        }
        return { blocked: false, ip };
    } catch(e) {
        return { blocked: false, ip }; // 表不存在就放行
    }
}

// ===== 获取客户端IP =====
export function getClientIp(request) {
    return request.headers.get('CF-Connecting-IP') || 'unknown';
}

// ===== 发帖频率检查（24小时限制） =====
export async function checkPostLimit(env, user) {
    try {
        // 查24小时内发了多少帖
        const { count } = await env.DB.prepare(
            "SELECT COUNT(*) as count FROM posts WHERE user_id = ? AND created_at > datetime('now', '-1 day')"
        ).bind(user.id).first();

        const dailyCount = count || 0;

        // 新用户（注册不到24小时）最多3帖
        const userRow = await env.DB.prepare(
            "SELECT created_at FROM users WHERE id = ?"
        ).bind(user.id).first();
        const isNewUser = userRow && new Date(userRow.created_at) > new Date(Date.now() - 24 * 60 * 60 * 1000);

        if (isNewUser && dailyCount >= 3) {
            return { allowed: false, message: '新用户24小时内最多发3帖，请明天再试' };
        }

        // 老用户24小时最多6帖
        if (dailyCount >= 6) {
            return { allowed: false, message: '24小时内最多发6帖，请稍后再试' };
        }

        return { allowed: true };
    } catch(e) {
        return { allowed: true }; // 出错放行
    }
}

// ===== 帖子总量检查 + 自动清理 =====
export async function checkAndCleanupPosts(env) {
    try {
        const { count } = await env.DB.prepare(
            "SELECT COUNT(*) as count FROM posts WHERE is_deleted = 0"
        ).first();

        if (count > 10000) {
            // 硬删除100条0赞0评论且超过30天的帖子
            const oldPosts = await env.DB.prepare(
                `SELECT id FROM posts
                 WHERE is_deleted = 0 AND likes_count = 0 AND comments_count = 0
                 AND created_at < datetime('now', '-30 days')
                 ORDER BY created_at ASC LIMIT 100`
            ).all();

            if (oldPosts.results.length > 0) {
                const ids = oldPosts.results.map(p => p.id);
                const idList = ids.join(',');
                // 删除关联数据
                await env.DB.prepare(`DELETE FROM likes WHERE post_id IN (${idList})`).run();
                await env.DB.prepare(`DELETE FROM favorites WHERE post_id IN (${idList})`).run();
                await env.DB.prepare(`DELETE FROM comments WHERE post_id IN (${idList})`).run();
                await env.DB.prepare(`DELETE FROM feed_reads WHERE post_id IN (${idList})`).run();
                await env.DB.prepare(`DELETE FROM posts WHERE id IN (${idList})`).run();
            }
        }
    } catch(e) {} // 清理失败不影响发帖
}

// ===== 清理过期软删除记录（超过24小时） =====
export async function cleanupExpiredDeleted(env) {
    try {
        // 清理超过24小时的软删除帖子
        const oldPosts = await env.DB.prepare(
            "SELECT id FROM posts WHERE is_deleted = 1 AND deleted_at < datetime('now', '-1 day')"
        ).all();
        if (oldPosts.results.length > 0) {
            const postIds = oldPosts.results.map(p => p.id).join(',');
            await env.DB.prepare(`DELETE FROM likes WHERE post_id IN (${postIds})`).run();
            await env.DB.prepare(`DELETE FROM favorites WHERE post_id IN (${postIds})`).run();
            await env.DB.prepare(`DELETE FROM comments WHERE post_id IN (${postIds})`).run();
            await env.DB.prepare(`DELETE FROM feed_reads WHERE post_id IN (${postIds})`).run();
            await env.DB.prepare(`DELETE FROM posts WHERE id IN (${postIds})`).run();
        }

        // 清理超过24小时的软删除评论
        await env.DB.prepare(
            "DELETE FROM comments WHERE is_deleted = 1 AND deleted_at < datetime('now', '-1 day')"
        ).run();

        // 清理过期的验证码
        await env.DB.prepare(
            "DELETE FROM captchas WHERE created_at < datetime('now', '-10 minutes')"
        ).run();
    } catch(e) {}
}

// ===== 会话验证 =====
export async function getUserFromRequest(env, request) {
    const auth = request.headers.get('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) return null;
    const token = auth.slice(7);
    const session = await env.DB.prepare(
        'SELECT user_id, expires_at FROM sessions WHERE token = ?'
    ).bind(token).first();
    if (!session) return null;
    if (new Date(session.expires_at) < new Date()) {
        await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
        return null;
    }
    const user = await env.DB.prepare(
        'SELECT * FROM users WHERE id = ?'
    ).bind(session.user_id).first();
    return user ? { ...user, token } : null;
}

// ===== JSON 响应 =====
export function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization'
        }
    });
}

// ===== CORS 预检 =====
export function cors() {
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization'
        }
    });
}

// ===== 经验升级计算（新公式：expToNext = 2.5n² + 10n） =====
export function getExpToNext(level) {
    return Math.floor(2.5 * level * level + 10 * level);
}

export function checkLevelUp(user) {
    let leveledUp = false;
    while (user.level < 30) {
        const needed = getExpToNext(user.level);
        if (user.exp >= needed) {
            user.exp -= needed;
            user.level++;
            leveledUp = true;
        } else {
            break;
        }
    }
    // 满级后经验继续累积显示
    return leveledUp;
}

// ===== 添加经验并检查升级 =====
export async function addExpAndCheckLevel(env, user, amount) {
    user.exp += amount;
    const leveledUp = checkLevelUp(user);
    await env.DB.prepare('UPDATE users SET exp = ?, level = ? WHERE id = ?')
        .bind(user.exp, user.level, user.id).run();
    return { exp: user.exp, level: user.level, leveledUp };
}

// ===== 等级颜色 =====
export function getLevelColor(level) {
    if (level >= 25) return '#FF1493'; // 炫彩粉（25-30用CSS动画实现炫彩）
    if (level >= 20) return '#FF4444'; // 红色
    if (level >= 15) return '#FFD700'; // 金色
    if (level >= 12) return '#9B59B6'; // 紫色
    if (level >= 9) return '#3498DB'; // 蓝色
    if (level >= 7) return '#2ECC71'; // 绿色
    return '#FFFFFF'; // 白色
}

// ===== 获取每日任务定义 =====
export function getDailyTasks() {
    return [
        { id: 'signin', name: '签到', desc: '每日签到1次', target: 1, capsReward: '1~3', expReward: '1~3', type: 'daily' },
        { id: 'post2', name: '发帖2次', desc: '发布2条帖子', target: 2, capsReward: 3, expReward: 8, type: 'daily' },
        { id: 'comment3', name: '评论3次', desc: '评论3条帖子', target: 3, capsReward: 3, expReward: 6, type: 'daily' },
        { id: 'like3', name: '点赞3次', desc: '点赞3条帖子', target: 3, capsReward: 2, expReward: 5, type: 'daily' },
        { id: 'fav2', name: '收藏2次', desc: '收藏2条帖子', target: 2, capsReward: 2, expReward: 4, type: 'daily' },
        { id: 'tip3', name: '投盖3次', desc: '给别人投3个瓶盖', target: 3, capsReward: 3, expReward: 5, type: 'daily' },
        { id: 'liked3', name: '获赞3次', desc: '帖子收到3个赞', target: 3, capsReward: 2, expReward: 4, type: 'daily' },
        { id: 'signin3', name: '连续签到3天', desc: '连续签到3天不中断', target: 3, capsReward: 3, expReward: 6, type: 'daily' },
        { id: 'profile', name: '完善资料', desc: '填写个人简介', target: 1, capsReward: 2, expReward: 3, type: 'once' }
    ];
}

// ===== 获取用户今日任务进度 =====
export async function getUserTasks(env, userId, today) {
    const taskDefs = getDailyTasks();
    const rows = await env.DB.prepare(
        'SELECT task_id, progress, target, claimed FROM user_tasks WHERE user_id = ? AND task_date = ?'
    ).bind(userId, today).all();
    const progressMap = {};
    for (const row of rows.results) {
        progressMap[row.task_id] = { progress: row.progress, target: row.target, claimed: row.claimed };
    }
    return taskDefs.map(t => {
        const p = progressMap[t.id];
        return {
            ...t,
            progress: p ? p.progress : 0,
            claimed: p ? p.claimed : 0,
            canClaim: (p ? p.progress : 0) >= t.target && !(p ? p.claimed : 0)
        };
    });
}

// ===== 领取任务奖励 =====
export async function claimTaskReward(env, userId, taskId, today) {
    const taskDefs = getDailyTasks();
    const task = taskDefs.find(t => t.id === taskId);
    if (!task) return { success: false, message: '任务不存在' };

    const row = await env.DB.prepare(
        'SELECT progress, claimed FROM user_tasks WHERE user_id = ? AND task_id = ? AND task_date = ?'
    ).bind(userId, taskId, today).first();

    if (!row || row.progress < task.target) return { success: false, message: '任务未完成' };
    if (row.claimed) return { success: false, message: '奖励已领取' };

    let capsGain, expGain;
    if (task.capsReward === '1~3') {
        capsGain = Math.floor(Math.random() * 3) + 1;
        expGain = Math.floor(Math.random() * 3) + 1;
    } else {
        capsGain = task.capsReward;
        expGain = task.expReward;
    }

    await env.DB.prepare(
        'UPDATE user_tasks SET claimed = 1 WHERE user_id = ? AND task_id = ? AND task_date = ?'
    ).bind(userId, taskId, today).run();
    await env.DB.prepare('UPDATE users SET caps = caps + ? WHERE id = ?').bind(capsGain, userId).run();

    // 添加经验并检查升级
    const userRow = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
    let leveledUp = false;
    if (userRow) {
        const result = await addExpAndCheckLevel(env, userRow, expGain);
        leveledUp = result.leveledUp;
    }

    return { success: true, capsGain, expGain, taskName: task.name, leveledUp };
}

// ===== 更新任务进度 =====
export async function updateTaskProgress(env, userId, taskId, target, today) {
    await env.DB.prepare(
        `INSERT INTO user_tasks (user_id, task_id, progress, target, task_date)
         VALUES (?, ?, 1, ?, ?)
         ON CONFLICT(user_id, task_id, task_date) DO UPDATE SET progress = progress + 1`
    ).bind(userId, taskId, target, today).run();
}

// ===== 投盖 =====
export async function tipPost(env, user, postId, amount) {
    // 验证帖子存在
    const post = await env.DB.prepare('SELECT id, user_id, caps FROM posts WHERE id = ? AND is_deleted = 0').bind(postId).first();
    if (!post) return { success: false, message: '帖子不存在' };

    // 不能给自己投
    if (post.user_id === user.id) return { success: false, message: '不能给自己的帖子投盖' };

    // 检查余额
    if (user.caps < amount) return { success: false, message: `瓶盖不足，当前余额 ${user.caps}` };

    // 检查是否已经投过
    const existing = await env.DB.prepare('SELECT id FROM post_tips WHERE post_id = ? AND user_id = ?').bind(postId, user.id).first();
    if (existing) return { success: false, message: '已经投过该帖了' };

    // 检查每日限额（投出的总瓶盖数）
    const today = new Date().toISOString().slice(0, 10);
    // 从users表的daily_tips_given字段查
    const userRow = await env.DB.prepare('SELECT daily_tips_given, daily_tasks_date FROM users WHERE id = ?').bind(user.id).first();
    let tipsGivenToday = 0;
    if (userRow.daily_tasks_date === today) {
        tipsGivenToday = userRow.daily_tips_given || 0;
    }
    if (tipsGivenToday + amount > 10) {
        const remaining = 10 - tipsGivenToday;
        return {
            success: false,
            message: `投盖数超过当天限额 ${tipsGivenToday}/10`,
            remaining,
            canTipOne: remaining >= 1
        };
    }

    // 执行投盖
    await env.DB.prepare('INSERT INTO post_tips (post_id, user_id, amount) VALUES (?, ?, ?)').bind(postId, user.id, amount).run();
    await env.DB.prepare('UPDATE posts SET tips_count = tips_count + ?, caps = caps + ? WHERE id = ?').bind(amount, amount, postId).run();
    await env.DB.prepare('UPDATE users SET caps = caps - ? WHERE id = ?').bind(amount, user.id).run();

    // 更新daily计数
    if (userRow.daily_tasks_date === today) {
        await env.DB.prepare('UPDATE users SET daily_tips_given = daily_tips_given + ? WHERE id = ?').bind(amount, user.id).run();
    } else {
        await env.DB.prepare('UPDATE users SET daily_tips_given = ?, daily_tasks_date = ? WHERE id = ?').bind(amount, today, user.id).run();
    }

    // 更新投盖任务进度
    await updateTaskProgress(env, user.id, 'tip3', 3, today);

    user.caps -= amount;
    return { success: true, amount, postTipsCount: (post.caps || 0) + amount, userCaps: user.caps };
}

// ===== 获取用户投盖状态（某帖子） =====
export async function getTipStatus(env, userId, postId) {
    if (!userId) return { tipped: false, amount: 0 };
    const row = await env.DB.prepare('SELECT amount FROM post_tips WHERE post_id = ? AND user_id = ?').bind(postId, userId).first();
    if (row) return { tipped: true, amount: row.amount };
    return { tipped: false, amount: 0 };
}

// ===== 获取用户每日投盖已用额度 =====
export async function getDailyTipsUsed(env, userId) {
    const today = new Date().toISOString().slice(0, 10);
    const row = await env.DB.prepare('SELECT daily_tips_given, daily_tasks_date FROM users WHERE id = ?').bind(userId).first();
    if (row && row.daily_tasks_date === today) return row.daily_tips_given || 0;
    return 0;
}

// ===== 更新用户日常行为计数（点赞/发帖/评论/收藏/获赞） =====
export async function updateDailyCount(env, userId, field, today) {
    // field: daily_likes, daily_posts, daily_comments, daily_favorites
    await env.DB.prepare(
        `UPDATE users SET ${field} = CASE WHEN daily_tasks_date = ? THEN ${field} + 1 ELSE 1 END,
         daily_tasks_date = CASE WHEN daily_tasks_date = ? THEN daily_tasks_date ELSE ? END
         WHERE id = ?`
    ).bind(today, today, today, userId).run();
}

// ===== 记录每日获赞 =====
export async function incrementReceivedLikes(env, postOwnerId) {
    if (!postOwnerId) return;
    const today = new Date().toISOString().slice(0, 10);
    await env.DB.prepare(
        `INSERT INTO daily_received_likes (user_id, count, record_date) VALUES (?, 1, ?)
         ON CONFLICT(user_id, record_date) DO UPDATE SET count = count + 1`
    ).bind(postOwnerId, today).run();
    
    // 更新获赞任务进度
    const row = await env.DB.prepare(
        'SELECT count FROM daily_received_likes WHERE user_id = ? AND record_date = ?'
    ).bind(postOwnerId, today).first();
    if (row && row.count <= 3) {
        await env.DB.prepare(
            `INSERT INTO user_tasks (user_id, task_id, progress, target, task_date) VALUES (?, 'liked3', ?, 3, ?)
             ON CONFLICT(user_id, task_id, task_date) DO UPDATE SET progress = ?`
        ).bind(postOwnerId, row.count, today, row.count).run();
    }
}

// ===== 创建消息 =====
export async function createMessage(env, userId, type, senderName, content, relatedPostId = null) {
    await env.DB.prepare(
        'INSERT INTO messages (user_id, type, sender_name, content, related_post_id) VALUES (?, ?, ?, ?, ?)'
    ).bind(userId, type, senderName, content, relatedPostId).run();
}
