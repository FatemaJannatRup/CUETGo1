export default function Field({ label, error, children }) {
  return (
    <label className="block mb-4">
      <span className="text-sm font-medium text-ink/80 mb-1.5 block">{label}</span>
      {children}
      {error && <span className="text-xs text-rose-500 mt-1 block">{error}</span>}
    </label>
  )
}

export const inputClass =
  "w-full bg-white border border-lilac-200 focus:border-lilac-400 focus:outline-none rounded-xl px-4 py-3 text-ink placeholder:text-ink/35"
