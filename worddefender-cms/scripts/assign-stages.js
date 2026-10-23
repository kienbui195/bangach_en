/**
 * Chia bộ từ chính thức trong CMS thành 12 chặng × 15 màn theo thiết kế (mục 1 của tài liệu
 * thiết kế bản online), rồi ghi topicSlug / levelNumber / orderIndex cho từng từ và dựng
 * topic + level tương ứng.
 *
 *   node scripts/assign-stages.js            # chỉ xem kế hoạch, không ghi gì
 *   node scripts/assign-stages.js --apply    # ghi xuống CMS
 *
 * Chặng lấy theo trường `category` của từ: các category được gom vào 12 chặng sao cho mỗi
 * chặng xấp xỉ 250 từ và một category không bị xẻ đôi (trừ khi tự nó quá lớn). Trong một
 * chặng, từ dễ xếp trước (cefr, rồi độ dài, rồi a→z), nên màn đầu toàn từ ngắn.
 *
 * Ràng buộc quan trọng rút ra từ lỗi "từ bị lặp trong modal": pool của màn N là từ mới của
 * màn N cộng từ mới của màn N−1, nên pool phải ≥ targetCount, nếu không game buộc phải cắt
 * bớt số từ của màn. Script kiểm tra điều này và báo lỗi nếu vi phạm.
 */
const path = require('path');
const { createStrapi } = require('@strapi/strapi');

const APPLY = process.argv.includes('--apply');

// ---- Thiết kế 15 màn của một chặng (giữ đúng tài liệu) ----
const TARGETS = [10, 12, 15, 18, 20, 22, 25, 28, 30, 32, 36, 40, 44, 48, 50];
/**
 * Số gạch rơi cùng lúc theo mức khó (khớp GAME_RULES.pace.concurrent của client): trong một
 * mức, các màn rải đều từ đầu đến cuối khoảng. Đây là thước đo độ khó duy nhất — tốc độ rơi
 * giống nhau ở mọi màn.
 */
const CONCURRENT = { easy: [3, 5], medium: [6, 10], hard: [11, 15], boss: 15 };

const concurrentOf = (n) => {
  const tier = tierOf(n);
  if (tier === 'boss') return CONCURRENT.boss;
  const peers = [];
  for (let i = 1; i <= TARGETS.length; i++) if (tierOf(i) === tier) peers.push(i);
  const [lo, hi] = CONCURRENT[tier];
  const idx = peers.indexOf(n);
  return peers.length <= 1 ? lo : Math.round(lo + (hi - lo) * (idx / (peers.length - 1)));
};
const WORDS_PER_TOPIC = 250;

/**
 * Số từ MỚI của mỗi màn. Tài liệu lấy 60% targetCount, nhưng màn 1 không có màn trước để ôn
 * nên phải tự đủ từ; các màn sau cũng được nâng lên nếu 60% cộng màn trước vẫn thiếu.
 * Màn boss nhận phần còn lại để tổng đúng 250.
 */
const newPerLevel = () => {
  const news = [];
  for (let i = 0; i < TARGETS.length - 1; i++) {
    const sixty = Math.round(0.6 * TARGETS[i]);
    const needed = TARGETS[i] - (news[i - 1] ?? 0); // đủ pool cho chính màn này
    news.push(Math.max(sixty, needed));
  }
  news.push(WORDS_PER_TOPIC - news.reduce((a, b) => a + b, 0));
  return news;
};

const NEWS = newPerLevel();

const tierOf = (n) => (n === 15 ? 'boss' : n <= 4 ? 'easy' : n <= 9 ? 'medium' : 'hard');

/** Số chữ bị che: tỉ lệ 25→80% của tài liệu, quy ra số ký tự trên một từ dài trung bình 6. */
const missingOf = (n) => {
  if (n === 15) return [5, 8];
  const t = (n - 1) / 14;
  const lo = Math.max(1, Math.round((0.25 + (0.65 - 0.25) * t) * 6));
  const hi = Math.max(lo + 1, Math.round((0.35 + (0.8 - 0.35) * t) * 6));
  return [lo, hi];
};

