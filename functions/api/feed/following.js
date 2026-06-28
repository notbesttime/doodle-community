// GET /api/feed/following - 关注动态流（关注的人的帖子）
import { getUserFromRequest, json, cors } from '../lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestGet({ request, env }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (!user) return json({ error: '请先登录' }, 401);

        const url = new URL(request.url);
        const page = parseInt(url.searchParams.get('page') || '1');
        const limit = parseInt(url.searchParams.get('limit') || '20');
        const offset = (page - 1) * limit;

        // 查关注的人的帖子
        const { results } = await env.DB.prepare(
            `SELECT p.* FROM posts p
             INNER JOIN follows f ON f.following_id = p.user_id
             WHERE f.follower_id = ? AND p.is_deleted = 0 AND p.is_private = 0
             ORDER BY p.created_at DESC
             LIMIT ? OFFSET ?`
        ).bind(user.id, limit, offset).all();

        // 查当前用户对这些帖子的点赞/收藏/已读状态
        let likedSet = new Set(), favSet = new Set(), readSet = new Set();
        if (results.length > 0) {
            const postIds = results.map(p => p.id);

            const likesResults = await env.DB.prepare(
                `SELECT post_id FROM likes WHERE user_id = ? AND post_id IN (${postIds.join(',')})`
            ).bind(user.id).all();
            likedSet = new Set(likesResults.results.map(l => l.post_id));

            const favResults = await env.DB.prepare(
                `SELECT post_id FROM favorites WHERE user_id = ? AND post_id IN (${postIds.join(',')})`
            ).bind(user.id).all();
            favSet = new Set(favResults.results.map(f => f.post_id));

            const readResults = await env.DB.prepare(
                `SELECT post_id FROM feed_reads WHERE user_id = ? AND post_id IN (${postIds.join(',')})`
            ).bind(user.id).all();
            readSet = new Set(readResults.results.map(r => r.post_id));
        }

        // 批量标记为已读
        for (const p of results) {
            if (!readSet.has(p.id)) {
                await env.DB.prepare(
                    'INSERT OR IGNORE INTO feed_reads (user_id, post_id) VALUES (?, ?)'
                ).bind(user.id, p.id).run();
            }
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
            createdAt: formatTime(p.created_at),
            liked: likedSet.has(p.id),
            favorited: favSet.has(p.id),
            isNew: !readSet.has(p.id)
        }));

        return json({ posts, page, hasMore: results.length === limit });
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
