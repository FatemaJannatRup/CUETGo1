import { useNavigate } from 'react-router-dom'

export default function RoleSelect() {
  const navigate = useNavigate()

  return (
    <div className="h-full min-h-full flex flex-col justify-center gap-8 px-8 py-14 bg-cream">
      <div className="text-center">
        <h1 className="font-display text-2xl text-ink mb-2">I am a...</h1>
        <p className="text-ink/60 text-sm">Choose how you'd like to continue</p>
      </div>

      <div className="flex flex-col gap-4">
        <button
          onClick={() => navigate('/student/login')}
          className="bg-white border border-lilac-200 hover:border-lilac-400 rounded-xl2 p-5 text-left shadow-soft transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-lilac-100 flex items-center justify-center text-xl">
              🎓
            </div>
            <div>
              <p className="font-semibold text-ink">Student</p>
              <p className="text-sm text-ink/60">Request and join shared rides</p>
            </div>
          </div>
        </button>

        <button
          onClick={() => navigate('/driver/login')}
          className="bg-white border border-lilac-200 hover:border-lilac-400 rounded-xl2 p-5 text-left shadow-soft transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-lilac-100 flex items-center justify-center text-xl">
              🛺
            </div>
            <div>
              <p className="font-semibold text-ink">Rickshaw Driver</p>
              <p className="text-sm text-ink/60">রিকশাচালক — রাইড গ্রহণ করুন</p>
            </div>
          </div>
        </button>
      </div>
    </div>
  )
}
