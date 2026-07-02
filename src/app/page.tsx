import AstronautLayer from "./AstronautLayer";

export const metadata = {
  title: "Daniel Grande",
  description: "Daniel Grande",
};

// Fixed star field — each star fades on its own delay/duration so they stagger.
// t/l = top/left %, s = size px, d = animation-delay s, u = duration s.
const STARS = [
  { t: 6, l: 14, s: 1, d: 0.2, u: 6 },
  { t: 9, l: 34, s: 1.4, d: 2.1, u: 8 },
  { t: 16, l: 58, s: 1, d: 4.0, u: 7 },
  { t: 12, l: 78, s: 1, d: 1.2, u: 9 },
  { t: 20, l: 91, s: 1.2, d: 3.3, u: 6.5 },
  { t: 26, l: 6, s: 1, d: 5.0, u: 10 },
  { t: 30, l: 24, s: 1, d: 0.8, u: 7.5 },
  { t: 33, l: 47, s: 1.4, d: 2.7, u: 9 },
  { t: 28, l: 68, s: 1, d: 4.4, u: 6 },
  { t: 36, l: 88, s: 1, d: 1.6, u: 8.5 },
  { t: 44, l: 16, s: 1.2, d: 3.9, u: 7 },
  { t: 48, l: 38, s: 1, d: 0.5, u: 11 },
  { t: 52, l: 60, s: 1, d: 2.3, u: 6 },
  { t: 46, l: 82, s: 1.4, d: 5.5, u: 9 },
  { t: 56, l: 9, s: 1, d: 1.9, u: 8 },
  { t: 60, l: 29, s: 1, d: 4.7, u: 7 },
  { t: 64, l: 52, s: 1.2, d: 0.9, u: 10 },
  { t: 58, l: 73, s: 1, d: 3.1, u: 6.5 },
  { t: 66, l: 93, s: 1, d: 5.2, u: 8 },
  { t: 72, l: 20, s: 1.4, d: 2.0, u: 9 },
  { t: 76, l: 42, s: 1, d: 4.2, u: 7 },
  { t: 80, l: 64, s: 1, d: 0.3, u: 11 },
  { t: 74, l: 85, s: 1.2, d: 2.9, u: 6 },
  { t: 84, l: 12, s: 1, d: 5.8, u: 8.5 },
  { t: 88, l: 34, s: 1, d: 1.4, u: 7 },
  { t: 92, l: 55, s: 1.4, d: 3.7, u: 9 },
  { t: 86, l: 78, s: 1, d: 0.7, u: 6.5 },
  { t: 94, l: 90, s: 1, d: 4.9, u: 8 },
  { t: 4, l: 48, s: 1, d: 3.5, u: 10 },
  { t: 40, l: 70, s: 1, d: 1.1, u: 7 },
  { t: 70, l: 5, s: 1.2, d: 5.4, u: 9 },
  { t: 18, l: 44, s: 1, d: 2.5, u: 6 },
];

