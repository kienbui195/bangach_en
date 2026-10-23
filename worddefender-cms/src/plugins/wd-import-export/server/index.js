'use strict';

/**
 * Phần server của plugin Import / Export.
 *
 * Route để type 'admin' nên chỉ người đã đăng nhập admin gọi được; giao diện plugin gửi
 * kèm token bằng getFetchClient của chính Strapi (xem admin/src/pages/HomePage.jsx), đây là
 * chỗ plugin cộng đồng strapi-import-export hỏng trên Strapi 5.58.
 */
const service = require('./service');

const controller = ({ strapi }) => {
  const svc = () => strapi.plugin('wd-import-export').service('content');

  /** Lỗi trong lúc import/export là lỗi dữ liệu của người dùng, trả 400 kèm thông báo đọc được. */
  const run = (fn) => async (ctx) => {
    try {
      ctx.body = await fn(ctx);
    } catch (err) {
      strapi.log.error(`[wd-import-export] ${err.stack ?? err}`);
      ctx.status = 400;
      ctx.body = { error: err.message ?? String(err) };
    }
  };

  return {
    contentTypes: run(async () => ({ data: svc().listContentTypes() })),

    export: run(async (ctx) => {
      const { uid, format = 'json' } = ctx.request.body ?? {};
      if (!uid) throw new Error('Thiếu uid');
      return { data: await svc().exportData({ uid, format }) };
    }),

    import: run(async (ctx) => {
      const { uid, format = 'json', content, keyField = 'id', dryRun = false } = ctx.request.body ?? {};
      if (!uid) throw new Error('Thiếu uid');
      if (!content) throw new Error('Chưa có nội dung để nạp');
      return { data: await svc().importData({ uid, format, content, keyField, dryRun }) };
    }),
  };
};

module.exports = {
  register() {},
  bootstrap() {},
  config: {
    default: { allowedUids: null },
    validator(config) {
      if (config.allowedUids !== null && !Array.isArray(config.allowedUids)) {
        throw new Error('allowedUids phải là mảng uid hoặc null (cho phép mọi api::)');
      }
    },
  },
  controllers: { content: controller },
  services: { content: service },
  routes: {
    admin: {
      type: 'admin',
      routes: [
        { method: 'GET', path: '/content-types', handler: 'content.contentTypes', config: { policies: [] } },
        { method: 'POST', path: '/export', handler: 'content.export', config: { policies: [] } },
        { method: 'POST', path: '/import', handler: 'content.import', config: { policies: [] } },
      ],
    },
  },
};
