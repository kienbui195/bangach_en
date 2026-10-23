/**
 * Nạp chặng, màn, từ vựng từ seed/stages.json vào Strapi. Chạy lại được (idempotent):
 * bản ghi đã có (theo slug, uniqueKey, ownerKey+headword) được cập nhật, chưa có thì tạo; tất cả xuất bản.
 * Chạy trong container: docker compose exec bangach-cms node scripts/seed-stages.js
 */
const path = require('path');
const { createStrapi } = require('@strapi/strapi');

const data = require('../seed/stages.json');

/** Tạo hoặc cập nhật một bản ghi theo bộ lọc. Các collection đã tắt draft/publish nên không cần xuất bản. */
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
  const count = { topic: [0, 0], level: [0, 0], vocabulary: [0, 0] };
  const tally = (key, r) => count[key][r.created ? 0 : 1]++;

  for (const t of data.topics) {
    const { levels, ...topicFields } = t;
    const topic = await upsert(strapi, 'api::topic.topic', { slug: t.slug }, {
      ...topicFields,
      source: 'official',
      visibility: 'approved',
      ownerKey: 'official',
    });
    tally('topic', topic);

    for (const l of levels) {
      const uniqueKey = `${t.slug}:${l.levelNumber}`;
      tally('level', await upsert(strapi, 'api::level.level', { uniqueKey }, { ...l, uniqueKey, topic: topic.documentId }));
    }
  }

  for (const v of data.vocabulary) {
    tally('vocabulary', await upsert(strapi, 'api::vocabulary.vocabulary', { ownerKey: v.ownerKey, headword: v.headword }, v));
  }

  for (const [key, [created, updated]] of Object.entries(count)) {
    strapi.log.info(`${key}: tạo mới ${created}, cập nhật ${updated}`);
  }
  await strapi.destroy();
  process.exit(0);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
