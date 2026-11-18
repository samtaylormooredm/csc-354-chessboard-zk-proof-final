import { Chess, type Square } from "chess.js";
import { useMemo, useState, type CSSProperties } from "react";
import { Chessboard, defaultPieces, type ChessboardOptions } from "react-chessboard";

const LIGHT = "#E5EDF6";
const DARK = "#52749A";
const HIGHLIGHT = "rgba(255, 255, 51, 0.5)";
const MARK = "rgba(235, 97, 80, 0.8)";
const CHECK = "radial-gradient(circle, rgba(255, 0, 0, 0.9) 0%, rgba(231, 0, 0, 0.55) 35%, rgba(169, 0, 0, 0) 70%)";
// Percentages are of the centre-to-corner distance, so 70% is roughly the square's edge.
const MOVE_DOT = "radial-gradient(circle, rgba(0, 0, 0, 0.16) 19%, transparent 20%)";
const CAPTURE_RING =
  "radial-gradient(circle, transparent 58%, rgba(0, 0, 0, 0.16) 59%, rgba(0, 0, 0, 0.16) 69%, transparent 70%)";
const PROMOTION_PIECES = ["q", "n", "r", "b"] as const;

const solid = (color: string) => `linear-gradient(${color}, ${color})`;

interface BoardProps {
  fen: string;
  orientation: "white" | "black";
  /** Last move played (UCI), highlighted on the board. */
  lastMove: string | null;
  /** Whether the side to move may be moved by the user right now. */
  interactive: boolean;
  onMove: (uci: string) => void;
}

export function Board({ fen, orientation, lastMove, interactive, onMove }: BoardProps) {
  const chess = useMemo(() => new Chess(fen), [fen]);
  const [selected, setSelected] = useState<Square | null>(null);
  const [marks, setMarks] = useState<ReadonlySet<string>>(new Set());
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null);

  // Selection, marks and the promotion picker belong to one position: reset when it changes.
  const [shownFen, setShownFen] = useState(fen);
  if (shownFen !== fen) {
    setShownFen(fen);
    setSelected(null);
    setMarks(new Set());
    setPromotion(null);
  }

  const turn = chess.turn();
  const targets = useMemo(
    () => (interactive && selected ? chess.moves({ square: selected, verbose: true }) : []),
    [chess, interactive, selected],
  );

  function tryMove(from: Square, to: Square): "moved" | "promotion" | "illegal" {
    const options = chess.moves({ square: from, verbose: true }).filter((m) => m.to === to);
    if (options.length === 0) return "illegal";
    if (options.some((m) => m.promotion)) {
      setPromotion({ from, to });
      return "promotion";
    }
    onMove(`${from}${to}`);
    return "moved";
  }

  const squareStyles: Record<string, CSSProperties> = {};
  const layer = (square: string, background: string) => {
    const existing = squareStyles[square]?.background;
    squareStyles[square] = { background: existing ? `${background}, ${String(existing)}` : background };
  };
  // Added bottom-up: later layers are painted on top of earlier ones.
  if (lastMove) {
    layer(lastMove.slice(0, 2), solid(HIGHLIGHT));
    layer(lastMove.slice(2, 4), solid(HIGHLIGHT));
  }
  if (selected && interactive) layer(selected, solid(HIGHLIGHT));
  if (chess.inCheck()) {
    const king = chess.findPiece({ type: "k", color: turn })[0];
    if (king) layer(king, CHECK);
  }
  for (const square of marks) layer(square, solid(MARK));
  for (const m of targets) layer(m.to, m.isCapture() || m.isEnPassant() ? CAPTURE_RING : MOVE_DOT);

  const options: ChessboardOptions = {
    id: "puzzle-board",
    position: fen,
    boardOrientation: orientation,
    lightSquareStyle: { backgroundColor: LIGHT },
    darkSquareStyle: { backgroundColor: DARK },
    lightSquareNotationStyle: { color: DARK, fontWeight: 600 },
    darkSquareNotationStyle: { color: LIGHT, fontWeight: 600 },
    dropSquareStyle: { boxShadow: "inset 0 0 0 4px rgba(255, 255, 255, 0.75)" },
    boardStyle: { borderRadius: 4, overflow: "hidden" },
    squareStyles,
    showNotation: true,
    showAnimations: true,
    animationDurationInMs: 220,
    allowDragging: interactive,
    allowDrawingArrows: true,
    clearArrowsOnClick: true,
    clearArrowsOnPositionChange: true,
    arrowOptions: {
      colors: {
        default: "rgba(255, 170, 0, 0.85)",
        shift: "rgba(99, 166, 238, 0.9)",
        ctrl: "rgba(248, 85, 63, 0.9)",
        alt: "rgba(72, 193, 249, 0.9)",
        meta: "rgba(72, 193, 249, 0.9)",
      },
      color: "rgba(255, 170, 0, 0.85)",
      secondaryColor: "rgba(99, 166, 238, 0.9)",
      tertiaryColor: "rgba(248, 85, 63, 0.9)",
      arrowLengthReducerDenominator: 8,
      sameTargetArrowLengthReducerDenominator: 4,
      arrowWidthDenominator: 5,
      activeArrowWidthMultiplier: 0.9,
      opacity: 0.8,
      activeOpacity: 0.5,
      arrowStartOffset: 0,
    },
    canDragPiece: ({ piece }) => interactive && !promotion && piece.pieceType[0] === turn,
    onPieceDrag: ({ square }) => {
      setMarks(new Set());
      if (square) setSelected(square as Square);
    },
    onPieceDrop: ({ sourceSquare, targetSquare }) => {
      if (!interactive || !targetSquare) return false;
      const outcome = tryMove(sourceSquare as Square, targetSquare as Square);
      if (outcome !== "illegal") setSelected(null);
      return outcome === "moved";
    },
    onSquareClick: ({ square, piece }) => {
      setMarks(new Set());
      if (promotion) {
        setPromotion(null);
        return;
      }
      if (!interactive) return;
      if (selected && selected !== square && tryMove(selected, square as Square) !== "illegal") {
        setSelected(null);
        return;
      }
      const ownPiece = piece?.pieceType[0] === turn;
      setSelected(ownPiece && square !== selected ? (square as Square) : null);
    },
    onSquareRightClick: ({ square }) => {
      setSelected(null);
      setMarks((prev) => {
        const next = new Set(prev);
        if (!next.delete(square)) next.add(square);
        return next;
      });
    },
  };

  const promotionColumn = promotion
    ? orientation === "white"
      ? promotion.to.charCodeAt(0) - 97
      : 104 - promotion.to.charCodeAt(0)
    : 0;

  return (
    <div className="board" onContextMenu={(e) => e.preventDefault()}>
      <Chessboard options={options} />
      {promotion && (
        <div className="promotion-backdrop" onClick={() => setPromotion(null)}>
          <div
            className="promotion-picker"
            role="dialog"
            aria-label="Choose promotion piece"
            style={{ left: `${promotionColumn * 12.5}%` }}
          >
            {PROMOTION_PIECES.map((p) => {
              const Piece = defaultPieces[`${turn}${p.toUpperCase()}`];
              return (
                <button
                  key={p}
                  type="button"
                  aria-label={`Promote to ${{ q: "queen", n: "knight", r: "rook", b: "bishop" }[p]}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMove(`${promotion.from}${promotion.to}${p}`);
                    setPromotion(null);
                  }}
                >
                  {Piece ? <Piece /> : p}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
