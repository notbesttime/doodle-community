// GET /api/posts/:id - 获取帖子详情
import { getUserFromRequest, json, cors } from '../../_lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestGet({ params, request, env }) {
    try {
        const id = params.id;
        const post = await env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first();
        if (!post) return json({ error: '帖子不存在' }, 404);

        // 获取当前用户的点赞/收藏状态
        const user = await getUserFromRequest(env, request);
        let liked = false, favorited = false;
        if (user) {
            const likeRow = await env.DB.prepare(
                'SELECT id FROM likes WHERE post_id = ? AND user_id = ?'
            ).bind(id, user.id).first();
            liked = !!likeRow;
            const favRow = await env.DB.prepare(
                'SELECT id FROM favorites WHERE post_id = ? AND user_id = ?'
            ).bind(id, user.id).first();
            favorited = !!favRow;
        }

        return json({
            id: post.id,
            author: post.author_name,
            authorLevel: post.author_level,
            title: post.title,
            content: post.content,
            images: JSON.parse(post.images || '[]'),
            videoUrl: post.video_url,
            likes: post.likes_count,
            comments: post.comments_count,
            favorites: post.favorites_count,
            createdAt: formatTime(post.created_at),
            liked, favorited
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