const levelSpec = (n) => {
  const [minMissing, maxMissing] = missingOf(n);
  const boss = n === 15;
  return {
    levelNumber: n,
    title: boss ? 'Màn Cuối: Trùm Chặng' : `Màn ${n}`,
    subtitle: boss
      ? `Toàn bộ từ của chặng, khuyết ${minMissing}-${maxMissing} ký tự`
      : `Khuyết ${minMissing}-${maxMissing} ký tự`,
    difficulty: tierOf(n),
    isBoss: boss,
    targetCount: TARGETS[n - 1],
    minMissing,
    maxMissing,
    fallSpeed: Number((4.5 + (9 - 4.5) * ((n - 1) / 14)).toFixed(1)),
    spawnInterval: Math.round(5000 - (5000 - 3200) * ((n - 1) / 14)),
    maxConcurrent: concurrentOf(n),
  };
};

// ---- Các chặng theo chủ đề nghề nghiệp (thay 12 chặng chung của tài liệu thiết kế) ----
const TOPICS = [
  ['van-phong-giao-tiep', 'Văn Phòng & Giao Tiếp Công Việc', 'Email, họp hành, báo cáo, quản lý dự án, trao đổi với khách hàng, ước lượng và xử lý vấn đề', '#3b82f6'],
  ['it-phat-trien-phan-mem', 'IT & Phát Triển Phần Mềm', 'Lập trình, kiểm thử, triển khai, hạ tầng, quy trình phát triển', '#6366f1'],
  ['may-mac-det-may', 'May Mặc & Dệt May', 'Vải sợi, công đoạn may, đơn hàng, kiểm hàng, xuất nhập khẩu', '#f97316'],
];

const CEFR_RANK = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };

/** Dễ trước khó: CEFR, rồi từ ngắn, rồi a→z cho ổn định giữa các lần chạy. */
const byDifficulty = (a, b) =>
  (CEFR_RANK[a.cefr] ?? 3) - (CEFR_RANK[b.cefr] ?? 3) ||
  a.headword.length - b.headword.length ||
  a.headword.localeCompare(b.headword);

/**
 * Gom các category thành 12 nhóm ~250 từ, giữ nguyên category trong cùng một nhóm khi có thể.
 * Category lớn hơn 250 từ bị cắt làm nhiều phần; nhóm thiếu được bù bằng category kế tiếp.
 */
const groupIntoTopics = (words) => {
  // Bạn đã tự gán chặng trong file import thì giữ nguyên, chỉ chia màn.
  const slugs = TOPICS.map((t) => t[0]);
  const tagged = words.filter((w) => slugs.includes(w.topicSlug)).length;
  if (tagged >= words.length * 0.9) {
    console.log(`Giữ topicSlug có sẵn (${tagged}/${words.length} từ đã gắn chặng)`);
    return slugs.map((slug) => words.filter((w) => w.topicSlug === slug));
  }

  const byCategory = new Map();
  for (const w of words) {
    const key = w.category || 'Khác';
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key).push(w);
  }
  // category nhiều từ trước, để phần dư nhỏ dễ lấp vào chỗ trống
  const buckets = [...byCategory.entries()].sort((a, b) => b[1].length - a[1].length);

  const topics = Array.from({ length: TOPICS.length }, () => []);
  const capacity = Math.ceil(words.length / TOPICS.length);
  for (const [, items] of buckets) {
    const rest = [...items].sort(byDifficulty);
    while (rest.length) {
      // chặng còn nhiều chỗ nhất
      const idx = topics.reduce((best, t, i) => (t.length < topics[best].length ? i : best), 0);
      const room = Math.max(1, capacity - topics[idx].length);
      topics[idx].push(...rest.splice(0, room));
    }
  }
  return topics;
};

/** Rải từ của một chặng vào 15 màn theo NEWS; trả về [{levelNumber, words}]. */
const splitIntoLevels = (words) => {
  const sorted = [...words].sort(byDifficulty);
  const total = sorted.length;
  const out = [];
  let cursor = 0;
  for (let n = 1; n <= 15; n++) {
    // chặng có thể lệch 250 nên chia theo tỉ lệ
    const share = n === 15 ? total - cursor : Math.round((NEWS[n - 1] / WORDS_PER_TOPIC) * total);
    out.push({ levelNumber: n, words: sorted.slice(cursor, cursor + share) });
    cursor += share;
  }
  return out;
};

/** Pool thật của màn trong game: từ mới của màn đó + màn liền trước; boss lấy cả chặng. */
const poolSize = (levels, n) =>
  n === 15
    ? levels.reduce((sum, l) => sum + l.words.length, 0)
    : levels[n - 1].words.length + (levels[n - 2]?.words.length ?? 0);

