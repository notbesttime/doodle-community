// POST /api/admin/users/[id]/reset-password - 管理员重置用户密码
// Body: { password: "新密码" }
import { getUserFromRequest, hashPassword, json, cors, createMessage } from '../../../lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestPost({ request, env, params }) {
    try {
        const adminUser = await getUserFromRequest(env, request);
        if (!adminUser) return json({ error: '请先登录' }, 401);
        if (adminUser.role !== 'admin') return json({ error: '无权限，仅管理员可访问' }, 403);

        const userId = parseInt(params.id);
        if (!userId) return json({ error: '无效的用户ID' }, 400);

        const body = await request.json();
        const newPassword = body.password;
        if (!newPassword || newPassword.length < 6) {
            return json({ error: '新密码至少6位' }, 400);
        }
        if (newPassword.length > 64) {
            return json({ error: '密码不能超过64位' }, 400);
        }

        // 检查目标用户是否存在
        const targetUser = await env.DB.prepare(
            'SELECT id, username, nickname FROM users WHERE id = ?'
        ).bind(userId).first();
        if (!targetUser) return json({ error: '用户不存在' }, 404);

        // 不允许重置自己的密码（管理员应通过正常改密流程）
        if (userId === adminUser.id) {
            return json({ error: '不能重置自己的密码，请使用修改密码功能' }, 400);
        }

        // 哈希新密码
        const passwordHash = await hashPassword(newPassword);

        // 更新密码
        await env.DB.prepare(
            'UPDATE users SET password_hash = ? WHERE id = ?'
        ).bind(passwordHash, userId).run();

        // 清除该用户所有会话（强制重新登录）
        await env.DB.prepare(
            'DELETE FROM sessions WHERE user_id = ?'
        ).bind(userId).run();

        // 发送系统消息通知用户
        await createMessage(
            env, userId, 'system', '系统管理员',
            `您的密码已被管理员重置，请使用新密码登录。如非本人操作，请立即联系管理员。`
        );

        return json({
            message: `已重置用户「${targetUser.nickname}」的密码，该用户的所有登录会话已失效`,
            username: targetUser.username,
            nickname: targetUser.nickname
        });
    } catch (e) {
        return json({ error: '服务器错误: ' + e.message }, 500);
    }
}
