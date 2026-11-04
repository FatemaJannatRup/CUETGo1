import { createContext, useCallback, useContext, useState } from 'react'

const FeedbackContext = createContext(() => {})

export function FeedbackProvider({ children }) {
  const [feedback, setFeedback] = useState(null)
  const notify = useCallback((message, type = 'info', duration = 2800) => {
    setFeedback({ message, type, id: Date.now() })
    if (duration > 0) window.setTimeout(() => setFeedback(current => current?.message === message ? null : current), duration)
  }, [])
  return <FeedbackContext.Provider value={notify}>
    {children}
    {feedback && <div className={`cuetgo-feedback cuetgo-feedback-${feedback.type}`} role="status" aria-live="polite">
      {feedback.type === 'loading' ? <span className="cuetgo-feedback-spinner" /> : <span className="cuetgo-feedback-icon">{feedback.type === 'success' ? '✓' : feedback.type === 'error' ? '!' : '•'}</span>}
      <span>{feedback.message}</span>
    </div>}
  </FeedbackContext.Provider>
}

export function useFeedback() { return useContext(FeedbackContext) }