const upsert = async (strapi, uid, filters, fields) => {
  const docs = strapi.documents(uid);
  const found = await docs.findFirst({ filters });
  if (found) {
    await docs.update({ documentId: found.documentId, data: fields });
    return { documentId: found.documentId, created: false };
  }
  const doc = await docs.create({ data: fields });
  return { documentId: doc.documentId, created: true };
};

const main = async () => {
  const strapi = await createStrapi({ appDir: process.cwd(), distDir: path.join(process.cwd(), 'dist') }).load();

  const words = await strapi.documents('api::vocabulary.vocabulary').findMany({
    filters: { ownerKey: 'official' },
    limit: -1,
  });
  strapi.log.info(`Đọc ${words.length} từ chính thức`);
  if (!words.length) {
    strapi.log.warn('Chưa có từ nào, dừng.');
    await strapi.destroy();
    return;
  }

  const grouped = groupIntoTopics(words);
  // Chặng chưa có từ nào thì không dựng, để CMS khỏi có chặng rỗng.
  const plan = grouped
    .map((topicWords, i) => ({
      topic: TOPICS[i],
      levels: splitIntoLevels(topicWords),
      total: topicWords.length,
    }))
    .filter((p) => p.total > 0);

  // ---- báo cáo + kiểm tra pool ----
  let problems = 0;
  for (const p of plan) {
    const short = [];
    for (let n = 1; n <= 15; n++) {
      if (poolSize(p.levels, n) < TARGETS[n - 1]) short.push(`màn ${n} (pool ${poolSize(p.levels, n)} < ${TARGETS[n - 1]})`);
    }
    problems += short.length;
    strapi.log.info(
      `${p.topic[0].padEnd(26)} ${String(p.total).padStart(4)} từ  ` +
        (short.length ? `THIẾU: ${short.join(', ')}` : 'đủ từ cho cả 15 màn')
    );
  }
  if (problems) {
    strapi.log.warn(
      `${problems} màn không đủ từ. Game sẽ tự cắt số từ của màn xuống cho khỏi lặp, ` +
        'nhưng nên bổ sung từ hoặc giảm targetCount.'
    );
  }

  if (!APPLY) {
    strapi.log.info('Chạy thử (không ghi). Thêm --apply để ghi xuống CMS.');
    await strapi.destroy();
    return;
  }

  // ---- ghi xuống CMS ----
  const count = { topic: 0, level: 0, word: 0 };
  for (let i = 0; i < plan.length; i++) {
    const [slug, title, description, themeColor] = plan[i].topic;
    await upsert(strapi, 'api::topic.topic', { slug }, {
      slug,
      title,
      description,
      themeColor,
      order: i + 1,
      source: 'official',
      visibility: 'approved',
      ownerKey: 'official',
    });
    count.topic++;

    const topicDoc = await strapi.documents('api::topic.topic').findFirst({ filters: { slug } });

    for (const level of plan[i].levels) {
      const spec = levelSpec(level.levelNumber);
      const uniqueKey = `${slug}:${level.levelNumber}`;
      await upsert(strapi, 'api::level.level', { uniqueKey }, { ...spec, uniqueKey, topic: topicDoc.documentId });
      count.level++;

      let orderIndex = 0;
      for (const w of level.words) {
        await strapi.documents('api::vocabulary.vocabulary').update({
          documentId: w.documentId,
          data: {
            topicSlug: slug,
            levelNumber: level.levelNumber,
            orderIndex: ++orderIndex,
            length: w.headword.length,
          },
        });
        count.word++;
      }
    }
  }

  // Dọn chặng cũ không còn trong kế hoạch (và màn của nó); từ vựng không đụng tới.
  const keep = new Set(plan.map((p) => p.topic[0]));
  const stale = (await strapi.documents('api::topic.topic').findMany({ limit: -1 })).filter(
    (t) => !keep.has(t.slug)
  );
  for (const t of stale) {
    const levels = await strapi.documents('api::level.level').findMany({
      filters: { uniqueKey: { $startsWith: `${t.slug}:` } },
      limit: -1,
    });
    for (const l of levels) await strapi.documents('api::level.level').delete({ documentId: l.documentId });
    await strapi.documents('api::topic.topic').delete({ documentId: t.documentId });
    strapi.log.info(`Đã xóa chặng cũ ${t.slug} (${levels.length} màn)`);
  }

  strapi.log.info(`Đã ghi: ${count.topic} chặng, ${count.level} màn, ${count.word} từ`);
  await strapi.destroy();
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
