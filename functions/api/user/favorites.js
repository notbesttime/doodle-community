// GET /api/user/favorites - 我的收藏列表
import { getUserFromRequest, json, cors } from '../lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestGet({ request, env }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (!user) return json({ error: '请先登录' }, 401);

        const { results } = await env.DB.prepare(
            `SELECT p.* FROM posts p
             JOIN favorites f ON p.id = f.post_id
             WHERE f.user_id = ?
             ORDER BY f.created_at DESC`
        ).bind(user.id).all();

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
            createdAt: p.created_at,
            liked: false,
            favorited: true
        }));

        return json({ posts });
    } catch (e) {
        return json({ error: '服务器错误' }, 500);
    }
}
