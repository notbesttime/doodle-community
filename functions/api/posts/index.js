// GET /api/posts - 帖子列表（支持搜索、分页）
// POST /api/posts - 发帖
import { getUserFromRequest, json, cors, checkLevelUp, checkRateLimit } from '../../_lib/utils.js';

export async function onRequestOptions() { return cors(); }

// 获取帖子列表
export async function onRequestGet({ request, env }) {
    try {
        const url = new URL(request.url);
        const page = parseInt(url.searchParams.get('page') || '1');
        const limit = parseInt(url.searchParams.get('limit') || '20');
        const search = url.searchParams.get('search') || '';
        const type = url.searchParams.get('type') || 'post';

        const offset = (page - 1) * limit;
        let query, params;

        if (search) {
            if (type === 'post') {
                query = 'SELECT * FROM posts WHERE title LIKE ? OR content LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?';
                params = [`%${search}%`, `%${search}%`, limit, offset];
            } else {
                query = 'SELECT * FROM posts WHERE author_name LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?';
                params = [`%${search}%`, limit, offset];
            }
        } else {
            query = 'SELECT * FROM posts ORDER BY created_at DESC LIMIT ? OFFSET ?';
            params = [limit, offset];
        }

        const { results } = await env.DB.prepare(query).bind(...params).all();

        // 获取当前用户的点赞/收藏状态
        const user = await getUserFromRequest(env, request);
        let likedSet = new Set(), favSet = new Set();
        if (user && results.length > 0) {
            const postIds = results.map(p => p.id);
            const likesResults = await env.DB.prepare(
                `SELECT post_id FROM likes WHERE user_id = ? AND post_id IN (${postIds.join(',')})`
            ).bind(user.id).all();
            likedSet = new Set(likesResults.results.map(l => l.post_id));

            const favResults = await env.DB.prepare(
                `SELECT post_id FROM favorites WHERE user_id = ? AND post_id IN (${postIds.join(',')})`
            ).bind(user.id).all();
            favSet = new Set(favResults.results.map(f => f.post_id));
        }

        const posts = results.map(p => ({
            id: p.id,
            author: p.author_name,
            authorLevel: p.author_level,
            title: p.title,
            content: p.content.substring(0, 200),
            images: JSON.parse(p.images || '[]'),
            videoUrl: p.video_url,
            likes: p.likes_count,
            comments: p.comments_count,
            favorites: p.favorites_count,
            createdAt: formatTime(p.created_at),
            liked: likedSet.has(p.id),
            favorited: favSet.has(p.id)
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

        const { title, content, images, videoUrl } = await request.json();
        if (!title || !title.trim()) return json({ error: '请输入标题' }, 400);
        if (!content || !content.trim()) return json({ error: '请输入内容' }, 400);

        // 频率限制：1分钟1帖
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        if (!await checkRateLimit(env.KV, 'post:' + user.id, 1, 60)) {
            return json({ error: '发帖过于频繁，请1分钟后再试' }, 429);
        }

        const result = await env.DB.prepare(
            'INSERT INTO posts (user_id, author_name, author_level, title, content, images, video_url) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(
            user.id, user.nickname, user.level, title.trim(), content.trim(),
            JSON.stringify(images || []), videoUrl || ''
        ).run();

        // 经验+2 瓶盖+3
        user.exp += 2;
        user.caps += 3;
        checkLevelUp(user);
        await env.DB.prepare(
            'UPDATE users SET exp = ?, caps = ?, level = ? WHERE id = ?'
        ).bind(user.exp, user.caps, user.level, user.id).run();

        return json({
            postId: result.meta.last_row_id,
            user: {
                ...user,
                token: undefined
            },
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
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
    if (diff < 2592000) return Math.floor(diff / 86400) + '天前';
    return created.toLocaleDateString('zh-CN');
}
