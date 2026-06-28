// 敏感词列表 - 可手动添加/删除
// 命中后替换为等长星号（如"傻逼"→"**"）
export const SENSITIVE_WORDS = [
    // 脏话/辱骂
    '傻逼', '操你', '草泥马', '滚蛋', '废物', '垃圾人',
    '王八蛋', '狗日', '去死', '去吃屎', '贱人', '婊子',
    '嫖娼', '约炮', '一夜情',

    // 政治（基础）
    '反动', '颠覆',

    // 违法
    '毒品', '大麻', '冰毒', '海洛因', '可卡因',
    '赌博', '博彩', '时时彩', '六合彩',
    '枪支', '弹药', '炸弹制作', '杀人方法',

    // 广告/垃圾
    '加微信', '加qq', '免费领取', '点击链接', '日赚百元',
    '兼职刷单', '代刷', '低价出售', '优惠券免费领',

    // 其他
    '自杀方法', '自残',
];

// 检查并替换敏感词
export function filterSensitiveWords(text) {
    if (!text) return text;
    let result = text;
    for (const word of SENSITIVE_WORDS) {
        if (result.includes(word)) {
            const stars = '*'.repeat(word.length);
            result = result.split(word).join(stars);
        }
    }
    return result;
}

// 检查是否包含敏感词（返回true/false，不替换）
export function containsSensitiveWord(text) {
    if (!text) return false;
    return SENSITIVE_WORDS.some(word => text.includes(word));
}
