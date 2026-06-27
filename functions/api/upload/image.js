// POST /api/upload/image - 图片上传到 R2
// 支持：头像（200KB限制）、帖子图片（2MB限制）
import { getUserFromRequest, json, cors, checkRateLimit } from '../_lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestPost({ request, env }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (!user) return json({ error: '请先登录' }, 401);

        // 频率限制
        if (!await checkRateLimit(env.KV, 'upload:' + user.id, 10, 60)) {
            return json({ error: '上传过于频繁，请稍后再试' }, 429);
        }

        const formData = await request.formData();
        const file = formData.get('file');
        const type = formData.get('type') || 'post'; // 'avatar' 或 'post'

        if (!file) return json({ error: '未找到文件' }, 400);

        const maxSize = type === 'avatar' ? 200 * 1024 : 2 * 1024 * 1024;
        if (file.size > maxSize) {
            return json({ error: `文件超过${type === 'avatar' ? '200KB' : '2MB'}限制` }, 400);
        }

        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (!allowedTypes.includes(file.type)) {
            return json({ error: '只支持 JPG/PNG/WebP/GIF 格式' }, 400);
        }

        // 生成文件名：{type}/{userId}_{timestamp}.{ext}
        const ext = file.type.split('/')[1];
        const filename = `${type}/${user.id}_${Date.now()}.${ext}`;

        // 上传到 R2
        await env.R2.put(filename, file.stream(), {
            httpMetadata: { contentType: file.type }
        });

        // 返回访问URL
        const url = `/api/upload/image/${filename}`;

        // 如果是头像，同时更新用户记录
        if (type === 'avatar') {
            await env.DB.prepare('UPDATE users SET avatar = ? WHERE id = ?').bind(url, user.id).run();
        }

        return json({ url, type });
    } catch (e) {
        return json({ error: '服务器错误: ' + e.message }, 500);
    }
}
