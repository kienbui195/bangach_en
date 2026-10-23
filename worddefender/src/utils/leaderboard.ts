export interface LeaderboardEntry {
  rank: number;
  name: string;
  score: number;
  isPlayer: boolean;
}

export interface LeaderboardResult {
  entries: LeaderboardEntry[];
  playerRank: number;
  totalPlayers: number;
}

const FAKE_NAMES = [
  'MinhAnh', 'BaoNgoc', 'TuanKiet', 'HaMy', 'QuangHuy', 'ThuThao', 'DucAnh', 'LanPhuong',
  'GiaBao', 'KhanhLinh', 'HoangNam', 'PhuongUyen', 'TheVinh', 'NgocDiep', 'AnKhang',
];

/**
 * DỮ LIỆU GIẢ: chưa có server nên bảng xếp hạng được dựng tại chỗ, người chơi luôn đứng hạng 4 hoặc 5.
 * Thay bằng GET /api/levels/:id/leaderboard khi có backend.
 */
export const buildFakeLeaderboard = (playerScore: number, playerName = 'Bạn'): LeaderboardResult => {
  const playerRank = Math.random() < 0.5 ? 4 : 5;
  const names = [...FAKE_NAMES].sort(() => Math.random() - 0.5);
  const score = Math.max(playerScore, 50);

  const above: number[] = [];
  let cursor = score;
  for (let i = 0; i < playerRank - 1; i++) {
    cursor = Math.round(cursor * (1.06 + Math.random() * 0.14));
    above.unshift(cursor);
  }

  const below: number[] = [];
  cursor = score;
  for (let i = 0; i < 5; i++) {
    cursor = Math.max(10, Math.round(cursor * (0.9 - Math.random() * 0.12)));
    below.push(cursor);
  }

  let nameIdx = 0;
  const entries: LeaderboardEntry[] = [
    ...above.map((s, i) => ({ rank: i + 1, name: names[nameIdx++], score: s, isPlayer: false })),
    { rank: playerRank, name: playerName, score: playerScore, isPlayer: true },
    ...below.map((s, i) => ({ rank: playerRank + 1 + i, name: names[nameIdx++], score: s, isPlayer: false })),
  ];

  return { entries, playerRank, totalPlayers: 120 + Math.floor(Math.random() * 80) };
};
