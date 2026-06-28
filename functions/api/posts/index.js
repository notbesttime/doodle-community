// GET /api/posts - 帖子列表（支持搜索、分页）
// POST /api/posts - 发帖
import { getUserFromRequest, json, cors, checkLevelUp, checkRateLimit, checkIpBlacklist, checkPostLimit, checkAndCleanupPosts, filterSensitiveWords, updateDailyCount, updateTaskProgress } from '../lib/utils.js';

export async function onRequestOptions() { return cors(); }

// 获取帖子列表
export async function onRequestGet({ request, env }) {
    try {
        // IP黑名单检查
        const ipInfo = await checkIpBlacklist(env, request);
        if (ipInfo.blocked) return json({ error: '您的IP已被封禁' }, 403);

        const url = new URL(request.url);
        const page = parseInt(url.searchParams.get('page') || '1');
        const limit = parseInt(url.searchParams.get('limit') || '20');
        const search = url.searchParams.get('search') || '';
        const type = url.searchParams.get('type') || 'post';
        const sort = url.searchParams.get('sort') || 'hot'; // hot | latest

        const offset = (page - 1) * limit;
        const user = await getUserFromRequest(env, request);
        const userId = user ? user.id : 0;

        // 排序：hot=热度算法, latest=纯时间倒序
        const orderClause = sort === 'latest'
            ? 'ORDER BY created_at DESC'
            : `ORDER BY (likes_count * 3 + comments_count * 2 + favorites_count * 4) / POWER((julianday('now') - julianday(created_at)) * 24 + 2, 1.8) DESC, created_at DESC`;

        // 过滤：未删除(is_deleted=0) 且 (非私密 或 自己是楼主 或 管理员)
        let query, params;
        const baseFilter = '(is_deleted = 0) AND (is_private = 0 OR user_id = ?)';

        if (search) {
            if (type === 'post') {
                query = `SELECT * FROM posts WHERE ${baseFilter} AND (title LIKE ? OR content LIKE ?) ${orderClause} LIMIT ? OFFSET ?`;
                params = [userId, `%${search}%`, `%${search}%`, limit, offset];
            } else {
                query = `SELECT * FROM posts WHERE ${baseFilter} AND author_name LIKE ? ${orderClause} LIMIT ? OFFSET ?`;
                params = [userId, `%${search}%`, limit, offset];
            }
        } else {
            query = `SELECT * FROM posts WHERE ${baseFilter} ${orderClause} LIMIT ? OFFSET ?`;
            params = [userId, limit, offset];
        }

        const { results } = await env.DB.prepare(query).bind(...params).all();

        let likedSet = new Set(), favSet = new Set(), followingSet = new Set(), tipSet = new Set();
        if (user && results.length > 0) {
            const postIds = results.map(p => p.id);
            const authorIds = [...new Set(results.map(p => p.user_id))];

            const likesResults = await env.DB.prepare(
                `SELECT post_id FROM likes WHERE user_id = ? AND post_id IN (${postIds.join(',')})`
            ).bind(user.id).all();
            likedSet = new Set(likesResults.results.map(l => l.post_id));

            const favResults = await env.DB.prepare(
                `SELECT post_id FROM favorites WHERE user_id = ? AND post_id IN (${postIds.join(',')})`
            ).bind(user.id).all();
            favSet = new Set(favResults.results.map(f => f.post_id));

            // 投盖状态查询
            try {
                const tipResults = await env.DB.prepare(
                    `SELECT post_id FROM post_tips WHERE user_id = ? AND post_id IN (${postIds.join(',')})`
                ).bind(user.id).all();
                tipSet = new Set(tipResults.results.map(t => t.post_id));
            } catch(e) {}

            // follows 表可能尚未创建，容错处理
            try {
                const followingResults = await env.DB.prepare(
                    `SELECT following_id FROM follows WHERE follower_id = ? AND following_id IN (${authorIds.join(',')})`
                ).bind(user.id).all();
                followingSet = new Set(followingResults.results.map(f => f.following_id));
            } catch(e) {}
        }

        const posts = results.map(p => ({
            id: p.id,
            author: p.author_name,
            authorId: p.user_id,
            authorLevel: p.author_level,
            title: p.title,
            content: p.content.substring(0, 200),
            images: JSON.parse(p.images || '[]'),
            videoUrl: p.video_url,
            likes: p.likes_count,
            comments: p.comments_count,
            favorites: p.favorites_count,
            tips: p.tips_count || 0,
            createdAt: formatTime(p.created_at),
            liked: likedSet.has(p.id),
            favorited: favSet.has(p.id),
            tipped: tipSet.has(p.id),
            isFollowing: followingSet.has(p.user_id)
        }));

        return json({ posts, page, hasMore: results.length === limit });
    } catch (e) {
        return json({ error: '服务器错误: ' + e.message }, 500);
    }
}

