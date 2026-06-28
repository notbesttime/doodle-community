// GET /api/upload/image/[type]/[filename] - 从 R2 读取图片（R2未开通，暂不可用）
import { cors } from '../../../lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestGet() {
    return new Response('Not Found', { status: 404 });
}
