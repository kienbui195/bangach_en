import { BOM, parseCsv, stringifyCsv } from './csv.js';

describe('parseCsv', () => {
  it('tách ô thường, bỏ BOM và dòng trống, chấp nhận CRLF và LF', () => {
    expect(parseCsv(`${BOM}a,b,c\r\n1,2,3\n\n4,5,6\n`)).toEqual([['a', 'b', 'c'], ['1', '2', '3'], ['4', '5', '6']]);
  });

  it('ô trong ngoặc kép có dấu phẩy, xuống dòng và ngoặc kép liền nhau', () => {
    expect(parseCsv('x,y\n"a, b","dòng 1\ndòng 2"\n"nói ""xin chào""",z')).toEqual([['x', 'y'], ['a, b', 'dòng 1\ndòng 2'], ['nói "xin chào"', 'z']]);
  });

  it('giữ ô rỗng ở giữa và cuối dòng', () => {
    expect(parseCsv('a,,c,\n,,,')).toEqual([['a', '', 'c', ''], ['', '', '', '']]);
  });

  it('ngoặc kép chưa đóng thì báo lỗi', () => {
    expect(() => parseCsv('a,"b\n1,2')).toThrow(/chưa đóng/);
  });
});

describe('stringifyCsv', () => {
  it('có BOM, escape dấu phẩy/ngoặc kép/xuống dòng, ô rỗng cho null', () => {
    const out = stringifyCsv(['a', 'b'], [{ a: 'x,y', b: 'nói "hi"\nxong' }, { a: null, b: 5 }]);
    expect(out.startsWith(BOM)).toBe(true);
    expect(out).toContain('"x,y","nói ""hi""\nxong"');
    expect(out).toContain('\r\n,5\r\n');
  });

  it('xuất rồi đọc lại ra đúng dữ liệu (tiếng Việt, ký tự đặc biệt)', () => {
    const rows = [{ w: 'ball', m: 'quả bóng, trái bóng', e: 'He said "kick it"\nNow!' }];
    const parsed = parseCsv(stringifyCsv(['w', 'm', 'e'], rows));
    expect(parsed[1]).toEqual(['ball', 'quả bóng, trái bóng', 'He said "kick it"\nNow!']);
  });

  it('chặn công thức Excel (=, +, -, @) bằng dấu nháy đơn, nhưng không đụng số âm', () => {
    const out = stringifyCsv(['a'], [{ a: '=SUM(A1)' }, { a: '-5' }, { a: '@cmd' }, { a: 'bình thường' }]);
    expect(out).toContain("'=SUM(A1)");
    expect(out).toContain("'@cmd");
    expect(out).toContain('\r\n-5\r\n');
  });
});
