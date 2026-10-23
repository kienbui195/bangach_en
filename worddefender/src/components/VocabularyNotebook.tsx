import React, { useState, useMemo } from 'react';
import { LearnedWordRecord } from '../types/game';
import { updateLearnedWordReview } from '../utils/storage';
import { soundManager } from '../utils/audio';
import {
  ArrowLeft,
  Search,
  Volume2,
  Layers,
  HelpCircle,
  CheckCircle,
  XCircle,
  Sparkles,
  RotateCw,
  Trophy,
  Folder,
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface VocabularyNotebookProps {
  learnedWords: LearnedWordRecord[];
  onBack: () => void;
  onRefreshWords: () => void;
}

type TabMode = 'list' | 'flashcard' | 'quiz';

import { ThemeToggle } from './ThemeToggle';
import { FullscreenButton } from './FullscreenButton';

export const VocabularyNotebook: React.FC<VocabularyNotebookProps> = ({
  learnedWords: allWords,
  onBack,
  onRefreshWords,
}) => {
  const [activeTab, setActiveTab] = useState<TabMode>('list');
  const [searchTerm, setSearchTerm] = useState('');
  // Chủ đề đang học; null = màn chọn chủ đề. Mọi chế độ bên dưới chỉ dùng từ của chủ đề này.
  const [topic, setTopic] = useState<string | null>(null);
  const learnedWords = useMemo(
    () => (topic === null ? allWords : allWords.filter((w) => w.category === topic)),
    [allWords, topic]
  );

  // Flashcard state
  const [cardIndex, setCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  // Quiz state
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizScore, setQuizScore] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [quizFinished, setQuizFinished] = useState(false);

  // Danh sách chủ đề kèm số từ và số từ đã thuộc
  const topics = useMemo(() => {
    const map = new Map<string, { total: number; mastered: number }>();
    allWords.forEach((w) => {
      const t = map.get(w.category) ?? { total: 0, mastered: 0 };
      t.total += 1;
      if (w.mastered) t.mastered += 1;
      map.set(w.category, t);
    });
    return Array.from(map, ([name, v]) => ({ name, ...v })).sort((a, b) => b.total - a.total);
  }, [allWords]);

  const openTopic = (name: string | null) => {
    setTopic(name);
    setActiveTab('list');
    setSearchTerm('');
    setCardIndex(0);
    setIsFlipped(false);
    setQuizIndex(0);
    setQuizScore(0);
    setSelectedOption(null);
    setIsAnswered(false);
    setQuizFinished(false);
  };

  // Filtered words for list view
  const filteredWords = useMemo(() => {
    return learnedWords.filter((w) => {
      const matchesSearch =
        w.word.toLowerCase().includes(searchTerm.toLowerCase()) ||
        w.meaning.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesSearch;
    });
  }, [learnedWords, searchTerm]);

  // Quiz questions generation
  const quizQuestions = useMemo(() => {
    if (learnedWords.length < 2) return [];
    // Shuffle words for quiz
    const shuffled = [...learnedWords].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 10).map((target) => {
      // Pick 3 distractor meanings
      const distractors = allWords
        .filter((w) => w.id !== target.id && w.meaning !== target.meaning)
        .sort(() => 0.5 - Math.random())
        .slice(0, 3)
        .map((w) => w.meaning);

      // If we don't have enough distractors from learned words, add some common fallback meanings
      const fallbackOptions = ['quả bóng', 'cánh cửa', 'bác sĩ', 'khu vườn', 'trái táo'];
      while (distractors.length < 3) {
        const fallback = fallbackOptions[Math.floor(Math.random() * fallbackOptions.length)];
        if (!distractors.includes(fallback) && fallback !== target.meaning) {
          distractors.push(fallback);
        }
      }

      const options = [target.meaning, ...distractors].sort(() => 0.5 - Math.random());
      return {
        word: target.word,
        phonetic: target.phonetic,
        correctMeaning: target.meaning,
        options,
      };
    });
  }, [learnedWords, allWords]);

  // Current flashcard word
  const currentCard = learnedWords[cardIndex];

  const handleNextCard = (remembered: boolean) => {
    if (currentCard) {
      updateLearnedWordReview(currentCard.word, remembered);
      onRefreshWords();
    }
    setIsFlipped(false);
    if (cardIndex < learnedWords.length - 1) {
      setCardIndex(cardIndex + 1);
    } else {
      setCardIndex(0);
    }
  };

  const handleSelectQuizOption = (option: string) => {
    if (isAnswered) return;
    const currentQ = quizQuestions[quizIndex];
    setSelectedOption(option);
    setIsAnswered(true);

    const isCorrect = option === currentQ.correctMeaning;
    if (isCorrect) {
      soundManager.playLetterSuccess();
      setQuizScore((prev) => prev + 1);
      updateLearnedWordReview(currentQ.word, true);
    } else {
      soundManager.playWrong();
      updateLearnedWordReview(currentQ.word, false);
    }
    onRefreshWords();
    soundManager.speak(currentQ.word);
  };

  const handleNextQuizQuestion = () => {
    if (quizIndex < quizQuestions.length - 1) {
      setQuizIndex((prev) => prev + 1);
      setSelectedOption(null);
      setIsAnswered(false);
    } else {
      setQuizFinished(true);
      try {
        confetti({ particleCount: 70, spread: 60 });
      } catch (e) {
        // ignore
      }
    }
  };

  const restartQuiz = () => {
    setQuizIndex(0);
    setQuizScore(0);
    setSelectedOption(null);
    setIsAnswered(false);
    setQuizFinished(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center pb-12 selection:bg-cyan-500 selection:text-white">
      {/* Top Header */}
      <header className="w-full px-3 sm:px-8 py-3 sm:py-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-800 bg-slate-950/85 backdrop-blur-md sticky top-0 z-20">
        <div className="order-1 flex-1 min-w-0 flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => (topic === null ? onBack() : openTopic(null))}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-extrabold text-white flex items-center gap-2 whitespace-nowrap">
              <span>{topic === null ? 'Bộ Sưu Tập Cá Nhân' : topic}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-mono border border-cyan-500/30">
                {learnedWords.length} từ
              </span>
            </h1>
            <p className="text-xs text-slate-400 hidden sm:block">Chọn một chủ đề để học đọc, nghe phát âm và ôn tập</p>
          </div>
        </div>

        {/* Tab Switchers */}
        {topic !== null && (
        <div className="order-3 sm:order-2 w-full sm:w-auto flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1 gap-1">
          <button
            onClick={() => setActiveTab('list')}
            className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'list' ? 'bg-cyan-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            Danh sách
          </button>
          <button
            onClick={() => {
              setActiveTab('flashcard');
              setCardIndex(0);
              setIsFlipped(false);
            }}
            disabled={learnedWords.length === 0}
            className={`flex-1 sm:flex-none justify-center px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 whitespace-nowrap transition-all disabled:opacity-40 ${
              activeTab === 'flashcard' ? 'bg-amber-400 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Lật thẻ</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('quiz');
              restartQuiz();
            }}
            disabled={learnedWords.length < 2}
            className={`flex-1 sm:flex-none justify-center px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 whitespace-nowrap transition-all disabled:opacity-40 ${
              activeTab === 'quiz' ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Trắc nghiệm</span>
          </button>
        </div>
        )}
        <div className="order-2 sm:order-3 flex items-center gap-2">
          <FullscreenButton />
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content Area */}
      <main className="w-full max-w-6xl px-4 sm:px-8 mt-6 flex-1 flex flex-col items-center">
        {allWords.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center max-w-md">
            <div className="w-16 h-16 rounded-3xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-500 mb-4">
              <Sparkles className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-200 mb-2">Bộ sưu tập còn trống</h3>
            <p className="text-sm text-slate-400 mb-6">
              Hãy chơi các màn bắn gạch để thu thập và mở khóa các từ vựng mới vào sổ tay của bạn!
            </p>
            <button
              onClick={onBack}
              className="py-2.5 px-6 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-sm shadow-lg shadow-cyan-500/20 active:scale-95 transition-all cursor-pointer"
            >
              Chơi ngay màn 1
            </button>
          </div>
        ) : topic === null ? (
          /* MÀN CHỌN CHỦ ĐỀ */
          <div className="w-full grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {topics.map((t) => (
              <button
                key={t.name}
                onClick={() => openTopic(t.name)}
                className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 hover:border-cyan-500/50 hover:bg-slate-900 transition-all text-left shadow-lg cursor-pointer active:scale-98"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Folder className="w-5 h-5 text-cyan-400 shrink-0" />
                  <span className="font-extrabold text-base text-white truncate">{t.name}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>{t.total} từ</span>
                  <span className="text-emerald-300">Đã thuộc {t.mastered}</span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mt-2">
                  <div className="h-full bg-emerald-400" style={{ width: `${(t.mastered / t.total) * 100}%` }} />
                </div>
              </button>
            ))}
          </div>
        ) : activeTab === 'list' ? (
          /* TAB 1: VOCABULARY LIST */
          <div className="w-full flex flex-col gap-4">
            {/* Search & Category Filter */}
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Tìm từ tiếng Anh hoặc nghĩa tiếng Việt trong chủ đề này..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                />
              </div>

            </div>

            {/* Word Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {filteredWords.map((item) => (
                <div
                  key={item.id}
                  className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 hover:border-cyan-500/50 hover:bg-slate-900 transition-all flex flex-col justify-between shadow-lg group relative"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-base text-white capitalize font-display">
                          {item.word}
                        </span>
                        {item.mastered && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                            Đã thuộc
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400 font-mono">{item.phonetic}</span>
                    </div>

                    <button
                      onClick={() => soundManager.speak(item.word)}
                      title="Nghe phát âm chuẩn"
                      className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 active:scale-95 transition-all group-hover:scale-105"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="text-sm font-semibold text-cyan-300 mb-2">{item.meaning}</div>

                  {item.example && (
                    <div className="text-xs text-slate-400 italic bg-slate-950/40 p-2 rounded-lg border border-slate-800/40">
                      "{item.example}"
                    </div>
                  )}

                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-800/60 text-[11px] text-slate-500">
                    <span>{item.category}</span>
                    <span>Đúng {item.timesCorrect} lần</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : activeTab === 'flashcard' ? (
          /* TAB 2: FLASHCARD REVIEW MODE */
          <div className="w-full max-w-md flex flex-col items-center">
            <div className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider">
              Thẻ {cardIndex + 1} / {learnedWords.length}
            </div>

            {/* 3D Flip Card Container */}
            <div
              onClick={() => setIsFlipped(!isFlipped)}
              className="w-full h-72 sm:h-80 cursor-pointer perspective-1000 relative select-none"
            >
              <div
                className={`w-full h-full rounded-3xl transition-transform duration-500 transform-style-3d border-2 ${
                  isFlipped
                    ? 'rotate-y-180 bg-gradient-to-br from-slate-900 to-indigo-950 border-indigo-500/60 shadow-[0_0_25px_rgba(99,102,241,0.25)]'
                    : 'bg-gradient-to-br from-slate-900 to-slate-950 border-cyan-500/50 shadow-[0_0_25px_rgba(6,182,212,0.25)]'
                } flex flex-col items-center justify-center p-6 text-center relative`}
              >
                {!isFlipped ? (
                  /* Front: English Word */
                  <div className="flex flex-col items-center justify-center h-full">
                    <span className="text-xs px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 mb-4 font-semibold">
                      {currentCard.category}
                    </span>
                    <h2 className="text-3xl sm:text-4xl font-black text-white capitalize mb-2 font-display tracking-wide">
                      {currentCard.word}
                    </h2>
                    <span className="text-sm font-mono text-slate-400 mb-6">{currentCard.phonetic}</span>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        soundManager.speak(currentCard.word);
                      }}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 text-xs font-bold border border-cyan-400/40 transition-colors"
                    >
                      <Volume2 className="w-4 h-4" />
                      <span>Nghe phát âm</span>
                    </button>

                    <span className="text-xs text-slate-500 mt-6 flex items-center gap-1">
                      <RotateCw className="w-3.5 h-3.5" /> Chạm vào thẻ để lật xem nghĩa
                    </span>
                  </div>
                ) : (
                  /* Back: Vietnamese Meaning */
                  <div className="flex flex-col items-center justify-center h-full">
                    <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 mb-4 font-semibold">
                      Nghĩa tiếng Việt
                    </span>
                    <h2 className="text-2xl sm:text-3xl font-extrabold text-amber-300 mb-4">
                      {currentCard.meaning}
                    </h2>

                    {currentCard.example && (
                      <p className="text-xs sm:text-sm text-slate-300 italic bg-slate-950/60 p-3 rounded-xl border border-slate-800 max-w-xs">
                        "{currentCard.example}"
                      </p>
                    )}

                    <span className="text-xs text-slate-500 mt-6 flex items-center gap-1">
                      <RotateCw className="w-3.5 h-3.5" /> Chạm để quay lại mặt trước
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Assessment Buttons */}
            <div className="flex items-center gap-3 w-full mt-6">
              <button
                onClick={() => handleNextCard(false)}
                className="flex-1 py-3 px-4 rounded-xl bg-slate-800 hover:bg-rose-950/50 hover:text-rose-300 border border-slate-700 hover:border-rose-500/50 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer"
              >
                <XCircle className="w-4 h-4 text-rose-400" />
                <span>Cần ôn lại</span>
              </button>

              <button
                onClick={() => handleNextCard(true)}
                className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all cursor-pointer"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Đã ghi nhớ!</span>
              </button>
            </div>
          </div>
        ) : (
          /* TAB 3: MULTIPLE CHOICE QUIZ */
          <div className="w-full max-w-md flex flex-col items-center">
            {!quizFinished ? (
              quizQuestions.length > 0 && (
                <div className="w-full flex flex-col">
                  {/* Progress bar */}
                  <div className="flex items-center justify-between text-xs font-bold text-slate-400 mb-2">
                    <span>
                      Câu hỏi {quizIndex + 1} / {quizQuestions.length}
                    </span>
                    <span className="text-cyan-400">Điểm: {quizScore}</span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden mb-6">
                    <div
                      className="h-full bg-cyan-400 transition-all duration-300"
                      style={{
                        width: `${((quizIndex + 1) / quizQuestions.length) * 100}%`,
                      }}
                    />
                  </div>

                  {/* Question Card */}
                  <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 text-center shadow-xl mb-5 relative">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-1">
                      Từ vựng này có nghĩa là gì?
                    </span>
                    <h3 className="text-3xl font-black text-white capitalize mb-1 font-display">
                      {quizQuestions[quizIndex].word}
                    </h3>
                    <span className="text-xs font-mono text-slate-400 block mb-3">
                      {quizQuestions[quizIndex].phonetic}
                    </span>

                    <button
                      onClick={() => soundManager.speak(quizQuestions[quizIndex].word)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 text-xs font-bold transition-colors"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>Nghe phát âm</span>
                    </button>
                  </div>

                  {/* 4 Choices */}
                  <div className="flex flex-col gap-2.5">
                    {quizQuestions[quizIndex].options.map((option, idx) => {
                      const isCorrect = option === quizQuestions[quizIndex].correctMeaning;
                      const isSelected = selectedOption === option;

                      let btnStyle = 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-200';
                      if (isAnswered) {
                        if (isCorrect) {
                          btnStyle = 'bg-emerald-950 border-emerald-500 text-emerald-300 font-bold';
                        } else if (isSelected) {
                          btnStyle = 'bg-rose-950 border-rose-500 text-rose-300 line-through';
                        }
                      }

                      return (
                        <button
                          key={idx}
                          disabled={isAnswered}
                          onClick={() => handleSelectQuizOption(option)}
                          className={`w-full p-3.5 rounded-xl border-2 text-left font-semibold text-sm transition-all flex items-center justify-between ${btnStyle} cursor-pointer active:scale-98`}
                        >
                          <span>{option}</span>
                          {isAnswered && isCorrect && <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />}
                          {isAnswered && isSelected && !isCorrect && (
                            <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Next question button */}
                  {isAnswered && (
                    <button
                      onClick={handleNextQuizQuestion}
                      className="mt-6 w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 font-extrabold text-white text-sm shadow-lg shadow-cyan-500/20 active:scale-95 transition-all cursor-pointer"
                    >
                      {quizIndex < quizQuestions.length - 1 ? 'Câu tiếp theo' : 'Xem kết quả'}
                    </button>
                  )}
                </div>
              )
            ) : (
              /* Quiz Finished Summary */
              <div className="p-8 rounded-3xl bg-slate-900 border border-slate-800 text-center shadow-2xl flex flex-col items-center">
                <div className="w-16 h-16 rounded-2xl bg-amber-400/20 text-amber-300 flex items-center justify-center mb-3">
                  <Trophy className="w-8 h-8 animate-bounce" />
                </div>
                <h3 className="text-2xl font-black text-white mb-1">Hoàn Thành Trắc Nghiệm!</h3>
                <p className="text-sm text-slate-400 mb-6">
                  Bạn đã trả lời đúng {quizScore} / {quizQuestions.length} câu hỏi.
                </p>

                <div className="flex gap-3 w-full">
                  <button
                    onClick={restartQuiz}
                    className="flex-1 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-sm active:scale-95 transition-all"
                  >
                    Làm lại bài này
                  </button>
                  <button
                    onClick={() => setActiveTab('list')}
                    className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm transition-all"
                  >
                    Về danh sách
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
