// GET /api/posts/:id - 获取帖子详情
import { getUserFromRequest, json, cors } from '../../lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestGet({ params, request, env }) {
    try {
        const id = params.id;
        const post = await env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first();
        if (!post) return json({ error: '帖子不存在' }, 404);

        const user = await getUserFromRequest(env, request);

        // 判断可见性：已删除的帖子只有楼主和管理员可见
        if (post.is_deleted) {
            const isOwner = user && user.id === post.user_id;
            const isAdmin = user && user.role === 'admin';
            if (!isOwner && !isAdmin) return json({ error: '帖子不存在' }, 404);
        }

        // 判断私密：私密帖子只有楼主和管理员可见
        if (post.is_private) {
            const isOwner = user && user.id === post.user_id;
            const isAdmin = user && user.role === 'admin';
            if (!isOwner && !isAdmin) return json({ error: '帖子不存在' }, 404);
        }

        let liked = false, favorited = false, isFollowing = false, tipped = false;
        if (user) {
            const likeRow = await env.DB.prepare(
                'SELECT id FROM likes WHERE post_id = ? AND user_id = ?'
            ).bind(id, user.id).first();
            liked = !!likeRow;
            const favRow = await env.DB.prepare(
                'SELECT id FROM favorites WHERE post_id = ? AND user_id = ?'
            ).bind(id, user.id).first();
            favorited = !!favRow;
            const tipRow = await env.DB.prepare(
                'SELECT id FROM post_tips WHERE post_id = ? AND user_id = ?'
            ).bind(id, user.id).first();
            tipped = !!tipRow;
            if (user.id !== post.user_id) {
                try {
                    const followRow = await env.DB.prepare(
                        'SELECT id FROM follows WHERE follower_id = ? AND following_id = ?'
                    ).bind(user.id, post.user_id).first();
                    isFollowing = !!followRow;
                } catch(e) {}
            }
        }

        return json({
            id: post.id,
            author: post.author_name,
            authorLevel: post.author_level,
            authorId: post.user_id,
            title: post.is_deleted ? '该帖已被删除' : post.title,
            content: post.is_deleted ? '' : post.content,
            images: post.is_deleted ? [] : JSON.parse(post.images || '[]'),
            videoUrl: post.is_deleted ? '' : post.video_url,
            likes: post.likes_count,
            comments: post.comments_count,
            favorites: post.favorites_count,
            tips: post.tips_count || 0,
            isPrivate: !!post.is_private,
            isDeleted: !!post.is_deleted,
            createdAt: formatTime(post.created_at),
            liked, favorited, tipped, isFollowing
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
