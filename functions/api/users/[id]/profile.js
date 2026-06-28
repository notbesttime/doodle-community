// GET /api/users/[id]/profile - 查看他人公开主页
import { getUserFromRequest, json, cors } from '../../lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestGet({ request, env, params }) {
    try {
        const targetId = parseInt(params.id);
        if (!targetId) return json({ error: '无效的用户ID' }, 400);

        const user = await env.DB.prepare(
            'SELECT id, uid, username, nickname, avatar, signature, level, exp, caps, followers, following, created_at FROM users WHERE id = ?'
        ).bind(targetId).first();
        if (!user) return json({ error: '用户不存在' }, 404);

        const currentUser = await getUserFromRequest(env, request);

        // 是否被当前用户关注
        let isFollowing = false;
        if (currentUser && currentUser.id !== targetId) {
            try {
                const row = await env.DB.prepare(
                    'SELECT id FROM follows WHERE follower_id = ? AND following_id = ?'
                ).bind(currentUser.id, targetId).first();
                isFollowing = !!row;
            } catch(e) {}
        }

        // 该用户的帖子（公开且未删除）
        const postsResult = await env.DB.prepare(
            'SELECT id, title, content, images, video_url, likes_count, comments_count, favorites_count, created_at FROM posts WHERE user_id = ? AND is_deleted = 0 AND is_private = 0 ORDER BY created_at DESC LIMIT 20'
        ).bind(targetId).all();

        const posts = postsResult.results.map(p => ({
            id: p.id,
            title: p.title,
            content: p.content.substring(0, 200),
            images: JSON.parse(p.images || '[]'),
            videoUrl: p.video_url,
            likes: p.likes_count,
            comments: p.comments_count,
            favorites: p.favorites_count,
            createdAt: formatTime(p.created_at)
        }));

        return json({
            id: user.id,
            uid: user.uid,
            username: user.username,
            nickname: user.nickname,
            avatar: user.avatar || '',
            signature: user.signature || '',
            level: user.level,
            exp: user.exp,
            caps: user.caps,
            followers: user.followers || 0,
            following: user.following || 0,
            postCount: posts.length,
            createdAt: user.created_at,
            isFollowing,
            isOwn: currentUser && currentUser.id === targetId,
            posts
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
