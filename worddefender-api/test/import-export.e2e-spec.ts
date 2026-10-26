import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createHash, createHmac } from 'node:crypto';
import request from 'supertest';
import { ADMIN_API_TOKEN } from '../src/admin/admin-token.guard.js';
import { BOM, parseCsv } from '../src/admin/csv.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { ResourcesService } from '../src/admin/resources.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const TOKEN = 'x'.repeat(40);
const HEADER = 'headword,meaning_vi,phonetic,part_of_speech,kind,example,example_vi,note';

/** Từ hợp lệ thứ i: chỉ a-z, 2-16 ký tự, duy nhất. */
const word = (i: number) => {
  let s = '';
  let n = i;
  do {
    s = String.fromCharCode(97 + (n % 26)) + s;
    n = Math.floor(n / 26);
  } while (n > 0);
  return `ww${s}`;
};
const csv = (rows: string[][], header = HEADER) => [header, ...rows.map((r) => r.join(','))].join('\n');
const goodRow = (i: number, meaning = `nghĩa ${i}`) => [word(i), meaning, '', 'noun', 'word', '', '', ''];

/** Nhập và xuất dữ liệu hàng loạt (US-05). Chạy trên MySQL thật. */
describe('import / export', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  const api = (method: 'get' | 'post', path: string) => request(app.getHttpServer())[method](`/admin-api${path}`).set('Authorization', `Bearer ${TOKEN}`);
  const dry = (content: string, format = 'csv') => api('post', '/vocabularies/import?dryRun=true').send({ format, content });
  const real = (content: string, previewToken: string | undefined, format = 'csv') => api('post', '/vocabularies/import?dryRun=false').send({ format, content, previewToken });
  const count = () => prisma.vocabulary.count();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ADMIN_API_TOKEN).useValue(TOKEN).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });
  beforeEach(async () => {
    await prisma.vocabulary.deleteMany();
  });
  afterAll(async () => {
    await prisma.vocabulary.deleteMany();
    await app.close();
  });

  it('AC-05.1 và AC-05.9 (BR18): chạy thử không ghi gì; xác nhận bằng previewToken thì ghi đủ 100 từ', async () => {
    const content = csv(Array.from({ length: 100 }, (_, i) => goodRow(i)));
    const d = await dry(content).expect(201);
    expect(d.body).toMatchObject({ dryRun: true, willCreate: 100, willUpdate: 0, unchanged: 0, rejected: [] });
    expect(d.body.previewToken).toBeTruthy();
    expect(await count()).toBe(0);
    const r = await real(content, d.body.previewToken).expect(201);
    expect(r.body).toMatchObject({ dryRun: false, willCreate: 100 });
    expect(await count()).toBe(100);
    expect((await prisma.vocabulary.findFirstOrThrow({ where: { headword: word(5) } })).length).toBe(word(5).length);
  });

  it('cột snake_case của file mẫu được nhận, cột lạ bị bỏ qua và liệt kê', async () => {
    const d = await dry(csv([[word(1), 'a', '/a/', 'noun', 'term', 'ex', 'vi', 'ghi chú']])).expect(201);
    expect(d.body.willCreate).toBe(1);
    expect(d.body.ignoredColumns.sort()).toEqual(['example_vi', 'note']);
    await real(csv([[word(1), 'a', '/a/', 'noun', 'term', 'ex', 'vi', 'ghi chú']]), d.body.previewToken).expect(201);
    const w = await prisma.vocabulary.findFirstOrThrow();
    expect(w).toMatchObject({ meaningVi: 'a', phonetic: '/a/', partOfSpeech: 'noun', kind: 'term', example: 'ex' });
  });

  it('AC-05.2: file JSON cùng nội dung cho kết quả giống bản CSV', async () => {
    const json = JSON.stringify(Array.from({ length: 100 }, (_, i) => ({ headword: word(i), meaningVi: `nghĩa ${i}`, kind: 'word' })));
    const d = await dry(json, 'json').expect(201);
    expect(d.body).toMatchObject({ willCreate: 100, rejected: [] });
    await real(json, d.body.previewToken, 'json').expect(201);
    expect(await count()).toBe(100);
    const wrapped = JSON.stringify({ items: [{ headword: word(500), meaningVi: 'x', kind: 'word' }] });
    expect((await dry(wrapped, 'json').expect(201)).body.willCreate).toBe(1);
  });

  it('AC-05.4 (A2, BR19): nhập lại đúng file thì không nhân đôi; sửa một nghĩa thì chỉ đúng dòng đó được cập nhật', async () => {
    const rows = Array.from({ length: 20 }, (_, i) => goodRow(i));
    const first = csv(rows);
    await real(first, (await dry(first).expect(201)).body.previewToken).expect(201);
    const again = await dry(first).expect(201);
    expect(again.body).toMatchObject({ willCreate: 0, willUpdate: 0, unchanged: 20 });
    await real(first, again.body.previewToken).expect(201);
    expect(await count()).toBe(20);

    const edited = csv(rows.map((r, i) => (i === 7 ? goodRow(7, 'nghĩa đã sửa') : r)));
    const d = await dry(edited).expect(201);
    expect(d.body).toMatchObject({ willCreate: 0, willUpdate: 1, unchanged: 19 });
    await real(edited, d.body.previewToken).expect(201);
    expect(await count()).toBe(20);
    expect((await prisma.vocabulary.findFirstOrThrow({ where: { headword: word(7) } })).meaningVi).toBe('nghĩa đã sửa');
  });

  it('AC-05.3 (A1, BR21): xuất CSV có BOM, tiếng Việt đúng dấu, và nhập lại chính file đó thì toàn bộ dòng "không đổi"', async () => {
    await prisma.vocabulary.createMany({
      data: [
        { ownerKey: 'official', headword: 'ball', length: 4, kind: 'word', meaningVi: 'quả bóng, trái bóng', example: 'He said "kick it"\nNow!', phonetic: '/bɔːl/' },
        { ownerKey: 'official', headword: 'desk', length: 4, kind: 'word', meaningVi: 'bàn làm việc' },
      ],
    });
    const res = await api('get', '/vocabularies/export?format=csv').expect(200);
    expect(res.body.count).toBe(2);
    expect(res.body.filename).toMatch(/^vocabularies-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(res.body.content.startsWith(BOM)).toBe(true);
    expect(res.body.content).toContain('quả bóng, trái bóng');
    const table = parseCsv(res.body.content);
    expect(table[0]).toContain('headword');
    const back = await dry(res.body.content).expect(201);
    expect(back.body).toMatchObject({ willCreate: 0, willUpdate: 0, unchanged: 2, rejected: [] });
  });

  it('xuất JSON và xuất theo bộ lọc hiện tại', async () => {
    await prisma.vocabulary.createMany({
      data: [
        { ownerKey: 'official', headword: 'ball', kind: 'word', meaningVi: 'a', topicSlug: 'x' },
        { ownerKey: 'official', headword: 'desk', kind: 'word', meaningVi: 'b', topicSlug: 'y' },
      ],
    });
    const res = await api('get', '/vocabularies/export?format=json&filter[topicSlug]=x').expect(200);
    const items = JSON.parse(res.body.content);
    expect(items).toHaveLength(1);
    expect(items[0].headword).toBe('ball');
    await api('get', '/vocabularies/export?format=xml').expect(422);
  });

  describe('file không hợp lệ (E1): từ chối cả file ở chạy thử, DB không đổi', () => {
    it('AC-05.5: thiếu cột bắt buộc, mã hóa sai, không phải CSV/JSON', async () => {
      const noMeaning = await dry('headword,phonetic\nball,/bɔːl/').expect(422);
      expect(noMeaning.body.error.message).toContain('meaningVi');
      const badEncoding = await dry(`${HEADER}\nball,qu� b�ng,,noun,word,,,`).expect(422);
      expect(badEncoding.body.error.message).toContain('UTF-8');
      await dry('{ không phải json', 'json').expect(422);
      await dry('"một chuỗi"', 'json').expect(422);
      await dry('a,"b\n1,2').expect(422);
      await dry('', 'csv').expect(422);
      await dry('x', 'xml' as never).expect(422);
      expect(await count()).toBe(0);
    });

    it('AC-05.8 (BR17): đúng 5.000 dòng qua chạy thử, 5.001 dòng bị từ chối; file quá 5MB bị từ chối', async () => {
      const rows = (n: number) => csv(Array.from({ length: n }, (_, i) => goodRow(i)));
      const ok = await dry(rows(5000)).expect(201);
      expect(ok.body.willCreate).toBe(5000);
      const tooMany = await dry(rows(5001)).expect(422);
      expect(tooMany.body.error.message).toContain('5001');
      const big = `${HEADER}\n${word(1)},${'x'.repeat(5 * 1024 * 1024)},,,word,,,`;
      await dry(big).expect(422);
      expect(await count()).toBe(0);
    }, 60_000);
  });

  it('AC-05.6 (E2, BR20): dòng trùng từ đã có và dòng sai luật được liệt kê kèm số dòng; xác nhận thì chỉ 95 dòng hợp lệ được ghi', async () => {
    await prisma.vocabulary.createMany({
      data: [0, 1, 2].map((i) => ({ ownerKey: 'official', headword: word(i), kind: 'word' as const, meaningVi: 'cũ' })),
    });
    const rows = Array.from({ length: 100 }, (_, i) => goodRow(i, `mới ${i}`)).slice(3); // 97 dòng hợp lệ, từ 3 trở đi
    const content = csv([
      goodRow(0, 'mới 0'), // trùng từ đã có nhưng nghĩa khác: là cập nhật, hợp lệ
      ...rows.slice(0, 94),
      [word(200), 'dài quá', '', 'noun', 'word', '', '', ''].map((c, i) => (i === 0 ? 'abcdefghijklmnopq' : c)), // 17 ký tự
      [word(201), 'có số', '', 'noun', 'word', '', '', ''].map((c, i) => (i === 0 ? 'ab1' : c)),
      goodRow(300),
      goodRow(300), // trùng ngay trong file
    ]);
    const d = await dry(content).expect(201);
    expect(d.body.rejected.map((r: { row: number }) => r.row)).toEqual([97, 98, 100]);
    expect(d.body.rejected[0]).toMatchObject({ field: 'headword' });
    expect(d.body.rejected[2].message).toContain('dòng 99');
    expect(d.body.willUpdate).toBe(1);
    const r = await real(content, d.body.previewToken).expect(201);
    expect(r.body.willCreate + r.body.willUpdate).toBe(1 + 94 + 1);
    expect(await count()).toBe(3 + 94 + 1);
  });

  it('AC-05.7 (E3): lỗi giữa lúc ghi (dòng thứ 30 của 50) thì không dòng nào được ghi và báo lỗi', async () => {
    const content = csv(Array.from({ length: 50 }, (_, i) => goodRow(i)));
    const d = await dry(content).expect(201);
    expect(d.body.willCreate).toBe(50);
    const svc = app.get(ResourcesService);
    const original = svc.coerceForImport.bind(svc);
    let calls = 0;
    const spy = vi.spyOn(svc, 'coerceForImport').mockImplementation((def, values) => {
      if (++calls === 30) throw new Error('mất kết nối DB giữa chừng');
      return original(def, values);
    });
    const r = await real(content, d.body.previewToken);
    spy.mockRestore();
    expect(r.status).toBe(500);
    expect(await count()).toBe(0); // 29 dòng đã được ghi trong giao dịch đều bị hủy
    const again = await real(content, d.body.previewToken).expect(201); // chạy lại từ đầu được
    expect(again.body.willCreate).toBe(50);
    expect(await count()).toBe(50);
  });

  it('AC-05.9 (BR18): ghi thật mà thiếu, hết hạn, sai nội dung hoặc sai khóa đối chiếu của previewToken đều bị 422, không ghi gì', async () => {
    const content = csv([goodRow(1), goodRow(2)]);
    const d = await dry(content).expect(201);
    await real(content, undefined).expect(422);
    await real(content, 'rác.rác').expect(422);
    await real(csv([goodRow(1), goodRow(2), goodRow(3)]), d.body.previewToken).expect(422); // file đã đổi
    const exp = Date.now() - 1000;
    const sig = createHmac('sha256', TOKEN).update(`vocabularies|headword|${createHash('sha256').update(content).digest('hex')}|${exp}`).digest('base64url');
    const expired = await real(content, `${exp}.${sig}`).expect(422);
    expect(expired.body.error.code).toBe('preview_required');
    expect(await count()).toBe(0);
    await real(content, d.body.previewToken).expect(201); // token đúng thì được
  });

  it('tài nguyên không hỗ trợ nhập bị 422', async () => {
    await api('post', '/topics/import?dryRun=true').send({ format: 'csv', content: 'slug,title\na,b' }).expect(422);
  });
});
