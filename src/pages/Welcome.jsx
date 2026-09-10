import { useNavigate } from 'react-router-dom'

export default function Welcome() {
  const navigate = useNavigate()

  return (
    <div className="h-full min-h-full flex flex-col items-center justify-between bg-gradient-to-b from-lilac-100 via-cream to-cream px-8 py-14 text-center">
      <div />
      <div className="flex flex-col items-center gap-5">
        <div className="w-20 h-20 rounded-2xl bg-lilac-500 shadow-soft flex items-center justify-center">
          <span className="text-cream font-display text-3xl">🤝</span>
        </div>
        <h1 className="font-display text-3xl text-ink leading-snug">
          Welcome to<br />CUETGo
        </h1>
        <p className="text-ink/70 max-w-[280px]">
          Share rickshaw rides across campus. Split fares, save money, travel together.
        </p>
      </div>
      <button
        onClick={() => navigate('/role')}
        className="w-full max-w-[280px] bg-lilac-500 hover:bg-lilac-600 transition-colors text-white font-medium py-3.5 rounded-full shadow-soft"
      >
        Get Started
      </button>
    </div>
  )
}
