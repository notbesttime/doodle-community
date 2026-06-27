// PUT /api/user/rename - 改名（首次免费，后续5瓶盖）
import { getUserFromRequest, json, cors } from '../_lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestPut({ request, env }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (!user) return json({ error: '请先登录' }, 401);

        const { newNickname } = await request.json();
        if (!newNickname || !newNickname.trim()) return json({ error: '请输入新昵称' }, 400);
        if (newNickname.length > 20) return json({ error: '昵称最多20个字符' }, 400);

        const isFree = user.rename_count === 0;
        const cost = 5;

        if (!isFree && user.caps < cost) {
            return json({ error: `改名需要${cost}瓶盖，当前不足` }, 400);
        }

        // 扣瓶盖（首次免费）
        if (!isFree) {
            await env.DB.prepare(
                'UPDATE users SET nickname = ?, rename_count = rename_count + 1, caps = caps - ? WHERE id = ?'
            ).bind(newNickname.trim(), cost, user.id).run();
        } else {
            await env.DB.prepare(
                'UPDATE users SET nickname = ?, rename_count = rename_count + 1 WHERE id = ?'
            ).bind(newNickname.trim(), user.id).run();
        }

        // 更新所有帖子的作者名
        await env.DB.prepare(
            'UPDATE posts SET author_name = ? WHERE user_id = ?'
        ).bind(newNickname.trim(), user.id).run();

        // 更新所有评论的作者名
        await env.DB.prepare(
            'UPDATE comments SET author_name = ? WHERE user_id = ?'
        ).bind(newNickname.trim(), user.id).run();

        return json({
            success: true,
            nickname: newNickname.trim(),
            cost: isFree ? 0 : cost,
            caps: isFree ? user.caps : user.caps - cost,
            renameCount: user.rename_count + 1,
            message: isFree ? '改名成功！（首次免费）' : `改名成功！消耗${cost}瓶盖`
        });
    } catch (e) {
        return json({ error: '服务器错误' }, 500);
    }
}
