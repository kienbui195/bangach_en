/**
 * Luật chơi mặc định, khớp worddefender/src/config/gameRules.ts. Dùng để khởi tạo game-config lần đầu
 * và để bổ sung khóa còn thiếu (kể cả desc) vào bản ghi đang có, không ghi đè giá trị đã chỉnh.
 * Mỗi nhóm có trường desc giải thích ý nghĩa, các trường con và công thức; game bỏ qua desc.
 */
export const DEFAULT_GAME_RULES = {
  pace: {
    desc: [
      'NHỊP CHƠI: tốc độ rơi GIỐNG NHAU ở mọi màn; độ khó nằm ở số gạch rơi cùng lúc.',
      'fallFactor: thời gian rơi một viên = T × fallFactor, kẹp trong fallDurationClampSec. T là thời gian ước tính để gõ xong một từ theo hồ sơ gõ của người chơi: T = phản xạ (giây) + số chữ khuyết trung bình × ms mỗi chữ. Người gõ chậm được rơi lâu hơn, nhưng màn nào cũng như màn nào.',
      'fallDurationClampSec [min, max]: giới hạn thời gian rơi, tính bằng giây.',
      'avgWordLength: CHỈ dùng dự phòng khi màn chưa có từ nào. Bình thường độ dài từ lấy từ chính bộ từ của màn, nên màn cuối toàn từ dài sẽ được rơi lâu hơn màn đầu một cách tự nhiên.',
      'failSlowdown {perFail, maxFails, maxFactor}: thua một màn nhiều lần thì gạch rơi chậm lại. paceFactor = min(maxFactor, perFail ^ min(số lần thua, maxFails)). Điểm tốc độ vẫn tính theo thời gian rơi chuẩn nên bảng xếp hạng công bằng.',
      'concurrent {easy, medium, hard, boss}: số gạch tối đa rơi cùng lúc theo mức khó. Trong một mức, các màn rải đều từ đầu đến cuối khoảng — mức dễ có 4 màn với khoảng [3,5] thì lần lượt 3, 4, 4, 5 gạch. Phá xong một viên hoặc để nó chạm đất là sinh viên mới bù ngay, nên trên sân luôn đủ số gạch này.',
      'refillMinGapMs: khoảng cách tối thiểu giữa hai lần sinh gạch, để đầu màn không bung cả loạt cùng lúc.',
      'spawnColumns {min, max, minColumnPx}: sân chia thành nhiều cột, gạch mới ra ở cột mà đỉnh cột còn trống. Số cột = bề rộng sân (px) chia minColumnPx, kẹp trong [min, max]. Ví dụ minColumnPx 110: điện thoại dọc (~430px) 4 cột, tablet dọc (768px) 6 cột, máy tính (1440px) 12 cột.',
      'Ví dụ với bộ từ văn phòng hiện tại, bàn phím mặc định (reactionMs 1200, msPerChar 600): màn 1 (từ ~4 chữ) rơi ~13 giây, màn 8 (~10,5 chữ) ~31 giây, màn 12 trở đi chạm trần 45 giây.',
    ].join('\n'),
    fallFactor: 7,
    fallDurationClampSec: [12, 45],
    avgWordLength: 6,
    failSlowdown: { perFail: 1.08, maxFails: 5, maxFactor: 1.4 },
    concurrent: { easy: [3, 5], medium: [6, 10], hard: [11, 15], boss: 15 },
    refillMinGapMs: 400,
    spawnColumns: { min: 4, max: 12, minColumnPx: 110 },
  },
  blanks: {
    desc: [
      'CHỮ KHUYẾT: mỗi gạch hiện một từ bị che bớt chữ, người chơi gõ các chữ bị che.',
      'Số chữ khuyết của một gạch = làm tròn(độ dài từ × tỉ lệ), tỉ lệ ngẫu nhiên trong khoảng [ratioLow, ratioHigh] của màn đó; ít nhất 1 chữ và luôn chừa lại tối thiểu 1 chữ lộ ra.',
      'ratioLow {start, end}: cận dưới của tỉ lệ khuyết; ratioHigh {start, end}: cận trên. start = màn đầu hành trình, end = màn cuối, nội suy tuyến tính theo vị trí màn. Tỉ lệ càng cao càng khó.',
      'boss [min, max]: khoảng tỉ lệ khuyết dùng cho màn boss.',
      'Ví dụ: từ "garden" (6 chữ), tỉ lệ 0,35–0,5 → khuyết 2 đến 3 chữ, như "g _ r _ e n".',
    ].join('\n'),
    ratioLow: { start: 0.25, end: 0.65 },
    ratioHigh: { start: 0.35, end: 0.8 },
    boss: [0.7, 0.85],
  },
  words: {
    desc: [
      'BỐC TỪ TRONG MỘT VÁN: mỗi ván bốc đủ số từ mục tiêu của màn, không lặp từ trong ván (trừ khi kho từ của màn quá nhỏ).',
      'newRatio: tỉ lệ từ mới (người chơi chưa từng học) trong ván; phần còn lại là từ đã học để ôn. Số từ mới = làm tròn(số từ mục tiêu × newRatio).',
      'Ví dụ: ván 10 từ, newRatio 0,6 → 6 từ mới và 4 từ ôn. Thiếu từ mới thì bù bằng từ ôn, và ngược lại.',
    ].join('\n'),
    newRatio: 0.6,
  },
  hearts: {
    desc: [
      'TIM VÀ COMBO: người chơi mất tim khi có gạch chạm đất và hết tim thì thua màn.',
      'max: số tim tối đa của một màn (cũng là số tim lúc bắt đầu). lossPerMiss: số tim mất mỗi gạch chạm đất (0,5 = nửa tim).',
      'comboReward: danh sách mức thưởng; mỗi lần đạt combo, game chọn ngẫu nhiên một giá trị trong danh sách để cộng tim (0,5 hoặc 1), không vượt quá max.',
      'combo {perWord, min, max}: số từ liên tiếp cần để đạt combo = clamp(làm tròn(số từ mục tiêu của màn × perWord), min, max). Combo đứt khi có gạch chạm đất; gõ sai không làm đứt. Khi tim đã đầy, combo được giữ lại cho lần sau.',
      'Ví dụ: màn 15 từ → 15 × 0,2 = 3 → nâng lên min = 4 từ liên tiếp; màn 50 từ → 10 từ liên tiếp.',
    ].join('\n'),
    max: 3,
    lossPerMiss: 0.5,
    comboReward: [0.5, 1],
    combo: { perWord: 0.2, min: 4, max: 10 },
  },
};
