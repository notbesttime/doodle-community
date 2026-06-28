// POST /api/upload/image - 图片上传（R2未开通，暂不可用）
import { getUserFromRequest, json, cors } from '../lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestPost({ request, env }) {
    return json({ error: '图片上传功能暂未开放，敬请期待' }, 503);
}
