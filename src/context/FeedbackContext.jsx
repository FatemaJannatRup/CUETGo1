import { createContext, useCallback, useContext, useState } from 'react'

const FeedbackContext = createContext(() => {})
const ClearFeedbackContext = createContext(() => {})

export function FeedbackProvider({ children }) {
  const [feedback, setFeedback] = useState(null)
  const clearFeedback = useCallback(() => setFeedback(null), [])
  const notify = useCallback((message, type = 'info', duration = 2800) => {
    const id = Date.now() + Math.random()
    setFeedback({ message, type, id })
    if (duration > 0) window.setTimeout(() => setFeedback(current => current?.id === id ? null : current), duration)
  }, [])
  return <FeedbackContext.Provider value={notify}>
    <ClearFeedbackContext.Provider value={clearFeedback}>
      {children}
      {feedback && <div className={`cuetgo-feedback cuetgo-feedback-${feedback.type}`} role="status" aria-live="polite">
        {feedback.type === 'loading' ? <span className="cuetgo-feedback-spinner" /> : <span className="cuetgo-feedback-icon">{feedback.type === 'success' ? '✓' : feedback.type === 'error' ? '!' : '•'}</span>}
        <span>{feedback.message}</span>
      </div>}
    </ClearFeedbackContext.Provider>
  </FeedbackContext.Provider>
}

export function useFeedback() { return useContext(FeedbackContext) }
export function useClearFeedback() { return useContext(ClearFeedbackContext) }