export default function Home() {
  return (
    <main className="landing">
      {/* Deep-space animated gradient field */}
      <div className="starfield" aria-hidden>
        {STARS.map((st, i) => (
          <span
            key={i}
            className="star"
            style={{
              top: `${st.t}%`,
              left: `${st.l}%`,
              width: `${st.s}px`,
              height: `${st.s}px`,
              animationDelay: `${st.d}s`,
              animationDuration: `${st.u}s`,
            }}
          />
        ))}
      </div>
      <div className="nebula nebula-1" aria-hidden />
      <div className="nebula nebula-2" aria-hidden />
      <div className="nebula nebula-3" aria-hidden />
      <div className="nebula nebula-4" aria-hidden />
      <AstronautLayer />
      <div className="vignette" aria-hidden />

      <h1 className="name">Daniel Grande</h1>

      <style>{`
        .landing {
          position: fixed;
          inset: 0;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          background: radial-gradient(120% 120% at 50% 20%, #0a0b1a 0%, #05060d 55%, #020208 100%);
          font-family: var(--font-geist-sans), system-ui, sans-serif;
          cursor: pointer;
          user-select: none;
          -webkit-user-select: none;
        }

        .name {
          position: relative;
          z-index: 4;
          margin: 0;
          padding: 0 1.5rem;
          text-align: center;
          font-weight: 600;
          font-size: clamp(2.75rem, 9vw, 7rem);
          letter-spacing: -0.03em;
          line-height: 1.05;
          color: #f4f5ff;
          background: linear-gradient(180deg, #ffffff 0%, #cfd4ff 60%, #a9b0ff 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          text-shadow: 0 0 40px rgba(140, 150, 255, 0.25);
          filter: drop-shadow(0 2px 30px rgba(90, 100, 220, 0.35));
          animation: rise 1.4s cubic-bezier(0.2, 0.7, 0.2, 1) both;
        }

        @keyframes rise {
          from { opacity: 0; transform: translateY(14px); letter-spacing: 0.02em; }
          to   { opacity: 1; transform: translateY(0);    letter-spacing: -0.03em; }
        }

        /* Drifting nebula blobs, blended additively over the dark base */
        .nebula {
          position: absolute;
          border-radius: 50%;
          filter: blur(90px);
          opacity: 0.55;
          mix-blend-mode: screen;
          will-change: transform;
          z-index: 1;
        }
        .nebula-1 {
          width: 46vmax; height: 46vmax;
          left: -8vmax; top: -6vmax;
          background: radial-gradient(circle at 50% 50%, #4f46e5, transparent 65%);
          animation: drift1 26s ease-in-out infinite;
        }
        .nebula-2 {
          width: 40vmax; height: 40vmax;
          right: -10vmax; top: 5vmax;
          background: radial-gradient(circle at 50% 50%, #a21caf, transparent 65%);
          animation: drift2 32s ease-in-out infinite;
        }
        .nebula-3 {
          width: 38vmax; height: 38vmax;
          left: 10vmax; bottom: -12vmax;
          background: radial-gradient(circle at 50% 50%, #0ea5e9, transparent 65%);
          animation: drift3 30s ease-in-out infinite;
        }
        .nebula-4 {
          width: 34vmax; height: 34vmax;
          right: 6vmax; bottom: -8vmax;
          background: radial-gradient(circle at 50% 50%, #7c3aed, transparent 65%);
          animation: drift4 36s ease-in-out infinite;
        }

        @keyframes drift1 {
          0%,100% { transform: translate(0, 0) scale(1); }
          20%     { transform: translate(38vmax, 14vmax) scale(1.1); }
          40%     { transform: translate(60vmax, 46vmax) scale(0.95); }
          60%     { transform: translate(24vmax, 58vmax) scale(1.15); }
          80%     { transform: translate(8vmax, 26vmax) scale(1.05); }
        }
        @keyframes drift2 {
          0%,100% { transform: translate(0, 0) scale(1); }
          20%     { transform: translate(-30vmax, 20vmax) scale(1.1); }
          40%     { transform: translate(-52vmax, 50vmax) scale(1.2); }
          60%     { transform: translate(-20vmax, 40vmax) scale(0.95); }
          80%     { transform: translate(-8vmax, 8vmax) scale(1.05); }
        }
        @keyframes drift3 {
          0%,100% { transform: translate(0, 0) scale(1); }
          20%     { transform: translate(30vmax, -18vmax) scale(1.15); }
          40%     { transform: translate(56vmax, -46vmax) scale(1); }
          60%     { transform: translate(34vmax, -58vmax) scale(1.2); }
          80%     { transform: translate(10vmax, -24vmax) scale(1.05); }
        }
        @keyframes drift4 {
          0%,100% { transform: translate(0, 0) scale(1.05); }
          20%     { transform: translate(-28vmax, -16vmax) scale(0.95); }
          40%     { transform: translate(-54vmax, -44vmax) scale(1.15); }
          60%     { transform: translate(-22vmax, -60vmax) scale(1); }
          80%     { transform: translate(-6vmax, -28vmax) scale(1.1); }
        }

        /* Individual star pixels — each fades on its own delay/duration */
        .starfield {
          position: absolute;
          inset: 0;
          z-index: 0;
          pointer-events: none;
        }
        .star {
          position: absolute;
          border-radius: 50%;
          background: #ffffff;
          box-shadow: 0 0 2px rgba(255, 255, 255, 0.6);
          opacity: 0.12;
          animation-name: starfade;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
        }

        @keyframes starfade {
          0%,100% { opacity: 0.08; }
          50%     { opacity: 0.9; }
        }

        /* Subtle darkening at the edges for depth */
        .vignette {
          position: absolute;
          inset: 0;
          z-index: 3;
          pointer-events: none;
          background: radial-gradient(120% 90% at 50% 45%, transparent 55%, rgba(2, 2, 8, 0.75) 100%);
        }

        @media (prefers-reduced-motion: reduce) {
          .nebula, .stars, .name { animation: none; }
        }
      `}</style>
    </main>
  );
}
