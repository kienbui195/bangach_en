/**
 * Giao thức WebSocket (socket.io) cho chế độ chơi online.
 * Server giữ quyền quyết định: chọn từ, thời điểm spawn, hợp lệ của phím gõ.
 * Client chỉ gửi ý định (gõ phím) và hiển thị trạng thái server trả về.
 *
 * Dịch vụ WebSocket chạy riêng, tách khỏi Strapi (Q2 = B). Client xác thực bằng JWT của Strapi;
 * khi trận kết thúc dịch vụ gọi API nội bộ của Strapi để ghi MatchResult/LevelClear, nên
 * luật tính điểm và xếp hạng chỉ nằm ở một nơi.
 */
import { DocumentId, MatchResult } from './api';

export type RoomStatus = 'waiting' | 'countdown' | 'playing' | 'finished';

export interface RoomPlayerState {
  playerDocumentId: DocumentId;
  displayName: string;
  hearts: number;
  destroyed: number;
  ready: boolean;
}

export interface RoomState {
  roomId: string;
  levelDocumentId: DocumentId;
  status: RoomStatus;
  seed: number; // cùng seed => cùng chuỗi từ, để các người chơi công bằng
  players: RoomPlayerState[];
}

/** Client -> Server */
export interface ClientToServerEvents {
  'room:join': (payload: { roomId: string }, ack: (res: { ok: boolean; error?: string }) => void) => void;
  'room:leave': () => void;
  'room:ready': (payload: { ready: boolean }) => void;
  /** Một phím gõ, `seq` tăng dần để server phát hiện mất/trùng gói. */
  'game:key': (payload: { brickId: string; char: string; seq: number; clientTs: number }) => void;
  'game:ping': (payload: { clientTs: number }) => void;
}

/** Server -> Client */
export interface ServerToClientEvents {
  'room:state': (state: RoomState) => void;
  'game:start': (payload: { serverTs: number; seed: number }) => void;
  'game:spawn': (payload: { brickId: string; vocabularyDocumentId: DocumentId; x: number; blankIndices: number[]; spawnAtMs: number }) => void;
  'game:keyResult': (payload: { seq: number; correct: boolean; brickId: string; solved: boolean }) => void;
  'game:opponent': (payload: { playerDocumentId: DocumentId; destroyed: number; hearts: number }) => void;
  'game:end': (payload: { result: MatchResult; ranking: { playerDocumentId: DocumentId; score: number }[] }) => void;
  'game:pong': (payload: { clientTs: number; serverTs: number }) => void;
  error: (payload: { code: string; message: string }) => void;
}