// 发帖
export async function onRequestPost({ request, env }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (!user) return json({ error: '请先登录' }, 401);

        // IP黑名单检查
        const ipInfo = await checkIpBlacklist(env, request);
        if (ipInfo.blocked) return json({ error: '您的IP已被封禁' }, 403);

        const { title, content, images, videoUrl } = await request.json();
        if (!title || !title.trim()) return json({ error: '请输入标题' }, 400);
        if (!content || !content.trim()) return json({ error: '请输入内容' }, 400);
        if (title.trim().length > 50) return json({ error: '标题不能超过50字' }, 400);
        if (content.trim().length > 5000) return json({ error: '内容不能超过5000字' }, 400);

        // 发帖频率限制（1分钟1帖）
        if (!await checkRateLimit(env.KV, 'post:' + user.id, 1, 60, env.DB)) {
            return json({ error: '发帖过于频繁，请1分钟后再试' }, 429);
        }

        // 24小时发帖上限检查
        const postLimit = await checkPostLimit(env, user);
        if (!postLimit.allowed) {
            return json({ error: postLimit.message }, 429);
        }

        // 敏感词过滤（星号替换）
        const filteredTitle = filterSensitiveWords(title.trim());
        const filteredContent = filterSensitiveWords(content.trim());

        const result = await env.DB.prepare(
            'INSERT INTO posts (user_id, author_name, author_level, title, content, images, video_url) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(
            user.id, user.nickname, user.level, filteredTitle, filteredContent,
            JSON.stringify(images || []), videoUrl || ''
        ).run();

        user.exp += 2;
        user.caps += 3;
        const leveledUp = checkLevelUp(user);
        await env.DB.prepare(
            'UPDATE users SET exp = ?, caps = ?, level = ? WHERE id = ?'
        ).bind(user.exp, user.caps, user.level, user.id).run();

        // 更新每日发帖计数和任务进度
        const today = new Date().toISOString().slice(0, 10);
        await updateDailyCount(env, user.id, 'daily_posts', today);
        await updateTaskProgress(env, user.id, 'post2', 2, today);

        // 异步检查帖子总量并清理
        await checkAndCleanupPosts(env);

        return json({
            postId: result.meta.last_row_id,
            user: { ...user, token: undefined, leveledUp },
            message: '发帖成功！经验+2 瓶盖+3'
        });
    } catch (e) {
        return json({ error: '服务器错误: ' + e.message }, 500);
    }
}

function formatTime(isoStr) {
    const now = new Date();
    const created = new Date(isoStr + 'Z');
    const diff = Math.floor((now - created) / 1000);
    if (diff < 300) return '刚刚';
    const y = created.getFullYear();
    const m = created.getMonth() + 1;
    const d = created.getDate();
    const h = String(created.getHours()).padStart(2, '0');
    const min = String(created.getMinutes()).padStart(2, '0');
    return `${y}年${m}月${d}日 ${h}:${min}`;
}
